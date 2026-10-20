# v0.1.0 · Grundspiel — build spec (steps C–J)

Steps A+B are done (commit `f6cf2f6`): grid, camera, renderer, boiler, heat, weather, HUD, title, boiler sheet.
This spec is the single source for the remaining steps. Code in English, all game text in German (as written here).

## Ground rules for every step

- Read first: `CLAUDE.md`, this spec, `src/sim/types.ts`, `src/sim/state.ts`, `src/sim/sim.ts`, `src/sim/heat.ts`,
  `src/sim/data/buildings.ts`, `src/ui/app.ts`, `src/ui/panels/boiler.ts`, `src/ui/panels/cell.ts`. Follow their patterns.
- Simulation (`src/sim/`) never touches the DOM. Randomness only through `src/sim/rng.ts` with the state as holder (`chance(s, p)`).
- Systems run once per game hour: register with `SYSTEMS.push(fn)` in `src/sim/sim.ts` order (import the module in `src/sim/index.ts`, see below).
- UI: a sheet is `PANELS[id] = (app, arg) => SheetView`; buttons use `data-act`/`data-arg` and `ACTIONS[name]`; bottom bar entries via `BAR.push`;
  map taps via `HOOKS.tapCell`; modals via `HOOKS.modal`. Reuse the CSS classes in `src/ui/styles.css` (`.cards .card`, `.kv`, `.btn`,
  `.stepper`, `.list .li`, `.label`, `.desc`, `.hint`, `.tabs`, `.gauge`). Add CSS only when nothing fits; use the existing tokens.
- Escape all names with `esc()`. Numbers with `fmt()`.
- Tests: the unit tests for each step are prepared in `test/pending/<step>.test.ts`. Move the step's file to `test/` and make it green.
  Never weaken, skip or delete a test; if a test contradicts this spec, the spec wins and you fix the test minimally and say so in your report.
  Add a browser test per step in `test/browser/<step>.spec.ts` (pattern: `test/browser/map.spec.ts`, helpers in `test/browser/helpers.ts`).
- Commands: `npm test`, `npm run test:browser` (builds first). Both must be green before the commit.
- Commit once per step: `feat: <summary> (TIM-107)`, then `git push`. Branch `v0.1.0-grundspiel-TIM-107`. Never touch `main`.
  End the commit message with the two attribution lines:
  `Co-Authored-By: Claude <noreply@anthropic.com>` is NOT wanted; use exactly the lines given in your task prompt.
- Anything this spec does not decide: pick the simplest solution that fits, and add one line to
  `design/updates/v0.1.0-grundspiel/decided.md` (`- <step>: <what> (<why>)`).

### Module wiring

Create `src/sim/index.ts` in step C. It imports every sim module that registers systems, in this order:
`economy` (C), `people` (D), `research` (E), `laws` (F), `explore` (G), `story` (I). `src/main.ts` and tests import `src/sim/index.ts`
before using `advance`. Each step adds its import line.

Final hourly order inside `stepHour`: boiler → construction → production → research → people (homes, health, meals, mood) →
laws daily effects → expeditions → story/events.

### Shared helpers (create in step C, `src/sim/util.ts`)

```ts
hasLaw(s, id): boolean                       // s.laws.signed.includes(id)
isWorkHour(s): boolean                       // hour in [start, end) of workHours(s)
workHours(s): [number, number]               // [8, 18]; law 'notschicht' → [8, 22]
canAfford(s, cost: Partial<Resources>): boolean
pay(s, cost): void                           // subtracts; caller checks canAfford
refund(s, cost, factor): void
```

---

## Step C · Bauen & Rohstoffe

### Buildings (add to `BUILDINGS`, keep the piles and deposits)

