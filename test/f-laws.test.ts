import '../src/sim/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID } from '../src/sim/grid';
import { addBuilding, addPerson, newGame } from '../src/sim/state';
import { stepHour } from '../src/sim/sim';
import { assign, productionHour } from '../src/sim/economy';
import { assignHomes, careCapacity, peopleHour } from '../src/sim/people';
import { LAWS } from '../src/sim/data/laws';
import { canSign, lawHourly, lawsHour, sign } from '../src/sim/laws';
import { isWorkHour, workHours } from '../src/sim/util';
import type { Building, GameState, PersonKind } from '../src/sim/types';

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
const rolled = (p: number) => rng.calls.some((x) => near(x, p));

// ── helpers ──────────────────────────────────────────────────────────────

const DAY8 = 24 * 7; // 1 Dec + 7 days = day 8, 00:00
const NIGHT = 24 * 9 + 3;

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

function warmBoiler(s: GameState): void {
  s.gen = { on: true, level: 3, overdrive: true, stress: 0 };
}

/** Day 10, no cooldown, middling mood: every law is signable unless its own rule says otherwise. */
function lawGame(): GameState {
  const s = newGame(1);
  s.time = 24 * 9 + 8;
  s.laws.readyAt = 0;
  s.discontent = 50;
  s.hope = 50;
  return s;
}

/** Mark all prerequisites of a law as signed (without their effects). */
function withPrerequisites(s: GameState, id: string): void {
  const req = LAWS[id].requires;
  if (!req) return;
  withPrerequisites(s, req);
  if (!s.laws.signed.includes(req)) s.laws.signed.push(req);
}

function finishedBuilding(s: GameState, type: string, ring = 1, skip = 0): Building {
  return addBuilding(s, type, freeCell(s, ring, skip), 1);
}

function calmCity(s: GameState, n = 20, engineers = 0): void {
  population(s, n - engineers, engineers);
  warmBoiler(s);
  s.res.rations = 1000;
  s.time = NIGHT;
  for (let i = 0; i < Math.ceil(n / 10); i++) addBuilding(s, 'zelt', freeCell(s, 1, i), 1);
  assignHomes(s);
}

// ── data ─────────────────────────────────────────────────────────────────

describe('law data', () => {
  it('has all laws of the spec', () => {
    const ids = [
      'kinderarbeit', 'kinderhort', 'suppe', 'ersatzkost', 'lebensmittelkarten', 'notschicht', 'truemmerpflicht', 'friedhof',
      'schneegrab', 'amputation', 'pflegestation', 'weinausschank', 'kohlenklau', 'schwarzmarkt', 'notstand', 'kiliansgemeinde',
      'buergerwehr', 'ausgangssperre', 'lautsprecher', 'arbeitsdienst', 'stadtkommandant', 'notkapelle', 'andacht', 'diakonissen',
      'kiliansfest', 'bischofsstadt',
    ];
    for (const id of ids) expect(LAWS[id], id).toBeDefined();
    expect(Object.keys(LAWS).length).toBe(ids.length);
  });

  it('puts the laws on their tabs', () => {
    for (const id of ['kinderarbeit', 'suppe', 'kohlenklau', 'schwarzmarkt', 'amputation']) expect(LAWS[id].tab, id).toBe('not');
    expect(LAWS.notstand.tab).toBe('weg');
    expect(LAWS.kiliansgemeinde.tab).toBe('weg');
    for (const id of ['buergerwehr', 'ausgangssperre', 'lautsprecher', 'arbeitsdienst', 'stadtkommandant']) expect(LAWS[id].tab, id).toBe('order');
    for (const id of ['notkapelle', 'andacht', 'diakonissen', 'kiliansfest', 'bischofsstadt']) expect(LAWS[id].tab, id).toBe('faith');
  });

  it('chains the order laws behind the emergency administration', () => {
    const chain = ['notstand', 'buergerwehr', 'ausgangssperre', 'lautsprecher', 'arbeitsdienst', 'stadtkommandant'];
    for (let i = 1; i < chain.length; i++) expect(LAWS[chain[i]].requires, chain[i]).toBe(chain[i - 1]);
  });

  it('chains the faith laws behind the Kilian congregation', () => {
    const chain = ['kiliansgemeinde', 'notkapelle', 'andacht', 'diakonissen', 'kiliansfest', 'bischofsstadt'];
    for (let i = 1; i < chain.length; i++) expect(LAWS[chain[i]].requires, chain[i]).toBe(chain[i - 1]);
  });

  it('the two paths exclude each other and open on day 8', () => {
    expect(LAWS.notstand.excludes).toBe('kiliansgemeinde');
    expect(LAWS.kiliansgemeinde.excludes).toBe('notstand');
    expect(LAWS.notstand.availableFrom).toBe(8);
    expect(LAWS.kiliansgemeinde.availableFrom).toBe(8);
  });

  it('the exclusive survival laws exclude each other', () => {
    const pairs = [['kinderarbeit', 'kinderhort'], ['suppe', 'ersatzkost'], ['friedhof', 'schneegrab'], ['amputation', 'pflegestation']];
    for (const [a, b] of pairs) {
      expect(LAWS[a].excludes, a).toBe(b);
      expect(LAWS[b].excludes, b).toBe(a);
    }
  });

  it('Fringsen needs the flag fringsen', () => {
    expect(LAWS.kohlenklau.flag).toBe('fringsen');
  });

  it('every law has a name and a description', () => {
    for (const l of Object.values(LAWS)) {
      expect(l.name.length, l.id).toBeGreaterThan(2);
      expect(l.desc.length, l.id).toBeGreaterThan(10);
    }
  });

  it('the last law of the order path carries its warning', () => {
    expect(LAWS.stadtkommandant.desc).toContain('Wir haben schon einmal einem Mann alles erlaubt.');
  });
});

