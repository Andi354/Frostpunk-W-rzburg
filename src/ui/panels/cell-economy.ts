import { def } from '../../sim/data/buildings';
import { assign, demolish, hourlyYield, idle } from '../../sim/economy';
import { hasLaw } from '../../sim/util';
import { RESOURCE_NAMES, type Building, type ResourceId } from '../../sim/types';
import { ACTIONS, type App } from '../app';
import { CELL_SECTIONS } from './cell';

/** Sections of the cell sheet for buildings and piles: workers, output, construction, heater, residents, demolition. */

const num = (n: number) => (Math.round(Math.abs(n) * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1 });

function workers(app: App, b: Building | undefined): string {
  if (!b) return '';
  const d = def(b.type);
  if (!d.slots || b.built < 1) return '';
  const pool = idle(app.s).filter((p) => d.staff !== 'engineer' || p.kind === 'engineer');
  const free = (kind: string) => idle(app.s).filter((p) => p.kind === kind).length;
  const full = b.workers.length >= d.slots;
  const staffLine = [`${free('worker')} Arbeiter`, `${free('engineer')} Fachkräfte`];
  if (hasLaw(app.s, 'kinderarbeit')) staffLine.push(`${free('child')} Kinder`);
  return `<div>
    <div class="label">Besetzung</div>
    <div class="row" style="margin-top:6px">
      <div class="stepper">
        <button data-act="staff" data-arg="${b.id}:-1" aria-label="Weniger" ${b.workers.length ? '' : 'disabled'}>−</button>
        <span>${b.workers.length} / ${d.slots}</span>
        <button data-act="staff" data-arg="${b.id}:1" aria-label="Mehr" ${full || !pool.length ? 'disabled' : ''}>+</button>
      </div>
    </div>
    <p class="hint">Frei: ${staffLine.join(' · ')}</p>
  </div>`;
}

function production(app: App, b: Building | undefined): string {
  if (!b || b.built < 1) return '';
  const d = def(b.type);
  if (!d.produces && !d.consumes && !d.pileYield && !d.coalPerHour) return '';
  const parts = Object.entries(hourlyYield(app.s, b))
    .filter(([, v]) => Math.abs(v ?? 0) >= 0.05)
    .map(([r, v]) => {
      const sign = (v ?? 0) > 0 ? '+' : '−';
      return `<span class="${(v ?? 0) > 0 ? 'good' : 'bad'}">${sign}${num(v ?? 0)} ${RESOURCE_NAMES[r as ResourceId]}/h</span>`;
    });
  return `<div>
    <div class="label">Pro Stunde</div>
    <div class="row" style="margin-top:6px">${parts.length ? parts.join('') : '<span class="hint">Niemand arbeitet hier.</span>'}</div>
  </div>`;
}

function construction(_app: App, b: Building | undefined): string {
  if (!b || b.built >= 1) return '';
  const left = Math.ceil((1 - b.built) * (def(b.type).buildHours ?? 1));
  return `<div>
    <div class="label">Baustelle</div>
    <div class="gauge" style="margin-top:6px"><i style="width:${Math.round(b.built * 100)}%"></i></div>
    <p class="hint">${Math.round(b.built * 100)} % · noch ${left} h</p>
  </div>`;
}

function heater(_app: App, b: Building | undefined): string {
  if (!b || !def(b.type).switchable || b.built < 1) return '';
  return `<div>
    <div class="label">Heizung</div>
    <div class="seg" style="margin-top:6px">
      <button class="btn ${b.on ? 'primary' : ''}" data-act="heater" data-arg="${b.id}" aria-pressed="${b.on}">${b.on ? 'Heizt' : 'Aus'}</button>
    </div>
  </div>`;
}

function residents(app: App, b: Building | undefined): string {
  const beds = b ? def(b.type).beds : undefined;
  if (!b || !beds) return '';
  const n = app.s.people.filter((p) => p.home === b.id).length;
  return `<dl class="kv"><dt>Bewohner</dt><dd>${n} / ${beds}</dd></dl>`;
}

function demolishButton(app: App, b: Building | undefined): string {
  if (!b || def(b.type).category === 'pile') return '';
  const armed = app.armed === `demolish:${b.id}`;
  return `<div class="row">
    <button class="btn danger" data-act="demolish" data-arg="${b.id}">${armed ? 'Wirklich abreißen?' : 'Abreißen'}</button>
    <span class="hint">Die Hälfte des Materials kommt zurück.</span>
  </div>`;
}

const sec = (f: (app: App, b: Building | undefined) => string) => (app: App, _cell: number, b: Building | undefined) => f(app, b);
CELL_SECTIONS.push(sec(workers), sec(production), sec(construction), sec(heater), sec(residents), sec(demolishButton));

ACTIONS.staff = (app, arg) => {
  const [id, delta] = arg.split(':').map(Number);
  const changed = assign(app.s, id, delta);
  if (delta > 0 && changed === 0) app.toast('Niemand frei für diese Stelle', 'bad');
};

ACTIONS.heater = (app, arg) => {
  const b = app.s.buildings.find((x) => x.id === Number(arg));
  if (!b) return;
  if (!b.on && app.s.res.coal < (def(b.type).coalPerHour ?? 0)) {
    app.toast('Keine Kohle für die Wärmestube', 'bad');
    return;
  }
  b.on = !b.on;
};

ACTIONS.demolish = (app, arg) => {
  const id = Number(arg);
  if (app.armed !== `demolish:${id}`) {
    app.armed = `demolish:${id}`;
    return;
  }
  demolish(app.s, id);
  app.closeSheet();
};

