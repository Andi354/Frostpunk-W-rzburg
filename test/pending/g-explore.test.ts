import '../src/sim/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID } from '../src/sim/grid';
import { addBuilding, addPerson, newGame } from '../src/sim/state';
import { stepHour } from '../src/sim/sim';
import { idle } from '../src/sim/economy';
import { census, peopleHour } from '../src/sim/people';
import { SITES } from '../src/sim/data/sites';
import { EVENTS } from '../src/sim/data/events';
import { canSend, exploreHour, send } from '../src/sim/explore';
import type { Expedition, GameState, PersonKind } from '../src/sim/types';

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
const countRolls = (p: number) => rng.calls.filter((x) => near(x, p)).length;

// ── helpers ──────────────────────────────────────────────────────────────

const START = 24 * 2 + 8; // day 3, 08:00: no storm
const STORM = 24 * 29 + 10; // day 30, 10:00
const stadtIds = () => Object.values(SITES).filter((x) => x.area === 'stadt').map((x) => x.id);

function freeCell(s: GameState, ring: number, skip = 0): number {
  const used = new Set(s.buildings.map((b) => b.cell));
  return GRID.filter((c) => c.ring === ring && !used.has(c.id))[skip].id;
}

function population(s: GameState, workers: number, engineers = 0, children = 0): void {
  s.people = [];
  const add = (kind: PersonKind, n: number) => {
    for (let i = 0; i < n; i++) addPerson(s, kind, 'wue');
  };
  add('worker', workers);
  add('engineer', engineers);
  add('child', children);
}

/** A game with a finished scout post, in the middle of day 3. */
function base(): GameState {
  const s = newGame(1);
  s.time = START;
  addBuilding(s, 'kundschafter', freeCell(s, 3), 1);
  return s;
}

/** Send a team and return the expedition (the send must work). */
function dispatch(s: GameState, site: string): Expedition {
  const e = send(s, site);
  expect(e, `send ${site}`).not.toBeNull();
  return e!;
}

/** Jump to the hour of arrival (or return) and run the expedition logic once. */
function at(s: GameState, time: number): void {
  s.time = time;
  exploreHour(s);
}

// ── data ─────────────────────────────────────────────────────────────────

describe('site data', () => {
  const stadt = ['hublandcenter', 'galgenberg', 'grombuehl', 'bahnhof', 'ferdinandeum', 'altstadt', 'residenz', 'talavera', 'festung'];
  const umland = ['veitshoechheim', 'kitzingen', 'ochsenfurt', 'karlstadt', 'schweinfurt', 'badkissingen', 'lohr', 'wertheim', 'rhoen'];

  it('has nine places in the city and nine in the surroundings', () => {
    for (const id of stadt) expect(SITES[id]?.area, id).toBe('stadt');
    for (const id of umland) expect(SITES[id]?.area, id).toBe('umland');
    expect(Object.keys(SITES).length).toBe(18);
  });

  it('every place has a map position, a time, a danger, a description and loot', () => {
    for (const x of Object.values(SITES)) {
      expect(x.x, x.id).toBeGreaterThanOrEqual(0);
      expect(x.x, x.id).toBeLessThanOrEqual(100);
      expect(x.y, x.id).toBeGreaterThanOrEqual(0);
      expect(x.y, x.id).toBeLessThanOrEqual(100);
      expect(x.hours, x.id).toBeGreaterThan(0);
      expect(x.danger, x.id).toBeGreaterThan(0);
      expect(x.danger, x.id).toBeLessThan(1);
      expect(x.desc.length, x.id).toBeGreaterThan(10);
      expect(typeof x.loot, x.id).toBe('object');
    }
  });

  it('matches the spec for a few places', () => {
    expect(SITES.hublandcenter).toMatchObject({ hours: 2, danger: 0.05, loot: { food: 120, rations: 60, parts: 1 } });
    expect(SITES.galgenberg).toMatchObject({ hours: 3, danger: 0.1, loot: { wood: 60 }, survivors: { n: 6, kind: 'mixed', origin: 'wue' } });
    expect(SITES.bahnhof).toMatchObject({ hours: 5, danger: 0.2, valley: true, loot: { coal: 400, steel: 60 }, event: 'fluechtlingszug' });
    expect(SITES.ferdinandeum).toMatchObject({ valley: true, flag: 'studenten', survivors: { n: 4, kind: 'engineer', origin: 'wue' } });
    expect(SITES.festung).toMatchObject({ hours: 10, danger: 0.45, needs: 'altstadt', flag: 'ausguck' });
    expect(SITES.talavera.flag).toBe('lkw');
    expect(SITES.schweinfurt).toMatchObject({ hours: 34, flag: 'schweinfurt' });
    expect(SITES.rhoen).toMatchObject({ hours: 60, danger: 0.6, flag: 'wasserkuppe', event: 'sturmwarnung' });
  });

  it('every prerequisite and every event refers to something that exists', () => {
    for (const x of Object.values(SITES)) {
      if (x.needs) expect(SITES[x.needs], `${x.id} needs ${x.needs}`).toBeDefined();
      if (x.event) expect(EVENTS[x.event], `${x.id} event ${x.event}`).toBeDefined();
    }
  });

  it('the city places are not in the valley unless the spec says so', () => {
    expect(SITES.hublandcenter.valley).toBeFalsy();
    expect(SITES.galgenberg.valley).toBeFalsy();
    expect(SITES.altstadt.valley).toBe(true);
  });
});

