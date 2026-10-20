import { closing, EVENTS } from '../../sim/data/events';
import { LAWS } from '../../sim/data/laws';
import { SITES } from '../../sim/data/sites';
import { census } from '../../sim/people';
import { resolveEvent } from '../../sim/story';
import { dayOf } from '../../sim/weather';
import { ACTIONS, HOOKS, esc, fmt, type App } from '../app';

/** Documents that carry the red stamp, besides every document while a warning runs. */
const URGENT = ['sturm_beginnt', 'sturmwarnung'];

const CAUSES: Record<string, string> = { krankheit: 'Krankheit', hunger: 'Hunger', kälte: 'Kälte', unfall: 'Unfall', expedition: 'Expedition' };
const PATHS: Record<string, string> = { order: 'Weg der Ordnung', faith: 'Weg des Glaubens' };
const ENDS: Record<string, string> = {
  won: 'Der Frost bricht',
  revolt: 'Der Aufstand',
  despair: 'Die Hoffnung ist erloschen',
  dead: 'Niemand ist geblieben',
  burst: 'Der Kessel ist geborsten',
};

/** The first pending document (after the title, before the Bilanz). */
HOOKS.modal.push((app) => {
  if (app.title) return null;
  const s = app.s;
  if (s.outcome) return bilanz(app);
  const p = s.events.pending[0];
  if (!p) return null;
  const def = EVENTS[p.id];
  const urgent = URGENT.includes(p.id) || !!s.warning;
  const choices = p.choices
    .map((c, i) => {
      const off = def.choices[i]?.available && !def.choices[i].available!(s);
      return `<button class="choice" data-act="choose" data-arg="${i}"${off ? ' disabled' : ''}>${esc(c.label)}${c.hint ? `<small>${esc(c.hint)}</small>` : ''}</button>`;
    })
    .join('');
  return `<div class="modal"><section class="modal-card" role="dialog" aria-label="${esc(p.title)}">
    ${urgent ? '<div class="stamp">DRINGEND</div>' : ''}
    ${p.sender ? `<div class="sender">${esc(p.sender)}</div>` : ''}
    <h2>${esc(p.title)}</h2>
    <div class="doc">${esc(p.body)}</div>
    <div class="choices">${choices}</div>
  </section></div>`;
});

/** The Bilanz: days, the living and the dead, laws, path, places, and the closing paragraph. */
function bilanz(app: App): string {
  const s = app.s;
  const c = census(s);
  const causes = Object.entries(s.deaths);
  const laws = s.laws.signed.map((id) => LAWS[id]?.name ?? id);
  const rows: [string, string][] = [
    ['Tage überlebt', `${dayOf(s.time)} von 35`],
    ['Lebend', `${fmt(c.total)} (Arbeiter ${fmt(c.workers)}, Fachkräfte ${fmt(c.engineers)}, Kinder ${fmt(c.children)})`],
    ['Tot', `${fmt(s.dead)}${causes.length ? ' · ' + causes.map(([k, n]) => `${CAUSES[k] ?? k} ${fmt(n)}`).join(', ') : ''}`],
    ['Gesetze', laws.length ? laws.join(', ') : 'keine'],
    ['Weg', s.laws.path ? PATHS[s.laws.path] : 'keiner'],
    ['Orte erkundet', `${fmt(s.explored.length)} von ${fmt(Object.keys(SITES).length)}`],
  ];
  return `<div class="modal"><section class="modal-card" role="dialog" aria-label="Bilanz">
    <div class="sender">Bilanz · Winter 1946/47</div>
    <h2>${esc(ENDS[s.outcome ?? ''] ?? 'Bilanz')}</h2>
    <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="doc">${esc(closing(s))}</div>
    <div class="choices"><button class="choice" data-act="newGame">Neues Spiel<small>Ein neuer Winter, derselbe Kessel</small></button></div>
  </section></div>`;
}

ACTIONS.choose = (app, arg) => {
  resolveEvent(app.s, Number(arg));
};
