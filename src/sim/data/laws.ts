export type LawTab = 'not' | 'weg' | 'order' | 'faith';

export interface LawMood {
  hope?: number;
  discontent?: number;
}

export interface LawDef {
  id: string;
  name: string;
  desc: string;
  tab: LawTab;
  /** must be in force before this law can be signed */
  requires?: string;
  /** cannot be in force together with this law (works both ways) */
  excludes?: string;
  /** first day (1-based) on which the law can be signed */
  availableFrom?: number;
  /** a flag of the game that has to be set (`s.flags`) */
  flag?: string;
  /** one-off change of the mood when the law is signed */
  onSign?: LawMood;
  /** change of the mood per game hour while the law is in force */
  perHour?: LawMood;
}

const L = (l: LawDef) => l;

export const LAWS: Record<string, LawDef> = {
  // ── Not: survival laws ──
  kinderarbeit: L({ id: 'kinderarbeit', name: 'Kinderarbeit', tab: 'not', excludes: 'kinderhort', onSign: { discontent: 5, hope: -3 },
    desc: 'Kinder füllen die Arbeitsplätze der Erwachsenen und arbeiten mit 60 % Leistung. Dafür gibt es keinen Kinderhort.' }),
  kinderhort: L({ id: 'kinderhort', name: 'Kinderhort', tab: 'not', excludes: 'kinderarbeit', onSign: { hope: 2 },
    desc: 'Ein Raum, in dem die Kleinen betreut werden. Kinder helfen nur in der Sanitätsstation und der Werkstatt mit, dort mit halber Leistung.' }),
  suppe: L({ id: 'suppe', name: 'Wassersuppe', tab: 'not', excludes: 'ersatzkost', onSign: { discontent: 2 },
    desc: 'Eine dünne Suppe aus Rüben und Wasser. Die Volksküche macht aus 1 Rohkost 1,25 Rationen. Dafür werden die Leute schneller krank (+15 %).' }),
  ersatzkost: L({ id: 'ersatzkost', name: 'Ersatzkost', tab: 'not', excludes: 'suppe', onSign: { discontent: 4 }, perHour: { discontent: 0.03 },
    desc: 'Eichelkaffee und Sägemehlbrot. Die Volksküche macht aus 1 Rohkost 1,5 Rationen. Der Unmut wächst jede Stunde ein wenig.' }),
  lebensmittelkarten: L({ id: 'lebensmittelkarten', name: 'Lebensmittelkarten', tab: 'not', onSign: { discontent: 3 },
    desc: 'Karten für jeden Haushalt. Kinder und Menschen ohne Arbeit bekommen am Abend nur eine halbe Ration.' }),
  notschicht: L({ id: 'notschicht', name: 'Notschicht', tab: 'not', onSign: { discontent: 5 }, perHour: { discontent: 0.08 },
    desc: 'Die Arbeit dauert von 8 bis 22 Uhr. Bei der Arbeit steigt die Gefahr, krank zu werden, um 10 %. Der Unmut wächst jede Stunde.' }),
  truemmerpflicht: L({ id: 'truemmerpflicht', name: 'Trümmerpflicht', tab: 'not', onSign: { discontent: 2 }, perHour: { discontent: 0.03 },
    desc: 'Jeder räumt Schutt. Trümmerhaufen und Trümmerbahn bringen 25 % mehr. Der Unmut wächst jede Stunde ein wenig.' }),
  friedhof: L({ id: 'friedhof', name: 'Friedhof am Galgenberg', tab: 'not', excludes: 'schneegrab', onSign: { hope: 2 },
    desc: 'Die Toten bekommen einen Platz mit Namen auf dem Holzkreuz. Jeder Tod kostet nur 1 Hoffnung statt 2. Erlaubt den Friedhof als Gebäude.' }),
  schneegrab: L({ id: 'schneegrab', name: 'Schneegrab', tab: 'not', excludes: 'friedhof', onSign: { hope: -2 },
    desc: 'Die Toten werden im Schnee bestattet, ohne Namen und ohne Kreuz. Jeder Tod kostet 1 Hoffnung und 0,5 Unmut.' }),
  amputation: L({ id: 'amputation', name: 'Amputation', tab: 'not', excludes: 'pflegestation',
    desc: 'Schwerkranke werden im Lazarett amputiert. Nach 24 Stunden sind sie wieder da, aber nur noch mit halber Arbeitskraft.' }),
  pflegestation: L({ id: 'pflegestation', name: 'Pflegestation', tab: 'not', excludes: 'amputation',
    desc: 'Jedes Gesundheitsgebäude pflegt 5 Menschen mehr. Jeder Gepflegte braucht zusätzlich eine Ration am Abend.' }),
  weinausschank: L({ id: 'weinausschank', name: 'Weinausschank', tab: 'not', onSign: { hope: 3 },
    desc: 'Die Weinstube „Zum Stachel“ darf öffnen. Ein Schluck Frankenwein hilft gegen Frost und Trübsinn. Erlaubt die Weinstube als Gebäude.' }),
  kohlenklau: L({ id: 'kohlenklau', name: 'Fringsen', tab: 'not', flag: 'fringsen', onSign: { discontent: -5 },
    desc: 'Wer in der Not Kohle von der Bahn nimmt, sündigt nicht. Jeden Morgen kommen 40 Kohle dazu. Die Militärpolizei fängt Diebe, dann sinkt die Hoffnung um 3.' }),
  schwarzmarkt: L({ id: 'schwarzmarkt', name: 'Schwarzmarkt dulden', tab: 'not', onSign: { discontent: -3, hope: -2 }, perHour: { discontent: -0.02 },
    desc: 'Wer Holz hat, bekommt dafür Ersatzteile. Jeden Morgen mit mindestens 60 Holz: 30 Holz gegen 1 Ersatzteil. Der Unmut sinkt jede Stunde ein wenig.' }),

  // ── Weg: the two paths ──
  notstand: L({ id: 'notstand', name: 'Notstandsverwaltung ausrufen', tab: 'weg', availableFrom: 8, excludes: 'kiliansgemeinde', onSign: { discontent: -8 },
    desc: 'Eine Verwaltung mit Befehlsgewalt führt die Stadt. Es ist der Weg der Ordnung: Bürgerwehr, Ausgangssperre, Lautsprecher und Arbeitsdienst. Der Unmut sinkt um 8.' }),
  kiliansgemeinde: L({ id: 'kiliansgemeinde', name: 'Kiliansgemeinde gründen', tab: 'weg', availableFrom: 8, excludes: 'notstand', onSign: { hope: 8 },
    desc: 'Die Gemeinde versammelt sich im Kessel und betet für den Frühling. Es ist der Weg des Glaubens: Notkapelle, Andacht, Diakonissen und Kiliansfest. Die Hoffnung steigt um 8.' }),

  // ── Ordnung (after Notstandsverwaltung) ──
  buergerwehr: L({ id: 'buergerwehr', name: 'Bürgerwehr', tab: 'order', requires: 'notstand', perHour: { discontent: -0.03 },
    desc: 'Männer mit Armbinden halten die Nacht über Ordnung. Erlaubt die Wachstube als Gebäude. Der Unmut sinkt jede Stunde ein wenig.' }),
  ausgangssperre: L({ id: 'ausgangssperre', name: 'Ausgangssperre', tab: 'order', requires: 'buergerwehr', perHour: { discontent: -0.08, hope: -0.02 },
    desc: 'Nach Einbruch der Dunkelheit darf niemand mehr auf die Straße. Der Unmut sinkt jede Stunde, die Hoffnung ein wenig.' }),
  lautsprecher: L({ id: 'lautsprecher', name: 'Lautsprecherwagen', tab: 'order', requires: 'ausgangssperre', perHour: { hope: 0.05 },
    desc: 'Ein Wagen fährt durch die Straßen und verkündet, dass es weitergeht. Die Hoffnung steigt jede Stunde ein wenig.' }),
  arbeitsdienst: L({ id: 'arbeitsdienst', name: 'Arbeitsdienst', tab: 'order', requires: 'lautsprecher', perHour: { discontent: 0.02 },
    desc: 'Jeder arbeitet, wo er gebraucht wird. Alle Arbeit bringt 15 % mehr. Der Unmut wächst jede Stunde ein wenig.' }),
  stadtkommandant: L({ id: 'stadtkommandant', name: 'Stadtkommandant', tab: 'order', requires: 'arbeitsdienst', onSign: { hope: -5 },
    desc: 'Ein Offizier übernimmt die Stadt. Der Unmut wird auf 80 begrenzt, die Hoffnung sinkt um 5. Wir haben schon einmal einem Mann alles erlaubt.' }),

  // ── Glaube (after Kiliansgemeinde) ──
  notkapelle: L({ id: 'notkapelle', name: 'Notkapelle', tab: 'faith', requires: 'kiliansgemeinde',
    desc: 'Erlaubt die Notkapelle als Gebäude. Ist sie besetzt, steigt die Hoffnung jeden Tag um 2.' }),
  andacht: L({ id: 'andacht', name: 'Abendandacht', tab: 'faith', requires: 'notkapelle', perHour: { hope: 0.05 },
    desc: 'Jeden Abend wird gebetet, in der Kälte und mit geflickten Mänteln. Die Hoffnung steigt jede Stunde ein wenig.' }),
  diakonissen: L({ id: 'diakonissen', name: 'Diakonissen', tab: 'faith', requires: 'andacht',
    desc: 'Die Schwestern vom Luitpold-Krankenhaus pflegen mehr Kranke. Die Pflegeplätze steigen um 30 %.' }),
  kiliansfest: L({ id: 'kiliansfest', name: 'Kiliansfest', tab: 'faith', requires: 'diakonissen', onSign: { hope: 15, discontent: -15 },
    desc: 'Der Stadtpatron wird gefeiert, mit dem Wein aus den letzten Fässern. Die Hoffnung steigt um 15, der Unmut sinkt um 15.' }),
  bischofsstadt: L({ id: 'bischofsstadt', name: 'Bischofsstadt', tab: 'faith', requires: 'kiliansfest', onSign: { discontent: 5 },
    desc: 'Der Dom ist verbrannt, aber nicht der Glaube der Stadt. Die Hoffnung fällt nie unter 20. Der Unmut steigt sofort um 5.' }),
};
