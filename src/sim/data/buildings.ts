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

  // ── housing ──
  zelt: D({ id: 'zelt', name: 'Zelt', category: 'housing', desc: 'Armeezelte aus dem Depot der Amerikaner. Besser als nichts.', cost: { wood: 10 }, buildHours: 4, beds: 10, insulation: 0 }),
  nissen: D({ id: 'nissen', name: 'Nissenhütte', category: 'housing', desc: 'Halbrunde Wellblechbaracken, wie sie die Briten bauen. Halten den Wind ab.', cost: { wood: 15, steel: 10 }, buildHours: 8, beds: 10, insulation: 10, requires: 'nissenhuetten' }),
  ziegelhaus: D({ id: 'ziegelhaus', name: 'Ziegelhaus', category: 'housing', desc: 'Aus geborgenen Ziegeln gemauert, mit einem Dach, das auch im Februar hält.', cost: { bricks: 25, wood: 10 }, buildHours: 12, beds: 10, insulation: 20, requires: 'ziegelbau' }),

  // ── resources (on a deposit, or working a pile) ──
  kohlengrube: D({ id: 'kohlengrube', name: 'Kohlengrube', category: 'resources', desc: 'Ein Stollen in das verschüttete Kohlenlager unter dem Kraterrand, Tag für Tag mit Hacke und Schaufel.', cost: { wood: 25, steel: 10 }, buildHours: 12, slots: 10, staff: 'worker', insulation: 5, produces: { coal: 2 }, onDeposit: 'dep_coal' }),
  holzfaeller: D({ id: 'holzfaeller', name: 'Holzfällerei', category: 'resources', desc: 'Die erfrorenen Kiefern am Waldrand fallen Stamm für Stamm, mit Handsäge und Axt.', cost: { wood: 15 }, buildHours: 8, slots: 10, staff: 'worker', insulation: 0, produces: { wood: 0.8 }, onDeposit: 'dep_wood' }),
  hangar: D({ id: 'hangar', name: 'Schrottverwertung', category: 'resources', desc: 'In den Hallen des Fliegerhorsts werden Stahlträger geschnitten, gezogen und zum Heizwerk geschleppt.', cost: { wood: 25 }, buildHours: 10, slots: 10, staff: 'worker', insulation: 5, produces: { steel: 0.4 }, onDeposit: 'dep_steel' }),
  truemmerbahn: D({ id: 'truemmerbahn', name: 'Trümmerbahn', category: 'resources', desc: 'Eine Feldbahn zieht den Schutt der Kaserne ab und trennt Ziegel vom Holz.', cost: { wood: 20, steel: 5 }, buildHours: 10, slots: 10, staff: 'worker', insulation: 0, produces: { bricks: 0.8, wood: 0.1 }, onDeposit: 'dep_rubble' }),
  koehlerei: D({ id: 'koehlerei', name: 'Köhlerei', category: 'resources', desc: 'Holz wird in Meilern unter Erde und Torf zu Holzkohle gegart, langsam und stinkend.', cost: { bricks: 15, steel: 5 }, buildHours: 10, slots: 5, staff: 'worker', insulation: 10, consumes: { wood: 1.2 }, produces: { coal: 2.0 }, requires: 'koehlerei' }),

  // ── food ──
  jagdhuette: D({ id: 'jagdhuette', name: 'Jagdhütte', category: 'food', desc: 'Jäger aus dem Steigerwald bringen, was noch durch den Wald läuft. Nur bei Tageslicht.', cost: { wood: 15 }, buildHours: 6, slots: 5, staff: 'worker', insulation: 0, produces: { food: 1.6 }, dayOnly: true }),
  kueche: D({ id: 'kueche', name: 'Volksküche', category: 'food', desc: 'Ein Kessel Eintopf für alle. Aus Rüben und dem, was die Jäger bringen.', cost: { wood: 20, bricks: 10 }, buildHours: 8, slots: 5, staff: 'any', insulation: 10, consumes: { food: 2.5 }, produces: { rations: 2.5 } }),
  gewaechshaus: D({ id: 'gewaechshaus', name: 'Gewächshaus', category: 'food', desc: 'Aus geborgenen Fensterscheiben gebaut, bringen die Beete Gemüse, wenn die Wärme hält.', cost: { wood: 20, steel: 20 }, buildHours: 12, slots: 5, staff: 'engineer', insulation: 10, produces: { food: 1.4 }, requires: 'gewaechshaus' }),

  // ── health ──
  sanitaet: D({ id: 'sanitaet', name: 'Sanitätsstation', category: 'health', desc: 'Verbandszeug aus Bettlaken, Karbol aus dem Krankenhaus. Mehr gibt es nicht.', cost: { wood: 20 }, buildHours: 6, slots: 5, staff: 'engineer', insulation: 10, care: 5 }),
  lazarett: D({ id: 'lazarett', name: 'Lazarett', category: 'health', desc: 'Die Krankenstation im Hörsaal der Medizin, mit Betten aus den Kasernen und Ärzten, die kaum schlafen.', cost: { wood: 30, steel: 20, bricks: 20 }, buildHours: 16, slots: 10, staff: 'engineer', insulation: 20, care: 15, requires: 'lazarett' }),

  // ── heat ──
  waermestube: D({ id: 'waermestube', name: 'Wärmestube', category: 'heat', desc: 'Ein Ofen in der Halle, an dem die Leute die Hände wärmen. Er frisst Kohle, aber er wärmt den Umkreis.', cost: { steel: 15, bricks: 10 }, buildHours: 8, insulation: 0, heat: 20, heatRadius: 1.6, coalPerHour: 2, switchable: true, requires: 'waermestube' }),

  // ── technology ──
  werkstatt: D({ id: 'werkstatt', name: 'Werkstatt', category: 'tech', desc: 'Schraubstöcke, Feilen und eine Drehbank aus der Kaserne: hier wird aus Schrott wieder etwas.', cost: { wood: 25, bricks: 10 }, buildHours: 8, slots: 5, staff: 'engineer', insulation: 10 }),
  kundschafter: D({ id: 'kundschafter', name: 'Kundschafterposten', category: 'tech', desc: 'Männer mit Fahrrädern und Karten erkunden das Umland und kommen zurück, wenn sie können.', cost: { wood: 20, steel: 10 }, buildHours: 10, insulation: 5, unique: true, requires: 'kundschafter' }),
  funkstation: D({ id: 'funkstation', name: 'Funkstation', category: 'tech', desc: 'Ein Funkgerät aus dem Fliegerhorst. Wer antwortet, ist nicht allein.', cost: { steel: 30, parts: 3 }, buildHours: 16, slots: 2, staff: 'engineer', insulation: 10, unique: true, requires: 'funk' }),

  // ── society ──
  friedhof: D({ id: 'friedhof', name: 'Friedhof', category: 'society', desc: 'Ein Platz am Galgenberg für die Toten, mit Holzkreuzen und dem Namen jedes Einzelnen.', cost: { wood: 10 }, buildHours: 4, insulation: 0, requiresLaw: 'friedhof' }),
  weinstube: D({ id: 'weinstube', name: 'Weinstube „Zum Stachel“', category: 'society', desc: 'Ein Keller mit Fässern vom Bürgerspital. Ein Schluck Frankenwein hilft gegen den Frost.', cost: { wood: 20, bricks: 15 }, buildHours: 8, slots: 3, staff: 'any', insulation: 15, relief: 4, requiresLaw: 'weinausschank' }),
  kinderhort: D({ id: 'kinderhort', name: 'Kinderhort', category: 'society', desc: 'Ein Zimmer im Gemäuer, in dem die Kleinen lesen lernen, während die Eltern arbeiten.', cost: { wood: 20, bricks: 10 }, buildHours: 8, insulation: 15, requiresLaw: 'kinderhort' }),
  wachstube: D({ id: 'wachstube', name: 'Wachstube', category: 'society', desc: 'Ein Häuschen am Kesselrand, in dem die Bürgerwehr die Nacht durchwacht und für Ruhe sorgt.', cost: { wood: 20, steel: 10 }, buildHours: 8, slots: 4, staff: 'worker', insulation: 10, relief: 3, requiresLaw: 'buergerwehr' }),
  kapelle: D({ id: 'kapelle', name: 'Notkapelle', category: 'society', desc: 'Ein Dach aus Zeltplanen, ein Altar aus Kistenholz. Hier beten die Leute, wenn sie nicht mehr weiterwissen.', cost: { wood: 25, bricks: 10 }, buildHours: 10, slots: 2, staff: 'any', insulation: 10, hopeBoost: 2, requiresLaw: 'notkapelle' }),
};

export function def(type: string): BuildingDef {
  const d = BUILDINGS[type];
  if (!d) throw new Error(`unknown building ${type}`);
  return d;
}
