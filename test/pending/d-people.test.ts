import '../src/sim/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID } from '../src/sim/grid';
import { heatLevel, cellTemp, plazaTemp } from '../src/sim/heat';
import { addBuilding, addPerson, newGame } from '../src/sim/state';
import { assign } from '../src/sim/economy';
import { assignHomes, careCapacity, census, homeTemp, peopleHour } from '../src/sim/people';
import type { Building, GameState, Person, PersonKind } from '../src/sim/types';

// Randomness is only ever drawn through chance(s, p). The tests decide every roll themselves and record
// the probabilities the code asks for, so nothing here depends on a seed.
const rng = vi.hoisted(() => ({ decide: (_p: number): boolean => false, calls: [] as number[] }));
vi.mock('../src/sim/rng', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/sim/rng')>();
  return {
    ...real,
    chance: (_h: unknown, p: number) => {
      rng.calls.push(p);
      return rng.decide(p);
    },
  };
});

beforeEach(() => {
  rng.decide = () => false;
  rng.calls = [];
});

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
/** Did the code roll a die with exactly this probability? */
const rolled = (p: number) => rng.calls.some((x) => near(x, p));

// ── helpers ──────────────────────────────────────────────────────────────

const NIGHT = 24 * 2 + 3; // day 3, 03:00: nobody works, no meal
const NOON = 24 * 2 + 12; // day 3, 12:00: work hour
const MEAL = 24 * 2 + 19; // day 3, 19:00

function freeCell(s: GameState, ring: number, skip = 0): number {
  const used = new Set(s.buildings.map((b) => b.cell));
  return GRID.filter((c) => c.ring === ring && !used.has(c.id))[skip].id;
}

function population(s: GameState, workers: number, engineers = 0, children = 0): Person[] {
  s.people = [];
  const add = (kind: PersonKind, n: number) => {
    for (let i = 0; i < n; i++) addPerson(s, kind, 'wue');
  };
  add('worker', workers);
  add('engineer', engineers);
  add('child', children);
  return s.people;
}

function warmBoiler(s: GameState): void {
  s.gen = { on: true, level: 3, overdrive: true, stress: 0 };
}

/** `n` people, all in finished tents on ring 1/2 under a full boiler, plenty of rations, at night. */
function calmCity(s: GameState, n = 20, engineers = 0): void {
  population(s, n - engineers, engineers);
  warmBoiler(s);
  s.res.rations = 1000;
  s.time = NIGHT;
  const tents = Math.ceil(n / 10);
  for (let i = 0; i < tents; i++) addBuilding(s, 'zelt', freeCell(s, 1, i), 1);
  assignHomes(s);
}

function finishedBuilding(s: GameState, type: string, ring = 1, skip = 0): Building {
  return addBuilding(s, type, freeCell(s, ring, skip), 1);
}

function expedition(ids: number[]) {
  return { id: 99, site: 'hublandcenter', members: ids, leaveAt: 0, arriveAt: 5, returnAt: 10, phase: 'out' as const };
}

/** A health building staffed with `n` healthy engineers (they must exist in the population). */
function clinic(s: GameState, type: 'sanitaet' | 'lazarett', n: number): Building {
  const b = finishedBuilding(s, type, 2, type === 'sanitaet' ? 0 : 1);
  assign(s, b.id, n);
  return b;
}

function byId(s: GameState, id: number): Person | undefined {
  return s.people.find((p) => p.id === id);
}

// ── homes ────────────────────────────────────────────────────────────────

