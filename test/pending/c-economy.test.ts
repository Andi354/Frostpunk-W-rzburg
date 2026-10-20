import '../src/sim/index';
import { describe, expect, it } from 'vitest';
import { GRID } from '../src/sim/grid';
import { BUILDINGS, def } from '../src/sim/data/buildings';
import { cellTemp, heatLevel } from '../src/sim/heat';
import { addBuilding, addPerson, newGame } from '../src/sim/state';
import { assign, canPlace, constructionHour, demolish, efficiency, idle, placeBuilding, productionHour } from '../src/sim/economy';
import { canAfford, hasLaw, isWorkHour, pay, refund, workHours } from '../src/sim/util';
import type { Building, GameState, PersonKind } from '../src/sim/types';

// ── helpers ──────────────────────────────────────────────────────────────

/** A cell of the given ring without any building on it. */
function freeCell(s: GameState, ring = 7, skip = 0): number {
  const used = new Set(s.buildings.map((b) => b.cell));
  return GRID.filter((c) => c.ring === ring && !used.has(c.id))[skip].id;
}

function depositCell(s: GameState, type: string): number {
  return s.buildings.find((b) => b.type === type)!.cell;
}

/** Plenty of everything, so that only the rule under test can refuse a placement. */
function rich(s: GameState): void {
  s.res = { coal: 500, wood: 500, steel: 500, bricks: 500, food: 500, rations: 500, parts: 50 };
}

/** Replace the population by exactly this many people of each kind (all healthy and without job). */
function population(s: GameState, workers: number, engineers = 0, children = 0): void {
  s.people = [];
  const add = (kind: PersonKind, n: number) => {
    for (let i = 0; i < n; i++) addPerson(s, kind, 'wue');
  };
  add('worker', workers);
  add('engineer', engineers);
  add('child', children);
}

/** Boiler at full blast: every cell of ring 1..3 is warm (heat level 4, efficiency factor 1). */
function warmCity(s: GameState): void {
  s.gen = { on: true, level: 3, overdrive: true, stress: 0 };
}

/** Day 3 at the given hour. */
function atHour(s: GameState, hour: number): void {
  s.time = 24 * 2 + hour;
}

/** A finished building on a free inner cell (ring 1), staffed with up to `staff` idle people. */
function staffed(s: GameState, type: string, staff: number, skip = 0): Building {
  const b = addBuilding(s, type, freeCell(s, 1, skip), 1);
  if (staff) assign(s, b.id, staff);
  return b;
}

function expedition(ids: number[]) {
  return { id: 99, site: 'hublandcenter', members: ids, leaveAt: 0, arriveAt: 5, returnAt: 10, phase: 'out' as const };
}

// ── shared helpers (util.ts) ─────────────────────────────────────────────

describe('util helpers', () => {
  it('work hours are 8 to 18 without laws', () => {
    const s = newGame(1);
    expect(workHours(s)).toEqual([8, 18]);
  });

  it('isWorkHour is true from 08:00 up to but excluding 18:00', () => {
    const s = newGame(1);
    const at = (h: number) => {
      s.time = 24 + h;
      return isWorkHour(s);
    };
    expect([at(7), at(8), at(12), at(17), at(18), at(23)]).toEqual([false, true, true, true, false, false]);
  });

  it('hasLaw reads the signed laws', () => {
    const s = newGame(1);
    expect(hasLaw(s, 'suppe')).toBe(false);
    s.laws.signed.push('suppe');
    expect(hasLaw(s, 'suppe')).toBe(true);
  });

  it('canAfford compares every resource of the cost with the stock', () => {
    const s = newGame(1);
    expect(canAfford(s, { wood: 110, steel: 25 })).toBe(true);
    expect(canAfford(s, { wood: 110, steel: 26 })).toBe(false);
    expect(canAfford(s, {})).toBe(true);
  });

  it('pay subtracts and refund adds back the given fraction', () => {
    const s = newGame(1);
    pay(s, { wood: 30, bricks: 10 });
    expect(s.res.wood).toBe(80);
    expect(s.res.bricks).toBe(30);
    refund(s, { wood: 30, bricks: 10 }, 0.5);
    expect(s.res.wood).toBe(95);
    expect(s.res.bricks).toBe(35);
  });
});

// ── building data ────────────────────────────────────────────────────────

