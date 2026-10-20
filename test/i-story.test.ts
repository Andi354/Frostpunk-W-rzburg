import '../src/sim/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID } from '../src/sim/grid';
import { addBuilding, newGame } from '../src/sim/state';
import { advance } from '../src/sim/sim';
import { EVENTS } from '../src/sim/data/events';
import { queueEvent, resolveEvent, storyHour } from '../src/sim/story';
import type { GameState, PersonKind } from '../src/sim/types';

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

// ── helpers ──────────────────────────────────────────────────────────────

const ALL = Object.keys(EVENTS);
const timeOf = (day: number, hour: number) => 24 * (day - 1) + hour;

/** A game in which nothing but `only` can fire: every other event counts as already fired. */
function gameFor(only: string | null): GameState {
  const s = newGame(1);
  s.events.fired = ALL.filter((id) => id !== only);
  s.discontent = 50;
  s.hope = 50;
  return s;
}

function pendingIds(s: GameState): string[] {
  return s.events.pending.map((e) => e.id);
}

function freeCell(s: GameState, ring: number, skip = 0): number {
  const used = new Set(s.buildings.map((b) => b.cell));
  return GRID.filter((c) => c.ring === ring && !used.has(c.id))[skip].id;
}

function funkstation(s: GameState): void {
  addBuilding(s, 'funkstation', freeCell(s, 3), 1);
}

function count(s: GameState, kind: PersonKind, origin?: string): number {
  return s.people.filter((p) => p.kind === kind && (!origin || p.origin === origin)).length;
}

/** Queue the event and resolve the given choice; returns the state before and after. */
function choose(id: string, choice: number, setup?: (s: GameState) => void) {
  const s = gameFor(null);
  setup?.(s);
  const before = structuredClone(s);
  queueEvent(s, id);
  resolveEvent(s, choice);
  return { before, after: s };
}

// ── queueEvent ───────────────────────────────────────────────────────────

describe('events: data and queueEvent', () => {
  const ids = [
    'ankunft', 'amerikaner', 'kinder', 'blindgaenger', 'hamsterfahrt', 'kaeltewelle', 'heimkehrer', 'fluechtlingszug', 'streit',
    'kranke_zurueck', 'domschatz', 'treck_wertheim', 'fringsen', 'schweinfurt_funk', 'sturmwarnung', 'auszug', 'wahrheit_tal',
    'sturm_beginnt', 'sturm_vorbei',
  ];

  it('contains every event of the spec', () => {
    for (const id of ids) expect(EVENTS[id], id).toBeDefined();
  });

  it('every event has a title, at least one choice and a body', () => {
    for (const id of ids) {
      const e = EVENTS[id];
      expect(e.title.length, id).toBeGreaterThan(2);
      expect(e.choices.length, id).toBeGreaterThan(0);
      expect(e.body(newGame(1)).length, id).toBeGreaterThan(20);
    }
  });

  it('builds a pending event of plain strings and marks it as fired', () => {
    for (const id of ids) {
      const s = newGame(1);
      queueEvent(s, id);
      const pending = s.events.pending[0];
      expect(pending.id).toBe(id);
      expect(typeof pending.title).toBe('string');
      expect(typeof pending.body).toBe('string');
      expect(pending.choices.length).toBe(EVENTS[id].choices.length);
      for (const c of pending.choices) expect(typeof c.label).toBe('string');
      expect(s.events.fired).toContain(id);
      expect(JSON.parse(JSON.stringify(s.events.pending))).toEqual(s.events.pending);
    }
  });

  it('uses the senders and choice labels of the spec', () => {
    const s = newGame(1);
    queueEvent(s, 'amerikaner');
    queueEvent(s, 'heimkehrer');
    queueEvent(s, 'ankunft');
    const [am, he, an] = s.events.pending;
    expect(am.sender).toBe('Brief eines US-Captains');
    expect(am.choices.map((c) => c.label)).toEqual(['Kohlenlager freilegen', 'Brief verbrennen, um sich zu wärmen']);
    expect(he.sender).toBe('Ratsherr Konrad Hufnagel');
    expect(he.choices.map((c) => c.label)).toEqual(['Anhören', 'Zum Schweigen bringen']);
    expect(an.sender).toBe('Notiz im Heizwerk');
    expect(an.choices.map((c) => c.label)).toEqual(['An die Arbeit']);
  });
});

