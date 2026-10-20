// Research: the workshop (werkstatt) works through one technology at a time.
import { TECHS } from './data/techs';
import { efficiency } from './economy';
import { hasTech } from './heat';
import { staffedShare } from './people';
import { SYSTEMS } from './sim';
import { log } from './state';
import type { GameState } from './types';
import { canAfford, isWorkHour, pay } from './util';

/** Research per work hour: staffed finished workshops × efficiency, with the slide rule and the students. */
export function researchSpeed(s: GameState): number {
  let speed = 0;
  for (const b of s.buildings) {
    if (b.type !== 'werkstatt' || b.built < 1) continue;
    speed += staffedShare(s, b) * efficiency(s, b);
  }
  if (hasTech(s, 'rechenschieber')) speed *= 1.25;
  if (s.flags.studenten) speed *= 1.1;
  return speed;
}

/** German reason why a technology cannot be researched now, or null. */
export function canResearch(s: GameState, id: string): string | null {
  const t = TECHS[id];
  if (hasTech(s, id)) return 'Schon erforscht';
  if (s.research.current === id) return 'Läuft schon';
  if (t.requires && !hasTech(s, t.requires)) return `Erst: ${TECHS[t.requires].name}`;
  if (!s.buildings.some((b) => b.type === 'werkstatt' && b.built >= 1)) return 'Keine Werkstatt';
  if (!canAfford(s, t.cost)) return 'Nicht genug Material';
  return null;
}

/** Pays and starts a technology. Switching away from another one loses its progress; nothing is refunded. */
export function startResearch(s: GameState, id: string): boolean {
  if (canResearch(s, id) !== null) return false;
  pay(s, TECHS[id].cost);
  s.research.current = id;
  s.research.progress = 0;
  log(s, `Forschung beginnt: ${TECHS[id].name}`);
  return true;
}

/** Hourly progress in work hours; a finished technology is recorded once and the research stops. */
export function researchHour(s: GameState): void {
  const id = s.research.current;
  if (!id || !isWorkHour(s)) return;
  s.research.progress += researchSpeed(s);
  const t = TECHS[id];
  if (s.research.progress >= t.hours) {
    s.research.done.push(id);
    s.research.current = null;
    s.research.progress = 0;
    log(s, `Erforscht: ${t.name}`, 'good');
  }
}

SYSTEMS.push(researchHour);

/** Hours until the current research is done at the current speed, or null when nothing runs or nobody works. */
export function hoursLeft(s: GameState): number | null {
  const id = s.research.current;
  const speed = researchSpeed(s);
  if (!id || speed <= 0) return null;
  return Math.ceil((TECHS[id].hours - s.research.progress) / speed);
}