describe('building definitions', () => {
  it('keeps piles and deposits and adds every building of the spec', () => {
    const ids = [
      'zelt', 'nissen', 'ziegelhaus', 'kohlengrube', 'holzfaeller', 'hangar', 'truemmerbahn', 'koehlerei', 'jagdhuette', 'kueche',
      'gewaechshaus', 'sanitaet', 'lazarett', 'waermestube', 'werkstatt', 'kundschafter', 'funkstation', 'friedhof', 'weinstube',
      'kinderhort', 'wachstube', 'kapelle', 'pile_coal', 'dep_coal',
    ];
    for (const id of ids) expect(BUILDINGS[id], id).toBeDefined();
  });

  it('has the costs, build times and slots of the spec for a few buildings', () => {
    expect(def('zelt')).toMatchObject({ cost: { wood: 10 }, buildHours: 4, beds: 10 });
    expect(def('kohlengrube')).toMatchObject({ cost: { wood: 25, steel: 10 }, buildHours: 12, slots: 10, staff: 'worker', onDeposit: 'dep_coal' });
    expect(def('kueche')).toMatchObject({ slots: 5, staff: 'any', consumes: { food: 2.5 }, produces: { rations: 2.5 } });
    expect(def('sanitaet')).toMatchObject({ slots: 5, staff: 'engineer', care: 5 });
    expect(def('jagdhuette').dayOnly).toBe(true);
    expect(def('kundschafter').unique).toBe(true);
  });

  it('every building has a German description', () => {
    for (const d of Object.values(BUILDINGS)) expect(d.desc.length, d.id).toBeGreaterThan(10);
  });
});

// ── placing ──────────────────────────────────────────────────────────────

describe('canPlace', () => {
  it('allows a tent on a free cell when the wood is there', () => {
    const s = newGame(1);
    expect(canPlace(s, 'zelt', freeCell(s))).toBeNull();
  });

  it('refuses a cell that is occupied (pile)', () => {
    const s = newGame(1);
    const pile = depositCell(s, 'pile_coal');
    expect(canPlace(s, 'zelt', pile)).toBe('Feld belegt');
  });

  it('refuses a cell that is occupied by another building', () => {
    const s = newGame(1);
    const cell = freeCell(s);
    addBuilding(s, 'zelt', cell, 1);
    expect(canPlace(s, 'zelt', cell)).toBe('Feld belegt');
  });

  it('refuses a normal building on a deposit cell', () => {
    const s = newGame(1);
    expect(canPlace(s, 'zelt', depositCell(s, 'dep_coal'))).toBe('Feld belegt');
  });

  it('refuses a deposit building on a free cell and names the deposit', () => {
    const s = newGame(1);
    expect(canPlace(s, 'kohlengrube', freeCell(s))).toBe(`Nur auf ${def('dep_coal').name}`);
    expect(canPlace(s, 'holzfaeller', freeCell(s))).toBe(`Nur auf ${def('dep_wood').name}`);
  });

  it('refuses a deposit building on a deposit of the wrong kind', () => {
    const s = newGame(1);
    expect(canPlace(s, 'kohlengrube', depositCell(s, 'dep_wood'))).not.toBeNull();
  });

  it('allows a deposit building on its own deposit', () => {
    const s = newGame(1);
    expect(canPlace(s, 'kohlengrube', depositCell(s, 'dep_coal'))).toBeNull();
    expect(canPlace(s, 'holzfaeller', depositCell(s, 'dep_wood'))).toBeNull();
    expect(canPlace(s, 'hangar', depositCell(s, 'dep_steel'))).toBeNull();
    expect(canPlace(s, 'truemmerbahn', depositCell(s, 'dep_rubble'))).toBeNull();
  });

  it('refuses a building whose technology is not researched', () => {
    const s = newGame(1);
    rich(s);
    expect(canPlace(s, 'nissen', freeCell(s))).toBe('Noch nicht erforscht');
    s.research.done.push('nissenhuetten');
    expect(canPlace(s, 'nissen', freeCell(s))).toBeNull();
  });

  it('refuses a building whose law is not signed', () => {
    const s = newGame(1);
    rich(s);
    expect(canPlace(s, 'friedhof', freeCell(s))).toBe('Gesetz fehlt');
    s.laws.signed.push('friedhof');
    expect(canPlace(s, 'friedhof', freeCell(s))).toBeNull();
  });

  it('refuses when the material is short', () => {
    const s = newGame(1);
    s.res.wood = 9;
    expect(canPlace(s, 'zelt', freeCell(s))).toBe('Nicht genug Material');
    s.res.wood = 10;
    expect(canPlace(s, 'zelt', freeCell(s))).toBeNull();
  });

  it('allows a unique building only once, even while it is still under construction', () => {
    const s = newGame(1);
    rich(s);
    s.research.done.push('kundschafter');
    expect(canPlace(s, 'kundschafter', freeCell(s, 7, 0))).toBeNull();
    placeBuilding(s, 'kundschafter', freeCell(s, 7, 0));
    expect(canPlace(s, 'kundschafter', freeCell(s, 7, 0))).toBe('Nur einmal erlaubt');
  });

  it('never allows piles or deposits to be placed', () => {
    const s = newGame(1);
    rich(s);
    expect(canPlace(s, 'pile_coal', freeCell(s))).not.toBeNull();
    expect(canPlace(s, 'dep_coal', freeCell(s))).not.toBeNull();
    const before = s.buildings.length;
    expect(placeBuilding(s, 'pile_coal', freeCell(s))).toBeNull();
    expect(s.buildings.length).toBe(before);
  });
});

