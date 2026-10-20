import { GRID, cellAt } from '../sim/grid';
import { advance } from '../sim/sim';
import { RESOURCE_NAMES, type GameState, type Resources, type ResourceId } from '../sim/types';
import { dayOf, outsideTemp, isStorm, dateLabel } from '../sim/weather';
import { attachInput, clampCamera, toWorld, type Camera } from './camera';
import { icon } from './icons';
import { Renderer } from './render';

export interface SheetView {
  title: string;
  sub?: string;
  tabs?: { id: string; label: string }[];
  tab?: string;
  body: string;
}

export type Panel = (app: App, arg?: string) => SheetView;
export type Action = (app: App, arg: string, el: HTMLElement) => void;

export const PANELS: Record<string, Panel> = {};
export const ACTIONS: Record<string, Action> = {};
/** Bottom bar entries in order; steps add theirs. */
export const BAR: { id: string; label: string; icon: string; badge?: (s: GameState) => number }[] = [];
/** Hooks that build extra modal content (events) and react to the map tap. */
export const HOOKS: {
  tapCell: ((app: App, cell: number) => boolean)[];
  frame: ((app: App) => void)[];
  modal: ((app: App) => string | null)[];
} = { tapCell: [], frame: [], modal: [] };

export const SPEEDS = [0, 0.5, 1.2, 2.6]; // game hours per real second

