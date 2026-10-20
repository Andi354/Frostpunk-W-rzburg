import { hasTech } from '../../sim/heat';
import { TECHS, type TechDef } from '../../sim/data/techs';
import { canResearch, hoursLeft, researchSpeed, startResearch } from '../../sim/research';
import { type ResourceId } from '../../sim/types';
import { ACTIONS, BAR, PANELS, esc, type App } from '../app';
import { icon } from '../icons';

const CATS = [...new Set(Object.values(TECHS).map((t) => t.cat))];
const num = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function currentBlock(app: App): string {
  const s = app.s;
  const id = s.research.current;
  const speed = researchSpeed(s);
  const left = hoursLeft(s);
  const speedLine = `<dl class="kv"><dt>Tempo</dt><dd>${num(speed)} pro Stunde</dd></dl>`;
  if (!id) return `<p class="desc">Im Moment wird nichts erforscht.</p>${speedLine}`;
  const t = TECHS[id];
  const pct = Math.min(100, Math.round((s.research.progress / t.hours) * 100));
  const status = left === null ? '<span class="bad">Keine Werkstatt besetzt</span>' : `noch ${left} h`;
  return `<div>
    <div class="label">Wird erforscht</div>
    <h3 style="margin:6px 0 0;font-family:var(--f-ui);font-size:18px">${esc(t.name)}</h3>
    <div class="gauge" style="margin-top:8px"><i style="width:${pct}%"></i></div>
    <p class="hint" style="margin-top:6px">${pct} % · ${status}</p>
  </div>${speedLine}`;
}

function card(app: App, t: TechDef): string {
  const s = app.s;
  const reason = canResearch(s, t.id);
  const done = hasTech(s, t.id);
  const running = s.research.current === t.id;
  const locked = reason !== null && (reason.startsWith('Erst') || reason === 'Keine Werkstatt');
  const armed = app.armed === `research:${t.id}`;
  const cost = Object.entries(t.cost)
    .map(([r, n]) => `<span class="${(s.res[r as ResourceId] ?? 0) < (n ?? 0) ? 'short' : ''}">${icon(r)}${n}</span>`)
    .join('');
  let tag = `${t.hours} h`;
  if (done) tag = 'Erforscht';
  else if (running) tag = 'Läuft';
  else if (locked) tag = reason;
  else if (armed) tag = 'Wirklich wechseln? Der Fortschritt geht verloren.';
  const cls = `card${done ? ' done' : ''}${running ? ' active' : ''}${locked ? ' locked' : ''}`;
  return `<button class="${cls}" data-act="research" data-arg="${t.id}" ${reason ? 'disabled' : ''}>
    <h3>${esc(t.name)}</h3>
    <p>${esc(t.desc)}</p>
    <div class="cost">${cost}</div>
    <span class="tag">${esc(tag)}</span>
  </button>`;
}

PANELS.forschung = (app) => {
  const tab = app.sheet?.tab ?? (app.s.research.current ? TECHS[app.s.research.current].cat : CATS[0]);
  const list = Object.values(TECHS).filter((t) => t.cat === tab);
  return {
    title: 'Forschung',
    sub: 'Nur eine Werkstatt mit Fachkräften forscht. Ein Wechsel verwirft den Fortschritt.',
    tabs: CATS.map((c) => ({ id: c, label: c })),
    tab,
    body: `${currentBlock(app)}<div class="cards">${list.map((t) => card(app, t)).join('')}</div>`,
  };
};

ACTIONS.research = (app, id) => {
  const s = app.s;
  const reason = canResearch(s, id);
  if (reason) {
    app.armed = null;
    app.toast(reason, 'bad');
    return;
  }
  // switching away from a running technology needs a second tap
  if (s.research.current && app.armed !== `research:${id}`) {
    app.armed = `research:${id}`;
    return;
  }
  app.armed = null;
  startResearch(s, id);
};

// right after the people entry
const at = BAR.findIndex((b) => b.id === 'leute');
BAR.splice(at < 0 ? BAR.length : at + 1, 0, {
  id: 'forschung',
  label: 'Forschung',
  icon: 'research',
  badge: (s) => (!s.research.current && researchSpeed(s) > 0 ? 1 : 0),
});