// ── canSend ──────────────────────────────────────────────────────────────

describe('canSend', () => {
  it('is null when everything is in place', () => {
    expect(canSend(base(), 'hublandcenter')).toBeNull();
  });

  it('needs a scout post', () => {
    const s = newGame(1);
    s.time = START;
    expect(canSend(s, 'hublandcenter')).toBe('Kundschafterposten fehlt');
  });

  it('a scout post under construction does not count', () => {
    const s = newGame(1);
    s.time = START;
    addBuilding(s, 'kundschafter', freeCell(s, 3), 0.5);
    expect(canSend(s, 'hublandcenter')).toBe('Kundschafterposten fehlt');
  });

  it('refuses a place that is already explored', () => {
    const s = base();
    s.explored.push('hublandcenter');
    expect(canSend(s, 'hublandcenter')).toBe('Schon erkundet');
  });

  it('refuses a place a team is already on its way to', () => {
    const s = base();
    s.research.done.push('holzvergaser'); // two teams at once, so only this reason can apply
    dispatch(s, 'hublandcenter');
    expect(canSend(s, 'hublandcenter')).toBe('Unterwegs');
  });

  it('needs 4 free healthy people', () => {
    const s = base();
    population(s, 3);
    expect(canSend(s, 'hublandcenter')).toBe('Keine 4 Freien');
    population(s, 4);
    expect(canSend(s, 'hublandcenter')).toBeNull();
  });

  it('engineers can fill up the team', () => {
    const s = base();
    population(s, 2, 2);
    expect(canSend(s, 'hublandcenter')).toBeNull();
  });

  it('children, sick people and people with a job do not count as free', () => {
    const s = base();
    population(s, 6, 0, 5);
    s.people[0].health = 'sick';
    s.people[1].job = 999;
    s.people[2].health = 'grave';
    expect(canSend(s, 'hublandcenter')).toBe('Keine 4 Freien');
  });

  it('needs the place named in "needs" to be explored first', () => {
    const s = base();
    expect(canSend(s, 'festung')).toBe(`Erst: ${SITES.altstadt.name}`);
    expect(canSend(s, 'residenz')).toBe(`Erst: ${SITES.altstadt.name}`);
    s.explored.push('altstadt');
    expect(canSend(s, 'festung')).toBeNull();
    expect(canSend(s, 'residenz')).toBeNull();
  });

  it('the surroundings need three explored places in the city', () => {
    const s = base();
    expect(canSend(s, 'veitshoechheim')).toBe('Erst 3 Orte in der Stadt erkunden');
    s.explored = ['hublandcenter', 'galgenberg'];
    expect(canSend(s, 'veitshoechheim')).toBe('Erst 3 Orte in der Stadt erkunden');
    s.explored = ['hublandcenter', 'galgenberg', 'bahnhof'];
    expect(canSend(s, 'veitshoechheim')).toBeNull();
  });

  it('places in the surroundings do not count towards the three', () => {
    const s = base();
    s.explored = ['hublandcenter', 'galgenberg', 'veitshoechheim'];
    expect(canSend(s, 'kitzingen')).toBe('Erst 3 Orte in der Stadt erkunden');
  });

  it('is impossible during the storm (days 30 to 33)', () => {
    const s = base();
    for (const day of [30, 31, 32, 33]) {
      s.time = 24 * (day - 1) + 10;
      expect(canSend(s, 'hublandcenter'), `day ${day}`).toBe('Im Sturm unmöglich');
    }
    s.time = 24 * 33 + 10; // day 34
    expect(canSend(s, 'hublandcenter')).toBeNull();
  });

  it('allows one team at a time without the truck', () => {
    const s = base();
    dispatch(s, 'hublandcenter');
    expect(canSend(s, 'galgenberg')).toBe('Alle Trupps unterwegs');
  });

  it('allows two teams at once with the wood-gas truck, not three', () => {
    const s = base();
    s.research.done.push('holzvergaser');
    dispatch(s, 'hublandcenter');
    expect(canSend(s, 'galgenberg')).toBeNull();
    dispatch(s, 'galgenberg');
    expect(canSend(s, 'bahnhof')).toBe('Alle Trupps unterwegs');
  });

  it('the flag lkw also allows two teams', () => {
    const s = base();
    s.flags.lkw = 1;
    dispatch(s, 'hublandcenter');
    expect(canSend(s, 'galgenberg')).toBeNull();
  });

  it('a place becomes free again once the team is back', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    at(s, e.returnAt);
    expect(canSend(s, 'galgenberg')).toBeNull();
    expect(canSend(s, 'hublandcenter')).toBe('Schon erkundet');
  });
});

