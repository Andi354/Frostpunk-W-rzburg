# Decided without design · v0.1.0

- A+B: Generator in a crater on the Hubland, the city lies west below (Tim chose Würzburg, 1946/47)
- A+B: Stencil display type, condensed figures, typewriter documents (fits 1946 crates and notices)
- C: deposit building replaces the `dep_*` building; the kind is kept as `Building.deposit` and restored on demolition (the spec's `level = 0` / `amount = undefined` note contradicts this; the field is what the tests check)
- C: `canPlace` on a pile or deposit returns 'Nicht baubar' (not in the reason list; piles and deposits are never placed)
- C: `assign` takes people only into finished buildings (an unfinished site has no crew)
- C: 'any' slots take children after workers and engineers, only with law `kinderarbeit` (same as worker slots)
- C: dayOnly hunters work in [8, 16), i.e. 08:00 up to 15:59
- C: heaters (`coalPerHour`) burn coal every hour inside `productionHour`; a heater without coal switches itself off
- C: a pile's amount drops by the units it yields; the yield is capped by what is left, so an empty pile is removed at once
- C: a converter scales all its outputs by the same factor as its inputs (kitchen and kiln with short stock)
- C: `tsconfig.json` excludes `test/pending` so `tsc --noEmit` covers only what the current step has moved in
- C: locked cards show tech and law names from a small temporary table in `build.ts` until steps E and F bring TECHS and LAWS
- C: the HUD shows `parts` too, and the resource row flows across columns so seven entries fit