describe('placeBuilding', () => {
  it('creates an unfinished building on the cell and pays the cost', () => {
    const s = newGame(1);
    const cell = freeCell(s);
    const woodBefore = s.res.wood;
    const b = placeBuilding(s, 'zelt', cell)!;
    expect(b).not.toBeNull();
    expect(b.type).toBe('zelt');
    expect(b.cell).toBe(cell);
    expect(b.built).toBe(0);
    expect(s.buildings).toContain(b);
    expect(s.res.wood).toBe(woodBefore - 10);
  });

  it('pays every resource of a multi-resource cost', () => {
    const s = newGame(1);
    const { wood, steel } = s.res;
    placeBuilding(s, 'kohlengrube', depositCell(s, 'dep_coal'));
    expect(s.res.wood).toBe(wood - 25);
    expect(s.res.steel).toBe(steel - 10);
  });

  it('returns null and changes nothing when the placement is refused', () => {
    const s = newGame(1);
    s.res.wood = 5;
    const count = s.buildings.length;
    expect(placeBuilding(s, 'zelt', freeCell(s))).toBeNull();
    expect(s.res.wood).toBe(5);
    expect(s.buildings.length).toBe(count);
  });

  it('gives every placed building a fresh id', () => {
    const s = newGame(1);
    const a = placeBuilding(s, 'zelt', freeCell(s, 7, 0))!;
    const b = placeBuilding(s, 'zelt', freeCell(s, 7, 1))!;
    expect(a.id).not.toBe(b.id);
  });
});

describe('deposits', () => {
  it('replaces the deposit by the building and remembers the deposit kind', () => {
    const s = newGame(1);
    const cell = depositCell(s, 'dep_coal');
    const b = placeBuilding(s, 'kohlengrube', cell)!;
    expect(b.deposit).toBe('dep_coal');
    expect(s.buildings.filter((x) => x.cell === cell)).toEqual([b]);
    expect(s.buildings.some((x) => x.type === 'dep_coal' && x.cell === cell)).toBe(false);
  });

  it('keeps the cell occupied while the building stands', () => {
    const s = newGame(1);
    const cell = depositCell(s, 'dep_coal');
    placeBuilding(s, 'kohlengrube', cell);
    expect(canPlace(s, 'kohlengrube', cell)).toBe('Feld belegt');
  });

  it('restores the deposit when the building is demolished', () => {
    const s = newGame(1);
    const cell = depositCell(s, 'dep_wood');
    const b = placeBuilding(s, 'holzfaeller', cell)!;
    demolish(s, b.id);
    const onCell = s.buildings.filter((x) => x.cell === cell);
    expect(onCell.map((x) => x.type)).toEqual(['dep_wood']);
    expect(canPlace(s, 'holzfaeller', cell)).toBeNull();
  });

  it('two mines on the two coal deposits work, a third has no deposit left', () => {
    const s = newGame(1);
    rich(s);
    const coalCells = s.buildings.filter((b) => b.type === 'dep_coal').map((b) => b.cell);
    expect(coalCells.length).toBe(2);
    for (const c of coalCells) expect(placeBuilding(s, 'kohlengrube', c)).not.toBeNull();
    expect(canPlace(s, 'kohlengrube', freeCell(s))).not.toBeNull();
  });
});

// ── demolish ─────────────────────────────────────────────────────────────

describe('demolish', () => {
  it('removes the building and refunds half of the cost', () => {
    const s = newGame(1);
    const b = placeBuilding(s, 'kueche', freeCell(s))!; // wood 20, bricks 10
    const wood = s.res.wood;
    const bricks = s.res.bricks;
    demolish(s, b.id);
    expect(s.buildings.some((x) => x.id === b.id)).toBe(false);
    expect(s.res.wood).toBeCloseTo(wood + 10);
    expect(s.res.bricks).toBeCloseTo(bricks + 5);
  });

  it('refunds half also for a finished building', () => {
    const s = newGame(1);
    const b = placeBuilding(s, 'kueche', freeCell(s))!;
    b.built = 1;
    const wood = s.res.wood;
    demolish(s, b.id);
    expect(s.res.wood).toBeCloseTo(wood + 10);
  });

  it('frees the workers', () => {
    const s = newGame(1);
    const b = staffed(s, 'holzfaeller', 3);
    const ids = [...b.workers];
    expect(ids.length).toBe(3);
    demolish(s, b.id);
    for (const id of ids) expect(s.people.find((p) => p.id === id)!.job).toBeNull();
    expect(idle(s).length).toBe(s.people.filter((p) => p.kind !== 'child').length);
  });

  it('makes the residents homeless', () => {
    const s = newGame(1);
    const tent = addBuilding(s, 'zelt', freeCell(s), 1);
    const [p, q] = s.people;
    p.home = tent.id;
    q.home = tent.id;
    demolish(s, tent.id);
    expect(p.home).toBeNull();
    expect(q.home).toBeNull();
  });
});