// ── canSign ──────────────────────────────────────────────────────────────

describe('canSign', () => {
  it('allows a free survival law at the start of the game', () => {
    const s = newGame(1);
    expect(canSign(s, 'kinderarbeit')).toBeNull();
    expect(canSign(s, 'suppe')).toBeNull();
  });

  it('refuses a law that is already in force', () => {
    const s = lawGame();
    s.laws.signed.push('suppe');
    expect(canSign(s, 'suppe')).toBe('Schon erlassen');
  });

  it('refuses a law excluded by a signed one and names it', () => {
    const s = lawGame();
    s.laws.signed.push('kinderhort');
    expect(canSign(s, 'kinderarbeit')).toBe(`Ausgeschlossen durch ${LAWS.kinderhort.name}`);
  });

  it('exclusion works both ways', () => {
    const s = lawGame();
    s.laws.signed.push('ersatzkost');
    expect(canSign(s, 'suppe')).toBe(`Ausgeschlossen durch ${LAWS.ersatzkost.name}`);
  });

  it('refuses a law whose predecessor is missing and names it', () => {
    const s = lawGame();
    expect(canSign(s, 'buergerwehr')).toBe(`Erst: ${LAWS.notstand.name}`);
    s.laws.signed.push('notstand');
    expect(canSign(s, 'buergerwehr')).toBeNull();
  });

  it('every link of a chain needs the one before', () => {
    const s = lawGame();
    s.laws.signed.push('kiliansgemeinde');
    expect(canSign(s, 'andacht')).toBe(`Erst: ${LAWS.notkapelle.name}`);
    expect(canSign(s, 'notkapelle')).toBeNull();
  });

  it('the paths are not available before day 8', () => {
    const s = lawGame();
    s.time = DAY8 - 1; // day 7, 23:00
    expect(canSign(s, 'notstand')).toBe('Ab Tag 8');
    expect(canSign(s, 'kiliansgemeinde')).toBe('Ab Tag 8');
  });

  it('the paths open on day 8', () => {
    const s = lawGame();
    s.time = DAY8;
    expect(canSign(s, 'notstand')).toBeNull();
    expect(canSign(s, 'kiliansgemeinde')).toBeNull();
  });

  it('the paths exclude each other', () => {
    const s = lawGame();
    s.laws.signed.push('notstand');
    expect(canSign(s, 'kiliansgemeinde')).toBe(`Ausgeschlossen durch ${LAWS.notstand.name}`);
  });

  it('Fringsen is not possible before the flag is set', () => {
    const s = lawGame();
    expect(canSign(s, 'kohlenklau')).toBe('Noch nicht möglich');
    s.flags.fringsen = 1;
    expect(canSign(s, 'kohlenklau')).toBeNull();
  });

  it('after a signature the next law has to wait 18 hours', () => {
    const s = lawGame();
    const t = s.time;
    expect(sign(s, 'suppe')).toBe(true);
    expect(canSign(s, 'notschicht')).toBe('Nächstes Gesetz in 18 h');
    s.time = t + 5;
    expect(canSign(s, 'notschicht')).toBe('Nächstes Gesetz in 13 h');
    s.time = t + 17;
    expect(canSign(s, 'notschicht')).toBe('Nächstes Gesetz in 1 h');
    s.time = t + 18;
    expect(canSign(s, 'notschicht')).toBeNull();
  });
});