// ── send ─────────────────────────────────────────────────────────────────

describe('send', () => {
  it('creates an expedition with four members that leaves now', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    expect(s.expeditions).toContain(e);
    expect(e.site).toBe('hublandcenter');
    expect(e.members.length).toBe(4);
    expect(new Set(e.members).size).toBe(4);
    expect(e.leaveAt).toBe(s.time);
    expect(e.phase).toBe('out');
  });

  it('takes workers first', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    for (const id of e.members) expect(s.people.find((p) => p.id === id)!.kind).toBe('worker');
  });

  it('takes engineers when there are not enough workers', () => {
    const s = base();
    population(s, 2, 5);
    const e = dispatch(s, 'hublandcenter');
    const kinds = e.members.map((id) => s.people.find((p) => p.id === id)!.kind).sort();
    expect(kinds).toEqual(['engineer', 'engineer', 'worker', 'worker']);
  });

  it('never takes children, sick people or people with a job', () => {
    const s = base();
    population(s, 8, 0, 4);
    s.people[0].health = 'sick';
    s.people[1].job = 999;
    const e = dispatch(s, 'hublandcenter');
    for (const id of e.members) {
      const p = s.people.find((x) => x.id === id)!;
      expect(p.kind).toBe('worker');
      expect(p.health).toBe('ok');
      expect(p.job).toBeNull();
    }
  });

  it('the team is gone from the free people', () => {
    const s = base();
    const before = idle(s).length;
    const e = dispatch(s, 'hublandcenter');
    const after = idle(s).map((p) => p.id);
    expect(after.length).toBe(before - 4);
    for (const id of e.members) expect(after).not.toContain(id);
  });

  it('arrives after the travel time and is back after the same time again', () => {
    const s = base();
    const t = s.time;
    const e = dispatch(s, 'hublandcenter'); // 2 h
    expect(e.arriveAt).toBe(t + 2);
    expect(e.returnAt).toBe(t + 4);
  });

  it('the wood-gas truck cuts the travel time to 60 %', () => {
    const s = base();
    s.research.done.push('holzvergaser');
    const t = s.time;
    const e = dispatch(s, 'bahnhof'); // 5 h
    expect(e.arriveAt).toBeCloseTo(t + 3);
    expect(e.returnAt).toBeCloseTo(t + 6);
  });

  it('the flag lkw cuts the travel time to 60 %, too', () => {
    const s = base();
    s.flags.lkw = 1;
    s.explored.push('altstadt');
    const t = s.time;
    const e = dispatch(s, 'festung'); // 10 h
    expect(e.arriveAt).toBeCloseTo(t + 6);
    expect(e.returnAt).toBeCloseTo(t + 12);
  });

  it('returns null and sends nobody when canSend refuses', () => {
    const s = newGame(1);
    s.time = START; // no scout post
    expect(send(s, 'hublandcenter')).toBeNull();
    expect(s.expeditions.length).toBe(0);
    expect(idle(s).length).toBe(s.people.filter((p) => p.kind !== 'child').length);
  });

  it('people on an expedition are skipped by the people logic', () => {
    const s = base();
    population(s, 10);
    const e = dispatch(s, 'hublandcenter');
    s.res.rations = 50;
    s.time = 24 * 2 + 19;
    peopleHour(s);
    expect(s.res.rations).toBeCloseTo(50 - 6); // only the six who stayed eat
    expect(census(s).away).toBe(4);
    for (const id of e.members) expect(s.people.find((p) => p.id === id)!.health).toBe('ok');
  });
});