// ── triggers ─────────────────────────────────────────────────────────────

describe('storyHour: events fire once at their day and hour', () => {
  const streitSetup = (s: GameState) => s.people.slice(0, 16).forEach((p) => (p.origin = 'expellee'));
  const auszugSetup = (s: GameState) => {
    s.flags.heimkehrer = 80;
  };
  const schedule: [string, number, number, ((s: GameState) => void)?][] = [
    ['amerikaner', 2, 9],
    ['kinder', 3, 10],
    ['blindgaenger', 5, 11],
    ['hamsterfahrt', 6, 8],
    ['kaeltewelle', 8, 7],
    ['heimkehrer', 11, 9],
    ['fluechtlingszug', 12, 10],
    ['streit', 14, 12, streitSetup],
    ['auszug', 22, 9, auszugSetup],
    ['fringsen', 24, 8],
    ['sturmwarnung', 25, 8],
    ['sturm_beginnt', 30, 6],
    ['sturm_vorbei', 34, 6],
  ];

  for (const [id, day, hour, setup] of schedule) {
    it(`${id} fires on day ${day} at ${String(hour).padStart(2, '0')}:00, not an hour earlier`, () => {
      const s = gameFor(id);
      setup?.(s);
      s.time = timeOf(day, hour) - 1;
      storyHour(s);
      expect(pendingIds(s)).toEqual([]);
      s.time = timeOf(day, hour);
      storyHour(s);
      expect(pendingIds(s)).toEqual([id]);
      expect(s.events.fired).toContain(id);
    });
  }

  it('the arrival note fires at once on day 1', () => {
    const s = gameFor('ankunft');
    s.time = 7;
    storyHour(s);
    expect(pendingIds(s)).toEqual(['ankunft']);
  });

  it('an event fires only once, even when its hour comes up again', () => {
    const s = gameFor('amerikaner');
    s.time = timeOf(2, 9);
    storyHour(s);
    storyHour(s);
    expect(pendingIds(s)).toEqual(['amerikaner']);
    resolveEvent(s, 0);
    storyHour(s);
    expect(pendingIds(s)).toEqual([]);
  });

  it('the dud is not found once the bomb disposal service is researched', () => {
    const s = gameFor('blindgaenger');
    s.research.done.push('kampfmittel');
    s.time = timeOf(5, 11);
    storyHour(s);
    expect(pendingIds(s)).toEqual([]);
  });

  it('the quarrel needs 15 expellees', () => {
    const s = gameFor('streit');
    s.people.slice(0, 14).forEach((p) => (p.origin = 'expellee'));
    s.people.slice(14).forEach((p) => (p.origin = 'wue'));
    s.time = timeOf(14, 12);
    storyHour(s);
    expect(pendingIds(s)).toEqual([]);
    s.people[14].origin = 'expellee';
    storyHour(s);
    expect(pendingIds(s)).toEqual(['streit']);
  });

  it('the departure needs a return movement of at least 80', () => {
    const s = gameFor('auszug');
    s.flags.heimkehrer = 79;
    s.time = timeOf(22, 9);
    storyHour(s);
    expect(pendingIds(s)).toEqual([]);
    s.flags.heimkehrer = 80;
    storyHour(s);
    expect(pendingIds(s)).toEqual(['auszug']);
  });

  it('Fringsen arrives on day 24, or on day 20 with a radio station', () => {
    const plain = gameFor('fringsen');
    plain.time = timeOf(20, 8);
    storyHour(plain);
    expect(pendingIds(plain)).toEqual([]);
    const radio = gameFor('fringsen');
    funkstation(radio);
    radio.time = timeOf(20, 8);
    storyHour(radio);
    expect(pendingIds(radio)).toEqual(['fringsen']);
  });

  it('the storm warning arrives on day 25, or on day 21 with a radio station or the Wasserkuppe flag', () => {
    const plain = gameFor('sturmwarnung');
    plain.time = timeOf(21, 8);
    storyHour(plain);
    expect(pendingIds(plain)).toEqual([]);

    const radio = gameFor('sturmwarnung');
    funkstation(radio);
    radio.time = timeOf(21, 8);
    storyHour(radio);
    expect(pendingIds(radio)).toEqual(['sturmwarnung']);

    const kuppe = gameFor('sturmwarnung');
    kuppe.flags.wasserkuppe = 1;
    kuppe.time = timeOf(21, 8);
    storyHour(kuppe);
    expect(pendingIds(kuppe)).toEqual(['sturmwarnung']);
  });

  it('the radio message from Schweinfurt needs a radio station, the flag and day 15', () => {
    const ok = () => {
      const s = gameFor('schweinfurt_funk');
      funkstation(s);
      s.flags.schweinfurt = 1;
      return s;
    };
    const early = ok();
    early.time = timeOf(14, 23);
    storyHour(early);
    expect(pendingIds(early)).toEqual([]);

    const on = ok();
    on.time = timeOf(15, 10);
    storyHour(on);
    expect(pendingIds(on)).toEqual(['schweinfurt_funk']);

    const noRadio = gameFor('schweinfurt_funk');
    noRadio.flags.schweinfurt = 1;
    noRadio.time = timeOf(16, 10);
    storyHour(noRadio);
    expect(pendingIds(noRadio)).toEqual([]);

    const noFlag = gameFor('schweinfurt_funk');
    funkstation(noFlag);
    noFlag.time = timeOf(16, 10);
    storyHour(noFlag);
    expect(pendingIds(noFlag)).toEqual([]);
  });

  it('the truth about the valley comes once the valley has been seen and the return movement exists', () => {
    const s = gameFor('wahrheit_tal');
    s.time = timeOf(15, 12);
    storyHour(s);
    expect(pendingIds(s)).toEqual([]);
    s.flags.heimkehrer = 60;
    storyHour(s);
    expect(pendingIds(s)).toEqual([]); // valley not seen yet
    s.flags.tal_gesehen = 1;
    storyHour(s);
    expect(pendingIds(s)).toEqual(['wahrheit_tal']);
  });
});