// ── construction ─────────────────────────────────────────────────────────

describe('constructionHour', () => {
  it('advances an unfinished building by 1 / buildHours per hour', () => {
    const s = newGame(1);
    const b = placeBuilding(s, 'zelt', freeCell(s))!; // 4 h
    constructionHour(s);
    expect(b.built).toBeCloseTo(0.25);
    constructionHour(s);
    expect(b.built).toBeCloseTo(0.5);
  });

  it('finishes after exactly buildHours hours', () => {
    const s = newGame(1);
    const b = placeBuilding(s, 'kohlengrube', depositCell(s, 'dep_coal'))!; // 12 h
    for (let i = 0; i < 11; i++) constructionHour(s);
    expect(b.built).toBeLessThan(1);
    constructionHour(s);
    expect(b.built).toBeCloseTo(1);
  });

  it('never exceeds 1 and does not log twice', () => {
    const s = newGame(1);
    placeBuilding(s, 'zelt', freeCell(s));
    for (let i = 0; i < 10; i++) constructionHour(s);
    expect(s.buildings.find((x) => x.type === 'zelt')!.built).toBe(1);
    expect(s.log.filter((l) => l.text === 'Fertig: Zelt').length).toBe(1);
  });

  it('logs "Fertig: <name>" as good news', () => {
    const s = newGame(1);
    placeBuilding(s, 'zelt', freeCell(s));
    for (let i = 0; i < 4; i++) constructionHour(s);
    expect(s.log).toContainEqual(expect.objectContaining({ text: 'Fertig: Zelt', kind: 'good' }));
  });

  it('builds all unfinished buildings at once, each with its own speed', () => {
    const s = newGame(1);
    const tent = placeBuilding(s, 'zelt', freeCell(s, 7, 0))!; // 4 h
    const mine = placeBuilding(s, 'kohlengrube', depositCell(s, 'dep_coal'))!; // 12 h
    constructionHour(s);
    expect(tent.built).toBeCloseTo(1 / 4);
    expect(mine.built).toBeCloseTo(1 / 12);
  });

  it('leaves finished buildings, piles and deposits alone', () => {
    const s = newGame(1);
    const pile = s.buildings.find((b) => b.type === 'pile_coal')!;
    const amount = pile.amount;
    constructionHour(s);
    expect(pile.built).toBe(1);
    expect(pile.amount).toBe(amount);
  });
});

// ── assigning people ─────────────────────────────────────────────────────

describe('idle', () => {
  it('lists healthy adults without a job', () => {
    const s = newGame(1);
    const ids = idle(s).map((p) => p.id);
    const expected = s.people.filter((p) => p.kind !== 'child').map((p) => p.id);
    expect(ids.sort()).toEqual(expected.sort());
  });

  it('can be filtered by kind', () => {
    const s = newGame(1);
    expect(idle(s, 'worker').every((p) => p.kind === 'worker')).toBe(true);
    expect(idle(s, 'engineer').length).toBe(s.people.filter((p) => p.kind === 'engineer').length);
  });

  it('skips sick and gravely sick people', () => {
    const s = newGame(1);
    population(s, 4);
    s.people[0].health = 'sick';
    s.people[1].health = 'grave';
    expect(idle(s).map((p) => p.id)).toEqual([s.people[2].id, s.people[3].id]);
  });

  it('skips people with a job', () => {
    const s = newGame(1);
    population(s, 3);
    s.people[0].job = 123;
    expect(idle(s).length).toBe(2);
  });

  it('skips people away on an expedition', () => {
    const s = newGame(1);
    population(s, 3);
    s.expeditions.push(expedition([s.people[0].id]));
    expect(idle(s).map((p) => p.id)).not.toContain(s.people[0].id);
    expect(idle(s).length).toBe(2);
  });

  it('includes children only with the law kinderarbeit', () => {
    const s = newGame(1);
    population(s, 2, 0, 3);
    expect(idle(s).length).toBe(2);
    expect(idle(s, 'child').length).toBe(0);
    s.laws.signed.push('kinderarbeit');
    expect(idle(s).length).toBe(5);
    expect(idle(s, 'child').length).toBe(3);
  });
});

