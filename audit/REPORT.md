# KSUX UX & accessibility baseline (#45)

Throwaway audit branch `audit/ux-a11y-baseline`. **Never merge.** It describes the current state and fixes nothing.

- **Build audited**: `main` @ `6cef41a`, `next dev` + local anonymous Convex, `Judge Demo Mode` (`?demo=1`, persona Maya, Kennesaw), 2026-11-17.
- **Tooling**: Playwright 1.65 Chromium + axe-core 4.14.1 (tags `wcag2a/aa`, `wcag21a/aa`, `wcag22aa`, `best-practice`). Script: [`run-audit.mjs`](run-audit.mjs); map keyboard probe: [`map-keyboard-probe.mjs`](map-keyboard-probe.mjs).
- **Artifacts**: `screenshots/mobile/` (390×844 @2x, full page), `screenshots/desktop/` (1440×900 viewport), `screenshots/zoom200/` (390 wide, root font-size 200%, i.e. 1.4.4 text resize), `axe/<screen>.<mobile|desktop>.json`, and `results.json` (axe, target-size probe, Tab walk of 25 steps, 200% overflow, reduced-motion check).
- **Coverage**: all 15 URL-contract routes (the dynamic routes resolved from seeded data: `/chats/<deal chat>`, `/clubs/acm-ksu`, `/events/<id>`, `/courses/CS 3305`), plus `/clubs` and `/events` index pages, the Welcome gate, the OTP modal and the Quick Sheet. **Onboarding** needs a real verified `.edu` account, so it got a static code review only (see below), not a live scan.

## Caveats

- Automated axe finds roughly 30–40% of issues. The "manual" items below come from scripted probes plus screenshot review, **not** from real assistive-technology testing (VoiceOver/TalkBack/switch). AT testing is still open, as #39 already noted.
- The `zoom200` approximation scales the root `rem` only. Most text uses hard-coded `px` (`text-[11px]` ×78, `text-[10.5px]` ×34, `text-[10px]` ×26, `text-[9px]` ×1), so that text **does not scale at all** with user font settings. That is the main finding here, not a measurement error.
- An earlier run against the already-running `:3000` dev server hung 10 routes on the Suspense fallback ("Loading Campus Feed…"), because `_next/static/chunks/app/(shell)/feed/page.js` returned 404 from a stale dev build. A fresh `next dev` on `:3100` loaded every route. This is a dev-environment artifact, not a product bug, but it means a stale chunk leaves a route stuck on a fallback that never explains itself or retries (UX note for the redesign).

## Cross-cutting findings (ranked)