describe('homes', () => {
  it('gives every person a bed while beds are free, never more than the beds', () => {
    const s = newGame(1);
    population(s, 30);
    const a = finishedBuilding(s, 'zelt', 1, 0);
    const b = finishedBuilding(s, 'zelt', 1, 1);
    assignHomes(s);
    expect(s.people.filter((p) => p.home === a.id).length).toBe(10);
    expect(s.people.filter((p) => p.home === b.id).length).toBe(10);
    expect(s.people.filter((p) => p.home === null).length).toBe(10);
  });

  it('does not use tents that are still under construction', () => {
    const s = newGame(1);
    population(s, 5);
    addBuilding(s, 'zelt', freeCell(s, 1), 0.5);
    assignHomes(s);
    expect(s.people.every((p) => p.home === null)).toBe(true);
  });

  it('fills the beds nearest to the boiler first', () => {
    const s = newGame(1);
    population(s, 10);
    const far = finishedBuilding(s, 'zelt', 5);
    const near = finishedBuilding(s, 'zelt', 2);
    assignHomes(s);
    expect(s.people.every((p) => p.home === near.id)).toBe(true);
    expect(s.people.some((p) => p.home === far.id)).toBe(false);
  });

  it('rehouses people whose home is not finished or no longer exists', () => {
    const s = newGame(1);
    population(s, 2);
    const unfinished = addBuilding(s, 'zelt', freeCell(s, 1, 0), 0.3);
    const tent = finishedBuilding(s, 'zelt', 1, 1);
    s.people[0].home = unfinished.id;
    s.people[1].home = 424242;
    assignHomes(s);
    expect(s.people[0].home).toBe(tent.id);
    expect(s.people[1].home).toBe(tent.id);
  });

  it('keeps people in the home they already have', () => {
    const s = newGame(1);
    population(s, 6);
    const a = finishedBuilding(s, 'zelt', 5);
    assignHomes(s);
    const before = s.people.map((p) => p.home);
    finishedBuilding(s, 'zelt', 1); // a closer tent appears later
    assignHomes(s);
    expect(s.people.map((p) => p.home)).toEqual(before);
    expect(before.every((h) => h === a.id)).toBe(true);
  });

  it('is part of every hour', () => {
    const s = newGame(1);
    population(s, 4);
    const tent = finishedBuilding(s, 'zelt', 2);
    s.time = NIGHT;
    peopleHour(s);
    expect(s.people.every((p) => p.home === tent.id)).toBe(true);
  });

  it('people away on an expedition get no bed', () => {
    const s = newGame(1);
    population(s, 3);
    finishedBuilding(s, 'zelt', 2);
    s.expeditions.push(expedition([s.people[0].id]));
    s.time = NIGHT;
    peopleHour(s);
    expect(s.people[0].home).toBeNull();
    expect(s.people[1].home).not.toBeNull();
  });
});

describe('homeTemp', () => {
  it('is the temperature of the home cell for a housed person', () => {
    const s = newGame(1);
    population(s, 1);
    warmBoiler(s);
    s.time = NIGHT;
    const tent = finishedBuilding(s, 'zelt', 1);
    s.people[0].home = tent.id;
    expect(homeTemp(s, s.people[0])).toBe(cellTemp(s, tent.cell));
  });

  it('is the plaza temperature for the homeless', () => {
    const s = newGame(1);
    population(s, 1);
    warmBoiler(s);
    s.time = NIGHT;
    expect(homeTemp(s, s.people[0])).toBe(plazaTemp(s));
  });

  it('a heated tent is warmer than the plaza, an unheated one at the rim is colder than the plaza', () => {
    const s = newGame(1);
    population(s, 2);
    warmBoiler(s);
    s.time = NIGHT;
    const inner = finishedBuilding(s, 'zelt', 1);
    const rim = finishedBuilding(s, 'zelt', 7);
    s.people[0].home = inner.id;
    s.people[1].home = rim.id;
    expect(homeTemp(s, s.people[0])).toBeGreaterThan(plazaTemp(s));
    expect(homeTemp(s, s.people[1])).toBeLessThan(plazaTemp(s));
  });
});

// ── sickness ─────────────────────────────────────────────────────────────

