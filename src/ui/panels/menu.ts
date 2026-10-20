import { ACTIONS, PANELS, esc } from '../app';
import { icon } from '../icons';
import { setSound, soundOn } from '../sound';

const VERSION = 'v0.1.0';

const GUIDE: [string, string][] = [
  ['Kessel', 'Der Kessel im Krater wärmt die Siedlung. Ohne Kohle erlischt er.'],
  ['Wärme', 'Je näher ein Haus am Kessel liegt, desto wärmer. Die Wärmeansicht zeigt es.'],
  ['Bauen', 'Unter „Bauen“ ein Gebäude wählen, dann ein freies Feld antippen.'],
  ['Arbeit zuweisen', 'Ein Gebäude antippen und Leute eintragen. Ohne Arbeit läuft nichts.'],
  ['Essen', 'Die Volksküche macht aus Essen Rationen. Wer nichts isst, wird schwach.'],
  ['Krankheit', 'Kranke brauchen Pflege, am besten im Lazarett.'],
  ['Gesetze', 'Notverordnungen helfen, kosten aber etwas. Einmal unterschrieben, gelten sie.'],
  ['Erkundung', 'Trupps ziehen in die Stadt und ins Umland. Sie bringen Vorräte und Menschen, manchmal auch Gefahr.'],
];

PANELS.menu = (app) => {
  const on = soundOn();
  const armed = app.armed === 'newgame';
  return {
    title: 'Menü',
    sub: 'Winter 1946/47',
    body: `
      <div class="seg">
        <button class="btn" data-act="sound" aria-pressed="${on}">${icon(on ? 'sound' : 'mute')}${on ? 'Ton aus' : 'Ton an'}</button>
      </div>
      <p class="hint">Tempo: Die Knöpfe oben rechts steuern die Zeit. Pause hält alles an.</p>
      <div>
        <div class="label">Kurzanleitung</div>
        <div class="list" style="margin-top:6px">
          ${GUIDE.map(([k, v]) => `<div class="li"><div class="grow"><b>${esc(k)}.</b> ${esc(v)}</div></div>`).join('')}
        </div>
      </div>
      <button class="btn ${armed ? 'danger' : ''}" data-act="askNewGame">${armed ? 'Wirklich neu beginnen?' : 'Neues Spiel'}</button>
      <p class="hint">${VERSION}</p>`,
  };
};

ACTIONS.sound = () => setSound(!soundOn());