| id | name | cat | cost | h | slots/staff | beds/care | ins | effect | requires |
|---|---|---|---|---|---|---|---|---|---|
| `zelt` | Zelt | housing | wood 10 | 4 | – | beds 10 | 0 | | |
| `nissen` | Nissenhütte | housing | wood 15, steel 10 | 8 | – | beds 10 | 10 | | tech `nissenhuetten` |
| `ziegelhaus` | Ziegelhaus | housing | bricks 25, wood 10 | 12 | – | beds 10 | 20 | | tech `ziegelbau` |
| `kohlengrube` | Kohlengrube | resources | wood 25, steel 10 | 12 | 10 worker | | 5 | coal 1.0 | on `dep_coal` |
| `holzfaeller` | Holzfällerei | resources | wood 15 | 8 | 10 worker | | 0 | wood 0.8 | on `dep_wood` |
| `hangar` | Schrottverwertung | resources | wood 25 | 10 | 10 worker | | 5 | steel 0.4 | on `dep_steel` |
| `truemmerbahn` | Trümmerbahn | resources | wood 20, steel 5 | 10 | 10 worker | | 0 | bricks 0.8, wood 0.1 | on `dep_rubble` |
| `koehlerei` | Köhlerei | resources | bricks 15, steel 5 | 10 | 5 worker | | 10 | wood −1.2 → coal 2.0 | tech `koehlerei` |
| `jagdhuette` | Jagdhütte | food | wood 15 | 6 | 5 worker | | 0 | food 1.6, dayOnly | |
| `kueche` | Volksküche | food | wood 20, bricks 10 | 8 | 5 any | | 10 | food −2.5 → rations 2.5 | |
| `gewaechshaus` | Gewächshaus | food | wood 20, steel 20 | 12 | 5 engineer | | 10 | food 1.4 | tech `gewaechshaus` |
| `sanitaet` | Sanitätsstation | health | wood 20 | 6 | 5 engineer | care 5 | 10 | | |
| `lazarett` | Lazarett | health | wood 30, steel 20, bricks 20 | 16 | 10 engineer | care 15 | 20 | | tech `lazarett` |
| `waermestube` | Wärmestube | heat | steel 15, bricks 10 | 8 | – | | 0 | heat +20, radius 1.6 rings, coal 2/h, switchable | tech `waermestube` |
| `werkstatt` | Werkstatt | tech | wood 25, bricks 10 | 8 | 5 engineer | | 10 | research | |
| `kundschafter` | Kundschafterposten | tech | wood 20, steel 10 | 10 | – | | 5 | expeditions, unique | tech `kundschafter` |
| `funkstation` | Funkstation | tech | steel 30, parts 3 | 16 | 2 engineer | | 10 | story, unique | tech `funk` |
| `friedhof` | Friedhof | society | wood 10 | 4 | – | | 0 | | law `friedhof` |
| `weinstube` | Weinstube „Zum Stachel“ | society | wood 20, bricks 15 | 8 | 3 any | | 15 | relief 4/day | law `weinausschank` |
| `kinderhort` | Kinderhort | society | wood 20, bricks 10 | 8 | – | | 15 | | law `kinderhort` |
| `wachstube` | Wachstube | society | wood 20, steel 10 | 8 | 4 worker | | 10 | relief 3/day | law `buergerwehr` |
| `kapelle` | Notkapelle | society | wood 25, bricks 10 | 10 | 2 any | | 10 | hope +2/day | law `notkapelle` |

German descriptions (`desc`), one sentence each, Würzburg 1946 flavour; write them yourself in that tone
(examples: Zelt „Armeezelte aus dem Depot der Amerikaner. Besser als nichts.“; Nissenhütte „Halbrunde Wellblechbaracken, wie sie die
Briten bauen. Halten den Wind ab.“; Volksküche „Ein Kessel Eintopf für alle. Aus Rüben und dem, was die Jäger bringen.“).

`unique` buildings: at most one. Buildings needing a deposit can only be placed on a free deposit cell of that kind (the deposit
building is replaced: remove the `dep_*` building, remember the kind in `b.level = 0` and `b.amount = undefined`; store the deposit
type on the new building as `deposit: 'dep_coal'` — add optional `deposit?: string` to `Building`). Demolishing such a building
restores the deposit.

### Rules (`src/sim/economy.ts`)

```ts
canPlace(s, type, cellId): string | null   // German reason or null. Reasons: 'Feld belegt', 'Nur auf <deposit name>',
                                           // 'Noch nicht erforscht', 'Gesetz fehlt', 'Nicht genug Material', 'Nur einmal erlaubt'
placeBuilding(s, type, cellId): Building | null   // pays, built = 0 (piles/deposits never placeable)
demolish(s, buildingId): void              // refunds 50 % of cost (finished or not), frees workers and residents
idle(s, kind?: PersonKind): Person[]       // healthy, home city, not away, job === null; children only if law 'kinderarbeit'
assign(s, buildingId, delta): number       // +delta takes idle people (for 'worker' slots prefer workers, then engineers, then
                                           // children if allowed; 'engineer' slots only engineers; 'any' workers first);
                                           // −delta releases the last assigned. Returns the actual change. Never above slots.
efficiency(s, b): number                   // see below
constructionHour(s): void                  // every unfinished building: built += 1 / buildHours (cap 1), log 'Fertig: <name>' (good)
productionHour(s): void                    // only in isWorkHour(s); dayOnly buildings only 8–16
```

Production per hour for a staffed building: `rate × workingWorkers × efficiency(s, b)`, where `workingWorkers` counts assigned
people with health `ok` (children count 0.6). Converters (`consumes`) process only what the stock allows (scale down).
Piles: `pileYield` per worker-hour, taken from `b.amount`; at 0 the pile is removed (workers become idle, log
'<name> ist abgetragen').

`efficiency(s, b)` = heat factor × tech factor × law factor:
- heat factor from `heatLevel(cellTemp)` at the building: [0.5, 0.75, 0.9, 1, 1]; piles and deposits outdoors use the outside
  temperature plus boiler heat if in range.
- tech factor: `kohlenbohrer` ×1.4 for `kohlengrube`; `saege` ×1.4 for `holzfaeller`; `schneidbrenner` ×1.5 for `hangar`;
  `fallen` ×1.4 for `jagdhuette`; `gewaechshaus` on a cell below 0 °C ×0.3.
- law factor: `truemmerpflicht` ×1.25 for piles and `truemmerbahn`; `arbeitsdienst` ×1.15 for all; flag `glas` ×1.3 for `gewaechshaus`.