describe('exposure', () => {
  const PER_LEVEL = [0.008, 0.003, 0.001, 0.0002, 0];
  const scenarios: { level: number; setup: (s: GameState) => void }[] = [
    { level: 0, setup: (s) => { s.time = 24 * 29 + 3; } }, // storm night, no boiler
    { level: 1, setup: (s) => { s.time = NIGHT; } },
    { level: 2, setup: (s) => { s.time = NIGHT; s.gen = { on: true, level: 1, overdrive: false, stress: 0 }; } },
    { level: 3, setup: (s) => { s.time = NIGHT; s.gen = { on: true, level: 2, overdrive: true, stress: 0 }; } },
    { level: 4, setup: (s) => { s.time = NIGHT; warmBoiler(s); } },
  ];
  for (const sc of scenarios) {
    it(`a healthy homeless person at heat level ${sc.level} falls sick with probability ${PER_LEVEL[sc.level]} per hour`, () => {
      const s = newGame(1);
      population(s, 1);
      sc.setup(s);
      expect(heatLevel(homeTemp(s, s.people[0]))).toBe(sc.level); // sanity check of the scenario
      peopleHour(s);
      if (PER_LEVEL[sc.level] === 0) expect(rng.calls.filter((p) => p > 0)).toEqual([]);
      else expect(rolled(PER_LEVEL[sc.level])).toBe(true);
    });
  }

  it('colder places are more dangerous than warmer ones', () => {
    const risk = (setup: (s: GameState) => void) => {
      rng.calls = [];
      const s = newGame(1);
      population(s, 1);
      setup(s);
      peopleHour(s);
      return Math.max(0, ...rng.calls);
    };
    const storm = risk((s) => { s.time = 24 * 29 + 3; });
    const cold = risk((s) => { s.time = NIGHT; });
    const warm = risk((s) => { s.time = NIGHT; warmBoiler(s); });
    expect(storm).toBeGreaterThan(cold);
    expect(cold).toBeGreaterThan(warm);
  });

  it('a person who falls sick is sick afterwards', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = NIGHT;
    rng.decide = (p) => near(p, 0.003);
    peopleHour(s);
    expect(s.people[0].health).toBe('sick');
  });

  it('hunger multiplies the risk by 1.6', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = 24 * 29 + 3;
    s.people[0].hunger = 1;
    peopleHour(s);
    expect(rolled(0.008 * 1.6)).toBe(true);
  });

  it('at work during work hours the temperature of the workplace counts, not the home', () => {
    const s = newGame(1);
    population(s, 1);
    warmBoiler(s);
    s.time = NOON; // -20.5 °C outside
    const home = finishedBuilding(s, 'zelt', 1); // warm
    const camp = finishedBuilding(s, 'holzfaeller', 7); // outside the boiler range: "sehr kalt"
    const p = s.people[0];
    p.home = home.id;
    p.job = camp.id;
    camp.workers = [p.id];
    expect(heatLevel(cellTemp(s, camp.cell))).toBe(1);
    peopleHour(s);
    expect(rolled(0.003)).toBe(true);
  });

  it('at night the home counts, even for somebody with a job', () => {
    const s = newGame(1);
    population(s, 1);
    warmBoiler(s);
    s.time = NIGHT;
    const home = finishedBuilding(s, 'zelt', 1);
    const camp = finishedBuilding(s, 'holzfaeller', 7);
    const p = s.people[0];
    p.home = home.id;
    p.job = camp.id;
    camp.workers = [p.id];
    peopleHour(s);
    expect(rng.calls.filter((x) => x > 0)).toEqual([]);
  });

  it('sick people leave their job', () => {
    const s = newGame(1);
    population(s, 2);
    calmCity(s, 2);
    const camp = finishedBuilding(s, 'holzfaeller', 2);
    assign(s, camp.id, 2);
    s.people[0].health = 'sick';
    peopleHour(s);
    expect(s.people[0].job).toBeNull();
    expect(s.people[1].job).toBe(camp.id);
  });

  it('people away on an expedition do not fall sick', () => {
    const s = newGame(1);
    population(s, 2);
    s.time = 24 * 29 + 3;
    s.expeditions.push(expedition([s.people[0].id, s.people[1].id]));
    peopleHour(s);
    expect(rng.calls.filter((p) => p > 0)).toEqual([]);
  });
});

// ── care ─────────────────────────────────────────────────────────────────

describe('careCapacity', () => {
  it('is 0 without a health building', () => {
    const s = newGame(1);
    expect(careCapacity(s)).toBe(0);
  });

  it('is the full care value of a fully staffed first-aid station', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 5);
    expect(careCapacity(s)).toBeCloseTo(5);
  });

  it('scales with the staffed fraction', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 2);
    expect(careCapacity(s)).toBeCloseTo(2);
  });

  it('does not count sick staff', () => {
    const s = newGame(1);
    const b = clinic(s, 'sanitaet', 5);
    byId(s, b.workers[0])!.health = 'sick';
    expect(careCapacity(s)).toBeCloseTo(4);
  });

  it('is 0 while the building is not finished', () => {
    const s = newGame(1);
    const b = clinic(s, 'sanitaet', 5);
    b.built = 0.5;
    expect(careCapacity(s)).toBe(0);
  });

  it('a fully staffed field hospital cares for 15', () => {
    const s = newGame(1);
    clinic(s, 'lazarett', 10);
    expect(careCapacity(s)).toBeCloseTo(15);
  });

  it('adds up over all health buildings', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 5);
    clinic(s, 'lazarett', 7);
    expect(careCapacity(s)).toBeCloseTo(5 + 15 * 0.7);
  });

  it('X-ray multiplies by 1.3', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 5);
    s.research.done.push('roentgen');
    expect(careCapacity(s)).toBeCloseTo(6.5);
  });

  it('the law diakonissen multiplies by 1.3', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 5);
    s.laws.signed.push('diakonissen');
    expect(careCapacity(s)).toBeCloseTo(6.5);
  });

  it('the flag medizin multiplies by 1.2', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 5);
    s.flags.medizin = 1;
    expect(careCapacity(s)).toBeCloseTo(6);
  });

  it('the law pflegestation adds 5 per health building', () => {
    const s = newGame(1);
    clinic(s, 'sanitaet', 5);
    clinic(s, 'lazarett', 10);
    s.laws.signed.push('pflegestation');
    expect(careCapacity(s)).toBeCloseTo(5 + 15 + 5 * 2);
  });
});

