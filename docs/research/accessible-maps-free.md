# $0 tooling for accessible, colorblind-safe MapLibre maps

- **Date:** 2026-11-17
- **Ticket:** [Control707/KSUX#44](https://github.com/Control707/KSUX/issues/44) (part of wayfinder map [#35](https://github.com/Control707/KSUX/issues/35))
- **Scope:** the `Parking`, `Shuttle Route` (transit) and campus geo map in [`src/components/map/CampusGeoMap.tsx`](../../src/components/map/CampusGeoMap.tsx), built on `maplibre-gl` + OpenFreeMap under the $0 / zero-KSU-IT constraint in [`docs/SPEC.md` §1–2](../SPEC.md).
- **Related prior research:** none of `docs/research/campus-safety*.md` covers maps; nothing reused.

## Question

What $0 tooling and patterns exist to make KSUX's MapLibre GL + OpenFreeMap maps accessible — keyboard/ARIA/screen-reader support, colorblind-safe styling with redundant encoding, high-contrast/dark free styles, reduced motion, label text scaling, and proven "list + map" equivalent-alternative patterns?

## Executive answer

1. **No extra map library is needed for the basics.** `maplibre-gl` itself (BSD-3-Clause) already ships keyboard pan/zoom/rotate, a focusable `role="region"` canvas with a localizable `aria-label`, `aria-label`ed controls, focusable/role-managed markers, and automatic `prefers-reduced-motion` handling for `flyTo`/`easeTo` — verified in source. The only Mapbox-era plugin, `@mapbox/mapbox-gl-accessibility`, is **archived** and not published to npm; treat it as a ~100-line pattern to copy, not a dependency.
2. **The canvas is not screen-reader content, so the real fix is a list.** WCAG treats a map as a complex image needing a text alternative; the proven pattern (UK DEFRA's GOV.UK `@defra/interactive-map`, MIT, MapLibre-based) is a keyboard-accessible **listbox of features alongside the map**, a crosshair for keyboard/touch selection, and screen-reader announcements. KSUX already renders lot lists in `ParkingView`/`TransitView`; make that list the primary, synchronized equivalent.
3. **Colorblind-safe palette: Okabe–Ito (CUD)** for categorical route colors and a **redundantly encoded** fullness scale (color + pattern/icon + text label). The current fullness ramp (`#16A34A` green → `#D97706` amber → `#DC2626`/`#991B1B` reds) is a red–green ramp, exactly what CUD and ColorBrewer flag as unsafe. ColorBrewer (Apache-2.0) supplies colorblind-safe sequential ramps (e.g. `YlOrRd`, `PuOr`).
4. **Free styles:** OpenFreeMap hosts `liberty`, `bright`, `positron` (light, low-noise), `dark` and `fiord` (all verified HTTP 200) under MIT/BSD-3 code + CC BY 4.0 design; Protomaps basemaps (BSD-3 code, **CC0** design) adds `light`/`dark`/`white`/`grayscale`/`black` flavors that can be generated and self-hosted.
5. **Reduced motion is free in MapLibre** unless code passes `essential: true`. Text scaling of map labels is **not** automatic (canvas text ignores browser zoom/font-size); scale `text-size` via `setLayoutProperty` from a user setting.
6. **$0 verification:** `axe-core`/`@axe-core/playwright` (MPL-2.0), Playwright `emulateMedia({ reducedMotion, forcedColors })`, and Chrome's CDP `Emulation.setEmulatedVisionDeficiency` — all free and compatible with the existing Playwright setup.

## Findings

### 1. MapLibre GL JS built-in accessibility (verified in source)

Version context: the repo declares `"maplibre-gl": "^5.5.0"` and has **5.24.1** installed; current upstream is **6.19.0** (`npm view`/`package.json` checked 2026-11-17). Upstream license: BSD-3-Clause ([maplibre-gl-js LICENSE](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt)).

| Capability | Status | Evidence |
| :--- | :--- | :--- |
| Keyboard pan/zoom/rotate/pitch | Built in, on by default (`keyboard: true`). `+`/`=` zoom in, `-` zoom out (Shift = ×2), arrows pan 100px, Shift+←/→ rotate 15°, Shift+↑/↓ pitch 10°. | [`KeyboardHandler` docs](https://maplibre.org/maplibre-gl-js/docs/API/classes/KeyboardHandler/); [`src/ui/handler/keyboard.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/handler/keyboard.ts) |
| Focusable, labelled canvas | Canvas gets `tabindex="0"` (if interactive), `role="region"`, `aria-label` = UI string `Map.Title` (default "Map"). Override via `MapOptions.locale` (e.g. `{ 'Map.Title': 'Kennesaw campus parking map' }`). | [`src/ui/map.ts` L4288–4290](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/map.ts); [`default_locale.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/default_locale.ts); [`MapOptions.locale`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/) |
| Labelled controls | `NavigationControl`, `GeolocateControl`, `FullscreenControl`, `AttributionControl`, popup close button all set `aria-label` from the locale table. | `src/ui/control/*.ts`, `src/ui/popup.ts` L656 (same repo) |
| Markers | Default marker gets `aria-label` ("Map marker", overridable). In 6.1.0+ role is `img` when non-interactive, `button` when draggable/has popup, and `tabindex=0` is managed; app-supplied `role`/`tabindex` are preserved. **5.24.1 (installed) always sets `role="button"`** on labelled markers. | [`src/ui/marker.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/marker.ts); [CHANGELOG 6.1.0, #7790](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md) |
| Popup focus | Popup tracks focusable descendants (`[tabindex]:not([tabindex='-1'])` selector) for focus handling. | `src/ui/popup.ts` L112 |
| `cooperativeGestures` | Option requiring Ctrl/⌘+scroll or two-finger drag so the map doesn't trap page scroll — helps keyboard/screen-magnifier users scroll past the map. | [`MapOptions.cooperativeGestures`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/) |
| Screen-reader access to **rendered features** (vector tiles, GeoJSON layers) | **Not built in.** WebGL canvas content is invisible to assistive tech. | Absence confirmed by grep of `src/ui` (only canvas/controls/markers/popups carry ARIA). |

**Plugins.** The only purpose-built plugin, [`mapbox/mapbox-gl-accessibility`](https://github.com/mapbox/mapbox-gl-accessibility) (ISC), is **archived (last push 2021-11-16)** and `@mapbox/mapbox-gl-accessibility` returns 404 on npm. Its approach ([`src/index.js`](https://github.com/mapbox/mapbox-gl-accessibility/blob/master/src/index.js)) is: on `moveend`/`render`, `queryRenderedFeatures({ layers })`, then overlay a visually hidden, focusable `<button aria-label={feature.properties[labelProp]}>` positioned with `map.project()`. No `maplibre-gl-accessibility` package exists on npm (checked `maplibre-gl-accessibility`, `@maplibre/maplibre-gl-accessibility`, `maplibre-gl-a11y`: all 404) and `gh search repos "maplibre accessibility"` returned nothing. **Recommendation:** don't add a dependency; KSUX's lot/stop data is a small static GeoJSON, so render the accessible list from the data directly (§4) rather than querying rendered features.

### 2. Colorblind-safe styling

**Requirement.** WCAG 2.2 SC 1.4.1 *Use of Color* (Level A): "Color is not used as the only visual means of conveying information…" and SC 1.4.11 *Non-text Contrast* (AA): graphical objects required to understand content need ≥ 3:1 against adjacent colors ([WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/#use-of-color), [#non-text-contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)).

**Okabe–Ito / Color Universal Design palette** (primary source: Okabe & Ito, *Color Universal Design*, [jfly.uni-koeln.de/color](https://jfly.uni-koeln.de/color/), Fig. 16): Black `0,0,0`; Orange `230,159,0` (`#E69F00`); Sky Blue `86,180,233` (`#56B4E9`); Bluish Green `0,158,115` (`#009E73`); Yellow `240,228,66` (`#F0E442`); Blue `0,114,178` (`#0072B2`); Vermilion `213,94,0` (`#D55E00`); Reddish Purple `204,121,167` (`#CC79A7`). The page's guidance relevant to KSUX: avoid conveying information only by color; use vermilion instead of pure red (protanopes see dark red as near-black); avoid yellow–green ranges; "for thin lines and small objects, use darker blue and orange" rather than sky blue/yellow. No license is stated on the page (a color list is not copyrightable in itself — **unverified legal opinion**, but the values are widely reused). Use it for **categorical** `Shuttle Route` line colors where KSU-assigned `colorHex` values collide or fail contrast.

**ColorBrewer** ([axismaps/colorbrewer](https://github.com/axismaps/colorbrewer), **Apache-2.0**; [colorbrewer2.org](https://colorbrewer2.org/)) encodes a per-scheme colorblind flag in [`colorbrewer_schemes.js`](https://github.com/axismaps/colorbrewer/blob/master/colorbrewer_schemes.js): `'blind':[1]` = safe at all class counts, `2` = unsafe. Verified: `YlOrRd`, `Blues`, `PuBuGn`, `PuOr`, `RdYlBu`, `BrBG`, `PiYG`, `PRGn` are `blind:[1]`; **`RdYlGn` and `Spectral` are `blind:[2,2,2,…]` (not colorblind-safe)** — i.e. the classic green→red traffic-light ramp KSUX currently uses is the flagged pattern. Apache-2.0 requires attribution/NOTICE if the schemes file is redistributed; copying a handful of hex values into a style is low-risk (**unverified legal opinion**).

**Audit of the current KSUX fullness ramp** ([`CampusGeoMap.tsx` L359–371](../../src/components/map/CampusGeoMap.tsx)): tier 0 `#16A34A` green, 1 `#D97706` amber, 2 `#DC2626` red, 3 `#991B1B` dark red, default `#2563EB`. Problems: (a) green vs. red/amber is a red–green hue contrast, the case CUD says protan/deutan viewers merge; (b) contrast against the `#E8EEF5` background (computed with the WCAG relative-luminance formula) is 2.82:1 (green) and 2.73:1 (amber) — below 3:1 — and fill opacity 0.55 lowers it further; (c) dark red `#991B1B` vs the near-black `#111317` outline is 2.24:1. Candidate replacement (needs design review, not a spec): a single-hue-progression ramp such as ColorBrewer `YlOrRd`/`PuOr`, or Okabe–Ito blue `#0072B2` (4.44:1 on `#E8EEF5`) → orange `#E69F00` → vermilion `#D55E00` (3.31:1), **always paired with redundant encoding**.

**Redundant encoding — free MapLibre style-spec primitives** ([MapLibre Style Spec `v8.json`](https://github.com/maplibre/maplibre-style-spec/blob/main/src/reference/v8.json), BSD-3):
- `fill-pattern` (sprite image fills: e.g. none / diagonal hatch / cross-hatch / solid for tiers; sizes must be powers of two) — add images at runtime with `map.addImage`.
- `line-dasharray` for route differentiation (solid / dashed / dotted) in addition to color.
- `symbol` layers with `text-field` (e.g. "Full", "~80%") and `icon-image` (Maki icons are **CC0** per [openfreemap-styles LICENSE](https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md)).
- Lucide icons (already a KSUX dependency) for the HTML legend/list.

### 3. Free high-contrast, light and dark base styles

| Style | URL / source | Code license | Design license | Notes |
| :--- | :--- | :--- | :--- | :--- |
| OpenFreeMap **Liberty** (current) | `https://tiles.openfreemap.org/styles/liberty` | MIT (OpenFreeMap) / BSD-3 (OSM Liberty) | CC BY 4.0 | 111 layers; busy with POIs. Actively maintained. |
| OpenFreeMap **Positron** | `…/styles/positron` | BSD-3 | CC BY 4.0 (derived from CartoDB CC BY 3.0) | 55 layers, POIs removed — low-clutter light base that makes overlays (lots, routes) the highest-contrast thing on screen. |
| OpenFreeMap **Bright** | `…/styles/bright` | BSD-3 | CC BY 4.0 | |
| OpenFreeMap **Dark** | `…/styles/dark` | BSD-3 (Dark Matter) | CC BY 4.0 | 47 layers. Upstream "unmodified … not yet complete"; not on the Quick Start page. |
| OpenFreeMap **Fiord** | `…/styles/fiord` | BSD-3 | CC BY 4.0 | Same caveat as Dark. |
| **Protomaps basemaps** flavors `LIGHT`, `DARK`, `WHITE`, `GRAYSCALE`, `BLACK` | [protomaps/basemaps `styles/src/flavors.ts`](https://github.com/protomaps/basemaps/blob/main/styles/src/flavors.ts) | BSD-3 | **CC0** | Generates a MapLibre style JSON; needs a tile source — Protomaps schema differs from OpenMapTiles, so it does **not** drop onto OpenFreeMap tiles; would require self-hosted PMTiles (the free-hosting cost/limits of a PMTiles file are out of scope here — **unverified**). |

All five OpenFreeMap style URLs returned HTTP 200 on 2026-11-17. Licensing and "Dark/Fiord unmodified" status come from the [openfreemap-styles README](https://github.com/hyperknot/openfreemap-styles) and [LICENSE.md](https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md); free/no-key/no-limit use of the public instance from the [OpenFreeMap README](https://github.com/hyperknot/openfreemap). Map data is © OpenStreetMap contributors (ODbL) and **requires attribution** — note KSUX currently constructs the map with `attributionControl: false` ([`CampusGeoMap.tsx` L221](../../src/components/map/CampusGeoMap.tsx)), so attribution must be shown some other way.

**No free "high-contrast" style exists** among these (none was found that targets WCAG contrast); the practical pattern is: Positron (light) or Dark as the base, KSUX overlays drawn on top with ≥3:1 strokes, and a style switch keyed to `prefers-color-scheme` / `prefers-contrast` ([MDN `prefers-contrast`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast)). Because MapLibre paints with WebGL, **`forced-colors` (Windows High Contrast) does not recolor the canvas** ([MDN `forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors) describes forcing on CSS-rendered content); detect it with `matchMedia('(forced-colors: active)')` and switch to a minimal monochrome style + rely on the HTML list (inference from how the media query works — **not tested on Windows**).

### 4. Equivalent-alternative "list + map" patterns

- **W3C WAI** classifies "maps showing locations or other information" as **complex images** that need a short description plus a long description — "a textual representation of the essential information conveyed by the image" ([WAI Complex Images tutorial](https://www.w3.org/WAI/tutorials/images/complex/)). For KSUX the long description *is* the lot/route list.
- **UK Government — DEFRA `@defra/interactive-map`** ([repo](https://github.com/DEFRA/interactive-map), **MIT**, Crown Copyright 2025; "built to GOV.UK standards, with accessibility at its core"; MapLibre is the recommended provider; **beta**, npm `latest` = `0.0.1-alpha`). Concrete patterns documented there:
  - a **keyboard-accessible listbox** of selectable features, populated from a `labelProperty` ("Required for features to appear in keyboard navigation") with a visible keyboard cursor ring ([`docs/plugins/interact.md`](https://github.com/DEFRA/interactive-map/blob/main/docs/plugins/interact.md));
  - a **crosshair + "Select" button** for keyboard (Enter) and touch selection instead of precise tapping, with a WCAG 2.2 Target Size (44×44) rationale (same file);
  - a required **accessible map name** "read out by screen readers when the map is focused", a **keyboard-hint tooltip** on focus pointing to a shortcuts modal, and an **Alt/Option+I shortcut that announces the place at the map centre** via reverse geocoding ([`docs/api.md`](https://github.com/DEFRA/interactive-map/blob/main/docs/api.md));
  - `light`/`dark` app colour schemes and a map-styles switcher ([`docs/plugins/map-styles.md`](https://github.com/DEFRA/interactive-map/blob/main/docs/plugins/map-styles.md)).
  Adopting the package wholesale is **not recommended** (alpha, GOV.UK chrome, own provider abstraction); copy the patterns.
- **WCAG 2.2 SC 2.5.7 Dragging Movements** (AA) requires a non-drag alternative for drag operations ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#dragging-movements)) — the existing zoom buttons + list selection satisfy this for panning to a lot.
- **Transit agencies:** the ticket asks for transit-agency examples. I did **not** find a primary-source, documented accessible-map pattern from a transit agency during this session — **unverified / open** (see below).

**Fit with KSUX today.** `ParkingView` and `TransitView` already render `CampusGeoMap` next to lot/route content, and `CampusGeoMap` already has an accessible building-search `combobox`/`listbox` and a non-WebGL button-list fallback ([`CampusGeoMap.tsx` L491–560](../../src/components/map/CampusGeoMap.tsx)). The gap is that the button list appears only when WebGL fails; the pattern above makes the list always present (visible or as a toggle "Map | List" view), synced with map selection, and the map canvas `aria-describedby` that list.

### 5. Reduced motion

- MapLibre reads `matchMedia('(prefers-reduced-motion: reduce)')` (`browser.prefersReducedMotion`, [`src/util/browser.ts` L87–94](https://github.com/maplibre/maplibre-gl-js/blob/main/src/util/browser.ts)) and **skips the animation** in `easeTo`/`flyTo` (and so `fitBounds`) unless `essential: true` is passed ([`src/ui/camera.ts` L921, L1511](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/camera.ts); [`AnimationOptions.essential`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/AnimationOptions/)). Changelog also records: reduced motion disables the GeolocateControl pulse ([#7066](https://github.com/maplibre/maplibre-gl-js/pull/7066)), Mac inertia ([#3068](https://github.com/maplibre/maplibre-gl-js/pull/3068)), and fixes padding/offset preservation under reduced motion (#6576, #8730) ([CHANGELOG](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md)). Present in installed 5.24.1 (`prefers-reduced-motion` found in `dist/maplibre-gl.js`).
- **Action for KSUX:** never pass `essential: true` for convenience transitions; existing calls (`fitBounds` L189, `jumpTo` L272) already comply. WCAG 2.3.3 *Animation from Interactions* is Level **AAA** ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#animation-from-interactions)), so this is best practice, not AA-required. Spec reference: [MDN `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).

### 6. Text-size scaling of map labels

- WCAG 2.2 SC 1.4.4 *Resize Text* (AA): text resizable to 200% "without loss of content or functionality", **except images of text** ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#resize-text)). Labels drawn into the WebGL canvas behave like images of text: they do not follow the browser's font-size setting (inference from canvas rendering; MapLibre has no global text-scale option — grep of `MapOptions` found none).
- **$0 pattern:** a "Map label size" control (100/150/200%) that multiplies `text-size` on KSUX's own symbol layers via `map.setLayoutProperty(layerId, 'text-size', …)` ([`Map.setLayoutProperty`](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setlayoutproperty)); optionally also on basemap label layers (Liberty exposes `text-size` on layers like `water_name_point_label`, `poi_r20`). Because the HTML list (§4) carries the same names as real text, it satisfies 1.4.4 for the essential content even if canvas labels overlap at large sizes.

### 7. $0 verification tooling

| Tool | License | What it covers |
| :--- | :--- | :--- |
| [`axe-core`](https://github.com/dequelabs/axe-core) 4.14.1 / [`@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright) 4.14.0 | MPL-2.0 | Automated ARIA/contrast/name checks on the HTML around the map (controls, list, legend). Cannot see inside the canvas. |
| Playwright `page.emulateMedia({ reducedMotion, forcedColors })` (already a dev dep, `@playwright/test ^1.53.0`) | Apache-2.0 | Regression tests that `flyTo` jumps under reduced motion and forced-colors fallback renders ([Playwright `Page` API](https://playwright.dev/docs/api/class-page)). |
| Chrome DevTools Protocol `Emulation.setEmulatedVisionDeficiency` (protanopia/deuteranopia/tritanopia/achromatopsia) | free | Screenshot the map under simulated CVD in Playwright via a CDP session ([CDP Emulation domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)). CUD notes simulations are proofs, not true perception ([jfly](https://jfly.uni-koeln.de/color/)). |
| Contrast math | — | WCAG relative-luminance formula (used for the §2 audit) — trivially unit-testable in Vitest. |

## "Done when" — concrete libraries/styles, licenses, coverage

| Item | License | Covers |
| :--- | :--- | :--- |
| `maplibre-gl` (installed 5.24.1; 6.x adds marker role fixes) | BSD-3-Clause | Keyboard handler, focusable labelled canvas, ARIA controls/markers, `locale` strings, reduced-motion camera, `cooperativeGestures` |
| MapLibre Style Spec (`fill-pattern`, `line-dasharray`, symbol `text-field`/`icon-image`, `text-size`) | BSD-3-Clause | Redundant (non-color) encoding; label scaling |
| `@mapbox/mapbox-gl-accessibility` (archived; pattern only) | ISC | Hidden focusable buttons over rendered features — copy, don't install |
| `@defra/interactive-map` (alpha; pattern source) | MIT | List + map listbox, crosshair select, accessible name, keyboard hint, centre announcement, dark scheme |
| Okabe–Ito / CUD palette | no license stated | Categorical colorblind-safe route colors |
| ColorBrewer schemes | Apache-2.0 | Colorblind-flagged sequential/diverging ramps for lot fullness |
| OpenFreeMap Liberty / Bright / Positron / Dark / Fiord | MIT + BSD-3 code, CC BY 4.0 design, OSM ODbL data, Noto Sans OFL-1.1, Maki CC0 | Free light, low-clutter and dark base styles, no key |
| Protomaps basemaps flavors | BSD-3 code, CC0 design | Light/dark/white/grayscale/black styles if self-hosting PMTiles |
| `axe-core`, `@axe-core/playwright` | MPL-2.0 | Automated a11y checks on map chrome/list |
| Playwright `emulateMedia`, CDP vision-deficiency emulation | Apache-2.0 / free | Reduced-motion, forced-colors and CVD regression tests |

## Open questions / unverified

1. **Transit-agency "list + map" patterns** were not found in primary sources this session; only the UK DEFRA (GOV.UK) component was verified. A follow-up could check specific agencies' published accessibility statements.
2. **Okabe–Ito and ColorBrewer licensing for copied hex values** — treated as low-risk; not a legal opinion.
3. **`forced-colors` behaviour on the MapLibre canvas** inferred, not tested on Windows High Contrast.
4. **Should KSUX upgrade to `maplibre-gl` 6.x** for the corrected marker `role="img"/"button"` handling? Not assessed for breaking changes here.
5. **OpenFreeMap Dark/Fiord** are self-described as incomplete/unmodified upstream forks; quality for campus zoom levels not visually checked.
6. **Protomaps self-hosting** of PMTiles under the $0 stack (Vercel Hobby static file / bandwidth) not evaluated.
7. **OSM attribution**: `attributionControl: false` in `CampusGeoMap` needs an alternative attribution display — flagged, not researched (license compliance, not accessibility).

## Sources

- MapLibre GL JS: [repo](https://github.com/maplibre/maplibre-gl-js) (source read at commit `4f2025e`, v6.19.0), [CHANGELOG](https://github.com/maplibre/maplibre-gl-js/blob/main/CHANGELOG.md), [KeyboardHandler](https://maplibre.org/maplibre-gl-js/docs/API/classes/KeyboardHandler/), [MapOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/), [AnimationOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/AnimationOptions/)
- MapLibre Style Spec: [`v8.json`](https://github.com/maplibre/maplibre-style-spec/blob/main/src/reference/v8.json)
- [mapbox/mapbox-gl-accessibility](https://github.com/mapbox/mapbox-gl-accessibility) (archived)
- [DEFRA/interactive-map](https://github.com/DEFRA/interactive-map) — README, `docs/api.md`, `docs/architecture.md`, `docs/plugins/interact.md`, `docs/plugins/map-styles.md`
- OpenFreeMap: [hyperknot/openfreemap](https://github.com/hyperknot/openfreemap), [hyperknot/openfreemap-styles](https://github.com/hyperknot/openfreemap-styles), [LICENSE.md](https://github.com/hyperknot/openfreemap-styles/blob/main/LICENSE.md), [Quick start](https://openfreemap.org/quick_start/)
- [protomaps/basemaps](https://github.com/protomaps/basemaps) — `styles/src/flavors.ts`, `LICENSE.md`
- Okabe & Ito, [Color Universal Design](https://jfly.uni-koeln.de/color/)
- [ColorBrewer](https://colorbrewer2.org/) / [axismaps/colorbrewer](https://github.com/axismaps/colorbrewer)
- W3C: [WCAG 2.2 Recommendation](https://www.w3.org/TR/WCAG22/) (SC 1.4.1, 1.4.4, 1.4.11, 2.1.1, 2.3.3, 2.5.7), [WAI Complex Images tutorial](https://www.w3.org/WAI/tutorials/images/complex/)
- MDN: [`prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion), [`prefers-contrast`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-contrast), [`forced-colors`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)
- [axe-core](https://github.com/dequelabs/axe-core), [Playwright Page API](https://playwright.dev/docs/api/class-page), [CDP Emulation domain](https://chromedevtools.github.io/devtools-protocol/tot/Emulation/)
- KSUX: [`docs/SPEC.md`](../SPEC.md), [`GLOSSARY.md`](../../GLOSSARY.md), [`src/components/map/CampusGeoMap.tsx`](../../src/components/map/CampusGeoMap.tsx)
