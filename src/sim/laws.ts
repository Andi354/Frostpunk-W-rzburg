// Emergency laws: signing them, their hourly mood effects and the daily effects at 08:00.
import { LAWS, type LawDef } from './data/laws';
import { chance } from './rng';
import { SYSTEMS } from './sim';
import { log } from './state';
import type { GameState } from './types';
import { hasLaw, hourOfDay } from './util';
import { dayOf } from './weather';

/** Hours until the next law can be signed. */
const COOLDOWN = 18;

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** German reason why the law cannot be signed now, or null. */
export function canSign(s: GameState, id: string): string | null {
  const d: LawDef = LAWS[id];
  if (hasLaw(s, id)) return 'Schon erlassen';
  if (d.excludes && hasLaw(s, d.excludes)) return `Ausgeschlossen durch ${LAWS[d.excludes].name}`;
  if (d.requires && !hasLaw(s, d.requires)) return `Erst: ${LAWS[d.requires].name}`;
  if (d.availableFrom && dayOf(s.time) < d.availableFrom) return `Ab Tag ${d.availableFrom}`;
  if (d.flag && !s.flags[d.flag]) return 'Noch nicht möglich';
  if (s.time < s.laws.readyAt) return `Nächstes Gesetz in ${Math.ceil(s.laws.readyAt - s.time)} h`;
  return null;
}

/** Puts a law into force: the one-off mood change, the path, the cooldown. False when it cannot be signed. */
export function sign(s: GameState, id: string): boolean {
  if (canSign(s, id) !== null) return false;
  const d = LAWS[id];
  s.laws.signed.push(id);
  s.laws.readyAt = s.time + COOLDOWN;
  if (d.onSign) {
    s.hope = clamp(s.hope + (d.onSign.hope ?? 0));
    s.discontent = clamp(s.discontent + (d.onSign.discontent ?? 0));
  }
  if (id === 'notstand') s.laws.path = 'order';
  if (id === 'kiliansgemeinde') s.laws.path = 'faith';
  log(s, `Gesetz erlassen: ${d.name}`, 'good');
  return true;
}

/** Hope and discontent per hour of all laws in force. */
export function lawHourly(s: GameState): { hope: number; discontent: number } {
  let hope = 0;
  let discontent = 0;
  for (const id of s.laws.signed) {
    const m = LAWS[id]?.perHour;
    if (!m) continue;
    hope += m.hope ?? 0;
    discontent += m.discontent ?? 0;
  }
  return { hope, discontent };
}

/** Daily effects at 08:00: Fringsen brings coal (and may catch thieves), the black market trades wood for parts. */
export function lawsHour(s: GameState): void {
  if (hourOfDay(s) !== 8) return;
  if (hasLaw(s, 'kohlenklau')) {
    s.res.coal += 40;
    if (chance(s, 0.15)) {
      s.hope = clamp(s.hope - 3);
      log(s, 'Militärpolizei erwischt Kohlendiebe', 'bad');
    }
  }
  if (hasLaw(s, 'schwarzmarkt') && s.res.wood >= 60) {
    s.res.wood -= 30;
    s.res.parts += 1;
  }
}

SYSTEMS.push(lawsHour);
