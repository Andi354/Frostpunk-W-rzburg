import { GRID, RINGS, angularDistance, type Cell } from './grid';
import { pick, nextRandom, randInt, type RngHolder } from './rng';
import type { Building, GameState, LogEntry, Origin, Person, PersonKind } from './types';
import { FIRST_F, FIRST_M, LAST_EXP, LAST_WUE } from './data/names';

export function makeName(h: RngHolder, origin: Origin): string {
  const first = nextRandom(h) < 0.5 ? pick(h, FIRST_M) : pick(h, FIRST_F);
  return `${first} ${pick(h, origin === 'wue' ? LAST_WUE : LAST_EXP)}`;
}

export function addPerson(s: GameState, kind: PersonKind, origin: Origin): Person {
  const p: Person = { id: s.nextId++, name: makeName(s, origin), kind, origin, health: 'ok', sickHours: 0, hunger: 0, home: null, job: null };
  s.people.push(p);
  return p;
}

export function addBuilding(s: GameState, type: string, cell: number, built = 1, amount?: number): Building {
  const b: Building = { id: s.nextId++, type, cell, built, workers: [], on: true };
  if (amount !== undefined) b.amount = amount;
  s.buildings.push(b);
  return b;
}

export function log(s: GameState, text: string, kind: LogEntry['kind'] = 'info'): void {
  s.log.push({ t: s.time, text, kind });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}

function freeCells(s: GameState, filter: (c: Cell) => boolean): Cell[] {
  const used = new Set(s.buildings.map((b) => b.cell));
  return GRID.filter((c) => !used.has(c.id) && filter(c));
}

function placeAround(s: GameState, type: string, angle: number, count: number, ring: number): void {
  const candidates = freeCells(s, (c) => c.ring === ring).sort(
    (a, b) => angularDistance((a.a0 + a.a1) / 2, angle) - angularDistance((b.a0 + b.a1) / 2, angle),
  );
  for (const c of candidates.slice(0, count)) addBuilding(s, type, c.id);
}

function scatter(s: GameState, type: string, count: number, minRing: number, maxRing: number, min: number, max: number): void {
  for (let i = 0; i < count; i++) {
    const cells = freeCells(s, (c) => c.ring >= minRing && c.ring <= maxRing);
    if (!cells.length) return;
    const c = cells[Math.floor(nextRandom(s) * cells.length)];
    addBuilding(s, type, c.id, 1, randInt(s, min, max));
  }
}

export function newGame(seed = 1946): GameState {
  const s: GameState = {
    version: 1,
    rng: seed,
    time: 7, // 07:00 on 1 December 1946
    res: { coal: 180, wood: 110, steel: 25, bricks: 40, food: 50, rations: 70, parts: 0 },
    gen: { on: false, level: 1, overdrive: false, stress: 0 },
    buildings: [],
    nextId: 1,
    people: [],
    dead: 0,
    deaths: {},
    arrived: 0,
    hope: 55,
    discontent: 10,
    research: { done: [], current: null, progress: 0 },
    laws: { signed: [], readyAt: 0, path: null },
    explored: [],
    expeditions: [],
    events: { fired: [], pending: [], scheduled: [] },
    flags: {},
    log: [],
    warning: null,
    outcome: null,
    seenIntro: false,
  };

  // endless deposits at the crater edge; the city lies to the west (angle π)
  placeAround(s, 'dep_wood', -Math.PI / 3, 3, RINGS); // north-east: forest toward Gramschatz
  placeAround(s, 'dep_coal', 0.35, 2, RINGS); // east: the plant's buried coal store
  placeAround(s, 'dep_steel', Math.PI / 2, 2, RINGS); // south: airfield hangars
  placeAround(s, 'dep_rubble', (Math.PI * 3) / 4, 2, RINGS); // south-west: Galgenberg barracks

  scatter(s, 'pile_coal', 8, 1, 4, 70, 140);
  scatter(s, 'pile_wood', 9, 1, 5, 60, 120);
  scatter(s, 'pile_rubble', 11, 2, 6, 80, 160);
  scatter(s, 'pile_steel', 5, 3, 6, 40, 80);
  scatter(s, 'pile_food', 3, 2, 5, 40, 70);

  const kinds: [PersonKind, number][] = [['worker', 34], ['engineer', 12], ['child', 18]];
  for (const [kind, n] of kinds) {
    for (let i = 0; i < n; i++) addPerson(s, kind, nextRandom(s) < 0.15 ? 'expellee' : 'wue');
  }
  return s;
}

export function alive(s: GameState): Person[] {
  return s.people;
}

export function buildingById(s: GameState, id: number | null): Building | undefined {
  return id === null ? undefined : s.buildings.find((b) => b.id === id);
}
