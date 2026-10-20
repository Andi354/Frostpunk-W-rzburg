# Würzburger Kessel

A survival city builder for the phone browser: Würzburg in the winter of 1946/47, and the winter does not end.
The last survivors gather around an abandoned heating plant in a crater on the Hubland.

Play: open `dist/wuerzburger-kessel-<version>.html` in any browser (one self-contained file).

## Technical reference

- Stack: TypeScript, Vite, Canvas 2D; built into one HTML file (`vite-plugin-singlefile`).
- `src/sim/`: the simulation, pure TypeScript without DOM (state, rules, data). Deterministic with a seeded RNG.
- `src/ui/`: canvas renderer and DOM panels.
- `test/`: Vitest unit tests for the simulation; `test/browser/`: Playwright tests (headless Chromium, phone viewport).
