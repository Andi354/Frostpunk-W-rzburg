// Citizens: homes, sickness and care, hunger and meals, mood, and the warnings that end the game.
import { GRID } from './grid';
import { def } from './data/buildings';
import { idle } from './economy';
import { cellTemp, hasTech, heatLevel, plazaTemp } from './heat';
import { chance } from './rng';
import { SYSTEMS } from './sim';
import { buildingById, log } from './state';
import type { Building, GameState, Person } from './types';
import { hasLaw, hourOfDay, isWorkHour } from './util';

/** Hourly hope and discontent of signed laws, by law id. Step F fills this from the law data. */
export const LAW_MOOD: Partial<Record<string, { hope?: number; discontent?: number }>> = {};

/** Chance per hour to fall sick, by heat level (eisig … behaglich). */
const SICK_RISK = [0.008, 0.003, 0.001, 0.0002, 0];
const MEAL_HOUR = 19;

// ── helpers ──────────────────────────────────────────────────────────────

function awaySet(s: GameState): Set<number> {
  return new Set(s.expeditions.flatMap((e) => e.members));
}

/** People in the city: everybody except the expedition members. */
function inCity(s: GameState): Person[] {
  const away = awaySet(s);
  return s.people.filter((p) => !away.has(p.id));
}

function finished(s: GameState, id: number | null): Building | undefined {
  const b = buildingById(s, id);
  return b && b.built >= 1 ? b : undefined;
}

/** The finished bed a person lives in, if any. */
function housing(s: GameState, p: Person): Building | undefined {
  const b = finished(s, p.home);
  return b && def(b.type).beds ? b : undefined;
}

/** Share of the slots of a building that are filled by healthy people. */
export function staffedShare(s: GameState, b: Building): number {
  const d = def(b.type);
  if (!d.slots || b.built < 1) return 0;
  const healthy = b.workers.filter((id) => s.people.some((p) => p.id === id && p.health === 'ok')).length;
  return healthy / d.slots;
}

