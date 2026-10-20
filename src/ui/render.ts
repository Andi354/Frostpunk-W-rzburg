import { CRATER_RADIUS, GRID, RINGS, RING_WIDTH, type Cell } from '../sim/grid';
import { def } from '../sim/data/buildings';
import { cellTemp, genHeat, genRange, heatLevel } from '../sim/heat';
import type { Building, GameState } from '../sim/types';
import { outsideTemp, snowIntensity, dayOf, isStorm } from '../sim/weather';
import type { Camera } from './camera';

// ── palette for the canvas (kept in step with the CSS tokens) ──
const C = {
  snow: '#dfe6ea',
  snowShade: '#b9c6cf',
  road: 'rgba(92, 84, 78, 0.28)',
  plaza: '#8d8a86',
  ember: '#ff8a3d',
  emberSoft: 'rgba(255, 138, 61, 0.55)',
  night: 'rgba(7, 11, 22, 1)',
  heat: ['rgba(64, 120, 210, 0.42)', 'rgba(110, 170, 225, 0.36)', 'rgba(190, 215, 235, 0.25)', 'rgba(255, 186, 110, 0.32)', 'rgba(255, 120, 50, 0.38)'],
};

export interface Visual {
  roof: 'tent' | 'gable' | 'nissen' | 'flat' | 'works' | 'tower' | 'none';
  wall: string;
  roofColor: string;
  accent?: string;
  sign?: 'cross' | 'gear' | 'pot' | 'flame' | 'book' | 'mug' | 'antenna' | 'shield' | 'church' | 'grave' | 'glass';
  chimney?: boolean;
  w?: number; // footprint factor (tangential)
  d?: number; // footprint factor (radial)
}

export const VISUALS: Record<string, Visual> = {};

