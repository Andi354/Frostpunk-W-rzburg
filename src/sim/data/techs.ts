import type { Resources } from '../types';

export interface TechDef {
  id: string;
  name: string;
  desc: string;
  /** tab in the research sheet (German label) */
  cat: string;
  cost: Partial<Resources>;
  /** hours of work in a staffed workshop */
  hours: number;
  requires?: string;
}

const T = (t: TechDef) => t;

export const TECHS: Record<string, TechDef> = {
  // ── Wärme ──
  rost: T({ id: 'rost', name: 'Rostfeuerung', desc: 'Ein neuer Rost im Heizwerk, den die Amerikaner zurückgelassen haben. Der Kessel gibt mehr Wärme.', cat: 'Wärme', cost: { wood: 20 }, hours: 10 }),
  waermestube: T({ id: 'waermestube', name: 'Wärmestuben', desc: 'Öfen für die Halle, an denen die Leute ihre Hände wärmen können.', cat: 'Wärme', cost: { steel: 15 }, hours: 12 }),
  vorwaermer: T({ id: 'vorwaermer', name: 'Speisewasser-Vorwärmer', desc: 'Das Wasser kommt vorgewärmt in den Kessel, so brennt jede Schaufel Kohle länger.', cat: 'Wärme', cost: { steel: 25 }, hours: 16, requires: 'rost' }),
  heizrohre: T({ id: 'heizrohre', name: 'Heizschlangen', desc: 'Rohrschlangen aus alten Kasernenleitungen geben die Wärme der Öfen weiter in den Raum.', cat: 'Wärme', cost: { steel: 30 }, hours: 20, requires: 'waermestube' }),
  fernwaerme1: T({ id: 'fernwaerme1', name: 'Fernwärmeleitung I', desc: 'Eine Rohrleitung aus dem Heizwerk bis zu den Ruinen am Rand der Stadt.', cat: 'Wärme', cost: { steel: 30 }, hours: 18, requires: 'waermestube' }),
  fernwaerme2: T({ id: 'fernwaerme2', name: 'Fernwärmeleitung II', desc: 'Die Leitung wird bis in die Altstadt verlängert, auch wenn das Kupfer dafür aus dem Dom stammt.', cat: 'Wärme', cost: { steel: 50, parts: 2 }, hours: 30, requires: 'fernwaerme1' }),
  daemmung: T({ id: 'daemmung', name: 'Strohdämmung', desc: 'Stroh und Torf in den Wänden halten die Wohnungen einige Grad wärmer.', cat: 'Wärme', cost: { wood: 30 }, hours: 10 }),
  werkheizung: T({ id: 'werkheizung', name: 'Werkhallenöfen', desc: 'Eiserne Öfen aus Fabrikresten machen die Werkhallen erträglich.', cat: 'Wärme', cost: { wood: 20, steel: 10 }, hours: 14 }),

  // ── Wohnen ──
  nissenhuetten: T({ id: 'nissenhuetten', name: 'Nissenhütten', desc: 'Die Bauanleitung der Briten liegt noch im Rathaus. Wellblech, Holz und Geduld genügen.', cat: 'Wohnen', cost: { wood: 15, steel: 10 }, hours: 8 }),
  ziegelbau: T({ id: 'ziegelbau', name: 'Trümmerziegel-Bau', desc: 'Aus gesäuberten Ziegeln der Ruinen wird wieder gemauert, Stein auf Stein, wie vor dem Krieg.', cat: 'Wohnen', cost: { wood: 20 }, hours: 16, requires: 'nissenhuetten' }),

  // ── Rohstoffe ──
  koehlerei: T({ id: 'koehlerei', name: 'Köhlerei', desc: 'Die alte Technik der Köhler: Holz unter Erde und Torf zu Holzkohle gegart. Es stinkt, aber es brennt.', cat: 'Rohstoffe', cost: { wood: 25 }, hours: 12 }),
  kohlenbohrer: T({ id: 'kohlenbohrer', name: 'Presslufthämmer', desc: 'Die Presslufthämmer aus dem Fliegerhorst brechen die Kohle schneller aus dem Stollen.', cat: 'Rohstoffe', cost: { steel: 30 }, hours: 18 }),
  saege: T({ id: 'saege', name: 'Bandsäge', desc: 'Eine Bandsäge aus der Schreinerei des Fliegerhorsts schneidet die Kiefern in einem Bruchteil der Zeit.', cat: 'Rohstoffe', cost: { steel: 20 }, hours: 14 }),
  schneidbrenner: T({ id: 'schneidbrenner', name: 'Schneidbrenner', desc: 'Mit Schneidbrenner und Schweißflasche lassen sich die Stahlträger der Hallen in Stücke legen.', cat: 'Rohstoffe', cost: { wood: 20, steel: 15 }, hours: 16 }),

  // ── Nahrung ──
  fallen: T({ id: 'fallen', name: 'Fallenstellerei', desc: 'Drahtschlingen und Fallen im Steigerwald, wie es die Jäger von früher kannten.', cat: 'Nahrung', cost: { wood: 15 }, hours: 10 }),
  gewaechshaus: T({ id: 'gewaechshaus', name: 'Gewächshäuser', desc: 'Glasdächer aus den Fenstern der Villen am Hubland. Im Winter bleibt die Wärme drin.', cat: 'Nahrung', cost: { wood: 20, steel: 20 }, hours: 18 }),

  // ── Medizin ──
  lazarett: T({ id: 'lazarett', name: 'Lazarett', desc: 'Die Ärzte des Luitpold-Krankenhauses zeigen, wie man ein Lazarett aus Kasernenbetten einrichtet.', cat: 'Medizin', cost: { wood: 20, steel: 10 }, hours: 14 }),
  roentgen: T({ id: 'roentgen', name: 'Röntgenstation', desc: 'Wilhelm Conrad Röntgen hat hier in Würzburg die Strahlen entdeckt. Das Gerät aus dem Luitpold-Krankenhaus kann Leben retten.', cat: 'Medizin', cost: { steel: 25, parts: 2 }, hours: 22, requires: 'lazarett' }),
  penicillin: T({ id: 'penicillin', name: 'Penicillin', desc: 'Ein Pulver aus dem Lager der Amerikaner. Es hilft gegen Wundbrand, wenn man die Dosis kennt.', cat: 'Medizin', cost: { parts: 3 }, hours: 30, requires: 'roentgen' }),

  // ── Erkundung ──
  kundschafter: T({ id: 'kundschafter', name: 'Kundschafter', desc: 'Freiwillige, die sich auf Fahrrädern durch das Umland wagen und Karten mitbringen.', cat: 'Erkundung', cost: { wood: 15 }, hours: 8 }),
  wetterdienst: T({ id: 'wetterdienst', name: 'Wetterdienst', desc: 'Die Wetterwarte auf dem Galgenberg gibt wieder Vorhersagen aus, mit Messungen von Hand.', cat: 'Erkundung', cost: { wood: 10, steel: 5 }, hours: 10 }),
  holzvergaser: T({ id: 'holzvergaser', name: 'Holzvergaser-Lkw', desc: 'Lastwagen, die mit Holzgas fahren. Ein Umbau aus Blech und Rohren, der die Fahrten halbiert.', cat: 'Erkundung', cost: { steel: 30, parts: 1 }, hours: 20, requires: 'kundschafter' }),
  kampfmittel: T({ id: 'kampfmittel', name: 'Kampfmittelräumdienst', desc: 'Ein Trupp, der Blindgänger erkennt und sicher birgt, bevor sie jemandem die Hand nehmen.', cat: 'Erkundung', cost: { steel: 10 }, hours: 14 }),
  funk: T({ id: 'funk', name: 'Funkgerät', desc: 'Ein Sender aus dem Fliegerhorst. Wenn er Antwort bekommt, weiß die Stadt, dass sie nicht allein ist.', cat: 'Erkundung', cost: { steel: 20, parts: 2 }, hours: 24, requires: 'kundschafter' }),

  // ── Technik ──
  rechenschieber: T({ id: 'rechenschieber', name: 'Rechenschieber', desc: 'Mit Rechenschieber und Logbuch rechnen die Ingenieure jeden Arbeitsgang vor, bevor sie ihn tun.', cat: 'Technik', cost: { wood: 20 }, hours: 12 }),
};
