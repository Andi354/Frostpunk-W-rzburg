import './ui/styles.css';
import { newGame } from './sim/state';
import { App } from './ui/app';
import './ui/panels/title';
import './ui/panels/boiler';
import './ui/panels/cell';

const canvas = document.getElementById('map') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;
const app = new App(newGame(), canvas, ui);

// test and debugging handle
(window as unknown as { __game: App }).__game = app;