function hash(n: number): () => number {
  let x = (n * 2654435761) >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

interface Flake {
  x: number;
  y: number;
  s: number;
  v: number;
}
interface Smoke {
  x: number;
  y: number;
  r: number;
  a: number;
  vx: number;
  vy: number;
}

export interface RenderOptions {
  selected: number | null; // cell id
  heatView: boolean;
  placing: string | null; // building type being placed
  validCells: Set<number> | null;
  visualTime: number; // fractional hours
}

const EXTENT = 860;
const TERRAIN_SCALE = 1;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private terrain: HTMLCanvasElement;
  private mask: HTMLCanvasElement;
  private frost: HTMLCanvasElement | null = null;
  private flakes: Flake[] = [];
  private smoke: Smoke[] = [];
  private dpr = 1;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.terrain = this.buildTerrain();
    this.mask = document.createElement('canvas');
    for (let i = 0; i < 520; i++) this.flakes.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 2.2, v: 0.4 + Math.random() });
  }

  resize(cam: Camera): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cam.w * this.dpr);
    const h = Math.round(cam.h * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.mask.width = w;
      this.mask.height = h;
      this.frost = this.buildFrost(w, h);
    }
  }

  // ── static terrain: snowfield, crater wall, ring paths, the edge toward the Main valley ──
  private buildTerrain(): HTMLCanvasElement {
    const size = EXTENT * 2 * TERRAIN_SCALE;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const g = cv.getContext('2d')!;
    g.scale(TERRAIN_SCALE, TERRAIN_SCALE);
    g.translate(EXTENT, EXTENT);
    const rnd = hash(7);

    // plateau snow
    const bg = g.createRadialGradient(0, 0, 60, 0, 0, EXTENT * 1.2);
    bg.addColorStop(0, '#e8edf0');
    bg.addColorStop(0.55, '#d6dee3');
    bg.addColorStop(1, '#a9b6bf');
    g.fillStyle = bg;
    g.fillRect(-EXTENT, -EXTENT, EXTENT * 2, EXTENT * 2);

    // west: the plateau breaks off toward the Main valley and the ruined city
    const edgeX = -600;
    const slope = g.createLinearGradient(edgeX + 60, 0, -EXTENT, 0);
    slope.addColorStop(0, 'rgba(60, 70, 82, 0)');
    slope.addColorStop(0.35, 'rgba(60, 70, 82, 0.45)');
    slope.addColorStop(1, 'rgba(28, 34, 44, 0.9)');
    g.fillStyle = slope;
    g.fillRect(-EXTENT, -EXTENT, EXTENT + edgeX + 60, EXTENT * 2);
    // frozen Main, far below
    g.strokeStyle = 'rgba(200, 220, 235, 0.55)';
    g.lineWidth = 18;
    g.beginPath();
    g.moveTo(-820, -EXTENT);
    g.bezierCurveTo(-760, -300, -840, 200, -780, EXTENT);
    g.stroke();
    // ruin blocks of the old town
    for (let i = 0; i < 160; i++) {
      const x = -760 + rnd() * 120;
      const y = -500 + rnd() * 1000;
      g.fillStyle = `rgba(20, 24, 30, ${0.25 + rnd() * 0.3})`;
      g.fillRect(x, y, 6 + rnd() * 16, 4 + rnd() * 12);
    }
    g.save();
    g.fillStyle = 'rgba(230, 236, 240, 0.75)';
    g.font = '600 15px "Barlow Condensed", sans-serif';
    g.textAlign = 'center';
    g.translate(-700, 0);
    g.rotate(-Math.PI / 2);
    g.fillText('ABHANG ZUM MAINTAL · WÜRZBURG', 0, 0);
    g.restore();

    // speckle and wind-drift texture
    for (let i = 0; i < 9000; i++) {
      const x = (rnd() - 0.5) * EXTENT * 2;
      const y = (rnd() - 0.5) * EXTENT * 2;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(120,135,150,0.10)';
      g.fillRect(x, y, 1 + rnd() * 2, 1);
    }
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 260; i++) {
      const x = (rnd() - 0.5) * EXTENT * 2;
      const y = (rnd() - 0.5) * EXTENT * 2;
      const l = 20 + rnd() * 60;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + l / 2, y - 4, x + l, y + 2);
      g.stroke();
    }

    // crater wall: a shaded band beyond the outermost ring
    const rimIn = CRATER_RADIUS + RINGS * RING_WIDTH + 14;
    const rim = g.createRadialGradient(0, 0, rimIn, 0, 0, rimIn + 70);
    rim.addColorStop(0, 'rgba(70, 80, 92, 0.0)');
    rim.addColorStop(0.25, 'rgba(70, 80, 92, 0.38)');
    rim.addColorStop(0.6, 'rgba(240, 245, 248, 0.5)');
    rim.addColorStop(1, 'rgba(240, 245, 248, 0)');
    g.fillStyle = rim;
    g.beginPath();
    g.arc(0, 0, rimIn + 70, 0, Math.PI * 2);
    g.arc(0, 0, rimIn, 0, Math.PI * 2, true);
    g.fill();
    for (let i = 0; i < 140; i++) {
      const a = rnd() * Math.PI * 2;
      const r = rimIn + 8 + rnd() * 40;
      g.fillStyle = `rgba(60, 66, 74, ${0.25 + rnd() * 0.35})`;
      g.beginPath();
      g.ellipse(Math.cos(a) * r, Math.sin(a) * r, 3 + rnd() * 7, 2 + rnd() * 4, a, 0, Math.PI * 2);
      g.fill();
    }

    // trodden ring paths and short radial lanes
    g.strokeStyle = C.road;
    for (let k = 0; k <= RINGS; k++) {
      g.lineWidth = k === 0 ? 10 : 6;
      g.beginPath();
      g.arc(0, 0, CRATER_RADIUS + k * RING_WIDTH, 0, Math.PI * 2);
      g.stroke();
    }
    g.lineWidth = 3;
    for (const c of GRID) {
      g.beginPath();
      g.moveTo(Math.cos(c.a0) * c.r0, Math.sin(c.a0) * c.r0);
      g.lineTo(Math.cos(c.a0) * c.r1, Math.sin(c.a0) * c.r1);
      g.stroke();
    }

    // cobbled plaza
    g.fillStyle = C.plaza;
    g.beginPath();
    g.arc(0, 0, CRATER_RADIUS - 4, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 420; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * (CRATER_RADIUS - 8);
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(40,36,34,0.18)';
      g.fillRect(Math.cos(a) * r, Math.sin(a) * r, 4, 3);
    }
    return cv;
  }

  private buildFrost(w: number, h: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    grad.addColorStop(0, 'rgba(220, 235, 245, 0)');
    grad.addColorStop(0.7, 'rgba(210, 230, 245, 0.35)');
    grad.addColorStop(1, 'rgba(235, 245, 252, 0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // ice ferns creeping in from the edges
    const rnd = hash(99);
    g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    g.lineCap = 'round';
    const fern = (x: number, y: number, a: number, len: number, depth: number) => {
      if (depth <= 0 || len < 4) return;
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      g.lineWidth = depth * 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      fern(x2, y2, a + 0.5 + rnd() * 0.3, len * 0.62, depth - 1);
      fern(x2, y2, a - 0.5 - rnd() * 0.3, len * 0.62, depth - 1);
      fern(x2, y2, a + (rnd() - 0.5) * 0.3, len * 0.75, depth - 1);
    };
    const n = 26;
    for (let i = 0; i < n; i++) {
      const side = i % 4;
      const t = rnd();
      const L = Math.min(w, h) * (0.05 + rnd() * 0.07);
      if (side === 0) fern(t * w, 0, Math.PI / 2 + (rnd() - 0.5), L, 4);
      if (side === 1) fern(t * w, h, -Math.PI / 2 + (rnd() - 0.5), L, 4);
      if (side === 2) fern(0, t * h, (rnd() - 0.5), L, 4);
      if (side === 3) fern(w, t * h, Math.PI + (rnd() - 0.5), L, 4);
    }
    return cv;
  }

  // ── frame ──
  draw(s: GameState, cam: Camera, o: RenderOptions, now: number): void {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const g = this.ctx;
    const dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#9fadb7';
    g.fillRect(0, 0, cam.w, cam.h);

    // world transform
    g.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.w / 2 - cam.x * cam.zoom), dpr * (cam.h / 2 - cam.y * cam.zoom));
    g.imageSmoothingEnabled = true;
    g.drawImage(this.terrain, -EXTENT, -EXTENT, EXTENT * 2, EXTENT * 2);

    const temp = outsideTemp(o.visualTime);
    const range = genRange(s);
    // boiler range: faint warm disc on the snow
    if (s.gen.on) {
      const rr = CRATER_RADIUS + range * RING_WIDTH;
      const warm = g.createRadialGradient(0, 0, CRATER_RADIUS, 0, 0, rr);
      warm.addColorStop(0, 'rgba(200, 170, 140, 0.22)');
      warm.addColorStop(1, 'rgba(200, 170, 140, 0)');
      g.fillStyle = warm;
      g.beginPath();
      g.arc(0, 0, rr, 0, Math.PI * 2);
      g.fill();
    }

    if (o.heatView || o.placing) this.drawHeat(s, temp, o);

    const byCell = new Map<number, Building>();
    for (const b of s.buildings) byCell.set(b.cell, b);
    const night = nightFactor(o.visualTime);

    // shadows are cast toward the north-west in the low winter light
    g.shadowColor = 'rgba(30, 40, 55, 0.35)';
    g.shadowBlur = 4 * dpr * cam.zoom;
    g.shadowOffsetX = -3 * dpr * cam.zoom;
    g.shadowOffsetY = -3 * dpr * cam.zoom;
    for (const c of GRID) {
      const b = byCell.get(c.id);
      if (b) this.drawThing(b, c, night);
    }
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    g.shadowOffsetY = 0;

    this.drawBoiler(s, now);
    this.updateSmoke(s, byCell, dt);
    this.drawSmoke();

    if (o.selected !== null) this.outlineCell(GRID[o.selected], 'rgba(255, 138, 61, 0.95)', 3);

    // ── screen space ──
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawNight(s, cam, byCell, o.heatView || o.placing ? night * 0.45 : night, now);
    this.drawSnow(cam, o.visualTime, dt);
    const frostAmt = Math.max(0, Math.min(1, (-temp - 28) / 45));
    if (this.frost && frostAmt > 0) {
      g.globalAlpha = frostAmt;
      g.drawImage(this.frost, 0, 0, cam.w, cam.h);
      g.globalAlpha = 1;
    }
    if (isStorm(dayOf(o.visualTime))) {
      g.fillStyle = 'rgba(225, 235, 242, 0.18)';
      g.fillRect(0, 0, cam.w, cam.h);
    }
  }

  private drawHeat(s: GameState, temp: number, o: RenderOptions): void {
    const g = this.ctx;
    for (const c of GRID) {
      const lv = heatLevel(cellTemp(s, c.id, temp));
      let color = C.heat[lv];
      if (o.validCells && o.placing) color = o.validCells.has(c.id) ? color : 'rgba(40, 40, 46, 0.25)';
      g.fillStyle = color;
      sector(g, c, 2);
      g.fill();
    }
  }

  private outlineCell(c: Cell, color: string, width: number): void {
    const g = this.ctx;
    g.strokeStyle = color;
    g.lineWidth = width;
    sector(g, c, 3);
    g.stroke();
  }

  private drawThing(b: Building, c: Cell, night: number): void {
    const d = def(b.type);
    if (d.category === 'pile') return this.drawPile(b, c);
    if (d.category === 'deposit') return this.drawDeposit(b, c);
    this.drawBuilding(b, c, night);
  }

  private frame(c: Cell): { am: number; w: number; d: number } {
    const am = (c.a0 + c.a1) / 2;
    const rm = (c.r0 + c.r1) / 2;
    const arc = (c.a1 - c.a0) * rm;
    return { am, w: arc * 0.74, d: RING_WIDTH * 0.66 };
  }

  private drawPile(b: Building, c: Cell): void {
    const g = this.ctx;
    const rnd = hash(b.id * 31 + 7);
    const { am } = this.frame(c);
    const amount = b.amount ?? 0;
    const k = Math.max(0.35, Math.min(1, amount / 120));
    g.save();
    g.translate(c.x, c.y);
    g.rotate(am + Math.PI / 2);
    const n = Math.round(6 + 10 * k);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - 0.5) * 40 * k;
      const y = (rnd() - 0.5) * 30 * k;
      const r = 4 + rnd() * 7 * k;
      switch (b.type) {
        case 'pile_coal':
          g.fillStyle = rnd() < 0.3 ? '#3a3a3e' : '#1d1d21';
          g.beginPath();
          g.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
          g.fill();
          break;
        case 'pile_wood':
          g.strokeStyle = rnd() < 0.5 ? '#6b4a30' : '#8a6142';
          g.lineWidth = 3 + rnd() * 2;
          g.beginPath();
          g.moveTo(x - r * 1.6, y);
          g.lineTo(x + r * 1.6, y + (rnd() - 0.5) * 6);
          g.stroke();
          break;
        case 'pile_steel':
          g.strokeStyle = rnd() < 0.5 ? '#6f7880' : '#4c535a';
          g.lineWidth = 2.5;
          g.beginPath();
          g.moveTo(x - r * 1.8, y - r);
          g.lineTo(x + r * 1.8, y + r);
          g.stroke();
          if (i === 0) {
            // a wing of the wreck
            g.fillStyle = '#7d868d';
            g.beginPath();
            g.moveTo(-18 * k, -4);
            g.lineTo(20 * k, -10 * k);
            g.lineTo(22 * k, -4 * k);
            g.lineTo(-16 * k, 4);
            g.closePath();
            g.fill();
          }
          break;
        case 'pile_food':
          g.fillStyle = rnd() < 0.5 ? '#8c7a52' : '#a08c5e';
          g.fillRect(x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2);
          g.strokeStyle = 'rgba(40,30,20,0.5)';
          g.lineWidth = 0.8;
          g.strokeRect(x - r * 0.8, y - r * 0.6, r * 1.6, r * 1.2);
          break;
        default:
          g.fillStyle = ['#8b6f5e', '#7a6a62', '#9a8a7c', '#6e5a4e'][Math.floor(rnd() * 4)];
          g.beginPath();
          g.moveTo(x - r, y);
          g.lineTo(x - r * 0.3, y - r * 0.8);
          g.lineTo(x + r, y - r * 0.2);
          g.lineTo(x + r * 0.5, y + r * 0.7);
          g.closePath();
          g.fill();
      }
      // snow caps
      if (rnd() < 0.6) {
        g.fillStyle = 'rgba(245, 248, 250, 0.85)';
        g.beginPath();
        g.ellipse(x, y - r * 0.4, r * 0.6, r * 0.3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  }

  private drawDeposit(b: Building, c: Cell): void {
    const g = this.ctx;
    const rnd = hash(b.id * 13 + 3);
    const { am, w, d } = this.frame(c);
    g.save();
    g.translate(c.x, c.y);
    g.rotate(am + Math.PI / 2);
    if (b.type === 'dep_wood') {
      for (let i = 0; i < 9; i++) {
        const x = (rnd() - 0.5) * w;
        const y = (rnd() - 0.5) * d;
        const r = 6 + rnd() * 6;
        g.fillStyle = '#3e4a46';
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(240, 245, 248, 0.85)';
        g.beginPath();
        g.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
        g.fill();
      }
    } else if (b.type === 'dep_coal') {
      g.fillStyle = '#2b2a2d';
      g.beginPath();
      g.ellipse(0, 0, w * 0.42, d * 0.36, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#121214';
      g.beginPath();
      g.ellipse(0, 2, w * 0.18, d * 0.16, 0, 0, Math.PI * 2);
      g.fill();
    } else if (b.type === 'dep_steel') {
      g.strokeStyle = '#59616a';
      g.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const x = -w * 0.4 + (i * w * 0.8) / 4;
        g.beginPath();
        g.arc(x, d * 0.25, d * 0.4, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      }
    } else {
      g.fillStyle = '#7d6d62';
      for (let i = 0; i < 5; i++) {
        const x = (rnd() - 0.5) * w * 0.8;
        const y = (rnd() - 0.5) * d * 0.8;
        g.fillRect(x, y, 4 + rnd() * 12, 3);
        g.fillRect(x, y, 3, 4 + rnd() * 10);
      }
    }
    g.restore();
  }

  private drawBuilding(b: Building, c: Cell, night: number): void {
    const g = this.ctx;
    const v = VISUALS[b.type] ?? { roof: 'gable', wall: '#6d625a', roofColor: '#c9d2d8' };
    const f = this.frame(c);
    const w = f.w * (v.w ?? 1);
    const d = f.d * (v.d ?? 1);
    g.save();
    g.translate(c.x, c.y);
    g.rotate(f.am + Math.PI / 2); // local +y points toward the boiler

    if (b.built < 1) {
      // construction site: scaffold outline and a growing frame
      g.strokeStyle = '#6b4a30';
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      g.strokeRect(-w / 2, -d / 2, w, d);
      g.setLineDash([]);
      g.fillStyle = 'rgba(107, 74, 48, 0.55)';
      g.fillRect(-w / 2, -d / 2, w * b.built, d);
      g.restore();
      return;
    }

    // outward wall strip suggests height
    g.fillStyle = v.wall;
    g.fillRect(-w / 2, -d / 2 - 4, w, d + 4);
    switch (v.roof) {
      case 'tent': {
        g.fillStyle = '#b9ab8f';
        g.beginPath();
        g.moveTo(-w / 2, d / 2);
        g.lineTo(0, -d / 2);
        g.lineTo(0, d / 2);
        g.fill();
        g.fillStyle = '#9a8c72';
        g.beginPath();
        g.moveTo(w / 2, d / 2);
        g.lineTo(0, -d / 2);
        g.lineTo(0, d / 2);
        g.fill();
        g.fillStyle = 'rgba(240,244,247,0.7)';
        g.beginPath();
        g.moveTo(-w / 6, -d / 6);
        g.lineTo(0, -d / 2);
        g.lineTo(w / 6, -d / 6);
        g.fill();
        break;
      }
      case 'nissen': {
        const grad = g.createLinearGradient(0, -d / 2, 0, d / 2);
        grad.addColorStop(0, '#6c747a');
        grad.addColorStop(0.45, '#e6ecef');
        grad.addColorStop(1, '#8b949a');
        g.fillStyle = grad;
        g.fillRect(-w / 2, -d / 2, w, d);
        g.strokeStyle = 'rgba(60,66,72,0.35)';
        g.lineWidth = 1;
        for (let x = -w / 2 + 4; x < w / 2; x += 4) {
          g.beginPath();
          g.moveTo(x, -d / 2);
          g.lineTo(x, d / 2);
          g.stroke();
        }
        break;
      }
      case 'flat':
      case 'works': {
        g.fillStyle = v.roofColor;
        g.fillRect(-w / 2, -d / 2, w, d);
        g.strokeStyle = 'rgba(50,50,56,0.45)';
        g.lineWidth = 2;
        g.strokeRect(-w / 2 + 1, -d / 2 + 1, w - 2, d - 2);
        if (v.roof === 'works') {
          g.fillStyle = 'rgba(80,86,92,0.55)';
          for (let x = -w / 2 + 3; x < w / 2 - 6; x += 9) g.fillRect(x, -d / 2 + 3, 5, d - 6);
        }
        break;
      }
      case 'tower': {
        g.fillStyle = v.roofColor;
        g.beginPath();
        g.arc(0, 0, Math.min(w, d) * 0.48, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(40,40,46,0.6)';
        g.lineWidth = 2;
        g.stroke();
        break;
      }
      case 'none':
        break;
      default: {
        // gable roof with snow; ridge runs tangentially
        g.fillStyle = shade(v.roofColor, 1.05);
        g.fillRect(-w / 2, -d / 2, w, d / 2);
        g.fillStyle = shade(v.roofColor, 0.82);
        g.fillRect(-w / 2, 0, w, d / 2);
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-w / 2, 0);
        g.lineTo(w / 2, 0);
        g.stroke();
      }
    }

    if (v.chimney) {
      g.fillStyle = '#4a3a33';
      g.fillRect(w * 0.25, -d * 0.35, 6, 6);
    }
    if (v.sign) drawSign(g, v.sign, v.accent ?? '#c0392b', -w * 0.28, d * 0.12);

    // windows glow at night when the building is in use
    const active = b.workers.length > 0 || def(b.type).category === 'housing';
    if (night > 0.2 && active && b.on) {
      g.fillStyle = `rgba(255, 170, 80, ${0.35 + night * 0.55})`;
      for (let i = 0; i < 3; i++) g.fillRect(-w / 2 + 5 + i * (w / 3), d / 2 - 3, 5, 3);
    }
    g.restore();
  }

  private drawBoiler(s: GameState, now: number): void {
    const g = this.ctx;
    const heat = genHeat(s);
    const pulse = s.gen.on ? 0.75 + 0.25 * Math.sin(now / (s.gen.overdrive ? 120 : 380)) : 0;
    // district heating pipes
    g.strokeStyle = '#4b4440';
    g.lineWidth = 7;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 44, Math.sin(a) * 44);
      g.lineTo(Math.cos(a) * (CRATER_RADIUS - 6), Math.sin(a) * (CRATER_RADIUS - 6));
      g.stroke();
    }
    // brick boiler house
    g.fillStyle = '#7a4b3a';
    g.beginPath();
    g.arc(0, 0, 46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40, 24, 18, 0.5)';
    g.lineWidth = 1;
    for (let r = 14; r < 46; r += 6) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    // iron ring with rivets
    g.strokeStyle = '#2f2c2b';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, 44, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#b8955a';
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath();
      g.arc(Math.cos(a) * 44, Math.sin(a) * 44, 1.6, 0, Math.PI * 2);
      g.fill();
    }
    // chimney mouth with the fire below
    const glow = g.createRadialGradient(0, 0, 2, 0, 0, 24);
    glow.addColorStop(0, s.gen.on ? `rgba(255, 220, 150, ${pulse})` : '#1a1a1c');
    glow.addColorStop(0.5, s.gen.on ? `rgba(255, 120, 40, ${0.8 * pulse})` : '#202022');
    glow.addColorStop(1, '#141416');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, 20, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3c3532';
    g.lineWidth = 5;
    g.stroke();
    if (heat > 40) {
      g.strokeStyle = `rgba(255, 90, 40, ${0.4 + 0.4 * Math.sin(now / 90)})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 50, 0, Math.PI * 2);
      g.stroke();
    }
  }

  private updateSmoke(s: GameState, byCell: Map<number, Building>, dt: number): void {
    const wind = isStorm(dayOf(s.time)) ? 70 : 22;
    if (s.gen.on && Math.random() < dt * (s.gen.level * 9 + (s.gen.overdrive ? 12 : 0))) {
      this.smoke.push({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8, r: 10, a: 0.5, vx: wind, vy: -6 });
    }
    if (this.smoke.length < 220) {
      for (const b of byCell.values()) {
        const v = VISUALS[b.type];
        if (!v?.chimney || b.built < 1 || !b.on) continue;
        if (Math.random() < dt * 0.8) {
          const c = GRID[b.cell];
          this.smoke.push({ x: c.x, y: c.y, r: 3, a: 0.35, vx: wind * 0.7, vy: -3 });
        }
      }
    }
    for (const p of this.smoke) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 9;
      p.a -= dt * 0.09;
    }
    this.smoke = this.smoke.filter((p) => p.a > 0);
  }

  private drawSmoke(): void {
    const g = this.ctx;
    for (const p of this.smoke) {
      g.fillStyle = `rgba(70, 72, 78, ${p.a * 0.5})`;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawNight(s: GameState, cam: Camera, byCell: Map<number, Building>, night: number, now: number): void {
    const darkness = 0.1 + night * 0.5;
    const m = this.mask.getContext('2d')!;
    const dpr = this.dpr;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.globalCompositeOperation = 'source-over';
    m.clearRect(0, 0, this.mask.width, this.mask.height);
    m.fillStyle = `rgba(8, 13, 26, ${darkness})`;
    m.fillRect(0, 0, this.mask.width, this.mask.height);
    m.globalCompositeOperation = 'destination-out';
    const sx = (wx: number) => ((wx - cam.x) * cam.zoom + cam.w / 2) * dpr;
    const sy = (wy: number) => ((wy - cam.y) * cam.zoom + cam.h / 2) * dpr;
    const light = (x: number, y: number, r: number, a: number) => {
      const gr = m.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      m.fillStyle = gr;
      m.beginPath();
      m.arc(x, y, r, 0, Math.PI * 2);
      m.fill();
    };
    if (s.gen.on) {
      const flick = 0.92 + 0.08 * Math.sin(now / 170);
      light(sx(0), sy(0), (CRATER_RADIUS + genRange(s) * RING_WIDTH * 0.9) * cam.zoom * dpr, 0.85 * flick);
    }
    for (const b of byCell.values()) {
      const d = def(b.type);
      if (b.built < 1 || d.category === 'pile' || d.category === 'deposit') continue;
      const lit = (b.workers.length > 0 || d.category === 'housing' || d.heat) && b.on;
      if (!lit) continue;
      const c = GRID[b.cell];
      light(sx(c.x), sy(c.y), (d.heat ? 90 : 34) * cam.zoom * dpr, 0.7);
    }
    const g = this.ctx;
    g.drawImage(this.mask, 0, 0, cam.w, cam.h);
    // warm bloom over the boiler
    if (s.gen.on && night > 0.1) {
      g.globalCompositeOperation = 'lighter';
      const p = toScr(cam, 0, 0);
      const r = 120 * cam.zoom;
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      gr.addColorStop(0, `rgba(255, 140, 60, ${0.35 * night})`);
      gr.addColorStop(1, 'rgba(255, 140, 60, 0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawSnow(cam: Camera, time: number, dt: number): void {
    const g = this.ctx;
    const inten = snowIntensity(time);
    const storm = isStorm(dayOf(time));
    const count = Math.floor(this.flakes.length * (0.25 + inten * 0.75));
    const wind = storm ? 0.9 : 0.12;
    g.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let i = 0; i < count; i++) {
      const f = this.flakes[i];
      f.y += (f.v * 0.12 + inten * 0.08) * dt * (storm ? 2.5 : 1);
      f.x += (wind + Math.sin(f.y * 12 + i) * 0.02) * dt * f.v * 0.6;
      if (f.y > 1) f.y -= 1;
      if (f.x > 1) f.x -= 1;
      if (f.x < 0) f.x += 1;
      const x = f.x * cam.w;
      const y = f.y * cam.h;
      if (storm) {
        g.fillRect(x, y, f.s * 5, f.s * 0.7);
      } else {
        g.fillRect(x, y, f.s, f.s);
      }
    }
  }
}

function toScr(cam: Camera, x: number, y: number) {
  return { x: (x - cam.x) * cam.zoom + cam.w / 2, y: (y - cam.y) * cam.zoom + cam.h / 2 };
}

export function nightFactor(time: number): number {
  const h = time % 24;
  if (h >= 8.5 && h <= 15.5) return 0;
  if (h >= 18 || h <= 6) return 1;
  if (h < 8.5) return (8.5 - h) / 2.5;
  return (h - 15.5) / 2.5;
}

function sector(g: CanvasRenderingContext2D, c: Cell, inset: number): void {
  const da = inset / ((c.r0 + c.r1) / 2);
  g.beginPath();
  g.arc(0, 0, c.r1 - inset, c.a0 + da, c.a1 - da);
  g.arc(0, 0, c.r0 + inset, c.a1 - da, c.a0 + da, true);
  g.closePath();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const gg = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return `rgb(${r},${gg},${b})`;
}

function drawSign(g: CanvasRenderingContext2D, sign: NonNullable<Visual['sign']>, accent: string, x: number, y: number): void {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#f1ede4';
  g.beginPath();
  g.arc(0, 0, 6.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = accent;
  g.strokeStyle = accent;
  g.lineWidth = 1.6;
  switch (sign) {
    case 'cross':
      g.fillRect(-1.5, -4.5, 3, 9);
      g.fillRect(-4.5, -1.5, 9, 3);
      break;
    case 'church':
      g.fillRect(-0.8, -5, 1.6, 10);
      g.fillRect(-3.2, -2.6, 6.4, 1.6);
      break;
    case 'gear':
      g.beginPath();
      g.arc(0, 0, 3.5, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.fillRect(Math.cos(a) * 4 - 1, Math.sin(a) * 4 - 1, 2, 2);
      }
      break;
    case 'pot':
      g.fillRect(-4, -1, 8, 4);
      g.fillRect(-5, -2, 10, 1.5);
      break;
    case 'flame':
      g.beginPath();
      g.moveTo(0, -5);
      g.quadraticCurveTo(4, 0, 0, 4.5);
      g.quadraticCurveTo(-4, 0, 0, -5);
      g.fill();
      break;
    case 'antenna':
      g.beginPath();
      g.moveTo(0, 5);
      g.lineTo(0, -4);
      g.moveTo(-3, -1);
      g.lineTo(3, -1);
      g.stroke();
      break;
    case 'shield':
      g.beginPath();
      g.moveTo(-4, -4);
      g.lineTo(4, -4);
      g.lineTo(4, 0);
      g.quadraticCurveTo(0, 5, -4, 0);
      g.closePath();
      g.fill();
      break;
    case 'grave':
      g.fillRect(-0.8, -4.5, 1.6, 9);
      g.fillRect(-3, -2, 6, 1.4);
      break;
    case 'mug':
      g.fillRect(-3, -3, 5, 6);
      g.strokeRect(2, -1.5, 2, 3);
      break;
    case 'glass':
      g.strokeRect(-3.5, -3.5, 7, 7);
      g.beginPath();
      g.moveTo(0, -3.5);
      g.lineTo(0, 3.5);
      g.stroke();
      break;
    case 'book':
      g.fillRect(-4, -3, 3.6, 6);
      g.fillRect(0.4, -3, 3.6, 6);
      break;
  }
  g.restore();
}
