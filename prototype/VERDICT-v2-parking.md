# Verdict: KSUX v2 parking screen & parking map

Settled on the Wayfinder ticket **[Prototype redesigned parking screen and parking map](https://github.com/Control707/KSUX/issues/47)** (Map: KSUX v2, [#35](https://github.com/Control707/KSUX/issues/35)), 2026-11-17. Prototype: [`v2-parking.html`](./v2-parking.html), built on Direction C ([`VERDICT-v2-shell.md`](./VERDICT-v2-shell.md)).

## Decisions (human-confirmed)

1. **Layout A: full-bleed map with a bottom sheet.**
   - The sheet has three snap points: peek, half and full.
   - The peek holds, in thumb reach:
     - a slim arrival strip, "Just parked at `<lot code>`? ○ ◐ ◕ ●";
     - the "Best bet for your permit" card;
     - the **Parking Report** and **I'm leaving ~5 min** buttons;
     - the Clout balance.
   - At ≥1024 px the screen becomes a full-height map with a 26rem side list.
2. **Reporting is the data source, and Clout drives it.**
   - KSU publishes no live occupancy (ADR-0003, #2), so live fullness comes only from Student Parking Reports.
   - The arrival strip publishes in one tap. The lot defaults to the pinned or nearest lot, and tapping the lot code changes it. After reporting, the strip collapses to one line with Undo.
   - "I'm leaving" asks for an optional fullness rating, which is a normal Parking Report.
   - Other Students see **I took this spot** and **Gone**. Two Gone votes remove the Spot Opening.
   - Clout is shown as *pending* until it is corroborated, either by a matching report within 20 min or by "I took this spot". There is no location check, plus a daily cap, no streaks and Undo. Amounts belong to [#52](https://github.com/Control707/KSUX/issues/52).
3. **The estimate is labelled as an estimate.**
   - A lot with no report in the last 45 min shows a dashed edge on the map and a dimmed % in the list.
   - Its provenance line says "Estimated · …".
   - The current prior (`build168HourPrior`) is a hand-written curve, not real Banner 9 class load. The spec must stop describing it as the latter.

## Patterns for every v2 map (transit, campus geo map, future Incidents)

| Pattern | Rule |
|---|---|
| Base map | MapLibre with OpenFreeMap **positron** (light) or **dark**, following the theme. |
| Attribution | `AttributionControl` is always on (compact). Never `attributionControl:false`. |
| Status encoding | Four redundant channels: a **fill pattern** that matches the list's fill bar (tint · vertical stripes · diagonal hatch · cross-hatch), a **glyph pin** (○ ◐ ◕ ●), a **text label** (code or name at zoom ≥14.3), then Okabe–Ito-derived colour. Colour is never the only channel. |
| Confidence | **Solid** edge = live crowd data. **Dashed** edge = estimate or stale. The list mirrors this with a provenance line, a live/estimate dot and a dimmed value. |
| Not applicable to you | Hidden by default. "Show N … you can't use" reveals them greyed, with a struck pin. |
| Selection | A focus-blue outline, never a status colour. |
| List parity | Every map feature is in the list, in the same order. A map tap opens and announces the matching row. "Show on map" goes the other way. |
| Controls | Zoom in / zoom out / recenter at 44 px, top right. Rotation and pitch are off. A "Key" legend button. |
| Keyboard / SR | "Skip map" link first. The canvas is focusable with an `aria-label` (arrows pan, +/− zoom). A polite live region announces selections and filter results. |
| Camera | Fit to the visible features, padded for the sheet. With reduced motion, duration is 0 (jump, never fly). |
| Text scaling | Map labels scale through `setLayoutProperty('text-size')` with the text setting. At ≥150% text, grids drop to one column and the list is the equivalent. |
| Offline | If the map fails to load, it says so and points to the list. Every lot stays in the list. |

## Known gaps (prototype only)

- Fullness, report counts and Clout amounts are fake demo data.
- Corroboration is simulated with prototype-bar buttons.
- Deck-floor-level fullness is captured but not shown separately on the map.
- No assistive-technology device testing; only headless Edge was used. Contrast of the map patterns against both base styles still needs measuring.
- Layouts B (list-first) and C (tabs) were rejected but stay in the file under `?layout=`.
