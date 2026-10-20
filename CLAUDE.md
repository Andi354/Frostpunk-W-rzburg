# Würzburger Kessel

Survival city builder for the phone browser, set in Würzburg in an endless winter of 1946/47.

Language: game texts, chat and Linear in German; code and docs in English.

## Commands

- `npm test`: unit tests (Vitest)
- `npm run test:browser`: builds, then browser tests (Playwright, headless Chromium)
- `npm run dev`: dev server
- `npm run package`: builds `dist/wuerzburger-kessel-<version>.html` (committed, one file, the previous build is removed)

## Layout

- `src/sim/`: simulation (no DOM); `src/ui/`: renderer and panels; `test/`: tests
- `design/updates/v<version>-<shortname>/`: one folder per update
- Version: `package.json`

# Skills

> Diese Sektion bündelt projektspezifische Konfiguration für Skills, die sie
> brauchen. Jede Subsection gehört genau einem Skill; er liest nur seinen
> eigenen Abschnitt. Neue Skills fügen bei Bedarf einfach eine eigene
> Subsection hinzu, ohne bestehende anzufassen.

## job-linear

Dieser Abschnitt gehört zum Skill `job-linear` und wird von ihm gelesen.

- Linear-Projekt: Frostpunk Würzburg
- Linear-Team: Tim Andert

## sw-cycle

This section belongs to the skill `sw-cycle` and is read by it.

- Branch permission (granted by Tim): agents may push to the update branch of the current update
  (`v<version>-<shortname>-<ISSUE-ID>`) instead of an assigned session branch, and create `main`
  once in an empty repo. No other push to `main`.

## sw-implement

This section belongs to the skill `sw-implement` and is read by it.

- Tech stack: TypeScript, Vite, Canvas 2D, single-file build (`vite-plugin-singlefile`)
- Test commands: `npm test`, `npm run test:browser`
- Deliverable: one self-contained HTML file in `dist/`, also published as a claude.ai artifact for playing on the phone
