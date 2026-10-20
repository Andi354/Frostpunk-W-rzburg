import '../src/sim/index';
import { describe, expect, it } from 'vitest';
import { GRID } from '../src/sim/grid';
import { addBuilding, addPerson, newGame } from '../src/sim/state';
import { stepHour } from '../src/sim/sim';
import { assign, canPlace, efficiency } from '../src/sim/economy';
import { TECHS } from '../src/sim/data/techs';
import { canResearch, researchHour, researchSpeed, startResearch } from '../src/sim/research';
import type { Building, GameState, PersonKind } from '../src/sim/types';

// ── helpers ──────────────────────────────────────────────────────────────

function freeCell(s: GameState, ring: number, skip = 0): number {
  const used = new Set(s.buildings.map((b) => b.cell));
  return GRID.filter((c) => c.ring === ring && !used.has(c.id))[skip].id;
}

function population(s: GameState, workers: number, engineers: number): void {
  s.people = [];
  const add = (kind: PersonKind, n: number) => {
    for (let i = 0; i < n; i++) addPerson(s, kind, 'wue');
  };
  add('worker', workers);
  add('engineer', engineers);
}

/** A finished workshop on ring 1 with `staff` engineers. */
function workshop(s: GameState, staff: number, skip = 0): Building {
  const b = addBuilding(s, 'werkstatt', freeCell(s, 1, skip), 1);
  if (staff) assign(s, b.id, staff);
  return b;
}

function atHour(s: GameState, hour: number): void {
  s.time = 24 * 2 + hour;
}

function rich(s: GameState): void {
  s.res = { coal: 500, wood: 500, steel: 500, bricks: 500, food: 500, rations: 500, parts: 50 };
}

function warmCity(s: GameState): void {
  s.gen = { on: true, level: 3, overdrive: true, stress: 0 };
}

// ── data ─────────────────────────────────────────────────────────────────

describe('tech tree data', () => {
  const ids = [
    'rost', 'waermestube', 'vorwaermer', 'heizrohre', 'fernwaerme1', 'fernwaerme2', 'daemmung', 'werkheizung',
    'nissenhuetten', 'ziegelbau', 'koehlerei', 'kohlenbohrer', 'saege', 'schneidbrenner', 'fallen', 'gewaechshaus',
    'lazarett', 'roentgen', 'penicillin', 'kundschafter', 'wetterdienst', 'holzvergaser', 'kampfmittel', 'funk', 'rechenschieber',
  ];

  it('contains all 25 technologies of the spec', () => {
    for (const id of ids) expect(TECHS[id], id).toBeDefined();
    expect(Object.keys(TECHS).length).toBe(25);
  });

  it('every technology has a name, a German sentence, a category, a cost and hours', () => {
    for (const t of Object.values(TECHS)) {
      expect(t.id in TECHS).toBe(true);
      expect(t.name.length, t.id).toBeGreaterThan(2);
      expect(t.desc.length, t.id).toBeGreaterThan(15);
      expect(t.cat.length, t.id).toBeGreaterThan(2);
      expect(Object.keys(t.cost).length, t.id).toBeGreaterThan(0);
      expect(t.hours, t.id).toBeGreaterThan(0);
    }
  });

  it('every prerequisite exists', () => {
    for (const t of Object.values(TECHS)) if (t.requires) expect(TECHS[t.requires], `${t.id} requires ${t.requires}`).toBeDefined();
  });

  it('matches the spec for costs, hours and prerequisites of a few entries', () => {
    expect(TECHS.rost).toMatchObject({ cost: { wood: 20 }, hours: 10 });
    expect(TECHS.rost.requires).toBeUndefined();
    expect(TECHS.vorwaermer).toMatchObject({ cost: { steel: 25 }, hours: 16, requires: 'rost' });
    expect(TECHS.fernwaerme2).toMatchObject({ cost: { steel: 50, parts: 2 }, hours: 30, requires: 'fernwaerme1' });
    expect(TECHS.ziegelbau).toMatchObject({ cost: { wood: 20 }, hours: 16, requires: 'nissenhuetten' });
    expect(TECHS.penicillin).toMatchObject({ cost: { parts: 3 }, hours: 30, requires: 'roentgen' });
    expect(TECHS.holzvergaser).toMatchObject({ cost: { steel: 30, parts: 1 }, hours: 20, requires: 'kundschafter' });
    expect(TECHS.rechenschieber).toMatchObject({ cost: { wood: 20 }, hours: 12 });
  });
});

// ── canResearch ──────────────────────────────────────────────────────────