1. **Text does not resize (1.4.4, also an Android/iOS font-scaling gap).** Almost all small UI text is fixed `px`. Meta lines, chips, badges and the map overlay pills sit at 9–11 px. They are too small by default and do not follow user font size.
2. **Touch targets are systematically small (2.5.8 AA needs 24×24; the platform guideline is 44×44).** On almost every screen nearly all controls are under 44 px tall. Elements under 24 px are concentrated in Feed (18), Clubs (51), Dining (48), Events (40), Parking (14) and Deal Chat (14): `→` text links at 16 px tall, deck-level chips `P1…P5` at 31×23, the Course Hub checkbox at 13×13, and chat reactions at 22×22.
3. **Unlabeled form controls (axe `select-name`, critical, 14 nodes)**: filter `<select>`s on Marketplace, Parking (permit tier), Dining, Clubs and Course Hubs. Onboarding repeats the pattern: `<label>` elements are siblings with no `htmlFor`, so none of its inputs has an accessible name (static review).
4. **Icon-only buttons with no name (axe `button-name`, critical, 13 nodes)**: the OTP modal close, the Quick Sheet close `×`, the Feed post action (5th button per post), Marketplace listing save/flag icons, and the Deal Chat message delete. The Deal Chat also has an empty link (`link-name`).
5. **Modals and sheets are not dialogs.** The OTP modal and the Quick Sheet have no `role="dialog"`/`aria-modal`, Escape does not close them, and focus is not contained. Tabbing from an open Quick Sheet lands on the bottom nav behind it, and focus is not returned to the trigger.
6. **Maps are canvas-only with no equivalent controls (#39/#44).** The MapLibre canvas is focusable and arrow keys pan it (built-in keyboard support works), but the canvas name is a generic `"Map"`, there are **no zoom/pan buttons** (0 `.maplibregl-ctrl` buttons, which fails 2.5.7 dragging-alternative and leaves touch users pinch-only), **OSM attribution is off** (`attributionControl:false`, a licence gap), and lot fullness is encoded by a green/amber/red/dark-red fill (1.4.1 colour-only, red–green unsafe). The lot/stop *lists* below the maps carry the text status, so a list equivalent exists but is not linked to the map.
7. **Colour contrast failures (1.4.3, 46 nodes)**: Parking status chips (`#DC2626` on `#FEE2E2` = 3.95:1, and the amber/green chip variants at 11 px), and Transit route badges (white on `#FDBB30` = **1.7:1**). Many `incomplete` contrast results sit on the dark header and Quick Sheet and need manual checking.
8. **No live regions anywhere (4.1.3).** `liveRegions = 0` on every screen. Spot-opening toasts, "Leaving in ~5 min" confirmations, Scrappy SSE streaming, OTP errors and chat messages are all silent to screen readers.
9. **Landmarks and headings.** Desktop duplicates a landmark (`landmark-unique` on every route, nav rail + bottom nav both `nav` with no label). Feed and Deal Chat (desktop) have no `h1`, and the Quick Sheet skips heading levels. Welcome/OTP content sits outside any landmark.
10. **Reduced motion is ignored in code.** `src/` has no `prefers-reduced-motion`/`motion-reduce` handling. No infinite animations were caught running on `/`, but transitions (sheet slide, toasts) are unconditional. MapLibre's own reduced-motion handling is the only coverage.
11. **200% text reflow.** No horizontal page overflow at 390 px. Real breakage: the Campus switcher clips ("Kennesa|wMarietta" overlaps), the Judge Demo pill runs off-screen, the bottom nav labels collide with the Scrappy hero button, and Chats has 12 clipped text nodes. See `zoom200/chats.png` and `zoom200/now.png`.
12. **Focus visibility is mostly OK.** Tailwind focus rings show on most stops (`noVisibleRing` 0–1 per screen). The exceptions are a few `outline-none` inputs (map building search, onboarding fields) that rely on a subtle border-colour change, and 3 controls in the OTP modal with no visible ring. No keyboard traps were found. The Welcome gate's "trap" flag is just a 2-button page cycling back through the browser chrome.

## Worst problems per screen

| Screen | Worst problems (ranked) |
|---|---|
| **Welcome** | Content not in `<main>`/landmarks; fixed-px small copy; otherwise only 2 large buttons (fine). |
| **OTP modal** | Not a dialog (no role, no Esc, no focus trap/restore); unnamed close button; 3 controls without a visible focus ring; dev OTP preview and errors not announced. |
| **Onboarding** *(static)* | Labels not associated with inputs/select (no accessible names); `focus:outline-none` inputs; avatar upload label-as-button; step change ("Step 1 of 2") not announced. |
| **Now** (`/`) | 16-px-tall `→` tile links (5 under 24 px); 4 clipped texts at 200%; dense 10–11 px meta text; desktop duplicate nav landmark. |
| **Quick Sheet** | Not a dialog: Esc does nothing, focus escapes to the nav behind it; unnamed close `×`; skipped heading level; 2×5 grid labels wrap/truncate ("Marketplace" touches the edges). |
| **Feed** | No `h1`; unnamed post action button ×2; hashtag/ring chips and author links under 24 px (18); silent live updates. |
| **Marketplace** | Unnamed icon buttons ×3; 2 unlabeled filter selects; small "Report content" target (69×23); seller links 16 px tall. |
| **Chats** | 12 clipped text nodes at 200%; filter pills reflow badly; unread counts conveyed by a red badge only. |
| **Deal Chat** (`/chats/[id]`) | Unnamed delete button + empty link; reactions/quote at 22×22 (14 small targets); new messages and handoff state changes not announced; no `h1` on desktop. |
| **Scrappy** | Streaming answer not in a live region; citation pills small; otherwise structurally clean. |
| **Parking** | Colour-only fullness on map and chips; 18 contrast failures; unlabeled permit select; deck-level chips 31×23 and "Mark Gone" 23 px tall; no map zoom buttons; OSM attribution off; extremely long single page (12k px at 390 wide, 72 lots, no grouping or search). |
| **Study** | Mostly structural pass; 46/48 controls under 44 px; LibCal grid density. |
| **Transit** | White-on-gold route badges 1.7:1; map has no zoom controls or attribution; route colours used as the only line identity on the map; "Stop clear / Long line / Passed full" buttons 32 px tall. |
| **Dining** | 2 unlabeled selects; 48 targets under 24 px (crowd-report chips at 22 px, "Check Nutrislice" 15 px). |
| **Profile** | Structurally clean; small targets only. |
| **Moderation** | Phone link 16 px tall; otherwise clean. |
| **Clubs / Club page** | Unlabeled select; 51 sub-24-px links in the directory list (20-px rows); search input 16 px tall. |
| **Events / Event page** | 40 sub-24-px targets (title links 20 px, "Source" 16 px); event detail clean apart from size. |
| **Course Hub** | 13×13 checkbox; unlabeled select; no `h1` at times. |

## Implications for the map

- For **#46 shell/design system**: a type scale in `rem`, a 44 px minimum target token, a dialog/sheet primitive (role, Esc, focus trap/restore), a labelled `nav` per landmark, a live-region toast, and a contrast-checked status palette that is not colour-only.
- For **#47 parking/map**: zoom buttons + attribution, Okabe–Ito/pattern fullness, a list synced to the map, grouping/search for 72 lots, and larger report chips.
- For **#54 accessibility gate**: axe-in-Playwright is cheap and already scripted here (`run-audit.mjs`), so it can become a CI check. Target size and live regions need custom assertions, and AT testing stays manual.
