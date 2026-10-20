import { newGame } from '../../sim/state';
import type { GameState } from '../../sim/types';
import { dayOf } from '../../sim/weather';
import { ACTIONS, HOOKS, type App } from '../app';
import { hasSave, readSave, writeSave } from '../persist';
import { setSound } from '../sound';

/** Extra buttons on the title screen (continue a saved game …). */
export const TITLE_EXTRA: ((app: App) => string)[] = [];

TITLE_EXTRA.push(() => {
  const s = readSave();
  return s ? `<button class="btn primary" data-act="continueGame">Fortsetzen (Tag ${dayOf(s.time)})</button>` : '';
});

HOOKS.modal.unshift((app) => {
  if (!app.title) return null;
  return `<div class="title">
    <div class="kicker">Winter 1946/47 · Hubland</div>
    <h1>Würzburger<span>Kessel</span></h1>
    <p>Am 16. März 1945 ist Würzburg verbrannt. Jetzt kommt ein Winter, der nicht mehr aufhört. Die letzten Würzburger ziehen hinauf aufs Hubland, zu einem verlassenen Heizwerk in einem Krater. Halte sie am Leben, bis der Frost bricht.</p>
    <div class="actions">
      ${TITLE_EXTRA.map((f) => f(app)).join('')}
      <button class="btn primary" data-act="askNewGame">${app.armed === 'newgame' ? 'Wirklich neu beginnen?' : 'Neues Spiel'}</button>
    </div>
  </div>`;
});

/** Starts a fresh winter, writes it as the save and turns the sound on (the tap allows it). */
export function startNewGame(app: App): void {
  const s: GameState = newGame(Math.floor(Math.random() * 1e9));
  app.setState(s);
  app.title = false;
  app.speed = 1;
  app.armed = null;
  writeSave(s);
  setSound(true);
}

// Bilanz (after an outcome) starts a new game at once; the title and the menu ask first when a game would be lost.
ACTIONS.newGame = (app) => startNewGame(app);

ACTIONS.askNewGame = (app) => {
  const running = !app.title && !app.s.outcome;
  if (!running && !hasSave()) return startNewGame(app);
  if (app.armed === 'newgame') return startNewGame(app);
  app.armed = 'newgame';
};

ACTIONS.continueGame = (app) => {
  const s = readSave();
  if (!s) return;
  app.setState(s);
  app.title = false;
  app.speed = 1;
  setSound(true);
};
