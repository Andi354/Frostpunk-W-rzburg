import { newGame } from '../../sim/state';
import { ACTIONS, HOOKS, type App } from '../app';

/** Extra buttons on the title screen (continue a saved game …). */
export const TITLE_EXTRA: ((app: App) => string)[] = [];

HOOKS.modal.unshift((app) => {
  if (!app.title) return null;
  return `<div class="title">
    <div class="kicker">Winter 1946/47 · Hubland</div>
    <h1>Würzburger<span>Kessel</span></h1>
    <p>Am 16. März 1945 ist Würzburg verbrannt. Jetzt kommt ein Winter, der nicht mehr aufhört. Die letzten Würzburger ziehen hinauf aufs Hubland, zu einem verlassenen Heizwerk in einem Krater. Halte sie am Leben, bis der Frost bricht.</p>
    <div class="actions">
      ${TITLE_EXTRA.map((f) => f(app)).join('')}
      <button class="btn primary" data-act="newGame">Neues Spiel</button>
    </div>
  </div>`;
});

ACTIONS.newGame = (app) => {
  app.setState(newGame(Math.floor(Math.random() * 1e9)));
  app.title = false;
  app.speed = 1;
};