// ── sign ─────────────────────────────────────────────────────────────────

describe('sign', () => {
  it('puts the law into force and starts the cooldown', () => {
    const s = lawGame();
    const t = s.time;
    expect(sign(s, 'suppe')).toBe(true);
    expect(s.laws.signed).toContain('suppe');
    expect(s.laws.readyAt).toBe(t + 18);
  });

  it('logs the signature as good news', () => {
    const s = lawGame();
    sign(s, 'suppe');
    expect(s.log[s.log.length - 1].kind).toBe('good');
  });

  it('refuses without changing anything when the law cannot be signed', () => {
    const s = lawGame();
    const before = JSON.stringify(s);
    expect(sign(s, 'buergerwehr')).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('refuses during the cooldown', () => {
    const s = lawGame();
    sign(s, 'suppe');
    expect(sign(s, 'notschicht')).toBe(false);
    expect(s.laws.signed).toEqual(['suppe']);
  });

  const effects: [string, number, number][] = [
    // id, discontent change, hope change
    ['kinderarbeit', 5, -3],
    ['kinderhort', 0, 2],
    ['suppe', 2, 0],
    ['ersatzkost', 4, 0],
    ['lebensmittelkarten', 3, 0],
    ['notschicht', 5, 0],
    ['truemmerpflicht', 2, 0],
    ['friedhof', 0, 2],
    ['schneegrab', 0, -2],
    ['weinausschank', 0, 3],
    ['kohlenklau', -5, 0],
    ['schwarzmarkt', -3, -2],
    ['notstand', -8, 0],
    ['kiliansgemeinde', 0, 8],
    ['stadtkommandant', 0, -5],
    ['kiliansfest', -15, 15],
    ['bischofsstadt', 5, 0],
  ];
  for (const [id, disc, hope] of effects) {
    it(`${id} changes discontent by ${disc} and hope by ${hope} when signed`, () => {
      const s = lawGame();
      s.flags.fringsen = 1;
      withPrerequisites(s, id);
      expect(sign(s, id)).toBe(true);
      expect(s.discontent).toBeCloseTo(50 + disc);
      expect(s.hope).toBeCloseTo(50 + hope);
    });
  }

  it('laws without an immediate effect leave the mood alone', () => {
    const s = lawGame();
    sign(s, 'amputation');
    expect(s.discontent).toBe(50);
    expect(s.hope).toBe(50);
  });

  it('the emergency administration sets the order path', () => {
    const s = lawGame();
    sign(s, 'notstand');
    expect(s.laws.path).toBe('order');
  });

  it('the Kilian congregation sets the faith path', () => {
    const s = lawGame();
    sign(s, 'kiliansgemeinde');
    expect(s.laws.path).toBe('faith');
  });

  it('other laws leave the path alone', () => {
    const s = lawGame();
    sign(s, 'suppe');
    expect(s.laws.path).toBeNull();
  });

  it('a whole chain can be signed one law per cooldown', () => {
    const s = lawGame();
    for (const id of ['notstand', 'buergerwehr', 'ausgangssperre']) {
      expect(sign(s, id), id).toBe(true);
      s.time += 18;
    }
    expect(s.laws.signed).toEqual(['notstand', 'buergerwehr', 'ausgangssperre']);
  });
});

// ── hourly effects ───────────────────────────────────────────────────────

describe('lawHourly', () => {
  it('is zero without laws', () => {
    expect(lawHourly(newGame(1))).toEqual({ hope: 0, discontent: 0 });
  });

  const perHour: [string, number, number][] = [
    // id, hope per hour, discontent per hour
    ['ersatzkost', 0, 0.03],
    ['notschicht', 0, 0.08],
    ['truemmerpflicht', 0, 0.03],
    ['schwarzmarkt', 0, -0.02],
    ['buergerwehr', 0, -0.03],
    ['ausgangssperre', -0.02, -0.08],
    ['lautsprecher', 0.05, 0],
    ['arbeitsdienst', 0, 0.02],
    ['andacht', 0.05, 0],
  ];
  for (const [id, hope, disc] of perHour) {
    it(`${id} adds hope ${hope} and discontent ${disc} per hour`, () => {
      const s = newGame(1);
      s.laws.signed.push(id);
      const h = lawHourly(s);
      expect(h.hope).toBeCloseTo(hope, 6);
      expect(h.discontent).toBeCloseTo(disc, 6);
    });
  }

  it('laws with only a one-off effect add nothing per hour', () => {
    const s = newGame(1);
    s.laws.signed.push('kinderarbeit', 'suppe', 'friedhof', 'weinausschank', 'kiliansfest');
    expect(lawHourly(s)).toEqual({ hope: 0, discontent: 0 });
  });

  it('sums over all signed laws', () => {
    const s = newGame(1);
    s.laws.signed.push('ersatzkost', 'notschicht', 'ausgangssperre', 'lautsprecher', 'andacht');
    const h = lawHourly(s);
    expect(h.discontent).toBeCloseTo(0.03 + 0.08 - 0.08, 6);
    expect(h.hope).toBeCloseTo(-0.02 + 0.05 + 0.05, 6);
  });
});

// ── kitchen ──────────────────────────────────────────────────────────────

describe('kitchen and food laws', () => {
  function kitchenRatio(laws: string[]): number {
    const s = newGame(1);
    warmBoiler(s);
    s.laws.signed.push(...laws);
    const k = finishedBuilding(s, 'kueche', 1);
    assign(s, k.id, 2);
    s.time = 24 * 2 + 12;
    s.res.food = 100;
    s.res.rations = 0;
    productionHour(s);
    const eaten = 100 - s.res.food;
    expect(eaten).toBeCloseTo(5); // 2 workers × 2.5
    return s.res.rations / eaten;
  }

  it('turns 1 food into 1 ration without laws', () => {
    expect(kitchenRatio([])).toBeCloseTo(1);
  });

  it('Wassersuppe turns 1 food into 1.25 rations', () => {
    expect(kitchenRatio(['suppe'])).toBeCloseTo(1.25);
  });

  it('Ersatzkost turns 1 food into 1.5 rations', () => {
    expect(kitchenRatio(['ersatzkost'])).toBeCloseTo(1.5);
  });

  it('the stock limit still applies with a law', () => {
    const s = newGame(1);
    warmBoiler(s);
    s.laws.signed.push('ersatzkost');
    const k = finishedBuilding(s, 'kueche', 1);
    assign(s, k.id, 2);
    s.time = 24 * 2 + 12;
    s.res.food = 2;
    s.res.rations = 0;
    productionHour(s);
    expect(s.res.food).toBeCloseTo(0);
    expect(s.res.rations).toBeCloseTo(3);
  });

  it('Wassersuppe makes people 15 % more likely to fall sick', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = 24 * 29 + 3; // storm night: 0.008 per hour at the plaza
    s.laws.signed.push('suppe');
    peopleHour(s);
    expect(rolled(0.008 * 1.15)).toBe(true);
  });

  it('Lebensmittelkarten: children and people without a job eat half a ration', () => {
    const run = (law: boolean) => {
      const s = newGame(1);
      calmCity(s, 4);
      population(s, 2, 0, 2); // 2 workers and 2 children
      assignHomes(s);
      const camp = finishedBuilding(s, 'holzfaeller', 2);
      assign(s, camp.id, 1); // one worker has a job, one is idle, two children
      if (law) s.laws.signed.push('lebensmittelkarten');
      s.res.rations = 50;
      s.time = 24 * 2 + 19;
      peopleHour(s);
      return 50 - s.res.rations;
    };
    expect(run(false)).toBeCloseTo(4);
    expect(run(true)).toBeCloseTo(1 + 0.5 * 3);
  });

  it('Pflegestation: every cared patient costs one extra ration at 19:00', () => {
    const run = (law: boolean) => {
      const s = newGame(1);
      calmCity(s, 12, 5);
      const clinic = finishedBuilding(s, 'sanitaet', 2);
      assign(s, clinic.id, 5);
      s.people.find((p) => p.kind === 'worker')!.health = 'sick';
      if (law) s.laws.signed.push('pflegestation');
      s.res.rations = 100;
      s.time = 24 * 2 + 19;
      peopleHour(s);
      return 100 - s.res.rations;
    };
    expect(run(true) - run(false)).toBeCloseTo(1);
  });
});

// ── work hours ───────────────────────────────────────────────────────────

describe('Notschicht', () => {
  it('extends the work hours to 8–22', () => {
    const s = newGame(1);
    s.laws.signed.push('notschicht');
    expect(workHours(s)).toEqual([8, 22]);
  });

  it('is working time until 21:59 and not at 22:00', () => {
    const s = newGame(1);
    s.laws.signed.push('notschicht');
    const at = (h: number) => {
      s.time = 24 + h;
      return isWorkHour(s);
    };
    expect([at(7), at(8), at(18), at(21), at(22)]).toEqual([false, true, true, true, false]);
  });

  it('buildings produce in the evening hours, and not without the law', () => {
    const run = (law: boolean) => {
      const s = newGame(1);
      warmBoiler(s);
      if (law) s.laws.signed.push('notschicht');
      const camp = finishedBuilding(s, 'holzfaeller', 1);
      assign(s, camp.id, 3);
      s.time = 24 * 2 + 20;
      const wood = s.res.wood;
      productionHour(s);
      return s.res.wood - wood;
    };
    expect(run(false)).toBe(0);
    expect(run(true)).toBeCloseTo(0.8 * 3);
  });

  it('hunters still work only by day', () => {
    const s = newGame(1);
    warmBoiler(s);
    s.laws.signed.push('notschicht');
    const hut = finishedBuilding(s, 'jagdhuette', 1);
    assign(s, hut.id, 3);
    s.time = 24 * 2 + 20;
    const food = s.res.food;
    productionHour(s);
    expect(s.res.food).toBe(food);
  });

  it('makes sickness 10 % more likely at work', () => {
    const s = newGame(1);
    population(s, 1);
    s.time = 24 * 29 + 12; // storm, noon
    s.laws.signed.push('notschicht');
    const camp = finishedBuilding(s, 'holzfaeller', 7); // ins 0, outside the boiler range: "eisig"
    const p = s.people[0];
    p.job = camp.id;
    camp.workers = [p.id];
    peopleHour(s);
    expect(rolled(0.008 * 1.1)).toBe(true);
  });
});

// ── daily laws ───────────────────────────────────────────────────────────

describe('lawsHour: daily effects at 08:00', () => {
  const at = (s: GameState, h: number) => {
    s.time = 24 * 4 + h;
  };

  it('Fringsen brings 40 coal every morning', () => {
    const s = newGame(1);
    s.laws.signed.push('kohlenklau');
    at(s, 8);
    const coal = s.res.coal;
    lawsHour(s);
    expect(s.res.coal).toBe(coal + 40);
  });

  it('Fringsen brings nothing at other hours', () => {
    const s = newGame(1);
    s.laws.signed.push('kohlenklau');
    const coal = s.res.coal;
    for (const h of [0, 7, 9, 12, 23]) {
      at(s, h);
      lawsHour(s);
    }
    expect(s.res.coal).toBe(coal);
  });

  it('without the law nothing is stolen', () => {
    const s = newGame(1);
    at(s, 8);
    const coal = s.res.coal;
    lawsHour(s);
    expect(s.res.coal).toBe(coal);
  });

  it('the military police catch the coal thieves with a 15 % chance: log and 3 hope', () => {
    const s = newGame(1);
    s.laws.signed.push('kohlenklau');
    s.hope = 50;
    at(s, 8);
    rng.decide = (p) => near(p, 0.15);
    lawsHour(s);
    expect(rolled(0.15)).toBe(true);
    expect(s.hope).toBeCloseTo(47);
    expect(s.log.some((l) => l.text.includes('Militärpolizei erwischt Kohlendiebe'))).toBe(true);
  });

  it('when the thieves are not caught nothing is logged and hope stays', () => {
    const s = newGame(1);
    s.laws.signed.push('kohlenklau');
    s.hope = 50;
    at(s, 8);
    lawsHour(s);
    expect(s.hope).toBe(50);
    expect(s.log.some((l) => l.text.includes('Militärpolizei'))).toBe(false);
  });

  it('the black market turns 30 wood into 1 spare part at 08:00 when there is wood', () => {
    const s = newGame(1);
    s.laws.signed.push('schwarzmarkt');
    s.res.wood = 60;
    s.res.parts = 0;
    at(s, 8);
    lawsHour(s);
    expect(s.res.wood).toBe(30);
    expect(s.res.parts).toBe(1);
  });

  it('the black market does nothing with less than 60 wood', () => {
    const s = newGame(1);
    s.laws.signed.push('schwarzmarkt');
    s.res.wood = 59;
    s.res.parts = 0;
    at(s, 8);
    lawsHour(s);
    expect(s.res.wood).toBe(59);
    expect(s.res.parts).toBe(0);
  });

  it('the black market does nothing at other hours', () => {
    const s = newGame(1);
    s.laws.signed.push('schwarzmarkt');
    s.res.wood = 200;
    at(s, 9);
    lawsHour(s);
    at(s, 7);
    lawsHour(s);
    expect(s.res.wood).toBe(200);
  });

  it('runs as part of the game hour', () => {
    const s = newGame(1);
    s.laws.signed.push('kohlenklau');
    s.time = 24 * 4 + 8;
    const coal = s.res.coal;
    stepHour(s);
    expect(s.res.coal).toBe(coal + 40);
  });
});

// ── caps and floors of the paths ─────────────────────────────────────────

describe('path laws', () => {
  function quietNight(): GameState {
    const s = newGame(1);
    s.time = 24 * 3 + 3;
    return s;
  }

  it('the Stadtkommandant caps discontent at 80', () => {
    const s = quietNight();
    s.laws.signed.push('stadtkommandant');
    s.discontent = 95;
    stepHour(s);
    expect(s.discontent).toBeLessThanOrEqual(80);
    expect(s.outcome).toBeNull();
  });

  it('without the Stadtkommandant discontent can stay above 80', () => {
    const s = quietNight();
    s.discontent = 95;
    stepHour(s);
    expect(s.discontent).toBeGreaterThan(80);
  });

  it('the Bischofsstadt keeps hope from falling below 20', () => {
    const s = quietNight();
    s.laws.signed.push('bischofsstadt');
    s.hope = 3;
    stepHour(s);
    expect(s.hope).toBeGreaterThanOrEqual(20);
    expect(s.outcome).toBeNull();
  });

  it('without the Bischofsstadt hope can be lower', () => {
    const s = quietNight();
    s.hope = 3;
    stepHour(s);
    expect(s.hope).toBeLessThan(20);
  });

  it('the Bischofsstadt does not lift hope that is already higher', () => {
    const s = quietNight();
    s.laws.signed.push('bischofsstadt');
    s.hope = 60;
    stepHour(s);
    expect(s.hope).toBeGreaterThan(50);
    expect(s.hope).toBeLessThan(65);
  });
});

// ── laws that change care ────────────────────────────────────────────────

describe('care laws', () => {
  function ward() {
    const s = newGame(1);
    population(s, 2, 10);
    s.time = NIGHT;
    const b = finishedBuilding(s, 'sanitaet', 2);
    assign(s, b.id, 5);
    const patient = s.people[0];
    patient.health = 'grave';
    return { s, patient };
  }

  it('Amputation: a cared gravely sick person is back after 24 hours, as an amputee', () => {
    const { s, patient } = ward();
    s.laws.signed.push('amputation');
    patient.sickHours = 24;
    peopleHour(s);
    expect(patient.health).toBe('ok');
    expect(patient.amputee).toBe(true);
  });

  it('Amputation: an amputee works at half strength', () => {
    const s = newGame(1);
    warmBoiler(s);
    const camp = finishedBuilding(s, 'holzfaeller', 1);
    assign(s, camp.id, 2);
    s.people.find((p) => p.id === camp.workers[0])!.amputee = true;
    s.time = 24 * 2 + 12;
    const wood = s.res.wood;
    productionHour(s);
    expect(s.res.wood).toBeCloseTo(wood + 0.8 * (1 + 0.5));
  });

  it('without Amputation 24 hours are not enough', () => {
    const { s, patient } = ward();
    patient.sickHours = 24;
    peopleHour(s);
    expect(patient.health).toBe('grave');
  });

  it('Diakonissen raise the care capacity by 30 %', () => {
    const { s } = ward();
    const base = careCapacity(s);
    s.laws.signed.push('diakonissen');
    expect(careCapacity(s) / base).toBeCloseTo(1.3);
  });

  it('Pflegestation adds 5 care per health building', () => {
    const { s } = ward();
    const base = careCapacity(s);
    s.laws.signed.push('pflegestation');
    expect(careCapacity(s)).toBeCloseTo(base + 5);
  });
});