### UI
- Bar entry `bauen` („Bauen“, icon `build`) first in the bar (use `BAR.unshift`).
- Build sheet: tabs Wohnen, Rohstoffe, Nahrung, Gesundheit, Wärme, Technik, Gemeinschaft. Cards show name, short desc, cost (red if
  short), lock line ('Erforschen: <tech name>' / 'Gesetz: <law name>'). Tapping an available card enters placement mode:
  `app.placing = type`, `app.validCells = set of cells where canPlace === null`, sheet closes. `HOOKS.tapCell`: when placing, a valid
  cell places it (toast 'Baustelle: <name>'), an invalid cell toasts the reason; placement mode stays on for housing, ends otherwise.
- Cell sheet sections (`CELL_SECTIONS`): workers stepper `assign` ± with „x / slots“ and idle count by kind; production per hour
  (+ ‑ shown like `+8 Kohle/h`); construction progress gauge; heater on/off; residents count for housing; „Abreißen“ (needs a second
  tap: the button turns into „Wirklich abreißen?“ — keep the armed state in `app` memory, no confirm()).
- HUD resource deltas: per resource show the last game hour's change (`.res .d`), computed by comparing stock before and after
  each hour (store on `app`).
- Renderer: add `VISUALS` entries for every building (roof styles in `render.ts`: tent, nissen, gable, flat, works, tower; signs
  cross, gear, pot, flame, book, mug, antenna, shield, church, grave, glass). Suggested: zelt tent; nissen nissen; ziegelhaus gable
  `#a35a45` roof `#b9c0c6`; kohlengrube works + chimney; holzfaeller gable; hangar works; truemmerbahn flat; koehlerei tower + chimney;
  jagdhuette gable small (w .7, d .7); kueche gable + chimney + pot; gewaechshaus flat light `#cfe3e6` + glass; sanitaet gable + cross
  red; lazarett flat + cross; waermestube tower + chimney + flame; werkstatt works + gear; kundschafter tower + antenna? (no — use
  flag-less tower, sign shield `#b8955a`); funkstation flat + antenna; friedhof none + grave; weinstube gable + mug; kinderhort gable +
  book; wachstube flat + shield; kapelle gable + church.

### Start position
`newGame`: also places one finished `zelt`… no: the player builds. Start stock stays as in `state.ts`.

---

## Step D · Bewohner (`src/sim/people.ts`)

```ts
peopleHour(s): void          // runs every hour: homes → health → meals (19:00) → mood → warnings/outcome
assignHomes(s): void         // homeless (home === null or home not finished) get a free bed, nearest ring first
homeTemp(s, p): number       // cellTemp of home; homeless: plazaTemp(s)
census(s): { total, workers, engineers, children, homeless, sick, grave, hungry, idle, away }
careCapacity(s): number      // Σ care × (healthy staff / slots) over finished health buildings; × 1.3 if tech 'roentgen';
                             // × 1.3 if law 'diakonissen'; × 1.2 if flag 'medizin'; + 5 per health building if law 'pflegestation'
```

People away on an expedition (`s.expeditions[*].members`) are skipped by everything in this module.

**Exposure.** Each hour a healthy person may fall sick with probability by heat level of where they are
(at work during work hours if `job` set and the job building is finished, else at home): `[0.008, 0.003, 0.001, 0.0002, 0]`.
Hunger ≥ 1 multiplies by 1.6; law `suppe` ×1.15; law `notschicht` ×1.1 during work. Sick people leave their job (job = null).

**Care.** Each hour, fill care capacity: grave first, then sick (lowest id first). `sickHours` counts hours in the current state.
- sick, cared: recover after 30 h (Lazarett-cared: 18 h; law `amputation` irrelevant here).
- sick, not cared: each hour 1/48 → grave.
- grave, cared: each hour 1/200 death; recover to `ok` after 60 h (tech `penicillin`: 30 h). Law `amputation`: after 24 h instead,
  person becomes `amputee: true` (works at 0.5).
- grave, not cared: each hour 1/36 death.

**Death.** Remove the person from `s.people` (and from building workers), `s.dead++`, `s.deaths[cause]++`
(causes: `kälte`, `hunger`, `krankheit`, `expedition`, `unfall`), log `<name> ist gestorben.` kind `death`.
Hope −2 per death; −1 if a finished `friedhof` exists or law `schneegrab` (schneegrab adds discontent +0.5 per death).

**Meals** at 19:00: everyone eats 1 ration (law `lebensmittelkarten`: children and idle eat 0.5). No ration → `hunger++`,
else hunger = 0. Hunger ≥ 3: each day 20 % death chance (cause `hunger`).

**Mood** each hour, with `pop` = living people in the city:
```
pressure = (homeless + 1.5·hungry + untreated + 0.5·coldHomes) / pop      // coldHomes: home heat level ≤ 1
discontent += pressure·1.2 − 0.15 − Σrelief/24 + lawDiscontentPerHour
hope       += (pressure < 0.1 ? 0.05 : −pressure·0.4) + lawHopePerHour + Σkapelle/24
clamp both to [0, 100]
```
Relief: staffed `weinstube` 4/day, `wachstube` 3/day (scaled by staffed fraction). Law per-hour values are listed in step F.