function leaveJob(s: GameState, p: Person): void {
  for (const b of s.buildings) {
    const i = b.workers.indexOf(p.id);
    if (i >= 0) b.workers.splice(i, 1);
  }
  p.job = null;
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

// ── temperatures ─────────────────────────────────────────────────────────

/** Temperature of a person's home; the homeless huddle on the plaza. */
export function homeTemp(s: GameState, p: Person): number {
  const h = housing(s, p);
  return h ? cellTemp(s, h.cell) : plazaTemp(s);
}

/** Where a person is this hour: the workplace in work hours, otherwise home. */
function spot(s: GameState, p: Person): { temp: number; atWork: boolean } {
  if (isWorkHour(s)) {
    const w = finished(s, p.job);
    if (w) return { temp: cellTemp(s, w.cell), atWork: true };
  }
  return { temp: homeTemp(s, p), atWork: false };
}

// ── homes ────────────────────────────────────────────────────────────────

/** Homeless people (no bed, or a bed that is not finished) get a free bed, nearest ring first. */
export function assignHomes(s: GameState): void {
  const homes = s.buildings
    .filter((b) => b.built >= 1 && def(b.type).beds)
    .sort((a, b) => GRID[a.cell].ring - GRID[b.cell].ring || a.id - b.id);
  const free = new Map(homes.map((b) => [b.id, def(b.type).beds!]));
  for (const p of s.people) if (p.home !== null && free.has(p.home)) free.set(p.home, free.get(p.home)! - 1);
  for (const p of inCity(s)) {
    if (p.home !== null && free.has(p.home)) continue;
    p.home = null;
    const b = homes.find((h) => free.get(h.id)! > 0);
    if (b) {
      p.home = b.id;
      free.set(b.id, free.get(b.id)! - 1);
    }
  }
}

// ── care ─────────────────────────────────────────────────────────────────

/** Care places: care of the finished health buildings, scaled by their staffing and by techs, laws and flags. */
export function careCapacity(s: GameState): number {
  const health = s.buildings.filter((b) => def(b.type).category === 'health' && b.built >= 1);
  let care = 0;
  for (const b of health) care += (def(b.type).care ?? 0) * staffedShare(s, b);
  if (hasTech(s, 'roentgen')) care *= 1.3;
  if (hasLaw(s, 'diakonissen')) care *= 1.3;
  if (s.flags.medizin) care *= 1.2;
  if (hasLaw(s, 'pflegestation')) care += 5 * health.length;
  return care;
}

/** The patients that get a bed this hour: gravely sick first, then sick, lowest id first. */
export function carePlan(s: GameState): Set<number> {
  const cap = Math.floor(careCapacity(s) + 1e-9);
  const patients = inCity(s)
    .filter((p) => p.health !== 'ok')
    .sort((a, b) => (a.health === b.health ? a.id - b.id : a.health === 'grave' ? -1 : 1));
  return new Set(patients.slice(0, cap).map((p) => p.id));
}

function kill(s: GameState, p: Person, cause: string): void {
  s.people.splice(s.people.indexOf(p), 1);
  for (const b of s.buildings) {
    const i = b.workers.indexOf(p.id);
    if (i >= 0) b.workers.splice(i, 1);
  }
  s.dead++;
  s.deaths[cause] = (s.deaths[cause] ?? 0) + 1;
  const cemetery = hasLaw(s, 'schneegrab') || s.buildings.some((b) => b.type === 'friedhof' && b.built >= 1);
  s.hope -= cemetery ? 1 : 2;
  if (hasLaw(s, 'schneegrab')) s.discontent += 0.5;
  log(s, `${p.name} ist gestorben.`, 'death');
}

function recover(p: Person, amputee: boolean): void {
  p.health = 'ok';
  p.sickHours = 0;
  if (amputee) p.amputee = true;
}

/** Sickness from exposure, then care, recovery and death of the patients. Returns the cared patients. */
function healthHour(s: GameState): Set<number> {
  for (const p of inCity(s)) {
    if (p.health === 'ok') {
      let risk = SICK_RISK[heatLevel(spot(s, p).temp)];
      if (p.hunger >= 1) risk *= 1.6;
      if (hasLaw(s, 'suppe')) risk *= 1.15;
      if (spot(s, p).atWork && hasLaw(s, 'notschicht')) risk *= 1.1;
      if (risk > 0 && chance(s, risk)) {
        p.health = 'sick';
        p.sickHours = 0;
      }
    }
    if (p.health !== 'ok') leaveJob(s, p);
  }

  const cared = carePlan(s);
  const lazarettStaffed = s.buildings.some((b) => b.type === 'lazarett' && staffedShare(s, b) > 0);
  const sickCure = lazarettStaffed ? 18 : 30;
  const graveCure = hasLaw(s, 'amputation') ? 24 : hasTech(s, 'penicillin') ? 30 : 60;
  for (const p of inCity(s).filter((x) => x.health !== 'ok')) {
    const isCared = cared.has(p.id);
    p.sickHours += 1;
    if (p.health === 'sick') {
      if (isCared) {
        if (p.sickHours >= sickCure) recover(p, false);
      } else if (chance(s, 1 / 48)) {
        p.health = 'grave';
        p.sickHours = 0;
      }
    } else if (isCared) {
      if (p.sickHours >= graveCure) recover(p, hasLaw(s, 'amputation'));
      else if (chance(s, 1 / 200)) kill(s, p, 'krankheit');
    } else if (chance(s, 1 / 36)) {
      kill(s, p, 'krankheit');
    }
  }
  return cared;
}

// ── meals ────────────────────────────────────────────────────────────────

/** Everybody in the city eats one ration at 19:00; hunger builds up without one. */
function mealHour(s: GameState, cared: Set<number>): void {
  const city = inCity(s);
  if (hasLaw(s, 'pflegestation')) s.res.rations = Math.max(0, s.res.rations - city.filter((p) => cared.has(p.id)).length);
  for (const p of city) {
    const cost = hasLaw(s, 'lebensmittelkarten') && (p.kind === 'child' || p.job === null) ? 0.5 : 1;
    if (s.res.rations >= cost) {
      s.res.rations -= cost;
      p.hunger = 0;
    } else {
      p.hunger++;
    }
  }
  for (const p of inCity(s)) if (p.hunger >= 3 && chance(s, 0.2)) kill(s, p, 'hunger');
}

// ── mood ─────────────────────────────────────────────────────────────────

interface MoodParts {
  pop: number;
  homeless: number;
  hungry: number;
  untreated: number;
  coldHomes: number;
}

function moodParts(s: GameState, cared: Set<number>): MoodParts {
  const city = inCity(s);
  const parts: MoodParts = { pop: city.length, homeless: 0, hungry: 0, untreated: 0, coldHomes: 0 };
  for (const p of city) {
    const h = housing(s, p);
    if (!h) parts.homeless++;
    else if (heatLevel(cellTemp(s, h.cell)) <= 1) parts.coldHomes++;
    if (p.hunger >= 1) parts.hungry++;
    if (p.health !== 'ok' && !cared.has(p.id)) parts.untreated++;
  }
  return parts;
}

function pressure(m: MoodParts): number {
  return m.pop ? (m.homeless + 1.5 * m.hungry + m.untreated + 0.5 * m.coldHomes) / m.pop : 0;
}

function lawMoodHour(s: GameState): { hope: number; discontent: number } {
  let hope = 0;
  let discontent = 0;
  for (const id of s.laws.signed) {
    const m = LAW_MOOD[id];
    if (m) {
      hope += m.hope ?? 0;
      discontent += m.discontent ?? 0;
    }
  }
  return { hope, discontent };
}

function moodHour(s: GameState, cared: Set<number>): void {
  const pr = pressure(moodParts(s, cared));
  let relief = 0;
  let chapel = 0;
  for (const b of s.buildings) {
    const d = def(b.type);
    if (b.built < 1 || (!d.relief && !d.hopeBoost)) continue;
    const share = staffedShare(s, b);
    relief += (d.relief ?? 0) * share;
    chapel += (d.hopeBoost ?? 0) * share;
  }
  const law = lawMoodHour(s);
  s.discontent = clamp(s.discontent + pr * 1.2 - 0.15 - relief / 24 + law.discontent);
  s.hope = clamp(s.hope + (pr < 0.1 ? 0.05 : -pr * 0.4) + law.hope + chapel / 24);
}

/** Causes of the mood in plain German, for the Leute sheet. */
export function moodCauses(s: GameState): string[] {
  const m = moodParts(s, carePlan(s));
  const out: string[] = [];
  if (m.homeless) out.push(`${m.homeless} ${m.homeless === 1 ? 'Mensch' : 'Menschen'} ohne Dach`);
  if (m.hungry) out.push(`${m.hungry} ${m.hungry === 1 ? 'Mensch hungert' : 'Menschen hungern'}`);
  if (m.untreated) out.push(`${m.untreated} ${m.untreated === 1 ? 'Kranker' : 'Kranke'} ohne Pflege`);
  if (m.coldHomes) out.push(`${m.coldHomes} ${m.coldHomes === 1 ? 'Mensch wohnt' : 'Menschen wohnen'} in der Kälte`);
  return out;
}

// ── warnings and outcome ─────────────────────────────────────────────────

function outcomeHour(s: GameState): void {
  if (!s.people.length && !s.expeditions.length) {
    s.outcome = 'dead';
    log(s, 'Niemand ist mehr in der Siedlung.', 'death');
    return;
  }
  const w = s.warning;
  if (w) {
    const recovered = w.kind === 'revolt' ? s.discontent < 70 : s.hope > 25;
    if (recovered) {
      s.warning = null;
    } else if (s.time >= w.until) {
      const still = w.kind === 'revolt' ? s.discontent >= 85 : s.hope <= 15;
      if (still) {
        s.outcome = w.kind;
        log(s, w.kind === 'revolt' ? 'Der Aufstand bricht los.' : 'Die Stadt gibt auf.', 'bad');
      } else {
        s.warning = null;
      }
    }
  } else if (s.discontent >= 90) {
    s.warning = { kind: 'revolt', until: s.time + 48 };
    log(s, 'Die Leute sind kurz vor dem Aufstand. 48 Stunden.', 'bad');
  } else if (s.hope <= 10) {
    s.warning = { kind: 'despair', until: s.time + 48 };
    log(s, 'Die Hoffnung erlischt. 48 Stunden.', 'bad');
  }
}

// ── census ───────────────────────────────────────────────────────────────

export interface Census {
  total: number;
  workers: number;
  engineers: number;
  children: number;
  homeless: number;
  sick: number;
  grave: number;
  hungry: number;
  idle: number;
  away: number;
}

/** Counts for the Leute sheet. Kinds, sickness and hunger cover everybody; homeless and idle only the city. */
export function census(s: GameState): Census {
  const away = awaySet(s);
  const c: Census = { total: s.people.length, workers: 0, engineers: 0, children: 0, homeless: 0, sick: 0, grave: 0, hungry: 0, idle: idle(s).length, away: 0 };
  for (const p of s.people) {
    if (p.kind === 'worker') c.workers++;
    else if (p.kind === 'engineer') c.engineers++;
    else c.children++;
    if (p.health === 'sick') c.sick++;
    if (p.health === 'grave') c.grave++;
    if (p.hunger >= 1) c.hungry++;
    if (away.has(p.id)) c.away++;
    else if (!housing(s, p)) c.homeless++;
  }
  return c;
}

// ── the hour ─────────────────────────────────────────────────────────────

/** Runs once per game hour: homes → health → meals (19:00) → mood → warnings and outcome. */
export function peopleHour(s: GameState): void {
  assignHomes(s);
  const cared = healthHour(s);
  if (hourOfDay(s) === MEAL_HOUR) mealHour(s, cared);
  moodHour(s, cared);
  outcomeHour(s);
}

SYSTEMS.push(peopleHour);
