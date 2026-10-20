// Story: queues the documents of the scenario, the return movement of the Altstadt and the victory on day 35.
import { EVENTS } from './data/events';
import { SYSTEMS } from './sim';
import { log } from './state';
import type { GameState, PendingEvent } from './types';
import { hourOfDay } from './util';

/** Day 35 (4 January 1947) at 18:00, hours since 1 Dec 1946 00:00. */
const VICTORY_TIME = 24 * 34 + 18;

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Puts the event at the end of the pending documents, with its texts (strings only) and marks it as fired. */
export function queueEvent(s: GameState, id: string): void {
  const d = EVENTS[id];
  const pending: PendingEvent = {
    id,
    title: d.title,
    body: d.body(s),
    choices: d.choices.map((c) => (c.hint ? { label: c.label, hint: c.hint } : { label: c.label })),
  };
  if (d.sender) pending.sender = d.sender;
  s.events.pending.push(pending);
  if (!s.events.fired.includes(id)) s.events.fired.push(id);
}

/** Applies the choice `choice` of the first pending event and removes that event. */
export function resolveEvent(s: GameState, choice: number): void {
  const p = s.events.pending[0];
  if (!p) return;
  const c = EVENTS[p.id].choices[choice];
  if (!c) return;
  s.events.pending.shift();
  if (c.available && !c.available(s)) {
    log(s, 'Dieses Angebot ist nicht mehr möglich.');
    return;
  }
  c.apply(s);
}

/** Runs once per game hour: triggers, scheduled events, the return movement and the victory. */
export function storyHour(s: GameState): void {
  if (s.outcome) return;
  for (const [id, d] of Object.entries(EVENTS)) {
    if (d.trigger && !s.events.fired.includes(id) && d.trigger(s)) queueEvent(s, id);
  }
  const due = s.events.scheduled.filter((x) => x.at <= s.time);
  s.events.scheduled = s.events.scheduled.filter((x) => x.at > s.time);
  for (const x of due) if (!s.events.pending.some((p) => p.id === x.id)) queueEvent(s, x.id);

  // the return movement of the Altstadt: a daily change at 06:00 once the returnee has spoken
  const movement = s.flags.heimkehrer;
  if (movement !== undefined && hourOfDay(s) === 6) {
    s.flags.heimkehrer = clamp(movement + 2 + s.discontent / 10 - s.hope / 15);
  }

  if (s.time >= VICTORY_TIME && s.people.length) {
    s.outcome = 'won';
    log(s, 'Der Frost bricht. Die Siedlung steht.', 'good');
  }
}

SYSTEMS.push(storyHour);