**Warnings and outcome.** discontent ≥ 90 → `s.warning = {kind:'revolt', until: time+48}` and log
'Die Leute sind kurz vor dem Aufstand. 48 Stunden.' (bad). hope ≤ 10 → `'despair'` analog ('Die Hoffnung erlischt …').
At `until`: still discontent ≥ 85 (hope ≤ 15) → `s.outcome = 'revolt'` (`'despair'`); recovered earlier (discontent < 70 /
hope > 25) → `s.warning = null`. Nobody left alive in the city and no expedition out → `'dead'`.

### UI
- Bar entry `leute` („Leute“, icon `people`) after Kessel. Sheet: census as `.kv` (Arbeiter, Fachkräfte, Kinder, Obdachlos, Krank,
  Schwerkrank, Hungrig, Ohne Arbeit, Unterwegs), care capacity vs. patients, hope/discontent with the main causes in plain words
  (e.g. „12 Menschen ohne Dach“), last 15 log lines (`.list`).
- HUD meters already exist; set `.alert` when a warning runs (already wired via `s.warning`).
- Map: tiny dark figures walking between home and work are optional — skip.

---

## Step E · Forschung (`src/sim/research.ts`, data `src/sim/data/techs.ts`)

```ts
TECHS: Record<string, TechDef>    // { id, name, desc, cat, cost: Partial<Resources>, hours, requires?: string }
canResearch(s, id): string | null // 'Schon erforscht' | 'Erst: <name>' | 'Nicht genug Material' | 'Keine Werkstatt' | 'Läuft schon'
startResearch(s, id): boolean     // pays cost, sets current, progress 0 (switching away loses progress; cost not refunded)
researchSpeed(s): number          // Σ over finished werkstatt: healthyStaff/slots × efficiency; × 1.25 tech 'rechenschieber';
                                  // × 1.1 flag 'studenten'
researchHour(s): void             // only work hours: progress += speed; at ≥ hours: done.push, current = null, log 'Erforscht: <name>' good
```

| id | name | cat | cost | h | requires | effect (where it is checked) |
|---|---|---|---|---|---|---|
| `rost` | Rostfeuerung | Wärme | wood 20 | 10 | | boiler +5 °C (heat.ts, done) |
| `waermestube` | Wärmestuben | Wärme | steel 15 | 12 | | building |
| `vorwaermer` | Speisewasser-Vorwärmer | Wärme | steel 25 | 16 | rost | boiler coal −15 % (done) |
| `heizrohre` | Heizschlangen | Wärme | steel 30 | 20 | waermestube | heaters +10 (done) |
| `fernwaerme1` | Fernwärmeleitung I | Wärme | steel 30 | 18 | waermestube | range +2 (done) |
| `fernwaerme2` | Fernwärmeleitung II | Wärme | steel 50, parts 2 | 30 | fernwaerme1 | range +2 (done) |
| `daemmung` | Strohdämmung | Wärme | wood 30 | 10 | | housing +10 (done) |
| `werkheizung` | Werkhallenöfen | Wärme | wood 20, steel 10 | 14 | | workplaces +10 (done) |
| `nissenhuetten` | Nissenhütten | Wohnen | wood 15, steel 10 | 8 | | building |
| `ziegelbau` | Trümmerziegel-Bau | Wohnen | wood 20 | 16 | nissenhuetten | building |
| `koehlerei` | Köhlerei | Rohstoffe | wood 25 | 12 | | building |
| `kohlenbohrer` | Presslufthämmer | Rohstoffe | steel 30 | 18 | | kohlengrube ×1.4 |
| `saege` | Bandsäge | Rohstoffe | steel 20 | 14 | | holzfaeller ×1.4 |
| `schneidbrenner` | Schneidbrenner | Rohstoffe | wood 20, steel 15 | 16 | | hangar ×1.5 |
| `fallen` | Fallenstellerei | Nahrung | wood 15 | 10 | | jagdhuette ×1.4 |
| `gewaechshaus` | Gewächshäuser | Nahrung | wood 20, steel 20 | 18 | | building |
| `lazarett` | Lazarett | Medizin | wood 20, steel 10 | 14 | | building |
| `roentgen` | Röntgenstation | Medizin | steel 25, parts 2 | 22 | lazarett | care ×1.3 |
| `penicillin` | Penicillin | Medizin | parts 3 | 30 | roentgen | grave recovery 30 h |
| `kundschafter` | Kundschafter | Erkundung | wood 15 | 8 | | building |
| `wetterdienst` | Wetterdienst | Erkundung | wood 10, steel 5 | 10 | | precise forecast 5 days (boiler.ts, done) |
| `holzvergaser` | Holzvergaser-Lkw | Erkundung | steel 30, parts 1 | 20 | kundschafter | expeditions ×0.6 time, 2 at once |
| `kampfmittel` | Kampfmittelräumdienst | Erkundung | steel 10 | 14 | | no dud accidents (story) |
| `funk` | Funkgerät | Erkundung | steel 20, parts 2 | 24 | kundschafter | building |
| `rechenschieber` | Rechenschieber | Technik | wood 20 | 12 | | research ×1.25 |