describe('assign', () => {
  it('takes idle people into the building and sets their job', () => {
    const s = newGame(1);
    const b = staffed(s, 'holzfaeller', 0);
    expect(assign(s, b.id, 4)).toBe(4);
    expect(b.workers.length).toBe(4);
    for (const id of b.workers) expect(s.people.find((p) => p.id === id)!.job).toBe(b.id);
    expect(idle(s).length).toBe(s.people.filter((p) => p.kind !== 'child').length - 4);
  });

  it('never exceeds the slots', () => {
    const s = newGame(1);
    const b = staffed(s, 'holzfaeller', 0); // 10 slots
    expect(assign(s, b.id, 25)).toBe(10);
    expect(b.workers.length).toBe(10);
    expect(assign(s, b.id, 1)).toBe(0);
  });

  it('returns the actual change when there are not enough idle people', () => {
    const s = newGame(1);
    population(s, 3);
    const b = staffed(s, 'holzfaeller', 0);
    expect(assign(s, b.id, 8)).toBe(3);
    expect(b.workers.length).toBe(3);
  });

  it('a negative delta releases the last assigned people', () => {
    const s = newGame(1);
    const b = staffed(s, 'holzfaeller', 5);
    const before = [...b.workers];
    expect(assign(s, b.id, -2)).toBe(-2);
    expect(b.workers).toEqual(before.slice(0, 3));
    for (const id of before.slice(3)) expect(s.people.find((p) => p.id === id)!.job).toBeNull();
  });

  it('cannot release more people than are assigned', () => {
    const s = newGame(1);
    const b = staffed(s, 'holzfaeller', 2);
    expect(assign(s, b.id, -5)).toBe(-2);
    expect(b.workers.length).toBe(0);
  });

  it('worker slots prefer workers, then engineers', () => {
    const s = newGame(1);
    population(s, 2, 3);
    const b = staffed(s, 'holzfaeller', 0);
    assign(s, b.id, 3);
    const kinds = b.workers.map((id) => s.people.find((p) => p.id === id)!.kind);
    expect(kinds).toEqual(['worker', 'worker', 'engineer']);
  });

  it('worker slots take children last and only with the law kinderarbeit', () => {
    const s = newGame(1);
    population(s, 1, 1, 3);
    const b = staffed(s, 'holzfaeller', 0);
    expect(assign(s, b.id, 10)).toBe(2);
    s.laws.signed.push('kinderarbeit');
    expect(assign(s, b.id, 10)).toBe(3);
    const kinds = b.workers.map((id) => s.people.find((p) => p.id === id)!.kind);
    expect(kinds.slice(0, 2)).toEqual(['worker', 'engineer']);
    expect(kinds.slice(2)).toEqual(['child', 'child', 'child']);
  });

  it('engineer slots take only engineers', () => {
    const s = newGame(1);
    population(s, 10, 2);
    const b = staffed(s, 'sanitaet', 0); // 5 engineer slots
    expect(assign(s, b.id, 5)).toBe(2);
    for (const id of b.workers) expect(s.people.find((p) => p.id === id)!.kind).toBe('engineer');
  });

  it('engineer slots stay empty when there are no engineers', () => {
    const s = newGame(1);
    population(s, 10);
    const b = staffed(s, 'sanitaet', 0);
    expect(assign(s, b.id, 5)).toBe(0);
  });

  it('"any" slots take workers first, then engineers', () => {
    const s = newGame(1);
    population(s, 3, 5);
    const b = staffed(s, 'kueche', 0); // 5 any
    assign(s, b.id, 5);
    const kinds = b.workers.map((id) => s.people.find((p) => p.id === id)!.kind);
    expect(kinds).toEqual(['worker', 'worker', 'worker', 'engineer', 'engineer']);
  });

  it('piles can be worked directly by up to 5 people', () => {
    const s = newGame(1);
    const pile = addBuilding(s, 'pile_wood', freeCell(s), 1, 100);
    expect(assign(s, pile.id, 9)).toBe(5);
  });

  it('one person works in one place only', () => {
    const s = newGame(1);
    population(s, 4);
    const a = staffed(s, 'holzfaeller', 0, 0);
    const b = staffed(s, 'jagdhuette', 0, 1);
    assign(s, a.id, 3);
    expect(assign(s, b.id, 5)).toBe(1);
    expect(new Set([...a.workers, ...b.workers]).size).toBe(4);
  });
});

// ── production ───────────────────────────────────────────────────────────

