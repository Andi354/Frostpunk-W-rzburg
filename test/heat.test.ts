import { describe, expect, it } from 'vitest';
import { GRID } from '../src/sim/grid';
import { cellTemp, genCoalPerHour, genRange, heatLevel } from '../src/sim/heat';
import { newGame } from '../src/sim/state';
import { advance, setBoiler, setBoilerLevel, setOverdrive } from '../src/sim/sim';
import { outsideTemp, baseTemp, forecast, SCENARIO_DAYS } from '../src/sim/weather';

const inner = GRID.find((c) => c.ring === 1)!.id;
const outer = GRID.find((c) => c.ring === 7)!.id;

describe('boiler and heat', () => {
  it('heats cells within range only', () => {
    const s = newGame(1);
    const t = outsideTemp(s.time);
    expect(cellTemp(s, inner, t)).toBe(t);
    setBoiler(s, true);
    expect(cellTemp(s, inner, t)).toBe(t + 20);
    expect(genRange(s)).toBe(3);
    expect(cellTemp(s, outer, t)).toBe(t);
  });

  it('higher pressure and overdrive give more heat and burn more coal', () => {
    const s = newGame(1);
    setBoiler(s, true);
    const c1 = genCoalPerHour(s);
    setBoilerLevel(s, 3);
    const c3 = genCoalPerHour(s);
    setOverdrive(s, true);
    expect(c3).toBeGreaterThan(c1);
    expect(genCoalPerHour(s)).toBeCloseTo(c3 * 1.5);
    const t = outsideTemp(s.time);
    expect(cellTemp(s, inner, t)).toBe(t + 55);
  });

  it('consumes coal per hour and goes out when it runs dry', () => {
    const s = newGame(1);
    setBoiler(s, true);
    const before = s.res.coal;
    advance(s, 1);
    expect(s.res.coal).toBeCloseTo(before - 7);
    s.res.coal = 3;
    advance(s, 1);
    expect(s.gen.on).toBe(false);
    expect(s.res.coal).toBe(0);
  });

  it('bursts after sustained overdrive', () => {
    const s = newGame(1);
    s.res.coal = 99999;
    setBoiler(s, true);
    setOverdrive(s, true);
    advance(s, 60);
    expect(s.outcome).toBe('burst');
  });

  it('stress falls again without overdrive', () => {
    const s = newGame(1);
    s.res.coal = 9999;
    setBoiler(s, true);
    setOverdrive(s, true);
    advance(s, 10);
    const st = s.gen.stress;
    setOverdrive(s, false);
    advance(s, 5);
    expect(s.gen.stress).toBeLessThan(st);
  });

  it('maps temperatures to heat levels', () => {
    expect(heatLevel(-45)).toBe(0);
    expect(heatLevel(-20)).toBe(1);
    expect(heatLevel(-5)).toBe(2);
    expect(heatLevel(5)).toBe(3);
    expect(heatLevel(15)).toBe(4);
  });
});

describe('weather', () => {
  it('is colder at night than in the afternoon', () => {
    expect(outsideTemp(24 * 4 + 3)).toBeLessThan(outsideTemp(24 * 4 + 14));
  });
  it('builds up to the storm', () => {
    expect(baseTemp(32)).toBeLessThan(-80);
    expect(baseTemp(SCENARIO_DAYS)).toBeGreaterThan(baseTemp(32));
  });
  it('rounds the far forecast', () => {
    const f = forecast(0, 7, 2);
    expect(f).toHaveLength(7);
    expect(Math.abs(f[5].temp % 5)).toBe(0);
  });
});