Descriptions: one German sentence each with period colour (Röntgen: „Wilhelm Conrad Röntgen hat hier in Würzburg die Strahlen
entdeckt. Das Gerät aus dem Luitpold-Krankenhaus kann Leben retten.“).

UI: bar entry `forschung` („Forschung“, icon `research`). Sheet: current research with gauge and hours left at current speed
(„Keine Werkstatt besetzt“ when speed 0), tabs by category, cards with cost/hours/requires; tap starts (switching asks with an armed
second tap). Badge on the bar entry: 1 when nothing is researched but a staffed workshop exists.

---

## Step F · Notverordnungen (`src/sim/laws.ts`, data `src/sim/data/laws.ts`)

```ts
LAWS: Record<string, LawDef>   // { id, name, desc, tab: 'not' | 'weg' | 'order' | 'faith', requires?: string, excludes?: string,
                               //   availableFrom?: number (day), flag?: string (needs s.flags[flag]),
                               //   onSign?: { hope?: number, discontent?: number },
                               //   perHour?: { hope?: number, discontent?: number } }
canSign(s, id): string | null  // 'Schon erlassen' | 'Ausgeschlossen durch <name>' | 'Erst: <name>' | 'Ab Tag <n>' |
                               // 'Noch nicht möglich' | 'Nächstes Gesetz in <h> h'
sign(s, id): boolean           // signed.push, readyAt = time + 18, apply onSign, set path for 'notstand'/'kiliansgemeinde', log good
lawHourly(s): { hope: number, discontent: number }   // Σ perHour of signed laws (people.ts adds these)
lawsHour(s): void              // daily effects at 08:00 (kohlenklau, schwarzmarkt)
```

Survival laws (tab `not`):

| id | name | excl | onSign | perHour | effect |
|---|---|---|---|---|---|
| `kinderarbeit` | Kinderarbeit | kinderhort | disc +5, hope −3 | | children take worker slots at 0.6 |
| `kinderhort` | Kinderhort | kinderarbeit | hope +2 | | building; children in `sanitaet`/`werkstatt` slots count 0.5 (allowed there only) |
| `suppe` | Wassersuppe | ersatzkost | disc +2 | | kitchen 1 food → 1.25 rations; sickness ×1.15 |
| `ersatzkost` | Ersatzkost | suppe | disc +4 | disc +0.03 | kitchen 1 food → 1.5 rations (Eichelkaffee, Sägemehlbrot) |
| `lebensmittelkarten` | Lebensmittelkarten | | disc +3 | | children and idle eat 0.5 ration |
| `notschicht` | Notschicht | | disc +5 | disc +0.08 | work hours 8–22, sickness ×1.1 at work |
| `truemmerpflicht` | Trümmerpflicht | | disc +2 | disc +0.03 | piles and Trümmerbahn ×1.25 |
| `friedhof` | Friedhof am Galgenberg | schneegrab | hope +2 | | building; deaths hope −1 |
| `schneegrab` | Schneegrab | friedhof | hope −2 | | deaths hope −1, discontent +0.5 each |
| `amputation` | Amputation | pflegestation | | | grave cared → recovers after 24 h as amputee (works ×0.5) |
| `pflegestation` | Pflegestation | amputation | | | +5 care per health building; each cared patient costs 1 extra ration at 19:00 |
| `weinausschank` | Weinausschank | | hope +3 | | building Weinstube „Zum Stachel“ |
| `kohlenklau` | „Fringsen“ | | disc −5 | | needs flag `fringsen`; daily 08:00 +40 coal; 15 % chance per day: log 'Militärpolizei erwischt Kohlendiebe', hope −3 |
| `schwarzmarkt` | Schwarzmarkt dulden | | disc −3, hope −2 | disc −0.02 | daily 08:00 if wood ≥ 60: wood −30, parts +1 |

Paths (tab `weg`), available from day 8, exclusive with each other:
- `notstand` „Notstandsverwaltung ausrufen“ → `path = 'order'`, onSign disc −8.
- `kiliansgemeinde` „Kiliansgemeinde gründen“ → `path = 'faith'`, onSign hope +8.

Order laws (tab `order`, each requires the previous, first requires `notstand`):
`buergerwehr` Bürgerwehr (building Wachstube; perHour disc −0.03) → `ausgangssperre` Ausgangssperre (disc −0.08, hope −0.02) →
`lautsprecher` Lautsprecherwagen (hope +0.05) → `arbeitsdienst` Arbeitsdienst (all production ×1.15; disc +0.02) →
`stadtkommandant` Stadtkommandant (discontent capped at 80; onSign hope −5). Text of the last one warns: „Wir haben schon
einmal einem Mann alles erlaubt.“

