import { def, type BuildingDef } from './data/buildings';
import { cellTemp, hasTech, heatLevel } from './heat';
import { addBuilding, buildingById, log } from './state';
import { SYSTEMS } from './sim';
import { canAfford, hasLaw, hourOfDay, isWorkHour, pay, refund } from './util';
import type { Building, GameState, Person, PersonKind, ResourceId } from './types';

/** Efficiency by heat level (eisig … behaglich). */
const HEAT_FACTOR = [0.5, 0.75, 0.9, 1, 1];

/** Research that speeds up one building type. */
const TECH_FACTORS: [tech: string, type: string, factor: number][] = [
  ['kohlenbohrer', 'kohlengrube', 1.4],
  ['saege', 'holzfaeller', 1.4],
  ['schneidbrenner', 'hangar', 1.5],
  ['fallen', 'jagdhuette', 1.4],
];

// ── placing and demolishing ──────────────────────────────────────────────

/** German reason why a building cannot be placed here, or null. */
export function canPlace(s: GameState, type: string, cellId: number): string | null {
  const d = def(type);
  if (d.category === 'pile' || d.category === 'deposit') return 'Nicht baubar';
  const here = s.buildings.find((b) => b.cell === cellId);
  if (d.onDeposit) {
    if (!here) return `Nur auf ${def(d.onDeposit).name}`;
    if (here.type !== d.onDeposit) return 'Feld belegt';
  } else if (here) {
    return 'Feld belegt';
  }
  if (d.requires && !hasTech(s, d.requires)) return 'Noch nicht erforscht';
  if (d.requiresLaw && !hasLaw(s, d.requiresLaw)) return 'Gesetz fehlt';
  if (d.unique && s.buildings.some((b) => b.type === type)) return 'Nur einmal erlaubt';
  if (!canAfford(s, d.cost ?? {})) return 'Nicht genug Material';
  return null;
}

/** Places an unfinished building and pays for it. A deposit building replaces the deposit it stands on. */
export function placeBuilding(s: GameState, type: string, cellId: number): Building | null {
  if (canPlace(s, type, cellId) !== null) return null;
  const d = def(type);
  pay(s, d.cost ?? {});
  let deposit: string | undefined;
  if (d.onDeposit) {
    s.buildings.splice(s.buildings.findIndex((b) => b.cell === cellId), 1);
    deposit = d.onDeposit;
  }
  const b = addBuilding(s, type, cellId, 0);
  if (deposit) b.deposit = deposit;
  return b;
}

/** Removes a building, frees its people, refunds half the cost and restores its deposit. */
export function demolish(s: GameState, id: number): void {
  const b = buildingById(s, id);
  if (!b) return;
  const d = def(b.type);
  if (d.category === 'pile' || d.category === 'deposit') return;
  refund(s, d.cost ?? {}, 0.5);
  removeBuilding(s, b);
  for (const p of s.people) if (p.home === b.id) p.home = null;
  if (b.deposit) addBuilding(s, b.deposit, b.cell);
  log(s, `${d.name} abgerissen`);
}

function removeBuilding(s: GameState, b: Building): void {
  for (const p of s.people) if (p.job === b.id) p.job = null;
  b.workers = [];
  s.buildings.splice(s.buildings.indexOf(b), 1);
}

// ── people ───────────────────────────────────────────────────────────────

/** Healthy people without a job who are in the city (not on an expedition). */
export function idle(s: GameState, kind?: PersonKind): Person[] {
  const away = new Set(s.expeditions.flatMap((e) => e.members));
  const children = hasLaw(s, 'kinderarbeit');
  return s.people.filter(
    (p) =>
      p.health === 'ok' &&
      p.job === null &&
      !away.has(p.id) &&
      (kind === undefined || p.kind === kind) &&
      (p.kind !== 'child' || children),
  );
}

/** Staffing order: engineers only for engineer slots, otherwise workers, then engineers, then children. */
function staffOrder(staff: string): PersonKind[] {
  return staff === 'engineer' ? ['engineer'] : ['worker', 'engineer', 'child'];
}

/** +delta takes idle people into the slots, −delta releases the last assigned. Returns the actual change. */
export function assign(s: GameState, buildingId: number, delta: number): number {
  const b = buildingById(s, buildingId);
  const d = b ? def(b.type) : undefined;
  if (!b || !d?.slots) return 0;
  if (delta > 0) {
    if (b.built < 1) return 0;
    const want = Math.min(delta, d.slots - b.workers.length);
    if (want <= 0) return 0;
    const pool = idle(s);
    let added = 0;
    for (const kind of staffOrder(d.staff ?? 'worker')) {
      for (const p of pool) {
        if (added >= want) break;
        if (p.kind !== kind) continue;
        p.job = b.id;
        b.workers.push(p.id);
        added++;
      }
    }
    return added;
  }
  if (delta < 0) {
    const n = Math.min(-delta, b.workers.length);
    for (const id of b.workers.splice(b.workers.length - n, n)) {
      const p = s.people.find((x) => x.id === id);
      if (p) p.job = null;
    }
    return -n;
  }
  return 0;
}

