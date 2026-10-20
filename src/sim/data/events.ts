// The scenario's documents: every row of the event table of the spec, with its texts, trigger and effects.
// Triggers are checked every game hour and fire once; scheduled events (hamster_zurueck) and the events of
// the sites (arrival pushes them to s.events.scheduled) are queued by story.ts.
import { hasTech } from '../heat';
import { kill } from '../people';
import { chance, nextRandom } from '../rng';
import { addPerson, log } from '../state';
import type { GameState, Origin, PersonKind } from '../types';
import { def } from './buildings';
import { dayOf } from '../weather';

export interface EventChoice {
  label: string;
  hint?: string;
  /** when false the choice is greyed out; resolving it anyway does nothing */
  available?: (s: GameState) => boolean;
  apply: (s: GameState) => void;
}

export interface EventDef {
  id: string;
  title: string;
  sender?: string;
  body: (s: GameState) => string;
  choices: EventChoice[];
  /** checked every hour; the event fires once, the first time it is true */
  trigger?: (s: GameState) => boolean;
}

// ── helpers ──────────────────────────────────────────────────────────────

/** Hours since 1 Dec 1946 00:00 for a day (1-based) and an hour. */
const at = (day: number, hour: number) => 24 * (day - 1) + hour;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

function mood(s: GameState, hope = 0, disc = 0): void {
  s.hope = clamp(s.hope + hope);
  s.discontent = clamp(s.discontent + disc);
}

function hasFunk(s: GameState): boolean {
  return s.buildings.some((b) => b.type === 'funkstation' && b.built >= 1);
}

function expellees(s: GameState): number {
  return s.people.filter((p) => p.origin === 'expellee').length;
}

/** Kinds of a mixed group: every third one a child, the others workers (deterministic). */
function mixed(n: number): PersonKind[] {
  return Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 'child' : 'worker'));
}

function newcomers(s: GameState, kinds: PersonKind[], origin: Origin, sick = false): void {
  for (const k of kinds) {
    const p = addPerson(s, k, origin);
    if (sick) p.health = 'sick';
  }
}