describe('care and recovery', () => {
  /** A city with one engineer staff per `staff` of a first-aid station and two patients (workers 0 and 1). */
  function ward(staff: number, type: 'sanitaet' | 'lazarett' = 'sanitaet') {
    const s = newGame(1);
    population(s, 2, 10);
    s.time = NIGHT;
    clinic(s, type, staff);
    const [a, b] = s.people;
    return { s, a, b };
  }

  it('a cared sick person recovers after 30 hours', () => {
    const { s, a } = ward(5);
    a.health = 'sick';
    a.sickHours = 30;
    peopleHour(s);
    expect(a.health).toBe('ok');
  });

  it('a cared sick person is still sick before that, and counts the hours', () => {
    const { s, a } = ward(5);
    a.health = 'sick';
    a.sickHours = 10;
    peopleHour(s);
    expect(a.health).toBe('sick');
    expect(a.sickHours).toBe(11);
  });

  it('in the field hospital a sick person recovers after only 18 hours', () => {
    const { s, a } = ward(10, 'lazarett');
    a.health = 'sick';
    a.sickHours = 18;
    peopleHour(s);
    expect(a.health).toBe('ok');
  });

  it('in the first-aid station 18 hours are not enough', () => {
    const { s, a } = ward(5, 'sanitaet');
    a.health = 'sick';
    a.sickHours = 18;
    peopleHour(s);
    expect(a.health).toBe('sick');
  });

  it('a cared gravely sick person recovers after 60 hours', () => {
    const { s, a } = ward(5);
    a.health = 'grave';
    a.sickHours = 60;
    peopleHour(s);
    expect(a.health).toBe('ok');
  });

  it('a cared gravely sick person is still ill after 30 hours', () => {
    const { s, a } = ward(5);
    a.health = 'grave';
    a.sickHours = 30;
    peopleHour(s);
    expect(a.health).toBe('grave');
  });

  it('penicillin cuts the recovery of the gravely sick to 30 hours', () => {
    const { s, a } = ward(5);
    s.research.done.push('penicillin');
    a.health = 'grave';
    a.sickHours = 30;
    peopleHour(s);
    expect(a.health).toBe('ok');
  });

  it('the law amputation sends a cared gravely sick person home after 24 hours as an amputee', () => {
    const { s, a } = ward(5);
    s.laws.signed.push('amputation');
    a.health = 'grave';
    a.sickHours = 24;
    peopleHour(s);
    expect(a.health).toBe('ok');
    expect(a.amputee).toBe(true);
  });

  it('without the law nobody becomes an amputee', () => {
    const { s, a } = ward(5);
    a.health = 'grave';
    a.sickHours = 60;
    peopleHour(s);
    expect(a.health).toBe('ok');
    expect(a.amputee).toBeFalsy();
  });

  it('care capacity goes to the gravely sick first', () => {
    const { s, a, b } = ward(1); // capacity 1
    a.health = 'sick'; // lower id, would recover now if cared
    a.sickHours = 30;
    b.health = 'grave';
    b.sickHours = 0;
    peopleHour(s);
    expect(a.health).toBe('sick'); // not cared: the bed went to the grave case
    const probabilities = rng.calls;
    expect(probabilities.some((p) => near(p, 1 / 200))).toBe(true); // grave, cared
    expect(probabilities.some((p) => near(p, 1 / 48))).toBe(true); // sick, uncared
    expect(probabilities.some((p) => near(p, 1 / 36))).toBe(false); // nobody gravely sick is uncared
  });

  it('then the sick are cared for, lowest id first', () => {
    const { s, a, b } = ward(1); // capacity 1
    for (const p of [a, b]) {
      p.health = 'sick';
      p.sickHours = 30;
    }
    peopleHour(s);
    expect(a.health).toBe('ok');
    expect(b.health).toBe('sick');
  });

  it('with enough capacity everybody is cared for', () => {
    const { s, a, b } = ward(2); // capacity 2
    a.health = 'sick';
    b.health = 'grave';
    peopleHour(s);
    expect(rolled(1 / 48)).toBe(false);
    expect(rolled(1 / 36)).toBe(false);
  });

  it('an untreated sick person may become gravely ill (1/48 per hour)', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = NIGHT;
    warmBoiler(s);
    const p = s.people[0];
    p.health = 'sick';
    p.sickHours = 20;
    rng.decide = (x) => near(x, 1 / 48);
    peopleHour(s);
    expect(p.health).toBe('grave');
    expect(p.sickHours).toBe(0);
  });

  it('an untreated sick person stays sick when the die does not fall', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = NIGHT;
    warmBoiler(s);
    s.people[0].health = 'sick';
    peopleHour(s);
    expect(s.people[0].health).toBe('sick');
    expect(rolled(1 / 48)).toBe(true);
  });

  it('a sick person without care never recovers on their own', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = NIGHT;
    warmBoiler(s);
    s.people[0].health = 'sick';
    s.people[0].sickHours = 500;
    peopleHour(s);
    expect(s.people[0].health).toBe('sick');
  });

  it('an untreated gravely sick person can die (1/36 per hour)', () => {
    const s = newGame(1);
    population(s, 4);
    s.time = NIGHT;
    warmBoiler(s);
    const victim = s.people[0];
    victim.health = 'grave';
    rng.decide = (x) => near(x, 1 / 36);
    peopleHour(s);
    expect(byId(s, victim.id)).toBeUndefined();
  });

  it('a cared gravely sick person is much safer (1/200 per hour)', () => {
    const { s, b } = ward(5);
    b.health = 'grave';
    rng.decide = (x) => near(x, 1 / 36); // only the untreated die roll would kill
    peopleHour(s);
    expect(byId(s, b.id)).toBeDefined();
    expect(rolled(1 / 200)).toBe(true);
  });

  it('a cared gravely sick person can still die', () => {
    const { s, b } = ward(5);
    b.health = 'grave';
    rng.decide = (x) => near(x, 1 / 200);
    peopleHour(s);
    expect(byId(s, b.id)).toBeUndefined();
  });
});

