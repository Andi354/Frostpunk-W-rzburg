import '../src/sim/index';
import { describe, expect, it } from 'vitest';
import { GRID } from '../src/sim/grid';
import { def } from '../src/sim/data/buildings';
import { newGame } from '../src/sim/state';
import { advance, setBoiler, setBoilerLevel, setOverdrive } from '../src/sim/sim';
import { outsideTemp } from '../src/sim/weather';
import { assign, canPlace, idle, placeBuilding } from '../src/sim/economy';
import { canResearch, startResearch } from '../src/sim/research';
import { resolveEvent } from '../src/sim/story';
import type { GameState } from '../src/sim/types';

// Balance acceptance: two complete 35-day games played only through the public sim API.
// If the bot fails, the numbers are tuned (pile amounts, production rates, sickness rates), never this test.

const SEED = 1946;
const MAX_HOURS = 24 * 36; // the scenario ends on day 35 at 18:00; this is only a safety net

// ── the game loop ────────────────────────────────────────────────────────

type Bot = (s: GameState) => void;

/** Play hour by hour: decide every pending event with choice 0, let the bot act, advance one hour. */
function play(s: GameState, bot: Bot, onHour?: (s: GameState) => void): void {
  for (let hour = 0; hour < MAX_HOURS && !s.outcome; hour++) {
    for (let guard = 0; s.events.pending.length && guard < 20; guard++) resolveEvent(s, 0);
    bot(s);
    advance(s, 1);
    onHour?.(s);
  }
}

/** Share of the played hours in which the mood was fine: discontent below 75 and hope above 25. */
function calmShare(s: GameState, bot: Bot): number {
  let calm = 0;
  let total = 0;
  play(s, bot, (g) => {
    total++;
    if (g.discontent < 75 && g.hope > 25) calm++;
  });
  return total ? calm / total : 0;
}

/** Share of the people of the first day who are still alive. */
function survivors(s: GameState, startIds: Set<number>): number {
  return s.people.filter((p) => startIds.has(p.id)).length / startIds.size;
}

function summary(s: GameState, share: number): string {
  const day = Math.floor(s.time / 24) + 1;
  return `outcome=${s.outcome} day=${day} alive=${Math.round(share * 100)}% dead=${s.dead} causes=${JSON.stringify(s.deaths)} ` +
    `coal=${Math.round(s.res.coal)} rations=${Math.round(s.res.rations)} hope=${Math.round(s.hope)} discontent=${Math.round(s.discontent)}`;
}

// ── the bots ─────────────────────────────────────────────────────────────

/** The idle bot lights the boiler and nothing else. */
const idleBot: Bot = (s) => {
  if (!s.gen.on) setBoiler(s, true);
};

// Sensible bot ----------------------------------------------------------

/** Light the boiler, run it on the pressure the weather asks for, overdrive only in the cold snaps while coal and stress allow. */
function tendBoiler(s: GameState): void {
  if (!s.gen.on) setBoiler(s, true);
  const temp = outsideTemp(s.time);
  setBoilerLevel(s, temp < -45 ? 3 : temp < -25 ? 2 : 1);
  const start = temp < -55 && s.res.coal > 250 && s.gen.stress < 60;
  const keep = s.gen.overdrive && temp < -50 && s.res.coal > 120 && s.gen.stress < 80;
  setOverdrive(s, start || keep);
}

/** What to build, in this order; a step is done when that many of the type exist (also unfinished). */
const PLAN: { type: string; count: number }[] = [
  { type: 'zelt', count: 3 },
  { type: 'kohlengrube', count: 1 },
  { type: 'holzfaeller', count: 1 },
  { type: 'jagdhuette', count: 1 },
  { type: 'kueche', count: 1 },
  { type: 'zelt', count: 7 }, // a bed for everybody
  { type: 'jagdhuette', count: 2 },
  { type: 'kohlengrube', count: 2 }, // both coal deposits
  { type: 'sanitaet', count: 1 },
  { type: 'werkstatt', count: 1 },
  { type: 'hangar', count: 1 },
  { type: 'waermestube', count: 2 },
  { type: 'lazarett', count: 1 },
  { type: 'nissen', count: 2 },
];

const DEPOSIT_OF: Record<string, string> = {
  kohlengrube: 'dep_coal',
  holzfaeller: 'dep_wood',
  hangar: 'dep_steel',
  truemmerbahn: 'dep_rubble',
};

const owned = (s: GameState, type: string) => s.buildings.filter((b) => b.type === type).length;

/** Buildings on a deposit go on a free deposit of their kind, everything else on the free cell nearest to the boiler. */
function cellFor(s: GameState, type: string): number | null {
  const deposit = DEPOSIT_OF[type];
  if (deposit) return s.buildings.find((b) => b.type === deposit)?.cell ?? null;
  const used = new Set(s.buildings.map((b) => b.cell));
  const free = GRID.filter((c) => !used.has(c.id)).sort((a, b) => a.ring - b.ring || a.id - b.id);
  return free.length ? free[0].id : null;
}

/** Place at most one building per hour: the first open step of the plan; wait (save up) if it is only the material that is missing. */
function build(s: GameState): void {
  for (const step of PLAN) {
    if (owned(s, step.type) >= step.count) continue;
    const cell = cellFor(s, step.type);
    if (cell === null) continue;
    const why = canPlace(s, step.type, cell);
    if (why === 'Nicht genug Material') return;
    if (why === null) {
      placeBuilding(s, step.type, cell);
      return;
    }
  }
}