export function esc(t: string | number): string {
  return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function fmt(n: number): string {
  return Math.floor(n).toLocaleString('de-DE');
}

export function hhmm(time: number): string {
  const h = Math.floor(time % 24);
  return `${String(h).padStart(2, '0')}:00`;
}

export class App {
  cam: Camera = { x: 0, y: 0, zoom: 0.8, w: 400, h: 800 };
  renderer: Renderer;
  speed = 1;
  acc = 0;
  selected: number | null = null;
  heatView = false;
  placing: string | null = null;
  validCells: Set<number> | null = null;
  /** a button waiting for its second tap, e.g. 'demolish:12' */
  armed: string | null = null;
  /** change of each resource during the last game hour */
  delta: Partial<Resources> = {};
  sheet: { kind: string; arg?: string; tab?: string } | null = null;
  title = true;
  private lastHud = 0;
  private lastSheetHtml = '';
  private lastModalHtml = '';
  private seenLog = 0;
  private ui: HTMLElement;
  private els: Record<string, HTMLElement> = {};
  /** set by persistence (step J) */
  onHour: ((s: GameState) => void)[] = [];

  constructor(
    public s: GameState,
    private canvas: HTMLCanvasElement,
    ui: HTMLElement,
  ) {
    this.ui = ui;
    this.renderer = new Renderer(canvas);
    this.seenLog = s.log.length;
    this.buildDom();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    attachInput(canvas, this.cam, {
      onTap: (x, y) => this.tap(x, y),
      onChange: () => {},
    });
    ui.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el || (el as HTMLButtonElement).disabled) return;
      const fn = ACTIONS[el.dataset.act!];
      if (fn) {
        fn(this, el.dataset.arg ?? '', el);
        this.refresh();
      }
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  setState(s: GameState): void {
    this.s = s;
    this.seenLog = s.log.length;
    this.selected = null;
    this.sheet = null;
    this.placing = null;
    this.refresh();
  }

  resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.cam.w = r.width || window.innerWidth;
    this.cam.h = r.height || window.innerHeight;
    if (!this.resized) {
      this.cam.zoom = Math.min(this.cam.w, this.cam.h) / 560;
      this.resized = true;
    }
    clampCamera(this.cam);
    this.renderer.resize(this.cam);
  }
  private resized = false;

  private buildDom(): void {
    this.ui.innerHTML = `
      <div class="hud">
        <div class="res-row" data-el="res"></div>
        <div class="status-row">
          <div class="clock" data-el="clock"></div>
          <div class="temp" data-el="temp"></div>
          <div class="meters" data-el="meters"></div>
          <div class="speed" data-el="speed"></div>
        </div>
      </div>
      <div class="fab-col">
        <button class="fab" data-act="open" data-arg="menu" aria-label="Menü">${icon('menu')}</button>
        <button class="fab" data-act="heatView" aria-label="Wärmeansicht" data-el="heatBtn">${icon('heat')}</button>
        <button class="fab" data-act="recenter" aria-label="Zum Kessel">${icon('center')}</button>
      </div>
      <div class="toasts" data-el="toasts" aria-live="polite"></div>
      <div data-el="banner"></div>
      <nav class="bar" data-el="bar"></nav>
      <div data-el="sheet"></div>
      <div data-el="modal"></div>`;
    for (const el of this.ui.querySelectorAll<HTMLElement>('[data-el]')) this.els[el.dataset.el!] = el;
    this.refresh();
  }

  open(kind: string, arg?: string): void {
    if (this.sheet && this.sheet.kind === kind && this.sheet.arg === arg) {
      this.sheet = null;
    } else {
      this.sheet = { kind, arg };
    }
    this.placing = null;
    this.validCells = null;
    this.armed = null;
    this.refresh();
  }

  closeSheet(): void {
    this.sheet = null;
    this.selected = null;
    this.armed = null;
    this.refresh();
  }

  toast(text: string, kind = 'info'): void {
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    t.textContent = text;
    this.els.toasts.prepend(t);
    while (this.els.toasts.children.length > 4) this.els.toasts.lastElementChild!.remove();
    setTimeout(() => t.remove(), 5200);
  }

  private tap(sx: number, sy: number): void {
    if (this.title) return;
    const w = toWorld(this.cam, sx, sy);
    const cell = cellAt(w.x, w.y);
    this.armed = null;
    if (cell === null) {
      if (Math.hypot(w.x, w.y) < 60) {
        this.selected = null;
        this.open('boiler');
      } else {
        this.closeSheet();
      }
      return;
    }
    for (const h of HOOKS.tapCell) if (h(this, cell.id)) return this.refresh();
    this.selected = cell.id;
    this.sheet = { kind: 'cell', arg: String(cell.id) };
    this.refresh();
  }

  refresh(): void {
    this.lastHud = 0;
    this.renderHud(true);
    this.renderSheet();
    this.renderModal();
  }

  private renderHud(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHud < 250) return;
    this.lastHud = now;
    const s = this.s;
    const res: ResourceId[] = ['coal', 'wood', 'steel', 'bricks', 'food', 'rations', 'parts'];
    this.els.res.innerHTML = res
      .map((k) => {
        const d = Math.round(this.delta[k] ?? 0);
        const change = d === 0 ? '' : `<span class="d ${d > 0 ? 'pos' : 'neg'}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>`;
        return `<div class="res${s.res[k] < 10 ? ' low' : ''}" title="${RESOURCE_NAMES[k]}">${icon(k)}<span class="v">${fmt(s.res[k])}</span>${change}</div>`;
      })
      .join('');
    const day = dayOf(s.time);
    this.els.clock.innerHTML = `Tag ${day} · ${hhmm(s.time)}<small>${esc(dateLabel(day).replace(' 1946', '').replace(' 1947', ''))}</small>`;
    const t = Math.round(outsideTemp(s.time));
    this.els.temp.className = `temp${isStorm(day) ? ' storm' : ''}`;
    this.els.temp.textContent = `${t} °C`;
    const alertH = s.warning?.kind === 'despair' ? ' alert' : '';
    const alertD = s.warning?.kind === 'revolt' ? ' alert' : '';
    this.els.meters.innerHTML = `
      <div class="meter hope${alertH}" title="Hoffnung">${icon('hope')}<div class="track"><i style="width:${s.hope}%"></i></div></div>
      <div class="meter disc${alertD}" title="Unmut">${icon('disc')}<div class="track"><i style="width:${s.discontent}%"></i></div></div>`;
    const sp = ['pause', 'play', 'fast', 'faster'];
    const spl = ['Pause', 'Normal', 'Schnell', 'Sehr schnell'];
    this.els.speed.innerHTML = sp
      .map((n, i) => `<button data-act="speed" data-arg="${i}" aria-pressed="${this.speed === i}" aria-label="${spl[i]}">${icon(n)}</button>`)
      .join('');
    this.els.bar.innerHTML = BAR.map((b) => {
      const n = b.badge?.(s) ?? 0;
      return `<button data-act="open" data-arg="${b.id}" aria-pressed="${this.sheet?.kind === b.id}">${icon(b.icon)}${esc(b.label)}${n ? `<span class="badge">${n}</span>` : ''}</button>`;
    }).join('');
    this.els.heatBtn.setAttribute('aria-pressed', String(this.heatView));
    const banner = this.placing
      ? `<div class="banner">Freies Feld antippen <button class="btn" data-act="cancelPlace">Abbrechen</button></div>`
      : '';
    // only replace the markup when it changed, so a button under the finger is not rebuilt every tick
    if (banner !== this.lastBanner) {
      this.els.banner.innerHTML = banner;
      this.lastBanner = banner;
    }
  }
  private lastBanner = '';

  private renderSheet(): void {
    let html = '';
    if (this.sheet && !this.title) {
      const p = PANELS[this.sheet.kind];
      if (p) {
        const v = p(this, this.sheet.arg);
        const tabs = v.tabs
          ? `<div class="tabs">${v.tabs.map((t) => `<button data-act="tab" data-arg="${t.id}" aria-pressed="${t.id === (v.tab ?? this.sheet!.tab)}">${esc(t.label)}</button>`).join('')}</div>`
          : '';
        html = `<section class="sheet" role="dialog" aria-label="${esc(v.title)}">
          <div class="sheet-head"><div><h2>${esc(v.title)}</h2>${v.sub ? `<div class="sub">${v.sub}</div>` : ''}</div>
          <button class="close" data-act="close" aria-label="Schließen">${icon('close')}</button></div>
          ${tabs}<div class="sheet-body">${v.body}</div></section>`;
      }
    }
    if (html !== this.lastSheetHtml) {
      const body = this.els.sheet.querySelector('.sheet-body');
      const scroll = body ? body.scrollTop : 0;
      this.els.sheet.innerHTML = html;
      const nb = this.els.sheet.querySelector('.sheet-body');
      if (nb) nb.scrollTop = scroll;
      this.lastSheetHtml = html;
    }
  }

  private renderModal(): void {
    let html = '';
    for (const m of HOOKS.modal) {
      const h = m(this);
      if (h) {
        html = h;
        break;
      }
    }
    if (html !== this.lastModalHtml) {
      this.els.modal.innerHTML = html;
      this.lastModalHtml = html;
    }
  }

  private frame(t: number): void {
    const s = this.s;
    const paused = this.title || s.events.pending.length > 0 || !!s.outcome;
    if (!paused && this.speed > 0) {
      this.acc += (SPEEDS[this.speed] * Math.min(100, t - (this.lastT || t))) / 1000;
      while (this.acc >= 1 && !s.events.pending.length && !s.outcome) {
        this.acc -= 1;
        this.hour();
      }
    }
    this.lastT = t;
    // surface new log lines as toasts
    if (s.log.length < this.seenLog) this.seenLog = 0;
    while (this.seenLog < s.log.length) {
      const e = s.log[this.seenLog++];
      this.toast(e.text, e.kind);
    }
    for (const f of HOOKS.frame) f(this);
    this.renderHud();
    if (t - this.lastPanel > 400) {
      this.lastPanel = t;
      this.renderSheet();
      this.renderModal();
    }
    this.renderer.draw(s, this.cam, {
      selected: this.selected,
      heatView: this.heatView,
      placing: this.placing,
      validCells: this.validCells,
      visualTime: s.time + (paused ? 0 : Math.min(0.99, this.acc)),
    }, t);
    requestAnimationFrame((tt) => this.frame(tt));
  }
  /** One game hour: runs the simulation and remembers the resource change for the HUD. */
  hour(): void {
    const s = this.s;
    const before = { ...s.res };
    const t0 = s.time;
    advance(s, 1);
    if (s.time !== t0) {
      this.delta = {};
      for (const k of Object.keys(before) as ResourceId[]) this.delta[k] = s.res[k] - before[k];
    }
    for (const f of this.onHour) f(s);
  }
  private lastT = 0;
  private lastPanel = 0;
}

// ── generic actions ──
ACTIONS.speed = (app, arg) => {
  app.speed = Number(arg);
};
ACTIONS.open = (app, arg) => app.open(arg);
ACTIONS.close = (app) => app.closeSheet();
ACTIONS.tab = (app, arg) => {
  if (app.sheet) app.sheet.tab = arg;
};
ACTIONS.heatView = (app) => {
  app.heatView = !app.heatView;
};
ACTIONS.recenter = (app) => {
  app.cam.x = 0;
  app.cam.y = 0;
};
ACTIONS.cancelPlace = (app) => {
  app.placing = null;
  app.validCells = null;
};

export function cellName(id: number): string {
  const c = GRID[id];
  return `Ring ${c.ring}`;
}

// test hook: advance the simulation directly
(App.prototype as unknown as { __advance: (h: number) => void }).__advance = function (this: App, h: number) {
  for (let i = 0; i < h; i++) this.hour();
};