describe('productionHour', () => {
  it('a staffed building produces rate × workers per hour (warm, no tech)', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'holzfaeller', 3); // wood 0.8
    atHour(s, 12);
    const wood = s.res.wood;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(wood + 0.8 * 3);
  });

  it('uses the efficiency of the building', () => {
    const s = newGame(1);
    const b = addBuilding(s, 'holzfaeller', freeCell(s, 7), 1);
    assign(s, b.id, 4);
    atHour(s, 12);
    const eff = efficiency(s, b);
    const wood = s.res.wood;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(wood + 0.8 * 4 * eff);
  });

  it('a building without workers produces nothing', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'holzfaeller', 0);
    atHour(s, 12);
    const before = { ...s.res };
    productionHour(s);
    expect(s.res).toEqual(before);
  });

  it('sick workers produce nothing', () => {
    const s = newGame(1);
    warmCity(s);
    const b = staffed(s, 'holzfaeller', 3);
    s.people.find((p) => p.id === b.workers[0])!.health = 'sick';
    atHour(s, 12);
    const wood = s.res.wood;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(wood + 0.8 * 2);
  });

  it('children count 0.6', () => {
    const s = newGame(1);
    warmCity(s);
    population(s, 0, 0, 2);
    s.laws.signed.push('kinderarbeit');
    staffed(s, 'holzfaeller', 2);
    atHour(s, 12);
    const wood = s.res.wood;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(wood + 0.8 * 2 * 0.6);
  });

  it('a building with two outputs produces both', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'truemmerbahn', 5); // bricks 0.8, wood 0.1
    atHour(s, 12);
    const { bricks, wood } = s.res;
    productionHour(s);
    expect(s.res.bricks).toBeCloseTo(bricks + 0.8 * 5);
    expect(s.res.wood).toBeCloseTo(wood + 0.1 * 5);
  });

  it('only runs in work hours', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'holzfaeller', 3);
    const wood = s.res.wood;
    for (const h of [0, 3, 7, 18, 22]) {
      atHour(s, h);
      productionHour(s);
    }
    expect(s.res.wood).toBe(wood);
    atHour(s, 8);
    productionHour(s);
    expect(s.res.wood).toBeGreaterThan(wood);
  });

  it('a day building (hunters) works at noon but not in the evening or early morning', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'jagdhuette', 3); // food 1.6, dayOnly
    const food = s.res.food;
    atHour(s, 12);
    productionHour(s);
    expect(s.res.food).toBeCloseTo(food + 1.6 * 3);
    const after = s.res.food;
    atHour(s, 17);
    productionHour(s);
    atHour(s, 7);
    productionHour(s);
    expect(s.res.food).toBe(after);
  });

  it('a normal building still works at 17:00', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'holzfaeller', 2);
    atHour(s, 17);
    const wood = s.res.wood;
    productionHour(s);
    expect(s.res.wood).toBeGreaterThan(wood);
  });
});

describe('converters', () => {
  it('the kitchen turns food into the same amount of rations', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'kueche', 2);
    atHour(s, 12);
    s.res.food = 100;
    s.res.rations = 0;
    productionHour(s);
    expect(s.res.food).toBeCloseTo(100 - 2.5 * 2);
    expect(s.res.rations).toBeCloseTo(2.5 * 2);
  });

  it('the kitchen is limited by the food in stock', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'kueche', 2); // would process 5 food
    atHour(s, 12);
    s.res.food = 3;
    s.res.rations = 0;
    productionHour(s);
    expect(s.res.food).toBeCloseTo(0);
    expect(s.res.rations).toBeCloseTo(3);
  });

  it('the kitchen does nothing without food', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'kueche', 2);
    atHour(s, 12);
    s.res.food = 0;
    s.res.rations = 5;
    productionHour(s);
    expect(s.res.rations).toBe(5);
    expect(s.res.food).toBe(0);
  });

  it('the charcoal kiln turns 1.2 wood into 2.0 coal per worker-hour', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'koehlerei', 1);
    atHour(s, 12);
    s.res.wood = 50;
    const coal = s.res.coal;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(50 - 1.2);
    expect(s.res.coal).toBeCloseTo(coal + 2.0);
  });

  it('the charcoal kiln scales down to the wood in stock', () => {
    const s = newGame(1);
    warmCity(s);
    staffed(s, 'koehlerei', 1);
    atHour(s, 12);
    s.res.wood = 0.6;
    const coal = s.res.coal;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(0);
    expect(s.res.coal).toBeCloseTo(coal + 1.0);
  });
});

