import './ui/styles.css';
import './sim/index';
import { newGame } from './sim/state';
import { App } from './ui/app';
import './ui/panels/title';
import './ui/panels/boiler';
import './ui/panels/people';
import './ui/panels/research';
import './ui/panels/laws';
import './ui/panels/cell';
import './ui/panels/build';
import './ui/panels/cell-economy';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(newGame(), canvas, ui);

// test and debugging handle
(window as unknown as { __game: App }).__game = app;
