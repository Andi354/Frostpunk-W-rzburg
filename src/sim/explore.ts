// Expeditions: scouts go out from the scout post into the city and the surroundings, come back with loot and people.
import { SITES, siteFlags, type SiteDef } from './data/sites';
import { idle } from './economy';
import { hasTech } from './heat';
import { kill } from './people';
import { chance } from './rng';
import { SYSTEMS } from './sim';
import { addPerson, log } from './state';
import type { Expedition, GameState, Person, PersonKind, Resources } from './types';
import { dayOf, isStorm } from './weather';

const TEAM = 4;

/** The wood-gas truck (tech or flag) halves the travel time to 60 % and allows two teams. */
function hasTruck(s: GameState): boolean {
  return hasTech(s, 'holzvergaser') || !!s.flags.lkw;
}

function stadtExplored(s: GameState): number {
  return s.explored.filter((id) => SITES[id]?.area === 'stadt').length;
}

/** Healthy people who are not away and have no job, workers first, then engineers. Children never go. */
function freeTeam(s: GameState): Person[] {
  const pool = idle(s).filter((p) => p.kind !== 'child');
  const byKind = (kind: PersonKind) => pool.filter((p) => p.kind === kind);
  return [...byKind('worker'), ...byKind('engineer')];
}

/** German reason why a team cannot be sent to the place now, or null. */
export function canSend(s: GameState, siteId: string): string | null {
  const site = SITES[siteId];
  const post = s.buildings.some((b) => b.type === 'kundschafter' && b.built >= 1);
  if (!post) return 'Kundschafterposten fehlt';
  if (s.explored.includes(siteId)) return 'Schon erkundet';
  if (s.expeditions.some((e) => e.site === siteId)) return 'Unterwegs';
  if (site.needs && !s.explored.includes(site.needs)) return `Erst: ${SITES[site.needs].name}`;
  if (site.area === 'umland' && stadtExplored(s) < 3) return 'Erst 3 Orte in der Stadt erkunden';
  if (isStorm(dayOf(s.time))) return 'Im Sturm unmöglich';
  if (s.expeditions.length >= (hasTruck(s) ? 2 : 1)) return 'Alle Trupps unterwegs';
  if (freeTeam(s).length < TEAM) return 'Keine 4 Freien';
  return null;
}

/** Sends four free people to the place. Returns the expedition, or null when canSend refuses. */
export function send(s: GameState, siteId: string): Expedition | null {
  if (canSend(s, siteId) !== null) return null;
  const site = SITES[siteId];
  const team = freeTeam(s).slice(0, TEAM);
  const hours = site.hours * (hasTruck(s) ? 0.6 : 1);
  const e: Expedition = {
    id: s.nextId++,
    site: siteId,
    members: team.map((p) => p.id),
    leaveAt: s.time,
    arriveAt: s.time + hours,
    returnAt: s.time + 2 * hours,
    phase: 'out',
  };
  s.expeditions.push(e);
  log(s, `Trupp bricht auf nach ${site.name}`);
  return e;
}

/** Arrival: the place counts as explored, its flags are set and its event is queued; one danger roll per member. */
function arrive(s: GameState, e: Expedition, site: SiteDef): void {
  e.phase = 'back';
  e.loot = { ...site.loot };
  if (!s.explored.includes(site.id)) s.explored.push(site.id);
  for (const f of siteFlags(site)) s.flags[f] = 1;
  if (site.event && !s.events.fired.includes(site.event) && !s.events.scheduled.some((x) => x.id === site.event)) {
    s.events.scheduled.push({ id: site.event, at: s.time });
  }
  // a team out during a storm (on arrival or on the way back) takes the storm factor
  const storm = isStorm(dayOf(s.time)) || isStorm(dayOf(e.returnAt));
  const risk = site.danger * (site.valley ? 1.5 : 1) * (storm ? 3 : 1) * 0.25;
  for (const id of [...e.members]) {
    if (!chance(s, risk)) continue;
    const p = s.people.find((x) => x.id === id);
    if (p) kill(s, p, 'expedition');
    e.members.splice(e.members.indexOf(id), 1);
  }
  log(s, `${site.name} erreicht. ${e.members.length} kommen zurück.`, 'info');
}

/** Return: the loot goes into the stock, the survivors join the city, the flag of the residence gives hope. */
function home(s: GameState, e: Expedition, site: SiteDef): void {
  s.expeditions.splice(s.expeditions.indexOf(e), 1);
  if (!e.members.length) {
    log(s, `Kein Mann kehrt zurück aus ${site.name}.`, 'bad');
    return;
  }
  for (const [r, n] of Object.entries(e.loot ?? {}) as [keyof Resources, number][]) s.res[r] += n;
  if (site.survivors) {
    const { n, kind, origin } = site.survivors;
    for (let i = 0; i < n; i++) {
      const k: PersonKind = kind === 'mixed' ? (i % 3 === 2 ? 'child' : 'worker') : kind;
      addPerson(s, k, origin);
    }
  }
  if (siteFlags(site).includes('hofkeller')) s.hope = Math.min(100, s.hope + 10);
  log(s, `Trupp zurück aus ${site.name}`, 'good');
}

/** Runs every game hour: arrivals and returns of the expeditions that are due. */
export function exploreHour(s: GameState): void {
  for (const e of [...s.expeditions]) {
    const site = SITES[e.site];
    if (e.phase === 'out' && s.time >= e.arriveAt) arrive(s, e, site);
    else if (e.phase === 'back' && s.time >= e.returnAt) home(s, e, site);
  }
}

SYSTEMS.push(exploreHour);
