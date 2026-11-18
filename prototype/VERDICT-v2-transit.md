# Verdict: KSUX v2 transit screen & shuttle map

Settled on the Wayfinder ticket **[Prototype redesigned transit screen and shuttle map](https://github.com/Control707/KSUX/issues/67)** (Map: KSUX v2, [#35](https://github.com/Control707/KSUX/issues/35)), 2026-11-18. Prototype: [`v2-transit.html`](./v2-transit.html), built on Direction C ([`VERDICT-v2-shell.md`](./VERDICT-v2-shell.md)) and the Parking map patterns ([`VERDICT-v2-parking.md`](./VERDICT-v2-parking.md)), all of which still apply.

## Decisions (human-confirmed)

1. **Layout A: a full-bleed map with a bottom sheet** (same as Parking).
   - The sheet snaps to peek, half and full.
   - **Peek:** a "Your stop" card with its next 3 arrivals, plus a link to the "N Shuttle Notices on <Campus> routes".
   - **Half/full:** the route list. Each route expands to an ordered stop line with its buses placed between stops.
   - At ≥1024 px: the map plus a 27rem side panel.
   - "Your stop" is chosen from any stop card ("Make this your stop") and also feeds Now.
   - Layouts B (departures board) and C (route strip) were rejected. They stay in the file under `?layout=`.
2. **Stop reports earn no Clout.** Stop reports (No line / Long line / Passed full) stay outside [#52](https://github.com/Control707/KSUX/issues/52).

## Transit-specific map rules (in addition to the Parking patterns)

| Topic | Rule |
|---|---|
| Route identity | Three channels in priority order: the **route code** text, then the **line pattern**, then **colour**. The code appears on badges, as a label along each line at zoom ≥13.6, and under every bus marker. Patterns are solid, dashed and dotted. Colours are Okabe–Ito-derived, with separate light and dark values. No two routes serving the same Campus share both colour and pattern. KM keeps KSU gold and a 1.35× line width. |
| Route badges | Filled code badge with an ink ring and a pattern strip. The text switches between ink and white, whichever reaches ≥4.5:1 (this fixes the 1.7:1 badges). Each line has a surface casing so it meets 1.4.11 against both base maps. |
| Bus markers | A ringed bus glyph, a heading wedge rotated to the direction of travel, and the route-code label. A bus is **stale** after 36 s with no Passio update (3 missed 12 s polls) or while the feed is down. Stale means a dashed, faded ring at the last known position with no wedge. |
| Stale ETAs | Whenever the bus position is stale, every arrival shows "~N min · schedule" with a dashed dot (headway estimate) instead of live minutes. The feed pill reads "Bus GPS not updating · last N min ago". A route not running today shows "Not today · runs Fri–Sun". |
| Announcements | Bus movement is **never** announced. One polite live-region message plays when *your stop's* next bus drops to ≤2 min, at most once a minute. Feed state changes (live, not updating, offline) are announced. Map taps on a stop, route or bus announce the selection. |
| Motion | There is no pause toggle (#54). Normally markers glide for about 0.9 s per update. With reduced motion they jump, and the camera jumps too. |
| Stops ↔ list | A stop tap on the map or in the list opens the same **stop card**, focuses its heading and gives it a blue (focus-colour) ring on the map. "Show on map" goes the other way. A route-line tap selects and expands that route. "Show only <code>" chips filter the map. |
| Stop card | Shows arrivals per route (live or scheduled), the Shuttle Notices for those routes, and a 3-tap **stop report** (No line / Long line / Passed full). A report publishes in one tap, lasts 15 min, has Undo and is anonymous to other Students. The card also lists the reports from the last 15 min, plus "Make this your stop" and "Show on map". There is no Clout. Reports are labelled as not sent to Big Owl Bus or KSU. |
| Shuttle Notice | A neutral surface card with a grey double left rule, a notice icon, collapsible details and the source line "Shuttle Notice · from Big Owl Bus via Passio GO · posted <time> · not a KSU safety Alert". It is never red, never a banner, never on `/safety`, never pushed, and appears only with the routes it affects (route row, stop card, peek link). |
| Shared `CampusGeoMap` | One component serves Parking, Transit and the offline commuter view. Its layers are `lots`, `routes`, `stops` and `buses`, and its modes are `live` and `static`. Static/offline mode shows routes, stops and hours only: no buses, no times, and no live tiers. |
| Attribution | Always on. Adds "Routes & stops: Passio GO / Big Owl Bus" next to the OpenFreeMap/OSM credit. |

## Known gaps (prototype only)

- Bus positions, ETAs, loads, stop reports and Shuttle Notices are fake. Headways are guesses.
- The real stale threshold should be checked against Passio's actual update cadence.
- Route colour contrast against both base styles is measured only for badges. Line-vs-map contrast relies on the casing and still needs measuring on real tiles.
- No assistive-technology device testing was done; only headless Edge was used.
