import { GRID } from '../../sim/grid';
import { def } from '../../sim/data/buildings';
import { HEAT_NAMES, cellTemp, heatLevel } from '../../sim/heat';
import type { Building } from '../../sim/types';
import { PANELS, esc, fmt, type App } from '../app';

/** Extra sections for the cell sheet; later steps add workers, upgrades, demolition … */
export const CELL_SECTIONS: ((app: App, cell: number, b: Building | undefined) => string)[] = [];

export function heatChip(app: App, cell: number): string {
  const t = cellTemp(app.s, cell);
  const lv = heatLevel(t);
  const cls = lv >= 3 ? 'warm' : 'coldc';
  return `<span class="${cls}">${Math.round(t)} °C · ${HEAT_NAMES[lv]}</span>`;
}

PANELS.cell = (app, arg) => {
  const id = Number(arg);
  const c = GRID[id];
  const b = app.s.buildings.find((x) => x.cell === id);
  const d = b ? def(b.type) : null;
  const title = d ? d.name : 'Freies Feld';
  let body = d ? `<p class="desc">${esc(d.desc)}</p>` : `<p class="desc">Festgetretener Schnee auf dem Plateau.</p>`;
  if (b && d?.category === 'pile') body += `<dl class="kv"><dt>Vorrat</dt><dd>${fmt(b.amount ?? 0)}</dd></dl>`;
  for (const sec of CELL_SECTIONS) body += sec(app, id, b);
  return { title, sub: `Ring ${c.ring} · ${heatChip(app, id)}`, body };
};