const RESEARCH_ORDER = [
  'rost', 'daemmung', 'nissenhuetten', 'waermestube', 'kohlenbohrer', 'lazarett', 'fallen', 'heizrohre', 'rechenschieber', 'saege',
];

/** Research the next technology of the list whenever the workshop is free and the material is there. */
function research(s: GameState): void {
  if (s.research.current) return;
  const next = RESEARCH_ORDER.find((id) => !s.research.done.includes(id));
  if (next && canResearch(s, next) === null) startResearch(s, next);
}

/** Heaters burn coal only while there is some to spare. */
function heaters(s: GameState): void {
  for (const b of s.buildings) if (b.type === 'waermestube' && b.built >= 1) b.on = s.res.coal > 80;
}

/** Engineer buildings first (they take only engineers), then coal, food and wood; leftover people work the piles. */
const STAFF_ORDER = ['sanitaet', 'werkstatt', 'lazarett', 'kueche', 'kohlengrube', 'jagdhuette', 'holzfaeller', 'hangar', 'truemmerbahn'];

/** Food and wood are only worked while the stock is short; the people go to coal otherwise. */
const STOCK_MAX: Partial<Record<string, [resource: 'food' | 'wood' | 'rations', max: number]>> = {
  kueche: ['rations', 150],
  jagdhuette: ['food', 200],
  holzfaeller: ['wood', 200],
};

/** Staff every finished building again each hour in priority order; whoever is left over works the coal and wood piles. */
function staff(s: GameState): void {
  for (const b of s.buildings) if (b.workers.length && def(b.type).slots) assign(s, b.id, -b.workers.length);
  const piles = s.buildings.filter((b) => b.type === 'pile_coal' || b.type === 'pile_wood').sort((a, b) => (a.type < b.type ? -1 : 1));
  const order = STAFF_ORDER.filter((type) => {
    const limit = STOCK_MAX[type];
    return !limit || s.res[limit[0]] < limit[1];
  });
  for (const type of order) {
    for (const b of s.buildings) {
      if (b.type !== type || b.built < 1) continue;
      const free = (def(type).slots ?? 0) - b.workers.length;
      if (free > 0 && idle(s).length) assign(s, b.id, free);
    }
  }
  for (const p of piles) if (idle(s).length) assign(s, p.id, 5);
}

const sensibleBot: Bot = (s) => {
  tendBoiler(s);
  build(s);
  research(s);
  heaters(s);
  staff(s);
};

/** The sloppy bot: like the sensible one, but builds one day late, never overdrives, never signs laws, and sends people to work only every second day. */
const sloppyBot: Bot = (s) => {
  if (!s.gen.on) setBoiler(s, true);
  const temp = outsideTemp(s.time);
  setBoilerLevel(s, temp < -45 ? 3 : temp < -25 ? 2 : 1);
  if (s.time < 24) return;
  build(s);
  research(s);
  heaters(s);
  if (Math.floor(s.time / 24) % 2 === 0 && s.time % 24 === 8) staff(s);
};

// ── the two games ────────────────────────────────────────────────────────

describe('balance: the 35 days of the scenario', () => {
  it('a sensible player wins with at least 60 % of the people alive and a calm mood most of the time', () => {
    const s = newGame(SEED);
    const startIds = new Set(s.people.map((p) => p.id));
    const calm = calmShare(s, sensibleBot);
    const share = survivors(s, startIds);
    expect(s.outcome, summary(s, share)).toBe('won');
    expect(share, summary(s, share)).toBeGreaterThanOrEqual(0.6);
    expect(calm, `${summary(s, share)} calm=${calm.toFixed(2)}`).toBeGreaterThanOrEqual(0.8);
    expect(s.dead, 'the storm days still bite').toBeGreaterThan(0);
  }, 10_000);

  it('somebody who only lights the boiler loses, but not before day 6', () => {
    const s = newGame(SEED);
    const startIds = new Set(s.people.map((p) => p.id));
    play(s, idleBot);
    const share = survivors(s, startIds);
    const lost = s.outcome !== 'won' || share <= 0.4;
    expect(lost, summary(s, share)).toBe(true);
    expect(Math.floor(s.time / 24) + 1, summary(s, share)).toBeGreaterThanOrEqual(6);
  }, 10_000);

  it('a sloppy player lasts at least until day 20', () => {
    const s = newGame(SEED);
    const startIds = new Set(s.people.map((p) => p.id));
    play(s, sloppyBot);
    const share = survivors(s, startIds);
    expect(Math.floor(s.time / 24) + 1, summary(s, share)).toBeGreaterThanOrEqual(20);
  }, 10_000);
});

// Prints the numbers for tuning: BALANCE_REPORT=1 npx vitest run test/balance.test.ts
describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.BALANCE_REPORT)('balance report', () => {
  it.each([['sensible', sensibleBot], ['idle', idleBot], ['sloppy', sloppyBot]] as const)('%s', (name, bot) => {
    for (const seed of [SEED, 1, 2, 3]) {
      const s = newGame(seed);
      const ids = new Set(s.people.map((p) => p.id));
      const calm = calmShare(s, bot);
      console.log(`${name} seed=${seed} ${summary(s, survivors(s, ids))} calm=${calm.toFixed(2)}`);
    }
  });
});