describe('canResearch', () => {
  function ready(): GameState {
    const s = newGame(1);
    workshop(s, 5);
    rich(s);
    return s;
  }

  it('is null for an available technology', () => {
    expect(canResearch(ready(), 'rost')).toBeNull();
  });

  it('refuses a technology that is already researched', () => {
    const s = ready();
    s.research.done.push('rost');
    expect(canResearch(s, 'rost')).toBe('Schon erforscht');
  });

  it('refuses when the prerequisite is missing and names it', () => {
    const s = ready();
    expect(canResearch(s, 'vorwaermer')).toBe(`Erst: ${TECHS.rost.name}`);
    s.research.done.push('rost');
    expect(canResearch(s, 'vorwaermer')).toBeNull();
  });

  it('refuses when the material is short', () => {
    const s = ready();
    s.res.steel = 14;
    expect(canResearch(s, 'waermestube')).toBe('Nicht genug Material');
    s.res.steel = 15;
    expect(canResearch(s, 'waermestube')).toBeNull();
  });

  it('refuses when there is no finished workshop', () => {
    const s = newGame(1);
    rich(s);
    expect(canResearch(s, 'rost')).toBe('Keine Werkstatt');
  });

  it('an unfinished workshop does not count', () => {
    const s = newGame(1);
    rich(s);
    addBuilding(s, 'werkstatt', freeCell(s, 1), 0.5);
    expect(canResearch(s, 'rost')).toBe('Keine Werkstatt');
  });

  it('refuses the technology that is being researched right now', () => {
    const s = ready();
    startResearch(s, 'rost');
    expect(canResearch(s, 'rost')).toBe('Läuft schon');
  });

  it('another technology can be started while one runs', () => {
    const s = ready();
    startResearch(s, 'rost');
    expect(canResearch(s, 'daemmung')).toBeNull();
  });
});

describe('startResearch', () => {
  function ready(): GameState {
    const s = newGame(1);
    workshop(s, 5);
    return s;
  }

  it('pays the cost, sets the current research and starts at 0', () => {
    const s = ready();
    const { wood } = s.res;
    expect(startResearch(s, 'rost')).toBe(true);
    expect(s.res.wood).toBe(wood - 20);
    expect(s.research.current).toBe('rost');
    expect(s.research.progress).toBe(0);
  });

  it('pays every resource of the cost', () => {
    const s = ready();
    rich(s);
    startResearch(s, 'fernwaerme1'); // not available yet: no prerequisite
    expect(s.res.steel).toBe(500);
    s.research.done.push('waermestube', 'fernwaerme1');
    startResearch(s, 'fernwaerme2'); // steel 50, parts 2
    expect(s.res.steel).toBe(450);
    expect(s.res.parts).toBe(48);
  });

  it('returns false and pays nothing when the research is not allowed', () => {
    const s = ready();
    s.res.wood = 5;
    expect(startResearch(s, 'rost')).toBe(false);
    expect(s.res.wood).toBe(5);
    expect(s.research.current).toBeNull();
  });

  it('switching to another technology loses the progress and refunds nothing', () => {
    const s = ready();
    rich(s);
    startResearch(s, 'rost');
    s.research.progress = 6;
    const wood = s.res.wood;
    expect(startResearch(s, 'daemmung')).toBe(true);
    expect(s.research.current).toBe('daemmung');
    expect(s.research.progress).toBe(0);
    expect(s.res.wood).toBe(wood - 30); // only the new cost; the 20 wood of rost stay spent
  });
});

// ── speed ────────────────────────────────────────────────────────────────

describe('researchSpeed', () => {
  it('is 0 without a workshop', () => {
    expect(researchSpeed(newGame(1))).toBe(0);
  });

  it('is 0 with an unstaffed workshop', () => {
    const s = newGame(1);
    workshop(s, 0);
    expect(researchSpeed(s)).toBe(0);
  });

  it('a fully staffed workshop researches at its efficiency', () => {
    const s = newGame(1);
    const b = workshop(s, 5);
    expect(researchSpeed(s)).toBeCloseTo(efficiency(s, b));
  });

  it('a fully staffed, warm workshop researches at speed 1', () => {
    const s = newGame(1);
    warmCity(s);
    workshop(s, 5);
    expect(researchSpeed(s)).toBeCloseTo(1);
  });

  it('scales with the staffed fraction', () => {
    const s = newGame(1);
    warmCity(s);
    workshop(s, 2);
    expect(researchSpeed(s)).toBeCloseTo(0.4);
  });

  it('sick engineers do not count', () => {
    const s = newGame(1);
    warmCity(s);
    const b = workshop(s, 5);
    s.people.find((p) => p.id === b.workers[0])!.health = 'sick';
    expect(researchSpeed(s)).toBeCloseTo(0.8);
  });

  it('adds up over several workshops', () => {
    const s = newGame(1);
    warmCity(s);
    workshop(s, 5, 0);
    workshop(s, 5, 1);
    expect(researchSpeed(s)).toBeCloseTo(2);
  });

  it('an unfinished workshop adds nothing', () => {
    const s = newGame(1);
    warmCity(s);
    const b = workshop(s, 5);
    b.built = 0.8;
    expect(researchSpeed(s)).toBe(0);
  });

  it('the slide rule makes it 1.25 times faster', () => {
    const s = newGame(1);
    workshop(s, 5);
    const base = researchSpeed(s);
    s.research.done.push('rechenschieber');
    expect(researchSpeed(s) / base).toBeCloseTo(1.25);
  });

  it('the flag studenten makes it 1.1 times faster', () => {
    const s = newGame(1);
    workshop(s, 5);
    const base = researchSpeed(s);
    s.flags.studenten = 1;
    expect(researchSpeed(s) / base).toBeCloseTo(1.1);
  });

  it('slide rule and students multiply', () => {
    const s = newGame(1);
    workshop(s, 5);
    const base = researchSpeed(s);
    s.research.done.push('rechenschieber');
    s.flags.studenten = 1;
    expect(researchSpeed(s) / base).toBeCloseTo(1.25 * 1.1);
  });

  it('a cold workshop is slower than a warm one', () => {
    const cold = newGame(1);
    workshop(cold, 5);
    const warm = newGame(1);
    warmCity(warm);
    workshop(warm, 5);
    expect(researchSpeed(cold)).toBeLessThan(researchSpeed(warm));
  });
});

