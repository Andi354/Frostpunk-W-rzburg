export interface Camera {
  x: number; // world point at screen centre
  y: number;
  zoom: number; // screen px per world unit
  w: number; // css px
  h: number;
}

export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 2.6;

export function toWorld(cam: Camera, sx: number, sy: number): { x: number; y: number } {
  return { x: cam.x + (sx - cam.w / 2) / cam.zoom, y: cam.y + (sy - cam.h / 2) / cam.zoom };
}

export function toScreen(cam: Camera, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom + cam.w / 2, y: (wy - cam.y) * cam.zoom + cam.h / 2 };
}

export function clampCamera(cam: Camera): void {
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom));
  const lim = 820;
  cam.x = Math.max(-lim, Math.min(lim, cam.x));
  cam.y = Math.max(-lim, Math.min(lim, cam.y));
}

/** Zoom around a screen point so that the world point under it stays put. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): void {
  const before = toWorld(cam, sx, sy);
  cam.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, cam.zoom * factor));
  const after = toWorld(cam, sx, sy);
  cam.x += before.x - after.x;
  cam.y += before.y - after.y;
  clampCamera(cam);
}

export interface InputHandlers {
  onTap(sx: number, sy: number): void;
  onChange(): void;
}

/** Pan with one finger, pinch with two, tap to select; wheel zoom on desktop. */
export function attachInput(el: HTMLElement, cam: Camera, h: InputHandlers): void {
  const pts = new Map<number, { x: number; y: number }>();
  let downAt = 0;
  let moved = 0;
  let pinchDist = 0;

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      downAt = performance.now();
      moved = 0;
    }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      moved = 99; // a pinch is never a tap
    }
  });

  el.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      cam.x -= (cur.x - prev.x) / cam.zoom;
      cam.y -= (cur.y - prev.y) / cam.zoom;
      moved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
      clampCamera(cam);
      h.onChange();
    }
    pts.set(e.pointerId, cur);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist > 0) {
        const r = el.getBoundingClientRect();
        zoomAt(cam, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, d / pinchDist);
        h.onChange();
      }
      pinchDist = d;
    }
  });

  const end = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0 && moved < 10 && performance.now() - downAt < 450) {
      const r = el.getBoundingClientRect();
      h.onTap(e.clientX - r.left, e.clientY - r.top);
    }
    if (pts.size < 2) pinchDist = 0;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(cam, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      h.onChange();
    },
    { passive: false },
  );
}