Faith laws (tab `faith`, chain, first requires `kiliansgemeinde`):
`notkapelle` Notkapelle (building) → `andacht` Abendandacht (hope +0.05) → `diakonissen` Diakonissen (care ×1.3) →
`kiliansfest` Kiliansfest (onSign hope +15, disc −15) → `bischofsstadt` Bischofsstadt (hope never below 20; onSign disc +5).
Text: „Der Dom ist verbrannt, aber nicht der Glaube der Stadt.“

UI: bar entry `gesetze` („Gesetze“, icon `laws`). Sheet styled like an official notice („Bekanntmachung der Stadtverwaltung
Würzburg-Hubland“): cooldown line, tabs Not / Weg / (Ordnung | Glaube after choosing), cards with effects in plain German, signing
needs an armed second tap. Badge 1 when a law can be signed.

---

## Step G+H · Erkundung (`src/sim/explore.ts`, data `src/sim/data/sites.ts`)

```ts
SITES: Record<string, SiteDef>   // { id, name, area: 'stadt' | 'umland', x, y (0..100 on the area map), hours (one way),
                                 //   danger (0..1), valley?: boolean, desc, loot: Partial<Resources>,
                                 //   survivors?: { n, kind: PersonKind | 'mixed', origin }, flag?: string, event?: string,
                                 //   needs?: string (site id that must be explored first) }
canSend(s, siteId): string | null  // 'Kundschafterposten fehlt' | 'Schon erkundet' | 'Unterwegs' | 'Keine 4 Freien' |
                                   // 'Erst: <site>' | 'Im Sturm unmöglich' | 'Alle Trupps unterwegs'
send(s, siteId): Expedition | null // 4 idle healthy workers (engineers if not enough); leaveAt now; arriveAt = now + hours×f;
                                   // f = 0.6 with tech holzvergaser or flag 'lkw'
exploreHour(s): void               // arrival: explored.push, loot stored on the expedition, flag set, event queued (story),
                                   // danger roll per member: chance danger × (valley ? 1.5 : 1) × (storm ? 3 : 1) × 0.25
                                   // → member dies (cause 'expedition'); return after the same time;
                                   // on return: add loot, add survivors as new people (addPerson), members back, log good
```
Max concurrent expeditions: 1, or 2 with `holzvergaser`/flag `lkw`. Storm days: `send` refused; teams out during a storm take
the storm factor on their danger roll at arrival and return.

Stadt (`area: 'stadt'`), map positions on a stylised Würzburg (Main runs north→south at x≈38 with a bend; Hubland east):

| id | name | x,y | h | danger | valley | loot | survivors | flag / event |
|---|---|---|---|---|---|---|---|---|
| `hublandcenter` | Hubland-Center | 80,40 | 2 | 0.05 | | food 120, rations 60, parts 1 | | — US-Kaufhalle (PX) der Amerikaner, halb geplündert |
| `galgenberg` | Wohnheim Am Galgenberg | 74,62 | 3 | 0.1 | | wood 60 | 6 mixed wue | — Barackenlager der Ausgebombten am Galgenberg |
| `grombuehl` | Grombühl · Luitpold-Krankenhaus | 55,22 | 4 | 0.15 | | parts 2 | 3 engineer wue | event `kranke_zurueck` |
| `bahnhof` | Hauptbahnhof | 44,28 | 5 | 0.2 | ✓ | coal 400, steel 60 | | event `fluechtlingszug` (early) |
| `ferdinandeum` | Ferdinandeum | 30,48 | 5 | 0.15 | ✓ | wood 40 | 4 engineer wue | flag `studenten` — Studentenheim, Medizinstudenten mit Büchern |
| `altstadt` | Altstadt · Dom | 42,48 | 6 | 0.3 | ✓ | steel 80, bricks 150 | 2 worker wue | event `domschatz`; flag `tal_gesehen` |
| `residenz` | Residenz · Hofkeller | 50,52 | 7 | 0.3 | ✓ | parts 1 | 8 mixed wue | flag `hofkeller` (hope +10 on return); flag `tal_gesehen` |
| `talavera` | Talavera | 28,32 | 7 | 0.25 | ✓ | steel 40 | | flag `lkw` — US-Fahrzeugpark mit Holzvergaser-Lkw |
| `festung` | Festung Marienberg | 24,56 | 10 | 0.45 | ✓ | parts 2 | 5 mixed wue | flag `ausguck` (precise forecast 5 days like `wetterdienst`) |

Umland (`area: 'umland'`), positions on a regional map (Würzburg at 50,55):

| id | name | x,y | h | danger | loot | survivors | flag / event |
|---|---|---|---|---|---|---|---|
| `veitshoechheim` | Veitshöchheim | 44,46 | 14 | 0.2 | wood 150 | 5 mixed wue | |
| `kitzingen` | Kitzingen · Harvey Barracks | 70,66 | 24 | 0.3 | parts 3, food 150, steel 80 | | |
| `ochsenfurt` | Ochsenfurt · Zuckerfabrik | 62,82 | 22 | 0.25 | food 250 | | |
| `karlstadt` | Karlstadt · Zementwerk | 34,30 | 26 | 0.3 | bricks 200, steel 60 | 10 worker wue | |
| `schweinfurt` | Schweinfurt · Kugellagerwerke | 78,22 | 34 | 0.4 | steel 200, parts 4 | 6 engineer wue | flag `schweinfurt` (radio partner) |
| `badkissingen` | Bad Kissingen · Lazarettstadt | 60,8 | 40 | 0.35 | parts 2 | 12 mixed wue | flag `medizin` |
| `lohr` | Lohr am Main · Glashütte | 12,30 | 34 | 0.35 | steel 40 | 4 worker wue | flag `glas` |
| `wertheim` | Wertheim | 8,70 | 38 | 0.35 | | | event `treck_wertheim` |
| `rhoen` | Rhön · Wasserkuppe | 48,2 | 60 | 0.6 | parts 3 | 2 engineer wue | flag `wasserkuppe` (event `sturmwarnung` at once) |

