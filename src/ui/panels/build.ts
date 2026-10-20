import { GRID } from '../../sim/grid';
import { BUILDINGS, def, type BuildingDef } from '../../sim/data/buildings';
import { canPlace, placeBuilding } from '../../sim/economy';
import { TECHS } from '../../sim/data/techs';
import { hasTech } from '../../sim/heat';
import { LAWS } from '../../sim/data/laws';
import { hasLaw } from '../../sim/util';
import type { GameState } from '../../sim/types';
import { ACTIONS, BAR, HOOKS, PANELS, esc, type App } from '../app';
import { icon } from '../icons';

const TABS = [
  { id: 'housing', label: 'Wohnen' },
  { id: 'resources', label: 'Rohstoffe' },
  { id: 'food', label: 'Nahrung' },
  { id: 'health', label: 'Gesundheit' },
  { id: 'heat', label: 'Wärme' },
  { id: 'tech', label: 'Technik' },
  { id: 'society', label: 'Gemeinschaft' },
];

/** Why a card is locked (research, law, unique), or null. */
function lockLine(s: GameState, d: BuildingDef): string | null {
  if (d.requires && !hasTech(s, d.requires)) return `Erforschen: ${TECHS[d.requires]?.name ?? d.requires}`;
  if (d.requiresLaw && !hasLaw(s, d.requiresLaw)) return `Gesetz: ${LAWS[d.requiresLaw]?.name ?? d.requiresLaw}`;
  if (d.unique && s.buildings.some((b) => b.type === d.id)) return 'Nur einmal erlaubt';
  return null;
}

function card(app: App, d: BuildingDef): string {
  const s = app.s;
  const lock = lockLine(s, d);
  const deposit = d.onDeposit ? `Nur auf ${def(d.onDeposit).name}` : null;
  const cost = Object.entries(d.cost ?? {})
    .map(([r, n]) => `<span class="${(s.res[r as keyof typeof s.res] ?? 0) < n ? 'short' : ''}">${icon(r)}${n}</span>`)
    .join('');
  return `<button class="card${lock ? ' locked' : ''}" data-act="place" data-arg="${d.id}" ${lock ? 'disabled' : ''}>
    <h3>${esc(d.name)}</h3>
    <p>${esc(d.desc)}</p>
    <div class="cost">${cost}</div>
    ${lock ? `<span class="tag">${esc(lock)}</span>` : deposit ? `<span class="tag">${esc(deposit)}</span>` : ''}
  </button>`;
}

PANELS.bauen = (app) => {
  const tab = app.sheet?.tab ?? 'housing';
  const list = Object.values(BUILDINGS).filter((d) => d.category === tab);
  return {
    title: 'Bauen',
    sub: 'Gebäude wählen, dann ein freies Feld antippen',
    tabs: TABS,
    tab,
    body: `<div class="cards">${list.map((d) => card(app, d)).join('')}</div>`,
  };
};

/** Cells where the building can stand right now. */
export function validCellsFor(s: GameState, type: string): Set<number> {
  return new Set(GRID.filter((c) => canPlace(s, type, c.id) === null).map((c) => c.id));
}

ACTIONS.place = (app, type) => {
  app.sheet = null;
  app.selected = null;
  app.placing = type;
  app.validCells = validCellsFor(app.s, type);
};

HOOKS.tapCell.push((app, cell) => {
  const type = app.placing;
  if (!type) return false;
  const d = def(type);
  const reason = canPlace(app.s, type, cell);
  if (reason) {
    app.toast(reason, 'bad');
    return true;
  }
  if (!placeBuilding(app.s, type, cell)) return true;
  app.toast(`Baustelle: ${d.name}`, 'good');
  if (d.category === 'housing') {
    app.validCells = validCellsFor(app.s, type);
  } else {
    app.placing = null;
    app.validCells = null;
  }
  return true;
});

BAR.unshift({ id: 'bauen', label: 'Bauen', icon: 'build' });