// ── progress and completion ──────────────────────────────────────────────

describe('researchHour', () => {
  function running(id = 'rost') {
    const s = newGame(1);
    warmCity(s);
    workshop(s, 5); // speed 1
    s.res.wood = 100;
    startResearch(s, id);
    return s;
  }

  it('adds the research speed to the progress in work hours', () => {
    const s = running();
    atHour(s, 12);
    researchHour(s);
    expect(s.research.progress).toBeCloseTo(1);
    researchHour(s);
    expect(s.research.progress).toBeCloseTo(2);
  });

  it('does nothing outside work hours', () => {
    const s = running();
    for (const h of [0, 3, 7, 18, 23]) {
      atHour(s, h);
      researchHour(s);
    }
    expect(s.research.progress).toBe(0);
  });

  it('does nothing without a current research', () => {
    const s = newGame(1);
    warmCity(s);
    workshop(s, 5);
    atHour(s, 12);
    researchHour(s);
    expect(s.research.current).toBeNull();
    expect(s.research.done).toEqual([]);
  });

  it('does not progress without a staffed workshop', () => {
    const s = newGame(1);
    workshop(s, 0);
    s.res.wood = 100;
    startResearch(s, 'rost');
    atHour(s, 12);
    researchHour(s);
    expect(s.research.progress).toBe(0);
  });

  it('finishes when the progress reaches the hours of the technology', () => {
    const s = running();
    s.research.progress = TECHS.rost.hours - 1;
    atHour(s, 12);
    researchHour(s);
    expect(s.research.done).toContain('rost');
    expect(s.research.current).toBeNull();
  });

  it('is not finished a moment too early', () => {
    const s = running();
    s.research.progress = TECHS.rost.hours - 1.5;
    atHour(s, 12);
    researchHour(s);
    expect(s.research.done).not.toContain('rost');
    expect(s.research.current).toBe('rost');
  });

  it('logs "Erforscht: <name>" as good news', () => {
    const s = running();
    s.research.progress = TECHS.rost.hours - 1;
    atHour(s, 12);
    researchHour(s);
    expect(s.log).toContainEqual(expect.objectContaining({ text: `Erforscht: ${TECHS.rost.name}`, kind: 'good' }));
  });

  it('a finished technology is recorded once', () => {
    const s = running();
    s.research.progress = TECHS.rost.hours;
    atHour(s, 12);
    researchHour(s);
    researchHour(s);
    expect(s.research.done.filter((x) => x === 'rost').length).toBe(1);
  });

  it('a faster workshop finishes sooner', () => {
    const s = running();
    s.research.done.push('rechenschieber');
    s.research.progress = TECHS.rost.hours - 1.2; // needs 1.25 per hour to finish now
    atHour(s, 12);
    researchHour(s);
    expect(s.research.done).toContain('rost');
  });

  it('runs as part of every game hour', () => {
    const s = running();
    atHour(s, 12);
    stepHour(s);
    expect(s.research.progress).toBeGreaterThan(0);
  });
});

describe('what research unlocks', () => {
  it('Nissenhütten unlock the Nissen hut', () => {
    const s = newGame(1);
    warmCity(s);
    workshop(s, 5);
    rich(s);
    const cell = freeCell(s, 7);
    expect(canPlace(s, 'nissen', cell)).toBe('Noch nicht erforscht');
    startResearch(s, 'nissenhuetten');
    s.research.progress = TECHS.nissenhuetten.hours - 1;
    atHour(s, 12);
    researchHour(s);
    expect(s.research.done).toContain('nissenhuetten');
    expect(canPlace(s, 'nissen', cell)).toBeNull();
  });

  it('every researchable building is locked until its technology is done', () => {
    const s = newGame(1);
    rich(s);
    const cell = freeCell(s, 7);
    const pairs: [string, string][] = [
      ['ziegelhaus', 'ziegelbau'],
      ['koehlerei', 'koehlerei'],
      ['gewaechshaus', 'gewaechshaus'],
      ['lazarett', 'lazarett'],
      ['waermestube', 'waermestube'],
      ['kundschafter', 'kundschafter'],
      ['funkstation', 'funk'],
    ];
    for (const [building, tech] of pairs) {
      expect(canPlace(s, building, cell), building).toBe('Noch nicht erforscht');
      s.research.done.push(tech);
      expect(canPlace(s, building, cell), building).toBeNull();
    }
  });
});