`needs`: `festung` needs `altstadt`; `residenz` needs `altstadt`; Umland sites need any 3 explored Stadt sites (`canSend`
reason 'Erst 3 Orte in der Stadt erkunden').

UI: bar entry `karte` („Karte“, icon `map`). Sheet with tabs „Würzburg“ / „Umland“, each an inline SVG map (viewBox 0 0 100 100,
`max-width: 100%`): Würzburg — the Main as a light band with the bend, Festung hill west, Hubland plateau east with the crater
marked „Kessel“, district labels (Altstadt, Zellerau, Grombühl, Sanderau, Frauenland); Umland — Main course
Lohr–Karlstadt–Würzburg–Ochsenfurt–Kitzingen–Schweinfurt, Rhön hatch in the north. Sites as markers (explored ✓, expedition
underway pulsing, locked grey). Tap a marker → detail below the map (desc, hours, danger in words: gering / mittel / hoch, loot
unknown until explored, „Trupp losschicken“ button or reason). Active expeditions listed with arrival/return time.

---

## Step I · Szenario (`src/sim/story.ts`, data `src/sim/data/events.ts`)

```ts
EVENTS: Record<string, EventDef>
// EventDef { id, title, sender?, body: (s) => string, choices: { label, hint?, available?: (s) => boolean, apply: (s) => void }[],
//            trigger?: (s) => boolean }   // checked hourly, fires once
queueEvent(s, id): void         // builds a PendingEvent (strings only) and pushes it; also marks fired
resolveEvent(s, index): void    // applies choice of the first pending event, removes it
storyHour(s): void              // fire triggers; scheduled entries (s.events.scheduled); heimkehrer support; end of scenario
```
Decisions pause time (already in `advance`). Modal UI via `HOOKS.modal`: `.modal .modal-card` with `.sender`, `h2`, `.doc`
(typewriter), `.choices .choice` (label + `small` hint); a red `.stamp` for urgent ones (storm, warnings).

Victory: day 35 at 18:00 with people alive → `outcome = 'won'`. Outcome modal for every outcome („Bilanz“): days survived, living
(by kind), dead (by cause), laws signed, path, places explored, a closing paragraph chosen by path and death count:
- won, deaths ≤ 5: „Als die Sonne am 4. Januar durch die Wolken bricht, steht der Kessel noch. … Würzburg wird wieder aufgebaut werden.“
- won, more deaths: mention the price; order path ends with the Stadtkommandant question; faith path with the bells.
- revolt / despair / dead / burst: short, dignified, one paragraph each. Button „Neues Spiel“.

Events (write full German texts in this tone — short paragraphs, period voice, sender line):