/** People who work in the building now: healthy, children count 0.6. */
function workingPeople(s: GameState, b: Building): number {
  let n = 0;
  for (const id of b.workers) {
    const p = s.people.find((x) => x.id === id);
    if (!p || p.health !== 'ok') continue;
    n += p.kind === 'child' ? 0.6 : 1;
  }
  return n;
}

// ── efficiency ───────────────────────────────────────────────────────────

/** Net output per game hour at the current staffing; negative values are consumed. Ignores the stock limit. */
export function hourlyYield(s: GameState, b: Building): Partial<Record<ResourceId, number>> {
  const d = def(b.type);
  const out: Partial<Record<ResourceId, number>> = {};
  if (b.built < 1) return out;
  const k = workingPeople(s, b) * efficiency(s, b);
  for (const [r, per] of Object.entries(d.pileYield ?? d.produces ?? {}) as [ResourceId, number][]) out[r] = per * k;
  for (const [r, per] of Object.entries(d.consumes ?? {}) as [ResourceId, number][]) out[r] = (out[r] ?? 0) - per * k;
  if (d.coalPerHour && b.on) out.coal = (out.coal ?? 0) - d.coalPerHour;
  return out;
}

/** Heat × tech × law factor of a building (or pile). */
export function efficiency(s: GameState, b: Building): number {
  const d = def(b.type);
  const t = cellTemp(s, b.cell);
  let f = HEAT_FACTOR[heatLevel(t)];
  for (const [tech, type, factor] of TECH_FACTORS) if (b.type === type && hasTech(s, tech)) f *= factor;
  if (b.type === 'gewaechshaus' && t < 0) f *= 0.3;
  if ((d.category === 'pile' || b.type === 'truemmerbahn') && hasLaw(s, 'truemmerpflicht')) f *= 1.25;
  if (hasLaw(s, 'arbeitsdienst')) f *= 1.15;
  if (b.type === 'gewaechshaus' && s.flags.glas) f *= 1.3;
  return f;
}

// ── hourly systems ───────────────────────────────────────────────────────

/** Unfinished buildings advance by 1 / buildHours per hour. */
export function constructionHour(s: GameState): void {
  for (const b of s.buildings) {
    if (b.built >= 1) continue;
    const d = def(b.type);
    b.built = Math.min(1, b.built + 1 / (d.buildHours ?? 1));
    if (b.built > 1 - 1e-9) {
      b.built = 1;
      log(s, `Fertig: ${d.name}`, 'good');
    }
  }
}

/** Heaters burn their coal every hour. Producers work in work hours only (hunters 08–16). */
export function productionHour(s: GameState): void {
  burnHeaters(s);
  if (!isWorkHour(s)) return;
  const h = hourOfDay(s);
  for (const b of [...s.buildings]) {
    if (b.built < 1) continue;
    const d = def(b.type);
    if (d.dayOnly && (h < 8 || h >= 16)) continue;
    const k = workingPeople(s, b) * efficiency(s, b);
    if (k <= 0) continue;
    if (d.pileYield) yieldPile(s, b, d.pileYield, k);
    else convert(s, d, k);
  }
}

function burnHeaters(s: GameState): void {
  for (const b of s.buildings) {
    const d = def(b.type);
    if (!d.coalPerHour || b.built < 1 || !b.on) continue;
    if (s.res.coal >= d.coalPerHour) {
      s.res.coal -= d.coalPerHour;
    } else {
      b.on = false;
      log(s, `${d.name} geht aus: keine Kohle.`, 'bad');
    }
  }
}

/** Converters use what the stock allows (scaled down); the rest of the output follows the same scale. */
function convert(s: GameState, d: BuildingDef, k: number): void {
  const consumes = Object.entries(d.consumes ?? {}) as [ResourceId, number][];
  const produces = Object.entries(d.produces ?? {}) as [ResourceId, number][];
  let scale = 1;
  for (const [r, per] of consumes) scale = Math.min(scale, s.res[r] / (per * k));
  scale = Math.max(0, scale);
  for (const [r, per] of consumes) s.res[r] -= per * k * scale;
  for (const [r, per] of produces) s.res[r] += per * k * scale;
}

/** Piles yield per worker-hour and shrink by what they give; an empty pile is removed. */
function yieldPile(s: GameState, b: Building, yields: Partial<Record<ResourceId, number>>, k: number): void {
  const list = Object.entries(yields) as [ResourceId, number][];
  const total = list.reduce((sum, [, per]) => sum + per * k, 0);
  const amount = b.amount ?? 0;
  const factor = total > 0 ? Math.min(1, amount / total) : 0;
  for (const [r, per] of list) s.res[r] += per * k * factor;
  b.amount = Math.max(0, amount - total * factor);
  if (b.amount <= 1e-9) {
    removeBuilding(s, b);
    log(s, `${def(b.type).name} ist abgetragen`);
  }
}

SYSTEMS.push(constructionHour, productionHour);