// ── death ────────────────────────────────────────────────────────────────

describe('death', () => {
  function dyingCity(n = 40) {
    const s = newGame(1);
    calmCity(s, n);
    const victim = s.people[0];
    victim.health = 'grave';
    rng.decide = (x) => near(x, 1 / 36);
    return { s, victim };
  }

  it('removes the person and counts the death with its cause', () => {
    const { s, victim } = dyingCity();
    peopleHour(s);
    expect(byId(s, victim.id)).toBeUndefined();
    expect(s.dead).toBe(1);
    expect(s.deaths.krankheit).toBe(1);
    expect(s.people.length).toBe(39);
  });

  it('removes the dead person from the workers of a building', () => {
    const { s, victim } = dyingCity();
    const camp = finishedBuilding(s, 'holzfaeller', 3);
    camp.workers = [victim.id, s.people[1].id];
    victim.job = camp.id;
    peopleHour(s);
    expect(camp.workers).not.toContain(victim.id);
    expect(camp.workers).toContain(s.people[1].id);
  });

  it('writes the death into the log', () => {
    const { s, victim } = dyingCity();
    peopleHour(s);
    expect(s.log).toContainEqual(expect.objectContaining({ text: `${victim.name} ist gestorben.`, kind: 'death' }));
  });

  it('costs 2 hope', () => {
    const { s } = dyingCity();
    s.hope = 55;
    peopleHour(s);
    // −2 for the death, plus the small calm-city drift of +0.05
    expect(s.hope).toBeGreaterThan(55 - 2.2);
    expect(s.hope).toBeLessThan(55 - 1.8);
  });

  it('costs only 1 hope with a cemetery', () => {
    const { s } = dyingCity();
    finishedBuilding(s, 'friedhof', 4);
    s.hope = 55;
    peopleHour(s);
    expect(s.hope).toBeGreaterThan(55 - 1.2);
    expect(s.hope).toBeLessThan(55 - 0.8);
  });

  it('costs only 1 hope with the law schneegrab, and 0.5 discontent', () => {
    const { s } = dyingCity();
    s.laws.signed.push('schneegrab');
    s.hope = 55;
    s.discontent = 30;
    peopleHour(s);
    expect(s.hope).toBeGreaterThan(55 - 1.2);
    expect(s.hope).toBeLessThan(55 - 0.8);
    // +0.5 for the death, −0.15 calm drift
    expect(s.discontent).toBeGreaterThan(30 + 0.2);
    expect(s.discontent).toBeLessThan(30 + 0.5);
  });

  it('an unfinished cemetery does not help', () => {
    const { s } = dyingCity();
    addBuilding(s, 'friedhof', freeCell(s, 4), 0.5);
    s.hope = 55;
    peopleHour(s);
    expect(s.hope).toBeLessThan(55 - 1.8);
  });
});