| id | trigger | sender | gist | choices |
|---|---|---|---|---|
| `ankunft` | day 1 at once | Notiz im Heizwerk | We arrive on the Hubland, the boiler is cold; first steps: light it, tents, coal | „An die Arbeit“ |
| `amerikaner` | day 2 09:00 | Brief eines US-Captains | The Americans left; the coal store under the crater edge can be dug | „Kohlenlager freilegen“ (+60 coal) / „Brief verbrennen, um sich zu wärmen“ (hope +1) |
| `kinder` | day 3 10:00 | Eine Mutter aus der Sanderau | Children want to help | „Wir reden darüber“ (opens nothing; mentions Kinderarbeit/Kinderhort in the law book) |
| `blindgaenger` | day 5 11:00, not tech kampfmittel | Trümmerkolonne | A dud under a rubble pile | „Vorsichtig bergen“ (50 %: one worker dies cause 'unfall', else steel +30) / „Absperren“ (one random pile removed) |
| `hamsterfahrt` | day 6 08:00 | Frauen aus der Zellerau | Want to barter in Rottendorf | „Erlauben“ (+70 food after 24 h via scheduled event `hamster_zurueck`; 20 %: rations −30 instead) / „Verbieten“ (disc +5) |
| `kaeltewelle` | day 8 07:00 | Wetterbeobachtung | Cold snap coming (days 9–10) | „Verstanden“ |
| `heimkehrer` | day 11 09:00 | Ratsherr Konrad Hufnagel | The old-town cellars are warmer, let us go back down to the valley | „Anhören“ (hope +3, flag heimkehrer = 40) / „Zum Schweigen bringen“ (disc +8, flag heimkehrer = 20) |
| `fluechtlingszug` | day 12 10:00, or on arrival at `bahnhof` | Bahnhofsvorsteher | 18 expellees from Silesia in a stranded train | „Aufnehmen“ (+18: 10 worker, 3 engineer, 5 child, origin expellee; disc +4) / „Abweisen“ (hope −8) |
| `streit` | day 14 12:00 and ≥ 15 expellees | Hilfspolizei | Würzburger and Vertriebene fight over beds | „Gleiche Rechte“ (disc +5, hope +3) / „Würzburger zuerst“ (hope −5, disc −3) |
| `kranke_zurueck` | arrival at `grombuehl` | Truppführer | Patients left behind in the hospital | „Mitnehmen“ (+5 people, all sick) / „Zurücklassen“ (hope −4) |
| `domschatz` | arrival at `altstadt` | Truppführer | Under the burnt Dom: the Kilian relics and a cellar of tools | „Reliquien bergen“ (hope +6) / „Werkzeug bergen“ (parts +2) |
| `treck_wertheim` | arrival at `wertheim` | Truppführer | A trek of 20 expellees | „Aufnehmen“ (+20 mixed expellee, disc +4) / „Nur Vorräte teilen“ (food −60, hope +2) |
| `fringsen` | day 24 08:00 (day 20 if a funkstation is finished) | Funk / Gerücht aus Köln | Kardinal Frings' sermon: in need taking coal is no sin | „Verstanden“ → flag `fringsen` (law becomes available) |
| `schweinfurt_funk` | finished funkstation and flag `schweinfurt`, from day 15 | Funkspruch aus Schweinfurt | They offer parts for coal | „100 Kohle gegen 2 Ersatzteile“ (available if coal ≥ 100) / „Ablehnen“ |
| `sturmwarnung` | day 21 08:00 if funkstation finished or flag `wasserkuppe`, else day 25 08:00 | Wetterwarte Wasserkuppe | „Der Weiße Tod“ arrives on day 30 for four days, below −80 °C | „Alle Kräfte auf den Sturm“ (hope +2) |
| `auszug` | day 22 09:00 if flag heimkehrer ≥ 80 | Ratsherr Hufnagel | His followers leave for the valley | „Gehen lassen“ (15 % of people leave with 80 food, 80 coal) / „Mit Gewalt halten“ (disc +15) |
| `wahrheit_tal` | flag `tal_gesehen` and heimkehrer set | Truppführer | The valley is dead and frozen; the scouts' report silences Hufnagel | „Bericht vorlesen“ (heimkehrer −50, hope +4) |
| `sturm_beginnt` | day 30 06:00 | — | The storm hits; stamp „DRINGEND“ | „Haltet durch“ |
| `sturm_vorbei` | day 34 06:00 | — | Silence; the snow stands still | „Atmen“ (hope +10) |

Heimkehrer support (flag `heimkehrer`, only after the event): daily at 06:00 `+= 2 + discontent/10 − hope/15`, clamp 0..100.
Show it in the people sheet as „Rückkehrbewegung: n %“.

Scheduled helper: `s.events.scheduled.push({ id, at })`; `storyHour` queues due entries.

### Balance target (test `test/balance.test.ts`, written in phase 2)
A scripted bot using only the public sim API must reach `outcome 'won'` with ≥ 50 % of the start population alive; a bot that
only lights the boiler and builds nothing must not win with more than 40 % alive. If the bot fails, tune numbers in this order:
pile amounts, production rates, sickness rates — and list every change in `decided.md`.

---

## Step J · Handy-Bedienung & Spielstand

- `src/ui/persist.ts`: save to `localStorage` key `wuerzburger-kessel-v1` (JSON of the whole state) every 6 game hours and on
  `visibilitychange` hidden; wrap every access in try/catch. Title screen: „Fortsetzen (Tag n)“ when a save exists
  (`TITLE_EXTRA`). New game asks with an armed second tap if a save exists. On outcome: delete the save.
- Hot reload: `window.claude?.hot?.snapshot(() => state)` and boot with `window.claude?.hot?.data` if present (guard with `?.`).
- Menu: a fab with icon `menu` in `.fab-col` opens sheet `menu`: Tempo hint, Ton an/aus, Kurzanleitung (8 short German lines:
  Kessel, Wärme, Bauen, Arbeit zuweisen, Essen, Krankheit, Gesetze, Erkundung), „Neues Spiel“, version line `v0.1.0`.
- Sound (`src/ui/sound.ts`, Web Audio, off until the player turns it on in the menu or taps „Neues Spiel“): wind = filtered
  noise whose gain follows snow intensity (storm loud); boiler hum = low oscillator when the boiler burns; a short bell for events.
- First-game hints: a small banner above the bar with the next suggested step until done (Kessel anheizen → Zelte bauen →
  Arbeiter auf Kohle → Volksküche + Jagdhütte → Werkstatt). Dismissable.
- Bar order at the end: Bauen, Kessel, Leute, Forschung, Gesetze, Karte.
- `npm run package` script `scripts/package.mjs`: copies `build/index.html` to `dist/wuerzburger-kessel-<version>.html`, deletes
  older `dist/wuerzburger-kessel-*.html`.