// ── arrival ──────────────────────────────────────────────────────────────

describe('exploreHour: arrival', () => {
  it('nothing happens before the arrival time', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt - 1);
    expect(s.explored).toEqual([]);
    expect(e.phase).toBe('out');
  });

  it('the place counts as explored on arrival and the team turns around', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    expect(s.explored).toContain('hublandcenter');
    expect(e.phase).toBe('back');
  });

  it('the loot is stored on the expedition and not yet in the stock', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    const before = { ...s.res };
    at(s, e.arriveAt);
    expect(e.loot).toEqual(SITES.hublandcenter.loot);
    expect(s.res).toEqual(before);
  });

  it('sets the flag of the place', () => {
    const s = base();
    const e = dispatch(s, 'ferdinandeum');
    expect(s.flags.studenten).toBeUndefined();
    at(s, e.arriveAt);
    expect(s.flags.studenten).toBeTruthy();
  });

  it('a place without a flag sets none', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    expect(s.flags).toEqual({});
  });

  it('queues the event of the place on arrival', () => {
    const s = base();
    const e = dispatch(s, 'bahnhof');
    at(s, e.arriveAt);
    expect(s.events.pending.map((x) => x.id)).toEqual(['fluechtlingszug']);
    expect(s.events.fired).toContain('fluechtlingszug');
  });

  it('queues the matching event for other places', () => {
    const cases: [string, string][] = [['grombuehl', 'kranke_zurueck'], ['altstadt', 'domschatz']];
    for (const [site, event] of cases) {
      const s = base();
      const e = dispatch(s, site);
      at(s, e.arriveAt);
      expect(s.events.pending.map((x) => x.id), site).toEqual([event]);
    }
  });

  it('the Rhön sets its flag and warns of the storm at once', () => {
    const s = base();
    s.explored = ['hublandcenter', 'galgenberg', 'bahnhof'];
    const e = dispatch(s, 'rhoen');
    at(s, e.arriveAt);
    expect(s.flags.wasserkuppe).toBeTruthy();
    expect(s.events.pending.map((x) => x.id)).toContain('sturmwarnung');
  });

  it('a place without an event queues nothing', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    expect(s.events.pending).toEqual([]);
  });

  it('an event that has already fired is not queued a second time', () => {
    const s = base();
    s.events.fired.push('fluechtlingszug');
    const e = dispatch(s, 'bahnhof');
    at(s, e.arriveAt);
    expect(s.events.pending).toEqual([]);
  });
});

