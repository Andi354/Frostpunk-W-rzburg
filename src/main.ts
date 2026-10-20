import './ui/styles.css';
import './sim/index';
import { newGame } from './sim/state';
import { App, HOOKS } from './ui/app';
import { attachPersistence, restoreHot } from './ui/persist';
import { soundTick } from './ui/sound';
import './ui/hints';
import './ui/panels/title';
import './ui/panels/boiler';
import './ui/panels/people';
import './ui/panels/research';
import './ui/panels/laws';
import './ui/panels/map';
import './ui/panels/cell';
import './ui/panels/build';
import './ui/panels/cell-economy';
import './ui/panels/events';
import './ui/panels/menu';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(newGame(), canvas, ui);
attachPersistence(app);
restoreHot(app);
HOOKS.frame.push((a) => soundTick(a.s));

// test and debugging handle
(window as unknown as { __game: App }).__game = app;