describe('piles', () => {
  it('yield per worker-hour and shrink by the amount taken', () => {
    const s = newGame(1);
    warmCity(s);
    const pile = addBuilding(s, 'pile_coal', freeCell(s, 1), 1, 100); // coal 1.6
    assign(s, pile.id, 3);
    atHour(s, 12);
    const coal = s.res.coal;
    productionHour(s);
    expect(s.res.coal).toBeCloseTo(coal + 1.6 * 3);
    expect(pile.amount).toBeCloseTo(100 - 1.6 * 3);
  });

  it('yield every resource of a mixed pile', () => {
    const s = newGame(1);
    warmCity(s);
    const pile = addBuilding(s, 'pile_rubble', freeCell(s, 1), 1, 100); // bricks 0.9, wood 0.25
    assign(s, pile.id, 2);
    atHour(s, 12);
    const { bricks, wood } = s.res;
    productionHour(s);
    expect(s.res.bricks).toBeCloseTo(bricks + 0.9 * 2);
    expect(s.res.wood).toBeGreaterThan(wood);
  });

  it('are not worked outside work hours', () => {
    const s = newGame(1);
    warmCity(s);
    const pile = addBuilding(s, 'pile_coal', freeCell(s, 1), 1, 100);
    assign(s, pile.id, 3);
    atHour(s, 22);
    productionHour(s);
    expect(pile.amount).toBe(100);
  });

  it('disappear when empty and never give more than they hold', () => {
    const s = newGame(1);
    warmCity(s);
    const pile = addBuilding(s, 'pile_coal', freeCell(s, 1), 1, 1);
    assign(s, pile.id, 5);
    atHour(s, 12);
    const coal = s.res.coal;
    productionHour(s);
    expect(s.buildings.some((b) => b.id === pile.id)).toBe(false);
    expect(s.res.coal).toBeCloseTo(coal + 1);
  });

  it('release their workers when they disappear and log it', () => {
    const s = newGame(1);
    warmCity(s);
    population(s, 5);
    const pile = addBuilding(s, 'pile_coal', freeCell(s, 1), 1, 1);
    assign(s, pile.id, 5);
    atHour(s, 12);
    productionHour(s);
    expect(idle(s).length).toBe(5);
    for (const p of s.people) expect(p.job).toBeNull();
    expect(s.log.some((l) => l.text === `${def('pile_coal').name} ist abgetragen`)).toBe(true);
  });

  it('a pile is not removed while something is left', () => {
    const s = newGame(1);
    warmCity(s);
    const pile = addBuilding(s, 'pile_wood', freeCell(s, 1), 1, 50);
    assign(s, pile.id, 1);
    atHour(s, 12);
    productionHour(s);
    expect(s.buildings.some((b) => b.id === pile.id)).toBe(true);
  });
});

// ── efficiency ───────────────────────────────────────────────────────────

describe('efficiency: heat factor', () => {
  // A lumber camp has insulation 0, so the cell temperature is outside + boiler.
  const cases: { name: string; level: number; factor: number; setup: (s: GameState) => void; ring: number }[] = [
    { name: 'eisig (storm night)', level: 0, factor: 0.5, ring: 7, setup: (s) => { s.time = 24 * 29 + 3; } },
    { name: 'sehr kalt (day 1 morning)', level: 1, factor: 0.75, ring: 7, setup: (s) => { s.time = 8; } },
    { name: 'kalt (boiler level 1)', level: 2, factor: 0.9, ring: 1, setup: (s) => { s.time = 8; s.gen = { on: true, level: 1, overdrive: false, stress: 0 }; } },
    { name: 'erträglich (boiler level 2)', level: 3, factor: 1, ring: 1, setup: (s) => { s.time = 8; s.gen = { on: true, level: 2, overdrive: false, stress: 0 }; } },
    { name: 'behaglich (boiler full)', level: 4, factor: 1, ring: 1, setup: (s) => { s.time = 8; s.gen = { on: true, level: 3, overdrive: true, stress: 0 }; } },
  ];
  for (const c of cases) {
    it(`is ${c.factor} when it is ${c.name}`, () => {
      const s = newGame(1);
      c.setup(s);
      const b = addBuilding(s, 'holzfaeller', freeCell(s, c.ring), 1);
      expect(heatLevel(cellTemp(s, b.cell))).toBe(c.level); // sanity check of the scenario
      expect(efficiency(s, b)).toBeCloseTo(c.factor);
    });
  }

  it('uses the temperature including the insulation of the building', () => {
    const s = newGame(1);
    s.time = 8; // -22 °C outside: a camp is "sehr kalt", a mine (+5) too, a kitchen (+10) is "kalt"
    const camp = addBuilding(s, 'holzfaeller', freeCell(s, 7, 0), 1);
    const kitchen = addBuilding(s, 'kueche', freeCell(s, 7, 1), 1);
    expect(efficiency(s, camp)).toBeCloseTo(0.75);
    expect(efficiency(s, kitchen)).toBeCloseTo(0.9);
  });

  it('applies to piles outdoors', () => {
    const s = newGame(1);
    s.time = 8;
    const pile = addBuilding(s, 'pile_wood', freeCell(s, 7), 1, 100);
    expect(efficiency(s, pile)).toBeCloseTo(0.75);
  });
});

