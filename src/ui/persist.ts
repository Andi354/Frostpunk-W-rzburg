import type { GameState } from '../sim/types';
import { HOOKS, type App } from './app';

/** localStorage key of the one save slot (JSON of the whole state). */
export const SAVE_KEY = 'wuerzburger-kessel-v1';
/** Game hours between two autosaves. */
const SAVE_EVERY = 6;

/** Serialises the whole state. */
export function encodeSave(s: GameState): string {
  return JSON.stringify(s);
}

/** A version 1 state with the top-level shape the game reads, or null. */
function isState(v: unknown): v is GameState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.time === 'number' &&
    !!o.res && typeof o.res === 'object' &&
    Array.isArray(o.buildings) &&
    Array.isArray(o.people) &&
    Array.isArray(o.log) &&
    !!o.gen && !!o.research && !!o.laws && !!o.events && !!o.flags
  );
}

/** Parses a save; null when the text is missing, not JSON, or not a version 1 state. */
export function decodeSave(raw: string | null | undefined): GameState | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isState(v) ? v : null;
  } catch {
    return null;
  }
}

// ── storage: every access may fail (private window, blocked site data) ──

export function readSave(): GameState | null {
  try {
    return decodeSave(localStorage.getItem(SAVE_KEY));
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return readSave() !== null;
}

export function writeSave(s: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, encodeSave(s));
  } catch {
    /* no storage: the game simply is not saved */
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* nothing to delete */
  }
}

/** Saves a running game, or deletes the save once the game is over. */
export function persistNow(s: GameState): void {
  if (s.outcome) deleteSave();
  else writeSave(s);
}

type Hot = { snapshot?: (get: () => GameState) => void; data?: unknown };

function hot(): Hot | undefined {
  return (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;
}

/** Autosave every few game hours, on hiding the page, and the outcome removes the save. */
export function attachPersistence(app: App): void {
  let saved = { s: app.s, time: app.s.time };
  app.onHour.push((s) => {
    if (s.outcome) {
      deleteSave();
      return;
    }
    if (saved.s !== s) saved = { s, time: s.time };
    if (s.time - saved.time >= SAVE_EVERY) {
      saved.time = s.time;
      writeSave(s);
    }
  });

  let gone: GameState | null = null;
  HOOKS.frame.push((a) => {
    if (a.s.outcome && gone !== a.s) {
      gone = a.s;
      deleteSave();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !app.title && !app.s.outcome) writeSave(app.s);
  });

  hot()?.snapshot?.(() => app.s);
}

/** Hot reload: a state handed over by the dev tooling replaces the title screen. */
export function restoreHot(app: App): boolean {
  const data = hot()?.data;
  if (!isState(data)) return false;
  app.setState(data);
  app.title = false;
  return true;
}
