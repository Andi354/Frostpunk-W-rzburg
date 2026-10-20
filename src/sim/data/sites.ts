// Places for the expeditions: 9 in the city (Stadt), 9 in the surroundings (Umland).
// Map positions are on a 0..100 grid: the city map is stylised (Main north→south at x≈38, Hubland east),
// the surroundings are a regional map with Würzburg at 50,55.
import type { PersonKind, Origin, Resources } from '../types';

export interface SiteDef {
  id: string;
  name: string;
  area: 'stadt' | 'umland';
  x: number;
  y: number;
  /** hours one way (before the truck) */
  hours: number;
  /** 0..1, chance per member at arrival before the modifiers */
  danger: number;
  /** in the Main valley: danger ×1.5 */
  valley?: boolean;
  desc: string;
  /** given to the city on the return */
  loot: Partial<Resources>;
  /** people who join the city on the return */
  survivors?: { n: number; kind: PersonKind | 'mixed'; origin: Origin };
  /** flag(s) set on arrival */
  flag?: string | string[];
  /** story event queued on arrival (step I) */
  event?: string;
  /** site that must be explored first */
  needs?: string;
}

const S = (s: SiteDef) => s;

export const SITES: Record<string, SiteDef> = {
  // ── Stadt ──
  hublandcenter: S({ id: 'hublandcenter', name: 'Hubland-Center', area: 'stadt', x: 80, y: 40, hours: 2, danger: 0.05, desc: 'Die Kaufhalle der Amerikaner, halb geplündert. In den Kühlräumen soll noch Dosenfleisch liegen.', loot: { food: 120, rations: 60, parts: 1 } }),
  galgenberg: S({ id: 'galgenberg', name: 'Wohnheim Am Galgenberg', area: 'stadt', x: 74, y: 62, hours: 3, danger: 0.1, desc: 'Das Barackenlager der Ausgebombten am Galgenberg. Wer hier noch wohnt, hat nichts mehr und teilt trotzdem.', loot: { wood: 60 }, survivors: { n: 6, kind: 'mixed', origin: 'wue' } }),
  grombuehl: S({ id: 'grombuehl', name: 'Grombühl · Luitpold-Krankenhaus', area: 'stadt', x: 55, y: 22, hours: 4, danger: 0.15, desc: 'Das Luitpold-Krankenhaus in Grombühl. Im Keller sollen noch Kranke liegen, die niemand abgeholt hat.', loot: { parts: 2 }, survivors: { n: 3, kind: 'engineer', origin: 'wue' }, event: 'kranke_zurueck' }),
  bahnhof: S({ id: 'bahnhof', name: 'Hauptbahnhof', area: 'stadt', x: 44, y: 28, hours: 5, danger: 0.2, valley: true, desc: 'Der Hauptbahnhof, ein Gerippe aus Glas und Stahl. Auf dem Abstellgleis stehen Kohlenwaggons, halb im Schnee.', loot: { coal: 400, steel: 60 }, event: 'fluechtlingszug' }),
  ferdinandeum: S({ id: 'ferdinandeum', name: 'Ferdinandeum', area: 'stadt', x: 30, y: 48, hours: 5, danger: 0.15, valley: true, desc: 'Ein Studentenheim im Tal, in dem noch Medizinstudenten mit ihren Büchern hocken. Sie wissen mehr als die Ärzte von damals.', loot: { wood: 40 }, flag: 'studenten', survivors: { n: 4, kind: 'engineer', origin: 'wue' } }),
  altstadt: S({ id: 'altstadt', name: 'Altstadt · Dom', area: 'stadt', x: 42, y: 48, hours: 6, danger: 0.3, valley: true, desc: 'Die Altstadt unter dem ausgebrannten Dom. Zwischen den Trümmern liegen Stahlträger und Ziegel für jedes Dach.', loot: { steel: 80, bricks: 150 }, survivors: { n: 2, kind: 'worker', origin: 'wue' }, flag: 'tal_gesehen', event: 'domschatz' }),
  residenz: S({ id: 'residenz', name: 'Residenz · Hofkeller', area: 'stadt', x: 50, y: 52, hours: 7, danger: 0.3, valley: true, desc: 'Die Residenz, der Hofkeller ist unversehrt. Wer ihn wieder betritt, kommt mit einem Lächeln zurück.', loot: { parts: 1 }, survivors: { n: 8, kind: 'mixed', origin: 'wue' }, flag: ['hofkeller', 'tal_gesehen'], needs: 'altstadt' }),
  talavera: S({ id: 'talavera', name: 'Talavera', area: 'stadt', x: 28, y: 32, hours: 7, danger: 0.25, valley: true, desc: 'Ein Fahrzeugpark der US-Armee an der Talavera. Zwischen den Lastwagen stehen Holzvergaser, die vielleicht noch fahren.', loot: { steel: 40 }, flag: 'lkw' }),
  festung: S({ id: 'festung', name: 'Festung Marienberg', area: 'stadt', x: 24, y: 56, hours: 10, danger: 0.45, valley: true, desc: 'Die Festung Marienberg auf dem Berg über dem Fluss. Auf dem Ausguck stehen noch die Messgeräte, und von dort sieht man das Wetter kommen.', loot: { parts: 2 }, survivors: { n: 5, kind: 'mixed', origin: 'wue' }, flag: 'ausguck', needs: 'altstadt' }),

  // ── Umland ──
  veitshoechheim: S({ id: 'veitshoechheim', name: 'Veitshöchheim', area: 'umland', x: 44, y: 46, hours: 14, danger: 0.2, desc: 'Das Schloss mit den Rokokogärten, die Dörfer ringsum fast leer. Die Gärtner haben ihr Holz gehortet.', loot: { wood: 150 }, survivors: { n: 5, kind: 'mixed', origin: 'wue' } }),
  kitzingen: S({ id: 'kitzingen', name: 'Kitzingen · Harvey Barracks', area: 'umland', x: 70, y: 66, hours: 24, danger: 0.3, desc: 'Die Harvey Barracks der Amerikaner bei Kitzingen. Die Depots sind verschlossen, die Tore stehen offen.', loot: { parts: 3, food: 150, steel: 80 } }),
  ochsenfurt: S({ id: 'ochsenfurt', name: 'Ochsenfurt · Zuckerfabrik', area: 'umland', x: 62, y: 82, hours: 22, danger: 0.25, desc: 'Die Zuckerfabrik am Main. Im Silo soll noch Rübenschnitzel liegen, hart wie Holz und trotzdem essbar.', loot: { food: 250 } }),
  karlstadt: S({ id: 'karlstadt', name: 'Karlstadt · Zementwerk', area: 'umland', x: 34, y: 30, hours: 26, danger: 0.3, desc: 'Das Zementwerk bei Karlstadt. Die Öfen sind kalt, und ein paar Männer dort leben noch.', loot: { bricks: 200, steel: 60 }, survivors: { n: 10, kind: 'worker', origin: 'wue' } }),
  schweinfurt: S({ id: 'schweinfurt', name: 'Schweinfurt · Kugellagerwerke', area: 'umland', x: 78, y: 22, hours: 34, danger: 0.4, desc: 'Die Kugellagerwerke, im Krieg das Ziel der Bomber. Der Funker dort hat einen Sender, der noch antwortet.', loot: { steel: 200, parts: 4 }, survivors: { n: 6, kind: 'engineer', origin: 'wue' }, flag: 'schweinfurt' }),
  badkissingen: S({ id: 'badkissingen', name: 'Bad Kissingen · Lazarettstadt', area: 'umland', x: 60, y: 8, hours: 40, danger: 0.35, desc: 'Die Kurkliniken sind belegt mit Verwundeten. Die Ärzte haben noch Verbandszeug und Instrumente.', loot: { parts: 2 }, survivors: { n: 12, kind: 'mixed', origin: 'wue' }, flag: 'medizin' }),
  lohr: S({ id: 'lohr', name: 'Lohr am Main · Glashütte', area: 'umland', x: 12, y: 30, hours: 34, danger: 0.35, desc: 'Die Glashütte in Lohr am Main. Die Öfen sind noch warm, und Scheiben gibt es, wenn man Ersatz findet.', loot: { steel: 40 }, survivors: { n: 4, kind: 'worker', origin: 'wue' }, flag: 'glas' }),
  wertheim: S({ id: 'wertheim', name: 'Wertheim', area: 'umland', x: 8, y: 70, hours: 38, danger: 0.35, desc: 'Wertheim an der Tauber, eine Stadt im Grenzland. Auf der Straße ziehen Trecks mit Menschen aus dem Osten.', loot: {}, event: 'treck_wertheim' }),
  rhoen: S({ id: 'rhoen', name: 'Rhön · Wasserkuppe', area: 'umland', x: 48, y: 2, hours: 60, danger: 0.6, desc: 'Die Wasserkuppe in der Rhön, wo einst die Segelflieger übten. Auf dem Gipfel funkt die Wetterwarte noch.', loot: { parts: 3 }, survivors: { n: 2, kind: 'engineer', origin: 'wue' }, flag: 'wasserkuppe', event: 'sturmwarnung' }),
};

/** The flags a place sets on arrival. */
export function siteFlags(site: SiteDef): string[] {
  return site.flag === undefined ? [] : Array.isArray(site.flag) ? site.flag : [site.flag];
}