describe('efficiency: tech factor', () => {
  const cases: [string, string, number][] = [
    ['kohlenbohrer', 'kohlengrube', 1.4],
    ['saege', 'holzfaeller', 1.4],
    ['schneidbrenner', 'hangar', 1.5],
    ['fallen', 'jagdhuette', 1.4],
  ];
  for (const [tech, type, factor] of cases) {
    it(`${tech} multiplies ${type} by ${factor}`, () => {
      const s = newGame(1);
      const b = addBuilding(s, type, freeCell(s, 7), 1);
      const base = efficiency(s, b);
      s.research.done.push(tech);
      expect(efficiency(s, b) / base).toBeCloseTo(factor);
    });
  }

  it('does not affect other buildings', () => {
    const s = newGame(1);
    const b = addBuilding(s, 'holzfaeller', freeCell(s, 7), 1);
    const base = efficiency(s, b);
    s.research.done.push('kohlenbohrer', 'schneidbrenner', 'fallen');
    expect(efficiency(s, b)).toBeCloseTo(base);
  });

  it('a greenhouse on a cell below 0 °C works at 30 %', () => {
    const s = newGame(1);
    s.time = 8;
    const b = addBuilding(s, 'gewaechshaus', freeCell(s, 7), 1); // -22 + 10 insulation = -12 °C
    expect(cellTemp(s, b.cell)).toBeLessThan(0);
    expect(efficiency(s, b)).toBeCloseTo(0.9 * 0.3);
  });

  it('a heated greenhouse is not penalised', () => {
    const s = newGame(1);
    s.time = 8;
    warmCity(s);
    const b = addBuilding(s, 'gewaechshaus', freeCell(s, 1), 1);
    expect(cellTemp(s, b.cell)).toBeGreaterThanOrEqual(0);
    expect(efficiency(s, b)).toBeCloseTo(1);
  });
});

describe('efficiency: law factor', () => {
  it('Trümmerpflicht ×1.25 for piles', () => {
    const s = newGame(1);
    const pile = addBuilding(s, 'pile_rubble', freeCell(s, 7), 1, 100);
    const base = efficiency(s, pile);
    s.laws.signed.push('truemmerpflicht');
    expect(efficiency(s, pile) / base).toBeCloseTo(1.25);
  });

  it('Trümmerpflicht ×1.25 for the rubble railway', () => {
    const s = newGame(1);
    const b = addBuilding(s, 'truemmerbahn', freeCell(s, 7), 1);
    const base = efficiency(s, b);
    s.laws.signed.push('truemmerpflicht');
    expect(efficiency(s, b) / base).toBeCloseTo(1.25);
  });

  it('Trümmerpflicht does not affect a lumber camp', () => {
    const s = newGame(1);
    const b = addBuilding(s, 'holzfaeller', freeCell(s, 7), 1);
    const base = efficiency(s, b);
    s.laws.signed.push('truemmerpflicht');
    expect(efficiency(s, b)).toBeCloseTo(base);
  });

  it('Arbeitsdienst ×1.15 for everything', () => {
    const s = newGame(1);
    const camp = addBuilding(s, 'holzfaeller', freeCell(s, 7, 0), 1);
    const pile = addBuilding(s, 'pile_wood', freeCell(s, 7, 1), 1, 100);
    const [a, p] = [efficiency(s, camp), efficiency(s, pile)];
    s.laws.signed.push('arbeitsdienst');
    expect(efficiency(s, camp) / a).toBeCloseTo(1.15);
    expect(efficiency(s, pile) / p).toBeCloseTo(1.15);
  });

  it('law factors multiply', () => {
    const s = newGame(1);
    const b = addBuilding(s, 'truemmerbahn', freeCell(s, 7), 1);
    const base = efficiency(s, b);
    s.laws.signed.push('truemmerpflicht', 'arbeitsdienst');
    expect(efficiency(s, b) / base).toBeCloseTo(1.25 * 1.15);
  });

  it('the flag glas gives the greenhouse ×1.3', () => {
    const s = newGame(1);
    const b = addBuilding(s, 'gewaechshaus', freeCell(s, 7), 1);
    const base = efficiency(s, b);
    s.flags.glas = 1;
    expect(efficiency(s, b) / base).toBeCloseTo(1.3);
  });

  it('tech, law and heat factors multiply', () => {
    const s = newGame(1);
    s.time = 8;
    const b = addBuilding(s, 'kohlengrube', freeCell(s, 7), 1); // -22 + 5 = -17 °C: sehr kalt
    expect(efficiency(s, b)).toBeCloseTo(0.75);
    s.research.done.push('kohlenbohrer');
    s.laws.signed.push('arbeitsdienst');
    expect(efficiency(s, b)).toBeCloseTo(0.75 * 1.4 * 1.15);
  });
});