// ── decisions pause time ─────────────────────────────────────────────────

describe('decisions pause the game', () => {
  it('advance does nothing while an event waits', () => {
    const s = newGame(1);
    queueEvent(s, 'ankunft');
    const t = s.time;
    advance(s, 5);
    expect(s.time).toBe(t);
  });

  it('advance continues after the decision', () => {
    const s = newGame(1);
    queueEvent(s, 'ankunft');
    resolveEvent(s, 0);
    const t = s.time;
    advance(s, 3);
    expect(s.time).toBe(t + 3);
  });

  it('time stops when an event is queued during an advance', () => {
    const s = gameFor('amerikaner');
    s.time = timeOf(2, 8);
    advance(s, 10);
    expect(pendingIds(s)).toEqual(['amerikaner']);
    expect(s.time).toBeLessThan(timeOf(2, 8) + 5);
  });
});

// ── resolveEvent ─────────────────────────────────────────────────────────

describe('resolveEvent', () => {
  it('removes the first pending event', () => {
    const s = newGame(1);
    queueEvent(s, 'kaeltewelle');
    queueEvent(s, 'kinder');
    resolveEvent(s, 0);
    expect(pendingIds(s)).toEqual(['kinder']);
  });

  it('applies the chosen option of the first pending event only', () => {
    const s = gameFor(null);
    queueEvent(s, 'amerikaner');
    queueEvent(s, 'sturm_vorbei');
    const hope = s.hope;
    resolveEvent(s, 0);
    expect(s.hope).toBe(hope); // sturm_vorbei (+10 hope) is still waiting
  });

  it('the Americans: dig up the coal store gives 60 coal', () => {
    const { before, after } = choose('amerikaner', 0);
    expect(after.res.coal).toBeCloseTo(before.res.coal + 60);
    expect(after.events.pending).toEqual([]);
  });

  it('the Americans: burning the letter gives 1 hope and no coal', () => {
    const { before, after } = choose('amerikaner', 1);
    expect(after.hope).toBeCloseTo(before.hope + 1);
    expect(after.res.coal).toBe(before.res.coal);
  });

  it('the refugee train: take them in brings 18 expellees (10 workers, 3 engineers, 5 children) and 4 discontent', () => {
    const { before, after } = choose('fluechtlingszug', 0);
    expect(after.people.length).toBe(before.people.length + 18);
    expect(count(after, 'worker', 'expellee') - count(before, 'worker', 'expellee')).toBe(10);
    expect(count(after, 'engineer', 'expellee') - count(before, 'engineer', 'expellee')).toBe(3);
    expect(count(after, 'child', 'expellee') - count(before, 'child', 'expellee')).toBe(5);
    expect(after.discontent).toBeCloseTo(before.discontent + 4);
  });

  it('the refugee train: turning them away costs 8 hope and brings nobody', () => {
    const { before, after } = choose('fluechtlingszug', 1);
    expect(after.people.length).toBe(before.people.length);
    expect(after.hope).toBeCloseTo(before.hope - 8);
  });

  it('the returnee: listening gives 3 hope and a return movement of 40', () => {
    const { before, after } = choose('heimkehrer', 0);
    expect(after.hope).toBeCloseTo(before.hope + 3);
    expect(after.flags.heimkehrer).toBe(40);
  });

  it('the returnee: silencing him gives 8 discontent and a return movement of 20', () => {
    const { before, after } = choose('heimkehrer', 1);
    expect(after.discontent).toBeCloseTo(before.discontent + 8);
    expect(after.flags.heimkehrer).toBe(20);
  });

  it('the children: talking about it changes nothing yet', () => {
    const { before, after } = choose('kinder', 0);
    expect(after.res).toEqual(before.res);
    expect(after.hope).toBe(before.hope);
    expect(after.discontent).toBe(before.discontent);
    expect(after.events.pending).toEqual([]);
  });

  it('the dud: carefully salvaging either costs one worker (cause unfall) or brings 30 steel, depending on the roll', () => {
    const run = (unlucky: boolean) => {
      rng.decide = (p) => near(p, 0.5) && unlucky;
      const { before, after } = choose('blindgaenger', 0);
      const died = after.dead - before.dead;
      const steel = after.res.steel - before.res.steel;
      if (died === 1) {
        expect(after.deaths.unfall).toBe(1);
        expect(after.people.length).toBe(before.people.length - 1);
        expect(steel).toBe(0);
        return 'death';
      }
      expect(died).toBe(0);
      expect(steel).toBeCloseTo(30);
      return 'steel';
    };
    expect([run(true), run(false)].sort()).toEqual(['death', 'steel']);
  });

  it('the dud: cordoning it off removes one random pile', () => {
    const piles = (s: GameState) => s.buildings.filter((b) => b.type.startsWith('pile_')).length;
    const { before, after } = choose('blindgaenger', 1);
    expect(piles(after)).toBe(piles(before) - 1);
  });

  it('the hamster trip: allowing it schedules the return in 24 hours', () => {
    const s = gameFor(null);
    queueEvent(s, 'hamsterfahrt');
    const t = s.time;
    resolveEvent(s, 0);
    expect(s.events.scheduled).toContainEqual({ id: 'hamster_zurueck', at: t + 24 });
  });

  it('the hamster trip: forbidding it costs 5 discontent', () => {
    const { before, after } = choose('hamsterfahrt', 1);
    expect(after.discontent).toBeCloseTo(before.discontent + 5);
    expect(after.events.scheduled).toEqual([]);
  });

  it('a scheduled event is not queued before its time', () => {
    const s = gameFor(null);
    s.time = 100;
    s.events.scheduled.push({ id: 'hamster_zurueck', at: 103 });
    storyHour(s);
    expect(pendingIds(s)).toEqual([]);
    expect(s.events.scheduled.length).toBe(1);
  });

  it('a scheduled event fires when its time has come and leaves the schedule', () => {
    const s = gameFor(null);
    s.time = 100;
    s.events.scheduled.push({ id: 'hamster_zurueck', at: 103 });
    s.time = 103;
    storyHour(s);
    expect(pendingIds(s)).toEqual(['hamster_zurueck']);
    expect(s.events.scheduled).toEqual([]);
  });

  it('the hamster trip brings 70 food when luck holds', () => {
    const s = gameFor(null);
    s.events.scheduled.push({ id: 'hamster_zurueck', at: 50 });
    s.time = 50;
    storyHour(s);
    const food = s.res.food;
    const rations = s.res.rations;
    if (s.events.pending.length) resolveEvent(s, 0);
    expect(s.res.food).toBeCloseTo(food + 70);
    expect(s.res.rations).toBe(rations);
  });

  it('the hamster trip can go wrong: 30 rations lost instead of the food', () => {
    const s = gameFor(null);
    s.events.scheduled.push({ id: 'hamster_zurueck', at: 50 });
    s.time = 50;
    rng.decide = (p) => near(p, 0.2);
    const food = s.res.food;
    const rations = s.res.rations;
    storyHour(s);
    if (s.events.pending.length) resolveEvent(s, 0);
    expect(s.res.rations).toBeCloseTo(rations - 30);
    expect(s.res.food).toBe(food);
  });

  it('streit: equal rights give 5 discontent and 3 hope', () => {
    const { before, after } = choose('streit', 0);
    expect(after.discontent).toBeCloseTo(before.discontent + 5);
    expect(after.hope).toBeCloseTo(before.hope + 3);
  });

  it('streit: Würzburgers first costs 5 hope and soothes 3 discontent', () => {
    const { before, after } = choose('streit', 1);
    expect(after.hope).toBeCloseTo(before.hope - 5);
    expect(after.discontent).toBeCloseTo(before.discontent - 3);
  });

  it('the patients: taking them along brings 5 sick people', () => {
    const { before, after } = choose('kranke_zurueck', 0);
    expect(after.people.length).toBe(before.people.length + 5);
    const known = new Set(before.people.map((p) => p.id));
    const added = after.people.filter((p) => !known.has(p.id));
    expect(added.length).toBe(5);
    expect(added.every((p) => p.health === 'sick')).toBe(true);
  });

  it('the patients: leaving them behind costs 4 hope', () => {
    const { before, after } = choose('kranke_zurueck', 1);
    expect(after.hope).toBeCloseTo(before.hope - 4);
    expect(after.people.length).toBe(before.people.length);
  });

  it('the cathedral: relics give 6 hope, tools give 2 spare parts', () => {
    const a = choose('domschatz', 0);
    expect(a.after.hope).toBeCloseTo(a.before.hope + 6);
    const b = choose('domschatz', 1);
    expect(b.after.res.parts).toBe(b.before.res.parts + 2);
  });

  it('the trek from Wertheim: taking them in brings 20 expellees and 4 discontent', () => {
    const { before, after } = choose('treck_wertheim', 0);
    expect(after.people.length).toBe(before.people.length + 20);
    const known = new Set(before.people.map((p) => p.id));
    expect(after.people.filter((p) => !known.has(p.id)).every((p) => p.origin === 'expellee')).toBe(true);
    expect(after.discontent).toBeCloseTo(before.discontent + 4);
  });

  it('the trek from Wertheim: sharing supplies costs 60 food and gives 2 hope', () => {
    const { before, after } = choose('treck_wertheim', 1, (s) => {
      s.res.food = 200;
    });
    expect(after.res.food).toBeCloseTo(before.res.food - 60);
    expect(after.hope).toBeCloseTo(before.hope + 2);
  });

  it('Fringsen: understanding the sermon sets the flag that opens the law', () => {
    const { after } = choose('fringsen', 0);
    expect(after.flags.fringsen).toBeTruthy();
  });

  it('the radio deal with Schweinfurt is available with 100 coal only', () => {
    const s = gameFor(null);
    s.res.coal = 99;
    expect(EVENTS.schweinfurt_funk.choices[0].available?.(s)).toBe(false);
    s.res.coal = 100;
    expect(EVENTS.schweinfurt_funk.choices[0].available?.(s)).toBe(true);
  });

  it('the radio deal: 100 coal for 2 spare parts', () => {
    const { before, after } = choose('schweinfurt_funk', 0);
    expect(after.res.coal).toBeCloseTo(before.res.coal - 100);
    expect(after.res.parts).toBe(before.res.parts + 2);
  });

  it('the radio deal: declining changes nothing', () => {
    const { before, after } = choose('schweinfurt_funk', 1);
    expect(after.res).toEqual(before.res);
  });

  it('the storm warning gives 2 hope', () => {
    const { before, after } = choose('sturmwarnung', 0);
    expect(after.hope).toBeCloseTo(before.hope + 2);
  });

  it('the calm after the storm gives 10 hope', () => {
    const { before, after } = choose('sturm_vorbei', 0);
    expect(after.hope).toBeCloseTo(before.hope + 10);
  });

  it('the departure: letting them go takes about 15 % of the people with 80 food and 80 coal', () => {
    const { before, after } = choose('auszug', 0, (s) => {
      s.flags.heimkehrer = 90;
      s.res.food = 200;
      s.res.coal = 300;
    });
    const left = before.people.length - after.people.length;
    expect(left).toBeGreaterThanOrEqual(Math.floor(before.people.length * 0.15));
    expect(left).toBeLessThanOrEqual(Math.ceil(before.people.length * 0.15));
    expect(after.res.food).toBeCloseTo(before.res.food - 80);
    expect(after.res.coal).toBeCloseTo(before.res.coal - 80);
  });

  it('the departure: holding them by force costs 15 discontent', () => {
    const { before, after } = choose('auszug', 1, (s) => {
      s.flags.heimkehrer = 90;
    });
    expect(after.discontent).toBeCloseTo(before.discontent + 15);
    expect(after.people.length).toBe(before.people.length);
  });

  it('the truth about the valley takes 50 off the return movement and gives 4 hope', () => {
    const { before, after } = choose('wahrheit_tal', 0, (s) => {
      s.flags.heimkehrer = 80;
      s.flags.tal_gesehen = 1;
    });
    expect(after.flags.heimkehrer).toBe(30);
    expect(after.hope).toBeCloseTo(before.hope + 4);
  });

  it('the truth about the valley never takes the return movement below 0', () => {
    const { after } = choose('wahrheit_tal', 0, (s) => {
      s.flags.heimkehrer = 20;
      s.flags.tal_gesehen = 1;
    });
    expect(after.flags.heimkehrer).toBe(0);
  });
});