describe('exploreHour: danger', () => {
  it('rolls once per member with danger × 0.25', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter'); // 0.05
    at(s, e.arriveAt);
    expect(countRolls(0.05 * 0.25)).toBe(4);
  });

  it('the valley is 1.5 times as dangerous', () => {
    const s = base();
    const e = dispatch(s, 'bahnhof'); // 0.2, valley
    at(s, e.arriveAt);
    expect(countRolls(0.2 * 1.5 * 0.25)).toBe(4);
  });

  it('the storm triples the danger', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    e.arriveAt = STORM; // the team is still out when the storm hits
    at(s, STORM);
    expect(countRolls(0.05 * 3 * 0.25)).toBe(4);
  });

  it('a member who loses the roll dies for good, with the cause expedition', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    const victim = e.members[0];
    const people = s.people.length;
    let n = 0;
    rng.decide = (p) => near(p, 0.05 * 0.25) && n++ === 0;
    at(s, e.arriveAt);
    expect(s.dead).toBe(1);
    expect(s.deaths.expedition).toBe(1);
    expect(s.people.length).toBe(people - 1);
    expect(s.people.some((p) => p.id === victim)).toBe(false);
    expect(e.members).not.toContain(victim);
    expect(e.members.length).toBe(3);
  });

  it('nobody dies when every roll is safe', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    expect(s.dead).toBe(0);
    expect(e.members.length).toBe(4);
  });
});

// ── return ───────────────────────────────────────────────────────────────

describe('exploreHour: return', () => {
  it('the team is still away before the return time', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    at(s, e.returnAt - 1);
    expect(s.expeditions).toContain(e);
    expect(idle(s).some((p) => e.members.includes(p.id))).toBe(false);
  });

  it('the loot is added to the stock on return', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    const { food, rations, parts } = s.res;
    at(s, e.returnAt);
    expect(s.res.food).toBeCloseTo(food + 120);
    expect(s.res.rations).toBeCloseTo(rations + 60);
    expect(s.res.parts).toBeCloseTo(parts + 1);
  });

  it('the members are free again and the expedition is over', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    const members = [...e.members];
    at(s, e.arriveAt);
    at(s, e.returnAt);
    expect(s.expeditions).toEqual([]);
    const free = idle(s).map((p) => p.id);
    for (const id of members) expect(free).toContain(id);
  });

  it('only the survivors come home when somebody died', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    const members = [...e.members];
    let n = 0;
    rng.decide = (p) => near(p, 0.05 * 0.25) && n++ === 0;
    at(s, e.arriveAt);
    rng.decide = () => false;
    at(s, e.returnAt);
    const free = idle(s).map((p) => p.id);
    expect(members.filter((id) => free.includes(id)).length).toBe(3);
  });

  it('survivors found on the way join the city as new people', () => {
    const s = base();
    const e = dispatch(s, 'ferdinandeum'); // 4 engineers from Würzburg
    const known = new Set(s.people.map((p) => p.id));
    at(s, e.arriveAt);
    expect(s.people.length).toBe(known.size); // not yet
    at(s, e.returnAt);
    const added = s.people.filter((p) => !known.has(p.id));
    expect(added.length).toBe(4);
    for (const p of added) {
      expect(p.kind).toBe('engineer');
      expect(p.origin).toBe('wue');
      expect(p.health).toBe('ok');
    }
  });

  it('a mixed group of survivors has the announced size', () => {
    const s = base();
    const e = dispatch(s, 'galgenberg'); // 6 mixed from Würzburg
    const before = s.people.length;
    at(s, e.arriveAt);
    at(s, e.returnAt);
    expect(s.people.length).toBe(before + 6);
  });

  it('a place without survivors adds nobody', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    const before = s.people.length;
    at(s, e.arriveAt);
    at(s, e.returnAt);
    expect(s.people.length).toBe(before);
  });

  it('logs the return as good news', () => {
    const s = base();
    const e = dispatch(s, 'hublandcenter');
    at(s, e.arriveAt);
    const logged = s.log.length;
    at(s, e.returnAt);
    expect(s.log.slice(logged).some((l) => l.kind === 'good')).toBe(true);
  });

  it('the whole trip runs through the game hours', () => {
    const s = base();
    const food = s.res.food;
    dispatch(s, 'hublandcenter'); // away 4 h
    for (let i = 0; i < 6; i++) stepHour(s);
    expect(s.explored).toContain('hublandcenter');
    expect(s.expeditions).toEqual([]);
    expect(s.res.food).toBeCloseTo(food + 120);
  });
});
