export type ResourceId = 'coal' | 'wood' | 'steel' | 'bricks' | 'food' | 'rations' | 'parts';

export type Resources = Record<ResourceId, number>;

export type PersonKind = 'worker' | 'engineer' | 'child';
export type Health = 'ok' | 'sick' | 'grave';
export type Origin = 'wue' | 'expellee';

export interface Person {
  id: number;
  name: string;
  kind: PersonKind;
  origin: Origin;
  health: Health;
  sickHours: number; // hours in the current health state
  hunger: number; // days without a meal
  home: number | null; // building id
  job: number | null; // building id
  amputee?: boolean;
}

export interface Building {
  id: number;
  type: string;
  cell: number;
  built: number; // 0..1, 1 = finished
  workers: number[]; // person ids
  on: boolean; // heaters and other switchable buildings
  amount?: number; // remaining amount for piles
  level?: number;
}

export interface Generator {
  on: boolean;
  level: number; // 1..3 pressure stage
  overdrive: boolean;
  stress: number; // 0..100, at 100 the boiler bursts
}

export interface LogEntry {
  t: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'death';
}

export interface Choice {
  label: string;
  hint?: string;
}

/** An event waiting for the player's decision (rendered as a modal document). */
export interface PendingEvent {
  id: string;
  title: string;
  body: string;
  choices: Choice[];
  sender?: string;
  data?: Record<string, number | string>;
}

export interface Expedition {
  id: number;
  site: string;
  members: number[]; // person ids, away from the city
  leaveAt: number;
  arriveAt: number; // arrival at site
  returnAt: number;
  phase: 'out' | 'back';
  loot?: Partial<Resources>;
  survivors?: number;
}

export type Outcome = null | 'won' | 'revolt' | 'despair' | 'dead' | 'burst';

export interface GameState {
  version: 1;
  rng: number;
  time: number; // hours since 1 Dec 1946 00:00
  res: Resources;
  gen: Generator;
  buildings: Building[];
  nextId: number;
  people: Person[];
  dead: number;
  deaths: Record<string, number>;
  arrived: number;
  hope: number; // 0..100
  discontent: number; // 0..100
  research: { done: string[]; current: string | null; progress: number };
  laws: { signed: string[]; readyAt: number; path: null | 'order' | 'faith' };
  explored: string[]; // site ids
  expeditions: Expedition[];
  events: { fired: string[]; pending: PendingEvent[]; scheduled: { id: string; at: number }[] };
  flags: Record<string, number>;
  log: LogEntry[];
  warning: null | { kind: 'revolt' | 'despair'; until: number };
  outcome: Outcome;
  seenIntro: boolean;
}

export const RESOURCE_NAMES: Record<ResourceId, string> = {
  coal: 'Kohle',
  wood: 'Holz',
  steel: 'Stahl',
  bricks: 'Ziegel',
  food: 'Rohkost',
  rations: 'Rationen',
  parts: 'Ersatzteile',
};