// ── returnee movement ────────────────────────────────────────────────────

describe('storyHour: return movement', () => {
  function movement(flag: number, discontent: number, hope: number, hour = 6): number {
    const s = gameFor(null);
    s.flags.heimkehrer = flag;
    s.discontent = discontent;
    s.hope = hope;
    s.time = timeOf(15, hour);
    storyHour(s);
    return s.flags.heimkehrer;
  }

  it('grows daily at 06:00 by 2 + discontent / 10 − hope / 15', () => {
    expect(movement(40, 30, 45)).toBeCloseTo(40 + 2 + 3 - 3);
    expect(movement(40, 60, 30)).toBeCloseTo(40 + 2 + 6 - 2);
  });

  it('falls when hope is high and discontent low', () => {
    expect(movement(40, 0, 90)).toBeCloseTo(40 + 2 + 0 - 6);
  });

  it('changes only at 06:00', () => {
    expect(movement(40, 60, 30, 7)).toBe(40);
    expect(movement(40, 60, 30, 5)).toBe(40);
  });

  it('stays between 0 and 100', () => {
    expect(movement(99, 100, 0)).toBe(100);
    expect(movement(1, 0, 100)).toBe(0);
  });

  it('does not exist before the returnee event', () => {
    const s = gameFor(null);
    s.discontent = 90;
    s.time = timeOf(5, 6);
    storyHour(s);
    expect(s.flags.heimkehrer).toBeUndefined();
  });
});

// ── the end of the scenario ──────────────────────────────────────────────

describe('victory', () => {
  it('wins on day 35 at 18:00 with people alive', () => {
    const s = gameFor(null);
    s.time = timeOf(35, 18);
    storyHour(s);
    expect(s.outcome).toBe('won');
  });

  it('does not win an hour earlier', () => {
    const s = gameFor(null);
    s.time = timeOf(35, 17);
    storyHour(s);
    expect(s.outcome).toBeNull();
  });

  it('does not win on day 34', () => {
    const s = gameFor(null);
    s.time = timeOf(34, 20);
    storyHour(s);
    expect(s.outcome).toBeNull();
  });

  it('is reached by playing the last hours', () => {
    const s = gameFor(null);
    s.time = timeOf(35, 15);
    s.res.coal = 1000;
    advance(s, 6);
    expect(s.outcome).toBe('won');
    expect(s.time).toBeLessThanOrEqual(timeOf(35, 20));
  });
});