/** Removes a person who leaves the city alive (no death, no cause). */
function leave(s: GameState, id: number): void {
  for (const b of s.buildings) {
    const i = b.workers.indexOf(id);
    if (i >= 0) b.workers.splice(i, 1);
  }
  const i = s.people.findIndex((p) => p.id === id);
  if (i >= 0) s.people.splice(i, 1);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// ── the table ────────────────────────────────────────────────────────────

const EVENT_LIST: EventDef[] = [
  {
    id: 'ankunft',
    title: 'Ankunft',
    sender: 'Notiz im Heizwerk',
    body: () =>
      'Wir sind oben. Der Krater liegt wie eine Schüssel in der Kälte, dahinter das Heizwerk und die Kaserne der Amerikaner, und unter uns die Stadt, die niemand mehr heizt.\n\n' +
      'Das Heizwerk ist kalt. Der Kessel braucht Kohle, um anzugehen, und wir haben genau so viel, wie ein Winter kostet, wenn wir sparsam sind.\n\n' +
      'Als Erstes: den Kessel anheizen. Dann Zelte aufstellen, das Holz sichern und sehen, wer noch Hände hat. Ich melde mich, wenn es etwas Neues gibt.',
    choices: [{ label: 'An die Arbeit', hint: 'Der Kessel wartet im Heizwerk.', apply: () => {} }],
    trigger: () => true,
  },
  {
    id: 'amerikaner',
    title: 'Abzug',
    sender: 'Brief eines US-Captains',
    body: () =>
      'An die Verbliebenen in Würzburg,\n\n' +
      'mit Wirkung vom 1. Dezember wird unsere Einheit in den Westen verlegt. Wir bedauern, dass wir das Heizwerk nicht in gutem Zustand übergeben können. ' +
      'Im Kohlenlager unter der Kraterkante liegt, was wir zurücklassen müssen. Bitte verstehen Sie: it is not possible to take more.\n\n' +
      'Die Kisten am Zaun gehören Ihnen. Gott schütze Sie in diesem Winter.\n\n' +
      'Mit vorzüglicher Hochachtung\nCaptain E. M. Lowell\nUS Army, Quartiermeister',
    choices: [
      { label: 'Kohlenlager freilegen', hint: '+60 Kohle', apply: (s) => { s.res.coal += 60; log(s, 'Das Kohlenlager unter der Kraterkante ist frei.', 'good'); } },
      { label: 'Brief verbrennen, um sich zu wärmen', hint: 'Hoffnung +1', apply: (s) => mood(s, 1) },
    ],
    trigger: (s) => s.time >= at(2, 9),
  },
  {
    id: 'kinder',
    title: 'Die Kinder wollen helfen',
    sender: 'Eine Mutter aus der Sanderau',
    body: () =>
      'Meine Kinder stehen den ganzen Tag am Zaun und fragen, ob sie etwas tun dürfen. Der Große ist zwölf, die Kleine zehn, und beide sind nicht dumm. ' +
      'Sie können Schutt tragen, Holz sammeln und Kohle schleppen.\n\n' +
      'Ich will nicht, dass sie das tun. Aber ich sehe, dass Sie jede Hand brauchen, und dass hier niemand mehr fragt, was erlaubt ist.\n\n' +
      'In den Notverordnungen steht, was man dazu sagen kann: Kinderarbeit oder Kinderhort.',
    choices: [{ label: 'Wir reden darüber', hint: 'Die Gesetze: Kinderarbeit oder Kinderhort', apply: () => {} }],
    trigger: (s) => s.time >= at(3, 10),
  },
  {
    id: 'blindgaenger',
    title: 'Ein Blindgänger',
    sender: 'Trümmerkolonne',
    body: () =>
      'Unter dem Schutthaufen am Südrand liegt eine Bombe, die nicht explodiert ist. Der Zünder ist verrostet, aber nicht tot. ' +
      'Wer sie bergen will, braucht ruhige Hände und Glück. Einen Kampfmittelräumdienst gibt es hier nicht.',
    choices: [
      {
        label: 'Vorsichtig bergen',
        hint: 'Mit Glück 30 Stahl, sonst stirbt ein Arbeiter',
        apply: (s) => {
          if (chance(s, 0.5)) {
            const workers = s.people.filter((p) => p.kind === 'worker');
            const pool = workers.length ? workers : s.people;
            if (pool.length) kill(s, pool[Math.floor(nextRandom(s) * pool.length)], 'unfall');
          } else {
            s.res.steel += 30;
            log(s, '30 Stahl aus dem Blindgänger geborgen.', 'good');
          }
        },
      },
      {
        label: 'Absperren',
        hint: 'Ein Trümmerhaufen wird aufgegeben',
        apply: (s) => {
          const piles = s.buildings.filter((b) => b.type.startsWith('pile_'));
          if (!piles.length) return;
          const b = piles[Math.floor(nextRandom(s) * piles.length)];
          for (const p of s.people) if (p.job === b.id) p.job = null;
          s.buildings.splice(s.buildings.indexOf(b), 1);
          log(s, `${def(b.type).name} ist abgesperrt und wird nicht mehr angerührt.`);
        },
      },
    ],
    trigger: (s) => s.time >= at(5, 11) && !hasTech(s, 'kampfmittel'),
  },
  {
    id: 'hamsterfahrt',
    title: 'Tauschhandel mit Rottendorf',
    sender: 'Frauen aus der Zellerau',
    body: () =>
      'Wir wollen nach Rottendorf. Dort haben die Bauern Kartoffeln und Rüben, und wir haben Wäsche und ein paar Kohlen, die wir nicht brauchen. ' +
      'Wir sind vor Dunkelheit zurück. Das sagen wir Ihnen nicht, weil es sicher ist. Es ist nur das, was wir noch haben.',
    choices: [
      {
        label: 'Erlauben',
        hint: 'Die Frauen kommen morgen mit Vorräten zurück, vielleicht',
        apply: (s) => s.events.scheduled.push({ id: 'hamster_zurueck', at: s.time + 24 }),
      },
      { label: 'Verbieten', hint: 'Unmut +5', apply: (s) => mood(s, 0, 5) },
    ],
    trigger: (s) => s.time >= at(6, 8),
  },
  {
    id: 'hamster_zurueck',
    title: 'Die Frauen kommen zurück',
    sender: 'Frauen aus der Zellerau',
    body: () =>
      'Sie kommen über die Brücke zurück, schneebedeckt, die Rucksäcke leer und die Säcke schwer. Der Bauer in Rottendorf hat Wort gehalten. ' +
      'Was in den Säcken ist, sieht man erst, wenn man sie abgeladen hat.',
    choices: [
      {
        label: 'Die Säcke abladen',
        hint: 'Was drin ist, zeigt sich beim Abladen',
        apply: (s) => {
          if (chance(s, 0.2)) {
            s.res.rations = Math.max(0, s.res.rations - 30);
            log(s, 'Auf dem Rückweg überfallen: 30 Rationen fehlen.', 'bad');
          } else {
            s.res.food += 70;
            log(s, 'Die Frauen bringen 70 Rohkost aus Rottendorf.', 'good');
          }
        },
      },
    ],
  },
  {
    id: 'kaeltewelle',
    title: 'Kälteeinbruch',
    sender: 'Wetterbeobachtung',
    body: () =>
      'Die Station auf dem Ausguck meldet für den 9. und 10. Dezember Werte, die man sonst nur aus dem Lexikon kennt. ' +
      'Heizen Sie, wo Sie können. Die Zelte halten nicht, wenn das Thermometer unter minus zwanzig fällt, und die Nächte sind länger, als sie sein sollten.',
    choices: [{ label: 'Verstanden', apply: () => {} }],
    trigger: (s) => s.time >= at(8, 7),
  },
  {
    id: 'heimkehrer',
    title: 'Die Rückkehr ins Tal',
    sender: 'Ratsherr Konrad Hufnagel',
    body: () =>
      'Ich war dreißig Jahre im Rathaus, und ich sage es Ihnen, wie es ist: Oben stirbt man. Im Tal, in den Kellern der Altstadt, ist es wärmer. ' +
      'Die Gewölbe unter der Domstraße halten den Wind ab, und das Wasser läuft noch.\n\n' +
      'Es gibt Familien, die wollen gehen, und ich werde nicht der sein, der sie aufhält. Hören Sie mich an.',
    choices: [
      {
        label: 'Anhören',
        hint: 'Hoffnung +3, die Rückkehr wächst',
        apply: (s) => {
          mood(s, 3);
          s.flags.heimkehrer = 40;
        },
      },
      {
        label: 'Zum Schweigen bringen',
        hint: 'Unmut +8, die Rückkehr bleibt schwach',
        apply: (s) => {
          mood(s, 0, 8);
          s.flags.heimkehrer = 20;
        },
      },
    ],
    trigger: (s) => s.time >= at(11, 9),
  },
  {
    id: 'fluechtlingszug',
    title: 'Der Zug auf dem Abstellgleis',
    sender: 'Bahnhofsvorsteher',
    body: () =>
      'Achtzehn Menschen sitzen seit drei Tagen in einem Güterwagen auf dem Abstellgleis. Sie kommen aus Schlesien, sie haben alles verloren, was sie besaßen, und sie wollen nicht weiter. ' +
      'Die Lokomotive hat keine Kohle mehr, und sie wird auch nicht wieder anspringen.\n\n' +
      'Was soll ich ihnen sagen?',
    choices: [
      {
        label: 'Aufnehmen',
        hint: '18 Menschen, Unmut +4',
        apply: (s) => {
          newcomers(s, [...Array<PersonKind>(10).fill('worker'), ...Array<PersonKind>(3).fill('engineer'), ...Array<PersonKind>(5).fill('child')], 'expellee');
          mood(s, 0, 4);
          log(s, '18 Menschen aus Schlesien kommen auf das Hubland.', 'good');
        },
      },
      { label: 'Abweisen', hint: 'Hoffnung −8', apply: (s) => mood(s, -8) },
    ],
    trigger: (s) => s.time >= at(12, 10),
  },
  {
    id: 'streit',
    title: 'Streit um die Betten',
    sender: 'Hilfspolizei',
    body: () =>
      'Zwei Männer in der Zeltreihe C haben sich geprügelt. Der eine ist aus Würzburg und hat sein Bett seit dem März, der andere kam mit dem Zug aus Schlesien und hat nichts außer seiner Decke. ' +
      'Jetzt sagt jeder, er habe das Recht auf den Platz. Ich brauche eine Antwort, bevor heute Nacht wieder jemand zum Messer greift.',
    choices: [
      { label: 'Gleiche Rechte', hint: 'Unmut +5, Hoffnung +3', apply: (s) => mood(s, 3, 5) },
      { label: 'Würzburger zuerst', hint: 'Hoffnung −5, Unmut −3', apply: (s) => mood(s, -5, -3) },
    ],
    trigger: (s) => s.time >= at(14, 12) && expellees(s) >= 15,
  },
  {
    id: 'kranke_zurueck',
    title: 'Im Keller des Luitpold',
    sender: 'Truppführer',
    body: () =>
      'Im Keller des Luitpold-Krankenhauses liegen noch Kranke auf Matratzen, die man vergessen hat. Sie haben Fieber, und manche können nicht mehr gehen. ' +
      'Wir haben Platz im Wagen für fünf. Wenn wir die anderen hier lassen, sterben sie in der Kälte.',
    choices: [
      { label: 'Mitnehmen', hint: '5 Kranke, sie brauchen Pflege', apply: (s) => newcomers(s, Array<PersonKind>(5).fill('worker'), 'wue', true) },
      { label: 'Zurücklassen', hint: 'Hoffnung −4', apply: (s) => mood(s, -4) },
    ],
  },
  {
    id: 'domschatz',
    title: 'Unter dem Dom',
    sender: 'Truppführer',
    body: () =>
      'Unter dem ausgebrannten Dom haben wir einen Keller gefunden. Dort stehen Kisten mit Silber, mit Kirchenschätzen und mit Werkzeug aus der Dombauhütte: Stemmeisen, Sägen, Feilen. ' +
      'Die Reliquien des heiligen Kilian sind in Samt gewickelt. Man kann sie tragen, aber nicht alles. Entscheiden Sie.',
    choices: [
      { label: 'Reliquien bergen', hint: 'Hoffnung +6', apply: (s) => mood(s, 6) },
      {
        label: 'Werkzeug bergen',
        hint: 'Ersatzteile +2',
        apply: (s) => {
          s.res.parts += 2;
        },
      },
    ],
  },
  {
    id: 'treck_wertheim',
    title: 'Der Treck aus Wertheim',
    sender: 'Truppführer',
    body: () =>
      'Zwanzig Menschen ziehen die Straße herauf: Frauen, Alte, drei Kinder auf einem Handwagen. Sie kommen aus dem Osten über Wertheim, wo es keinen Ort mehr gibt, der sie hält. ' +
      'Sie haben Hunger und wollen wissen, ob oben am Berg noch Platz ist.',
    choices: [
      {
        label: 'Aufnehmen',
        hint: '20 Menschen, Unmut +4',
        apply: (s) => {
          newcomers(s, mixed(20), 'expellee');
          mood(s, 0, 4);
          log(s, 'Der Treck aus Wertheim bleibt auf dem Hubland.', 'good');
        },
      },
      {
        label: 'Nur Vorräte teilen',
        hint: 'Rohkost −60, Hoffnung +2',
        apply: (s) => {
          s.res.food = Math.max(0, s.res.food - 60);
          mood(s, 2);
        },
      },
    ],
  },
  {
    id: 'fringsen',
    title: 'Die Predigt aus Köln',
    sender: 'Funk / Gerücht aus Köln',
    body: () =>
      'Aus dem Radio der Funkstation, und dann von Mund zu Mund: Kardinal Frings hat in Köln gepredigt. Wer in der Not Kohle von der Bahn nimmt, um seine Kinder zu wärmen, sündigt nicht.\n\n' +
      'Die Leute reden davon, als wäre es ein Befehl. Für uns wäre es eine Erlaubnis, und die sollte man sich vorher ansehen.',
    choices: [
      {
        label: 'Verstanden',
        hint: 'Das Gesetz „Fringsen“ wird möglich',
        apply: (s) => {
          s.flags.fringsen = 1;
        },
      },
    ],
    trigger: (s) => s.time >= (hasFunk(s) ? at(20, 8) : at(24, 8)),
  },
  {
    id: 'schweinfurt_funk',
    title: 'Ein Angebot über den Äther',
    sender: 'Funkspruch aus Schweinfurt',
    body: () =>
      'Die Kugellagerwerke antworten. Ihr Funker klingt müde und höflich: Sie haben Ersatzteile, die man bei uns dringend braucht, und keine Kohle mehr. ' +
      'Sie bieten zwei Ersatzteile gegen hundert Kohle. Das Angebot gilt bis zum Abend.',
    choices: [
      {
        label: '100 Kohle gegen 2 Ersatzteile',
        hint: 'Kohle −100, Ersatzteile +2',
        available: (s) => s.res.coal >= 100,
        apply: (s) => {
          s.res.coal -= 100;
          s.res.parts += 2;
        },
      },
      { label: 'Ablehnen', hint: 'Nichts ändert sich', apply: () => {} },
    ],
    trigger: (s) => s.time >= at(15, 0) && hasFunk(s) && !!s.flags.schweinfurt,
  },
  {
    id: 'sturmwarnung',
    title: 'Der Weiße Tod',
    sender: 'Wetterwarte Wasserkuppe',
    body: () =>
      'Die Messungen auf dem Gipfel sind eindeutig. Ab dem 30. Dezember zieht ein Sturm über das Land, der vier Tage bleibt: Schnee, der die Dächer drückt, und Kälte unter minus achtzig Grad. ' +
      'Die Leute nennen ihn den Weißen Tod.\n\n' +
      'Holz, Kohle und Dächer müssen vorher stehen. Wir haben nicht viel Zeit.',
    choices: [{ label: 'Alle Kräfte auf den Sturm', hint: 'Hoffnung +2', apply: (s) => mood(s, 2) }],
    trigger: (s) => s.time >= (hasFunk(s) || s.flags.wasserkuppe ? at(21, 8) : at(25, 8)),
  },
  {
    id: 'auszug',
    title: 'Der Zug ins Tal',
    sender: 'Ratsherr Hufnagel',
    body: () =>
      'Ich gehe nicht selbst. Aber meine Leute gehen. Es sind fünfzehn Familien, vielleicht mehr, und sie haben die Karren gepackt. ' +
      'Sie haben gesehen, was unten noch steht, und sie wollen heute Nacht los.\n\n' +
      'Sagen Sie, wer gehen will, soll gehen dürfen? Dann sage ich: Sie nehmen den Rest des Winters mit.',
    choices: [
      {
        label: 'Gehen lassen',
        hint: 'Ein Teil der Leute geht, 80 Rohkost und 80 Kohle mit',
        apply: (s) => {
          const n = Math.round(s.people.length * 0.15);
          const away = new Set(s.expeditions.flatMap((e) => e.members));
          const pool = s.people.filter((p) => !away.has(p.id));
          for (let i = 0; i < n && pool.length; i++) {
            const p = pool.splice(Math.floor(nextRandom(s) * pool.length), 1)[0];
            leave(s, p.id);
          }
          s.res.food = Math.max(0, s.res.food - 80);
          s.res.coal = Math.max(0, s.res.coal - 80);
          log(s, `${n} ${plural(n, 'Mensch verlässt', 'Menschen verlassen')} die Siedlung Richtung Tal.`, 'bad');
        },
      },
      { label: 'Mit Gewalt halten', hint: 'Unmut +15', apply: (s) => mood(s, 0, 15) },
    ],
    trigger: (s) => s.time >= at(22, 9) && (s.flags.heimkehrer ?? 0) >= 80,
  },
  {
    id: 'wahrheit_tal',
    title: 'Der Bericht aus dem Tal',
    sender: 'Truppführer',
    body: () =>
      'Unsere Späher waren in der Altstadt und in der Residenz. Das Tal ist tot und gefroren. Keine Fenster, keine Lichter. Die Keller sind voll Wasser, das zu Eis geworden ist.\n\n' +
      'Ich habe es selbst gesehen. Ratsherr Hufnagel wird das nicht hören wollen.',
    choices: [
      {
        label: 'Bericht vorlesen',
        hint: 'Rückkehr −50, Hoffnung +4',
        apply: (s) => {
          s.flags.heimkehrer = Math.max(0, (s.flags.heimkehrer ?? 0) - 50);
          mood(s, 4);
        },
      },
    ],
    trigger: (s) => !!s.flags.tal_gesehen && s.flags.heimkehrer !== undefined,
  },
  {
    id: 'sturm_beginnt',
    title: 'Der Sturm',
    body: () =>
      'Er ist da. Der Wind kommt aus Norden über die Rhön, und in einer Stunde ist das Licht weg. Der Schnee liegt waagerecht. ' +
      'Die Zelte biegen sich, die Türen frieren zu.\n\n' +
      'Bleiben Sie in den Häusern, halten Sie die Öfen am Brennen und zählen Sie Ihre Leute. Vier Tage.',
    choices: [{ label: 'Haltet durch', apply: () => {} }],
    trigger: (s) => s.time >= at(30, 6),
  },
  {
    id: 'sturm_vorbei',
    title: 'Stille',
    body: () =>
      'Am Morgen ist es still. Der Schnee steht still. Die Dächer haben gehalten, die meisten. Man hört wieder Stimmen aus den Zelten und das Knacken des Kessels.\n\n' +
      'Es ist vorbei, und es sind noch ein paar Tage bis zum Frost, der bricht.',
    choices: [{ label: 'Atmen', hint: 'Hoffnung +10', apply: (s) => mood(s, 10) }],
    trigger: (s) => s.time >= at(34, 6),
  },
];

export const EVENTS: Record<string, EventDef> = Object.fromEntries(EVENT_LIST.map((e) => [e.id, e]));

// ── the endings (Bilanz) ─────────────────────────────────────────────────

/** The closing paragraph of the scenario, by how it ended. */
export function closing(s: GameState): string {
  const dead = s.dead;
  const day = dayOf(s.time);
  switch (s.outcome) {
    case 'won': {
      const head = 'Als die Sonne am 4. Januar durch die Wolken bricht, steht der Kessel noch. Das Heizwerk brennt, die Zelte sind vom Schnee befreit, und die Leute stehen am Zaun und sehen hinunter auf die Stadt. Würzburg wird wieder aufgebaut werden, Stein auf Stein, wie vor dem Krieg.';
      if (dead <= 5) return `${head}\n\nEs waren nicht viele, die wir verloren haben. Ihre Namen wissen wir.`;
      const price = `${dead} ${plural(dead, 'Mensch hat', 'Menschen haben')} den Winter nicht überlebt, und ihr Preis steht in jedem Gesicht.`;
      const tail =
        s.laws.path === 'order'
          ? s.laws.signed.includes('stadtkommandant')
            ? 'Ein Stadtkommandant sitzt noch im Rathaus, und niemand fragt mehr, wer ihm die Befehle gegeben hat. Ob man das Ordnung nennt oder etwas anderes, wird man später entscheiden müssen.'
            : 'Die Ordnung hat gehalten, mit Lautsprecherwagen und Arbeitsdienst. Man wird sich fragen, was sie gekostet hat.'
          : s.laws.path === 'faith'
            ? 'Die Glocken läuten vom Dom, dessen Turm noch steht. Die Gemeinde singt in der Notkapelle, und an jedem Holzkreuz am Galgenberg brennt ein Licht.'
            : 'Es gab keinen großen Plan, nur Hände, die weitermachten. Das reichte.';
      return `${head}\n\n${price}\n\n${tail}`;
    }
    case 'revolt':
      return `Am Tag ${day} stehen die Leute vor dem Rathaus, und niemand hält sie mehr auf. Die Verwaltung wird aus dem Fenster geworfen, und die Kohle wird ohne Zählung verteilt. ` +
        'Es war nicht die Kälte allein. Es war das Gefühl, dass niemand mehr hinhört.';
    case 'despair':
      return `Am Tag ${day} ist die Hoffnung erloschen, und mit ihr die Arbeit. Man sitzt in den Zelten, den Mantel über den Knien, und wartet, dass es aufhört. ` +
        'Es hört auf. Aber niemand steht mehr auf, um es zu sehen.';
    case 'dead':
      return `Am Tag ${day} ist niemand mehr in der Siedlung. Die Zelte stehen offen im Schnee, das Heizwerk brennt noch eine Weile für niemanden. Auf dem Hubland ist es still.`;
    case 'burst':
      return `Am Tag ${day} birst der Kessel. Ein Knall, der bis in die Altstadt zu hören ist, dann Dampf über dem Krater. ` +
        'Das Heizwerk war das Letzte, was die Stadt warm hielt.';
    default:
      return '';
  }
}