// ── meals and hunger ─────────────────────────────────────────────────────

describe('meals', () => {
  it('everybody eats one ration at 19:00', () => {
    const s = newGame(1);
    calmCity(s, 10);
    s.time = MEAL;
    s.res.rations = 20;
    peopleHour(s);
    expect(s.res.rations).toBeCloseTo(10);
    expect(s.people.every((p) => p.hunger === 0)).toBe(true);
  });

  it('nobody eats at other hours', () => {
    const s = newGame(1);
    calmCity(s, 10);
    s.res.rations = 20;
    for (const h of [0, 8, 18, 20, 23]) {
      s.time = 24 * 2 + h;
      peopleHour(s);
    }
    expect(s.res.rations).toBe(20);
  });

  it('without rations everybody gets hungrier, one day more each evening', () => {
    const s = newGame(1);
    calmCity(s, 5);
    s.res.rations = 0;
    s.time = MEAL;
    peopleHour(s);
    expect(s.people.map((p) => p.hunger)).toEqual([1, 1, 1, 1, 1]);
    s.time = MEAL + 24;
    peopleHour(s);
    expect(s.people.map((p) => p.hunger)).toEqual([2, 2, 2, 2, 2]);
  });

  it('with too few rations only those who got none go hungry', () => {
    const s = newGame(1);
    calmCity(s, 10);
    s.res.rations = 5;
    s.time = MEAL;
    peopleHour(s);
    expect(s.res.rations).toBeCloseTo(0);
    expect(s.people.filter((p) => p.hunger === 1).length).toBe(5);
    expect(s.people.filter((p) => p.hunger === 0).length).toBe(5);
  });

  it('a good meal ends the hunger', () => {
    const s = newGame(1);
    calmCity(s, 4);
    s.people[0].hunger = 2;
    s.time = MEAL;
    peopleHour(s);
    expect(s.people[0].hunger).toBe(0);
  });

  it('people away on an expedition do not eat in the city', () => {
    const s = newGame(1);
    calmCity(s, 10);
    s.expeditions.push(expedition([s.people[0].id, s.people[1].id]));
    s.res.rations = 20;
    s.time = MEAL;
    peopleHour(s);
    expect(s.res.rations).toBeCloseTo(12);
    expect(s.people[0].hunger).toBe(0);
  });

  it('three days of hunger make death possible (20 % per day, cause hunger)', () => {
    const s = newGame(1);
    calmCity(s, 6);
    s.res.rations = 0;
    const starving = s.people[0];
    starving.hunger = 3;
    rng.decide = (p) => near(p, 0.2);
    for (let h = 0; h < 24; h++) {
      s.time = 24 * 2 + h;
      peopleHour(s);
    }
    expect(byId(s, starving.id)).toBeUndefined();
    expect(s.deaths.hunger).toBeGreaterThanOrEqual(1);
  });

  it('less than three days of hunger are not deadly', () => {
    const s = newGame(1);
    calmCity(s, 6);
    s.res.rations = 0;
    for (const p of s.people) p.hunger = 1;
    rng.decide = (p) => near(p, 0.2);
    for (let h = 0; h < 24; h++) {
      s.time = 24 * 2 + h;
      peopleHour(s);
    }
    expect(s.people.length).toBe(6);
    expect(s.people.every((p) => p.hunger === 2)).toBe(true);
  });
});

// ── mood ─────────────────────────────────────────────────────────────────

