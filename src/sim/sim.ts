import { genCoalPerHour } from './heat';
import { log } from './state';
import type { GameState } from './types';

/** Subsystems run once per game hour, in this order. Later steps register more. */
export type HourSystem = (s: GameState) => void;

export const SYSTEMS: HourSystem[] = [];

export function boilerHour(s: GameState): void {
  if (s.gen.on) {
    const need = genCoalPerHour(s);
    if (s.res.coal >= need) {
      s.res.coal -= need;
    } else {
      s.res.coal = 0;
      s.gen.on = false;
      s.gen.overdrive = false;
      log(s, 'Die Kohle ist aus. Der Kessel erlischt.', 'bad');
    }
  }
  if (s.gen.on && s.gen.overdrive) s.gen.stress = Math.min(100, s.gen.stress + 2.5);
  else s.gen.stress = Math.max(0, s.gen.stress - 1.5);
  if (s.gen.stress >= 100) {
    s.outcome = 'burst';
    log(s, 'Der Kessel ist geborsten.', 'death');
  }
}

/** Advance by one game hour. */
export function stepHour(s: GameState): void {
  if (s.outcome) return;
  boilerHour(s);
  for (const sys of SYSTEMS) {
    sys(s);
    if (s.outcome) break;
  }
  s.time += 1;
}

/** Advance by a number of game hours (fractions are accumulated by the caller). */
export function advance(s: GameState, hours: number): void {
  for (let i = 0; i < hours && !s.outcome; i++) {
    if (s.events.pending.length) return; // decisions pause time
    stepHour(s);
  }
}

// ── player actions on the boiler ──
export function setBoiler(s: GameState, on: boolean): void {
  if (on && s.res.coal <= 0) return;
  s.gen.on = on;
  if (!on) s.gen.overdrive = false;
}

export function setBoilerLevel(s: GameState, level: number): void {
  s.gen.level = Math.max(1, Math.min(3, Math.round(level)));
}

export function setOverdrive(s: GameState, on: boolean): void {
  s.gen.overdrive = on && s.gen.on;
}
