import type { GameState } from '../sim/types';
import { ACTIONS, HOOKS, esc } from './app';
import { writeSave } from './persist';

const count = (s: GameState, type: string): number => s.buildings.filter((b) => b.type === type).length;

/** The first-game steps in order; a step is shown until its check holds. */
export const HINTS: { text: string; done: (s: GameState) => boolean }[] = [
  { text: 'Kessel anheizen: Tippe auf den Kessel in der Mitte und dann auf „Anheizen“.', done: (s) => s.gen.on },
  { text: 'Zwei Zelte bauen: Unter „Bauen“ das Zelt wählen und ein freies Feld antippen.', done: (s) => count(s, 'zelt') >= 2 },
  {
    text: 'Einen Arbeiter auf die Kohle setzen: Kohlenhaufen oder Kohlengrube antippen.',
    done: (s) => s.buildings.some((b) => (b.type === 'pile_coal' || b.type === 'kohlengrube') && b.workers.length > 0),
  },
  { text: 'Volksküche und Jagdhütte bauen: Die Jagd bringt Essen, die Küche macht Rationen.', done: (s) => count(s, 'kueche') > 0 && count(s, 'jagdhuette') > 0 },
  { text: 'Werkstatt bauen: Ohne sie wird nichts erforscht.', done: (s) => count(s, 'werkstatt') > 0 },
];

/** The next suggested step, or null when the hints are done or dismissed. */
export function nextHint(s: GameState): string | null {
  if (s.flags.hintsOff) return null;
  return HINTS.find((h) => !h.done(s))?.text ?? null;
}

let host: HTMLElement | null = null;
let shown = '';

HOOKS.frame.push((app) => {
  const s = app.s;
  const text = !app.title && !app.sheet && !app.placing && !s.outcome && s.events.pending.length === 0 ? nextHint(s) : null;
  const html = text
    ? `<div class="hint-bar" role="status"><span>${esc(text)}</span><button class="hint-x" data-act="hintOff" aria-label="Hinweis ausblenden">×</button></div>`
    : '';
  if (html === shown) return;
  shown = html;
  if (!host) {
    host = document.createElement('div');
    document.getElementById('ui')?.appendChild(host);
  }
  host.innerHTML = html;
});

ACTIONS.hintOff = (app) => {
  app.s.flags.hintsOff = 1;
  writeSave(app.s);
};