describe('mood', () => {
  /** Run one hour on a copy and return the change of discontent and hope. */
  function delta(s: GameState): { disc: number; hope: number } {
    const t = structuredClone(s);
    peopleHour(t);
    return { disc: t.discontent - s.discontent, hope: t.hope - s.hope };
  }

  function mid(s: GameState): void {
    s.discontent = 50;
    s.hope = 50;
  }

  it('in a calm, warm, fed city discontent sinks slowly and hope grows slowly', () => {
    const s = newGame(1);
    calmCity(s, 20);
    mid(s);
    const d = delta(s);
    expect(d.disc).toBeCloseTo(-0.15, 2);
    expect(d.hope).toBeCloseTo(0.05, 2);
  });

  it('homeless people raise discontent and lower hope', () => {
    const s = newGame(1);
    population(s, 20);
    warmBoiler(s);
    s.res.rations = 1000;
    s.time = NIGHT;
    mid(s);
    const d = delta(s); // pressure ≥ 1
    expect(d.disc).toBeGreaterThan(0.9);
    expect(d.hope).toBeLessThan(-0.3);
  });

  it('hunger counts 1.5 per hungry person', () => {
    const s = newGame(1);
    calmCity(s, 20);
    for (const p of s.people.slice(0, 10)) p.hunger = 1;
    mid(s);
    const d = delta(s); // pressure = 1.5 · 10 / 20
    expect(d.disc).toBeCloseTo(0.75 * 1.2 - 0.15, 2);
    expect(d.hope).toBeCloseTo(-0.75 * 0.4, 2);
  });

  it('untreated sick people count', () => {
    const s = newGame(1);
    calmCity(s, 20);
    for (const p of s.people.slice(0, 4)) p.health = 'sick';
    mid(s);
    const d = delta(s); // pressure = 4 / 20
    expect(d.disc).toBeCloseTo(0.2 * 1.2 - 0.15, 2);
    expect(d.hope).toBeCloseTo(-0.2 * 0.4, 2);
  });

  it('sick people who are cared for do not count', () => {
    const s = newGame(1);
    calmCity(s, 20, 5);
    clinic(s, 'sanitaet', 5); // capacity 5
    const patients = s.people.filter((p) => p.kind === 'worker').slice(0, 4);
    for (const p of patients) p.health = 'sick';
    mid(s);
    const d = delta(s);
    expect(d.disc).toBeCloseTo(-0.15, 2);
  });

  it('homes at heat level 1 or colder count half', () => {
    const s = newGame(1);
    population(s, 20);
    s.res.rations = 1000;
    s.time = NIGHT; // −26 °C, boiler off
    for (let i = 0; i < 2; i++) finishedBuilding(s, 'zelt', 7, i);
    assignHomes(s);
    expect(s.people.every((p) => p.home !== null)).toBe(true);
    mid(s);
    const d = delta(s); // pressure = 0.5 · 20 / 20
    expect(d.disc).toBeCloseTo(0.5 * 1.2 - 0.15, 2);
    expect(d.hope).toBeCloseTo(-0.5 * 0.4, 2);
  });

  it('discontent and hope stay between 0 and 100', () => {
    const s = newGame(1);
    calmCity(s, 20);
    s.discontent = 0;
    s.hope = 100;
    peopleHour(s);
    expect(s.discontent).toBe(0);
    expect(s.hope).toBe(100);
    const t = newGame(1);
    population(t, 20);
    t.time = NIGHT;
    t.discontent = 100;
    t.hope = 0;
    peopleHour(t);
    expect(t.discontent).toBe(100);
    expect(t.hope).toBe(0);
  });

  it('a staffed wine bar relieves 4 discontent per day', () => {
    const base = newGame(1);
    calmCity(base, 20);
    mid(base);
    const bar = finishedBuilding(base, 'weinstube', 3);
    const plain = delta(base);
    assign(base, bar.id, 3);
    expect(delta(base).disc - plain.disc).toBeCloseTo(-4 / 24, 3);
  });

  it('the relief is scaled by the staffed fraction', () => {
    const s = newGame(1);
    calmCity(s, 20);
    mid(s);
    const bar = finishedBuilding(s, 'weinstube', 3);
    const plain = delta(s);
    assign(s, bar.id, 1);
    expect(delta(s).disc - plain.disc).toBeCloseTo(-(4 / 24) / 3, 3);
  });

  it('a staffed guard house relieves 3 discontent per day', () => {
    const s = newGame(1);
    calmCity(s, 20);
    mid(s);
    const post = finishedBuilding(s, 'wachstube', 3);
    const plain = delta(s);
    assign(s, post.id, 4);
    expect(delta(s).disc - plain.disc).toBeCloseTo(-3 / 24, 3);
  });

  it('a staffed chapel adds 2 hope per day', () => {
    const s = newGame(1);
    calmCity(s, 20);
    mid(s);
    const chapel = finishedBuilding(s, 'kapelle', 3);
    const plain = delta(s);
    assign(s, chapel.id, 2);
    expect(delta(s).hope - plain.hope).toBeCloseTo(2 / 24, 3);
  });

  it('adds the hourly values of the signed laws', () => {
    const s = newGame(1);
    calmCity(s, 20);
    mid(s);
    const plain = delta(s);
    s.laws.signed.push('ersatzkost', 'notschicht'); // discontent +0.03 and +0.08 per hour
    expect(delta(s).disc - plain.disc).toBeCloseTo(0.11, 3);
    s.laws.signed.push('andacht'); // hope +0.05 per hour
    expect(delta(s).hope - plain.hope).toBeCloseTo(0.05, 3);
  });
});

// ── warnings and outcome ─────────────────────────────────────────────────

