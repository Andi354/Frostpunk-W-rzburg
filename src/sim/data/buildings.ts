import type { ResourceId, Resources } from '../types';

export type BuildingCategory = 'pile' | 'deposit' | 'housing' | 'resources' | 'food' | 'health' | 'heat' | 'tech' | 'society';

export interface BuildingDef {
  id: string;
  name: string;
  category: BuildingCategory;
  desc: string;
  cost?: Partial<Resources>;
  buildHours?: number;
  /** worker slots and which kind may fill them */
  slots?: number;
  staff?: 'worker' | 'engineer' | 'any';
  /** housing capacity */
  beds?: number;
  /** patients cared for when fully staffed */
  care?: number;
  /** °C added to the cell (walls, stoves) */
  insulation: number;
  /** output per worker-hour at full efficiency */
  produces?: Partial<Record<ResourceId, number>>;
  consumes?: Partial<Record<ResourceId, number>>;
  /** coal per hour while switched on (heaters) */
  coalPerHour?: number;
  /** heat added to cells around it (heaters) */
  heat?: number;
  heatRadius?: number;
  /** needs a deposit of this kind on the cell */
  onDeposit?: string;
  requires?: string; // tech id
  requiresLaw?: string;
  /** works only in daylight (hunters) */
  dayOnly?: boolean;
  /** pile: what it yields per worker-hour and the start amount range */
  pileYield?: Partial<Record<ResourceId, number>>;
  /** can be switched off */
  switchable?: boolean;
  unique?: boolean;
  /** discontent relief per day while staffed/active */
  relief?: number;
  hopeBoost?: number;
}

const D = (d: BuildingDef) => d;

export const BUILDINGS: Record<string, BuildingDef> = {
  // ── piles: scattered rubble and supplies in the crater, worked directly ──
  pile_rubble: D({ id: 'pile_rubble', name: 'Trümmerhaufen', category: 'pile', desc: 'Reste der zerbombten Fliegerhorst-Kaserne. Ziegel klopfen, Balken bergen.', slots: 5, staff: 'any', insulation: 0, pileYield: { bricks: 0.9, wood: 0.25 } }),
  pile_wood: D({ id: 'pile_wood', name: 'Gebälk und Kisten', category: 'pile', desc: 'Zerbrochene Munitionskisten, Dachbalken, Zaunpfähle.', slots: 5, staff: 'any', insulation: 0, pileYield: { wood: 1.1 } }),
  pile_coal: D({ id: 'pile_coal', name: 'Kohlenhaufen', category: 'pile', desc: 'Die Amerikaner haben Kohle für das Heizwerk zurückgelassen.', slots: 5, staff: 'any', insulation: 0, pileYield: { coal: 1.6 } }),
  pile_steel: D({ id: 'pile_steel', name: 'Flugzeugwrack', category: 'pile', desc: 'Ein ausgebranntes Wrack vom Fliegerhorst. Aluminium und Stahl.', slots: 5, staff: 'any', insulation: 0, pileYield: { steel: 0.5 } }),
  pile_food: D({ id: 'pile_food', name: 'US-Vorratskisten', category: 'pile', desc: 'Zurückgelassene Armee-Rationen. Ein Glücksfall.', slots: 5, staff: 'any', insulation: 0, pileYield: { food: 1.2 } }),

  // ── deposits: endless sources at the crater edge, need a building ──
  dep_coal: D({ id: 'dep_coal', name: 'Kohlenlager des Heizwerks', category: 'deposit', desc: 'Ein verschüttetes Kohlenlager unter dem Kraterrand. Nur mit einer Grube erreichbar.', insulation: 0 }),
  dep_wood: D({ id: 'dep_wood', name: 'Gramschatzer Waldrand', category: 'deposit', desc: 'Erfrorene Kiefern am Rand des Plateaus. Holz für Jahre, wenn man es fällen kann.', insulation: 0 }),
  dep_steel: D({ id: 'dep_steel', name: 'Flugzeughallen', category: 'deposit', desc: 'Eingestürzte Hangars des Fliegerhorsts voller Stahlträger.', insulation: 0 }),
  dep_rubble: D({ id: 'dep_rubble', name: 'Kasernenruinen', category: 'deposit', desc: 'Die Ruinen der Galgenberg-Kaserne. Endlos Trümmer.', insulation: 0 }),
};

export function def(type: string): BuildingDef {
  const d = BUILDINGS[type];
  if (!d) throw new Error(`unknown building ${type}`);
  return d;
}