describe('warnings and outcome', () => {
  function city(): GameState {
    const s = newGame(1);
    calmCity(s, 20);
    s.time = 24 * 5 + 3;
    return s;
  }

  it('discontent of 90 starts a 48 hour revolt warning and logs it', () => {
    const s = city();
    s.discontent = 95;
    peopleHour(s);
    expect(s.warning).toEqual({ kind: 'revolt', until: s.time + 48 });
    expect(s.log).toContainEqual(expect.objectContaining({ text: 'Die Leute sind kurz vor dem Aufstand. 48 Stunden.', kind: 'bad' }));
  });

  it('hope of 10 starts a 48 hour despair warning and logs it', () => {
    const s = city();
    s.hope = 5;
    peopleHour(s);
    expect(s.warning).toEqual({ kind: 'despair', until: s.time + 48 });
    expect(s.log).toContainEqual(expect.objectContaining({ text: expect.stringContaining('Die Hoffnung erlischt'), kind: 'bad' }));
  });

  it('no warning in a quiet city', () => {
    const s = city();
    peopleHour(s);
    expect(s.warning).toBeNull();
    expect(s.outcome).toBeNull();
  });

  it('a running warning is not restarted every hour', () => {
    const s = city();
    s.discontent = 95;
    peopleHour(s);
    const until = s.warning!.until;
    s.time += 5;
    peopleHour(s);
    expect(s.warning!.until).toBe(until);
  });

  it('after the 48 hours a revolt breaks out when discontent is still 85 or more', () => {
    const s = city();
    s.discontent = 95;
    s.warning = { kind: 'revolt', until: s.time };
    peopleHour(s);
    expect(s.outcome).toBe('revolt');
  });

  it('after the 48 hours despair wins when hope is still 15 or less', () => {
    const s = city();
    s.hope = 5;
    s.warning = { kind: 'despair', until: s.time };
    peopleHour(s);
    expect(s.outcome).toBe('despair');
  });

  it('nothing happens before the warning runs out', () => {
    const s = city();
    s.discontent = 95;
    s.warning = { kind: 'revolt', until: s.time + 10 };
    peopleHour(s);
    expect(s.outcome).toBeNull();
    expect(s.warning).not.toBeNull();
  });

  it('a revolt warning ends early when discontent falls below 70', () => {
    const s = city();
    s.discontent = 60;
    s.warning = { kind: 'revolt', until: s.time + 30 };
    peopleHour(s);
    expect(s.warning).toBeNull();
    expect(s.outcome).toBeNull();
  });

  it('a despair warning ends early when hope rises above 25', () => {
    const s = city();
    s.hope = 40;
    s.warning = { kind: 'despair', until: s.time + 30 };
    peopleHour(s);
    expect(s.warning).toBeNull();
  });

  it('a warning stays while the numbers are between the thresholds', () => {
    const s = city();
    s.discontent = 78;
    s.warning = { kind: 'revolt', until: s.time + 30 };
    peopleHour(s);
    expect(s.warning).not.toBeNull();
  });

  it('a recovered city survives the end of the warning', () => {
    const s = city();
    s.discontent = 60;
    s.warning = { kind: 'revolt', until: s.time };
    peopleHour(s);
    expect(s.outcome).toBeNull();
  });

  it('nobody left alive ends the game with "dead"', () => {
    const s = city();
    s.people = [];
    peopleHour(s);
    expect(s.outcome).toBe('dead');
  });

  it('somebody on an expedition keeps the game alive', () => {
    const s = city();
    population(s, 1);
    s.expeditions.push(expedition([s.people[0].id]));
    peopleHour(s);
    expect(s.outcome).toBeNull();
  });
});

// ── census ───────────────────────────────────────────────────────────────

describe('census', () => {
  function mixed() {
    const s = newGame(1);
    population(s, 3, 2, 1);
    const [w0, w1, w2, e0, e1, c0] = s.people;
    const tent = finishedBuilding(s, 'zelt', 2);
    w0.job = 777;
    w0.home = tent.id;
    w1.health = 'sick';
    w1.home = tent.id;
    e0.health = 'grave';
    c0.hunger = 2;
    return { s, w2, e1 };
  }

  it('counts the people by kind, state and situation', () => {
    const { s } = mixed();
    expect(census(s)).toMatchObject({
      total: 6,
      workers: 3,
      engineers: 2,
      children: 1,
      homeless: 4,
      sick: 1,
      grave: 1,
      hungry: 1,
      idle: 2,
      away: 0,
    });
  });

  it('counts people on an expedition as away and not as idle', () => {
    const { s, w2 } = mixed();
    s.expeditions.push(expedition([w2.id]));
    const c = census(s);
    expect(c.away).toBe(1);
    expect(c.idle).toBe(1);
  });
});
