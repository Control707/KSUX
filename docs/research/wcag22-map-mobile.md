# WCAG 2.2 AA for a map-heavy mobile PWA (KSUX)

- **Date:** 2026-11-17
- **Ticket:** [Control707/KSUX#39](https://github.com/Control707/KSUX/issues/39), part of wayfinder map [#35](https://github.com/Control707/KSUX/issues/35)
- **Branch:** `research/wcag22-map-mobile` (research only; never merged)
- **Scope guard:** This is a requirements map, **not a conformance claim or audit**. No VoiceOver/TalkBack/Switch device testing was performed. Statements about current KSUX code come from reading `main` at `6cef41a` and are labelled as code observations.

## Question

What does **WCAG 2.2 Level AA** concretely require of a map-heavy, mobile-first PWA, and what is achievable on the web for: screen readers (VoiceOver iOS, TalkBack Android), text resizing / OS font scaling, contrast (text, non-text, focus), `prefers-reduced-motion`, target size (2.5.8) and spacing, keyboard and switch access, focus not obscured (2.4.11) under sticky header/bottom bar/sheets, dragging alternatives (2.5.7) for map pan/zoom, status messages, and non-color-only map encoding? For MapLibre GL (`<canvas>`): what do W3C/WAI and recognized guidance say about an equivalent non-map representation, accessible pins, and keyboard map controls?

## Executive answer

1. **WCAG has no "map exemption"; it has narrow, per-criterion carve-outs.** Maps are exempt from *Reflow* 2-D scrolling ([1.4.10 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)), dense pins may use the *Essential* exception of *Target Size* ([2.5.8 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)), and color gradients such as heat maps can be "essential" presentation under *Non-text Contrast* ([1.4.11 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). Everything else (text alternative, keyboard, single-pointer alternatives to drag/pinch, name/role/value, non-color encoding) still applies.
2. **The canvas itself can't be made screen-reader-navigable. KSUX should treat the map as a visual aid and make an HTML list/table the main equivalent.** W3C's complex-images tutorial says maps need a two-part text alternative: a short description plus a long description ([WAI Complex Images](https://www.w3.org/WAI/tutorials/images/complex/)). For KSUX, the long description should be a live, interactive DOM list of every Parking Lot / building / Shuttle stop with the same data and actions as the map.
3. **MapLibre gives a baseline, not compliance.** Its canvas gets `tabindex="0"`, `role="region"`, `aria-label="Map"` (installed `maplibre-gl@5.24.1`, `dist/maplibre-gl-dev.js` L73724–73726; same in [v6.19.0 `src/ui/map.ts` L4288–4290](https://github.com/maplibre/maplibre-gl-js/blob/v6.19.0/src/ui/map.ts#L4288-L4290)). It also provides arrow/`+`/`-` keyboard pan and zoom ([KeyboardHandler](https://maplibre.org/maplibre-gl-js/docs/API/classes/KeyboardHandler/)), zoom buttons in [NavigationControl](https://maplibre.org/maplibre-gl-js/docs/API/classes/NavigationControl/), localizable control labels ([`locale` option](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)), and OS reduced-motion handling for inertia and `flyTo` ([`reduceMotion`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)). It does **not** describe GeoJSON features drawn in WebGL layers, which is how KSUX draws lots, buildings and buses.
4. **Current KSUX gaps on the map surface (code observations):** no NavigationControl, so the only single-pointer pan/zoom is gestures, which fails 2.5.7/2.5.1. Parking fullness is encoded **only** by fill color at 0.55 opacity (1.4.1). Fills reach about 1.7–2.9:1 against the map background, and adjacent tiers only about 1.2–1.4:1 against each other (1.4.11). The full lot list exists only in the no-WebGL fallback, capped at 12. Map badges are not live regions (4.1.3). Lot fullness is not exposed as text near the map.
5. **Mobile text scaling:** WCAG 1.4.4 is met by surviving 200% browser zoom / Safari Page Zoom / Chrome Android zoom with a `rem`-based layout and a viewport that does not block zoom ([WebKit iOS 10 note on ignored `user-scalable=no`](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)). True OS-font-size following (Dynamic Type / Android font scale) is only partly available on the web: Safari's `-apple-system-*` font keywords ([WebKit](https://webkit.org/blog/3709/using-the-system-font-in-web-content/)) and Chromium's `<meta name="text-scale">` ([CSS Fonts 5 draft](https://drafts.csswg.org/css-fonts-5/); [Chrome Platform Status: "Proposed", Chrome 146 desktop/Android](https://chromestatus.com/feature/5112244702674944)). Treat this as progressive enhancement, not a requirement.

## Findings by topic

### A. Maps rendered to `<canvas>` (MapLibre)

- **Text alternative (1.1.1).** All non-text content needs an equivalent-purpose text alternative ([1.1.1 Understanding](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)). For "maps showing locations", WAI recommends a short description plus a long description ([Complex Images tutorial](https://www.w3.org/WAI/tutorials/images/complex/)). For an *interactive* map, the equivalent has to support the same tasks, such as finding a building, picking a Parking Lot, or seeing bus positions. A static paragraph is not enough. **Recommended pattern (not a W3C-mandated technique):** a sibling DOM list or table of features with name, Campus, status text and a button that opens the same detail/sheet the pin opens. The map is then the decorative or secondary view.
- **No APG "map" pattern exists.** The WAI-ARIA APG pattern index has no map widget ([APG Patterns](https://www.w3.org/WAI/ARIA/apg/patterns/); the index contains Listbox, Grid, Combobox, Dialog (Modal), Toolbar, Landmarks, etc., but no map pattern). Build from existing APG patterns instead: [Listbox](https://www.w3.org/WAI/ARIA/apg/patterns/listbox/)/plain list of buttons for features, [Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) for building search, [Toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) for map controls, and [Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) for sheets. Use [roving tabindex / `aria-activedescendant`](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/) when a group would otherwise add dozens of tab stops.
- **Canvas semantics from MapLibre.** As above, the canvas is a focusable `region` named "Map" (string `Map.Title`, overridable via [`locale`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/); defaults in [`default_locale.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/default_locale.ts)). KSUX should localize `Map.Title` to something specific like "Kennesaw Campus map, 72 Parking Lots. Use the list below for details." That name is all a screen reader gets from the canvas.
- **Accessible markers/pins.** WebGL `circle`/`fill`/`symbol` layers are pixels and have **no accessibility tree**. DOM `Marker`s do. In the installed 5.24.1, `Marker.addTo` sets `aria-label` (default "Map marker") and `role="button"` unless you set them yourself (`dist/maplibre-gl-dev.js` L74760–74767). In v6.19 the default marker is `role="img"` unless draggable or has a popup, and is focusable only then ([v6.19.0 `marker.ts` L966–1002](https://github.com/maplibre/maplibre-gl-js/blob/v6.19.0/src/ui/marker.ts#L966-L1002)). Custom `element` markers are "application-owned" for focus/role (same source). **Implication:** if a pin is clickable, give it a real `<button>` element with an accessible name that includes its visible label ([2.5.3 Label in Name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)) and its status ([4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)). Don't make 72 lots + buildings into separate tab stops, though. The DOM list is the better primary keyboard and screen-reader path.
- **Keyboard map controls (2.1.1).** [KeyboardHandler](https://maplibre.org/maplibre-gl-js/docs/API/classes/KeyboardHandler/) supports `+`/`=`/`-` zoom, arrows pan 100 px, Shift+arrows rotate/pitch, enabled by default via `keyboard: true` ([MapOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)). These shortcuts work only while the canvas has focus, which satisfies the "active only on focus" clause of [2.1.4 Character Key Shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html). No WCAG criterion requires keyboard *panning* if every *function* is keyboard reachable some other way, for example by choosing a lot in the list and centring it. Panning is still needed for exploration.
- **Pinch/drag alternatives (2.5.1, 2.5.7).** Both Understanding docs use maps as their example: pinch-zoom needs `+`/`−` buttons ([2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)), and drag-pan needs up/down/left/right buttons ([2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html); technique G219). `NavigationControl` provides zoom buttons and a compass, but **no pan buttons**. Satisfy pan with custom arrow buttons or with "select in list → map centers on it" plus a "Recenter Campus" button. Whether the list path alone covers *all* drag functionality is unverified. KSUX should add pan buttons or document that rationale. Do **not** use `cooperativeGestures` on mobile without an alternative: it forces two-finger panning ([MapOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)), which is a multipoint gesture under 2.5.1.
- **Reflow (1.4.10).** Maps are explicitly allowed 2-D scrolling ([1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), Note 2). But "sections of content within the two-dimensional layout … would still need to meet" Reflow (same page). Overlay chips, the search box and popups on the map must still reflow at 320 CSS px.

### B. Screen readers (VoiceOver iOS, TalkBack Android)

- Both readers navigate web content by swipe-to-next-item and explore-by-touch. VoiceOver's rotor jumps by headings, links, form controls etc. on webpages ([Apple: VoiceOver rotor](https://support.apple.com/guide/iphone/control-voiceover-using-the-rotor-iph3e2e3a6d/ios)). TalkBack uses "reading controls" and explore-by-touch ([Google: TalkBack gestures](https://support.google.com/accessibility/android/answer/6151827); [Get started with TalkBack](https://support.google.com/accessibility/android/answer/6283677)).
- **What's achievable on the web:** everything driven by semantic HTML/ARIA: headings, landmarks (`header`, `nav`, `main`), named buttons, `dialog`, live regions. **Not achievable:** reading individual features off a WebGL canvas. Explore-by-touch over the map lands on one "Map" region, which is another reason for the DOM equivalent.
- Requirements this touches: [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html), [2.4.6 Headings and Labels](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html), [4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html), [4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).
- **Unverified:** exact VoiceOver/TalkBack announcements for MapLibre's `role="region"` canvas, `aria-live` timing in iOS standalone (Home Screen) PWA mode, and TalkBack behavior with `<dialog>`. These need device testing.

### C. Text resizing & OS font scaling

- **1.4.4 Resize Text (AA):** text resizes to 200% "without assistive technology" and without loss of content or function ([1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)). Browser zoom satisfies this. W3C's draft mobile guidance says software may meet it "with the platform accessibility features" ([WCAG2Mobile, W3C Group Draft Note 6 May 2025](https://www.w3.org/TR/wcag2mobile-22/); a draft, not normative).
- **Mobile web mechanisms:** Safari iOS Page Zoom changes "font size" per site ([Apple: Safari settings](https://support.apple.com/guide/iphone/customize-your-safari-settings-iphb3100d149/ios)). Chrome Android has page zoom / default zoom ([Chrome Help](https://support.google.com/chrome/answer/96810?co=GENIE.Platform%3DAndroid)). iOS Safari ignores `user-scalable=no` since iOS 10 ([WebKit](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)), but KSUX should still never set it. Code observation: [layout.tsx](../../src/app/layout.tsx) sets only `width`/`initialScale`, which is good.
- **Dynamic Type analogue:** WebKit `font: -apple-system-body` etc. follow iOS text-size settings ([WebKit system font post](https://webkit.org/blog/3709/using-the-system-font-in-web-content/)). Chromium is adding `<meta name="text-scale" content="scale">` so `rem` follows the OS scale ([CSS Fonts 5 §2](https://drafts.csswg.org/css-fonts-5/); [`env(preferred-text-scale)` in CSS Env 1](https://drafts.csswg.org/css-env-1/); [CSSWG #12380](https://github.com/w3c/csswg-drafts/issues/12380)). Chrome Platform Status lists it as "Proposed", targeting Chrome 146 desktop/Android/WebView, with no iOS. **Recommendation:** size text and controls in `rem`, use `min-height` rather than fixed `height` on chips, add the meta tag as an opt-in, and don't depend on it.
- **1.4.12 Text Spacing (AA):** no loss of content when line-height ≥1.5×, paragraph spacing ≥2×, letter ≥0.12em, word ≥0.16em ([1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)). This risks clipping in fixed-height pills, the bottom bar, and map badges.
- **Code observation:** KSUX uses many px-literal tiny sizes (`text-[10px]`–`text-[11.5px]` in [AppShell.tsx](../../src/components/shell/AppShell.tsx) and [CampusGeoMap.tsx](../../src/components/map/CampusGeoMap.tsx)). Px still scales with browser zoom, so this isn't automatically a 1.4.4 failure. It does block the `text-scale` path and makes 200% clipping more likely.

### D. Contrast

- **Text 1.4.3:** 4.5:1, or 3:1 for large text ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
- **Non-text 1.4.11:** 3:1 for UI component boundaries/states and "parts of graphics required to understand the content" ([1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). The essential-presentation exemption covers things like heat-map gradients. Understanding warns it is "problematic" when those graphics are also UI components. Tappable lot polygons whose color is the status are both.
- **Focus indicators:** under 2.4.7 + 1.4.11, a visible focus indicator must reach 3:1 against adjacent colors ([1.4.11 Understanding, "Relationship with Focus Visible"](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html); [2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)). 2.4.13 Focus Appearance (2 px perimeter, 3:1 change) is **AAA**, so it's optional, but it's a good design target ([2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)).
- **Computed for KSUX palette (relative-luminance formula; my calculation, not a tool audit):**

  | Pair | Ratio | Note |
  |---|---|---|
  | `#5E6675` on white (secondary text) | 5.78 | passes 1.4.3 |
  | `#FDBB30` on `#111317` (header gold) | 10.92 | passes |
  | `#FDBB30` on white | **1.70** | gold must not be text/focus ring on white (e.g. search `focus:border-[#FDBB30]`) |
  | `#15803D` on `#DCFCE7` (status chip) | 4.57 | just passes |
  | `#E4E7EE` border on white | **1.24** | input/card borders fail 1.4.11 *if* the border is the only cue identifying a control |
  | Lot fill green/amber/red/dark-red at 0.55 on `#E8EEF5` | 1.77 / 1.73 / 2.36 / 2.88 | below 3:1 vs map background |
  | green vs red fill; red vs dark red | 1.34; 1.22 | tiers barely distinguishable without hue |

### E. Motion: `prefers-reduced-motion`

- 2.3.3 Animation from Interactions is **AAA**, not AA ([2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)). AA only covers flashing (2.3.1) and auto-moving content (2.2.2 Pause, Stop, Hide). Honoring the preference is still low-cost and recommended.
- MapLibre already reads `(prefers-reduced-motion: reduce)` ([`browser.ts` L87–93](https://github.com/maplibre/maplibre-gl-js/blob/main/src/util/browser.ts#L87-L93)), disables gesture inertia ([`reduceMotion`](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/)), and turns non-`essential` `flyTo` into `jumpTo` (installed dist L69786–69789). KSUX must not pass `essential: true` for cosmetic fly-tos, and must gate its own CSS sheet/toast/slide-down animations with `@media (prefers-reduced-motion: reduce)` or Tailwind `motion-reduce:`. Code observation: there are currently no such guards in `src/`.
- Live bus markers moving on the map are informational, not decorative. Under 2.2.2, moving content that starts automatically, lasts >5 s and appears alongside other content needs a pause mechanism unless it's essential ([2.2.2 is in WCAG 2.2](https://www.w3.org/TR/WCAG22/#pause-stop-hide)). Whether real-time vehicle positions count as "essential" is **unverified/interpretive**. A "Pause live updates" toggle is cheap insurance.

### F. Target size & spacing (2.5.8)

- At least 24×24 CSS px, or undersized targets whose 24 px circles don't intersect neighbours. Exceptions: Equivalent, Inline, User-agent control, Essential ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); technique C42 `min-height`/`min-width`). Understanding explicitly says dense **map pins** fall under *Essential*, because their position is the information.
- Platform guidance is stricter (not WCAG): Apple HIG 44×44 pt ([HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)), Android 48×48 dp ([Android: make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/apps)). A **44 px** target for bottom-bar slots, sheet handles and close buttons is a reasonable KSUX design rule. Prior KSUX research already flagged 2.5.8 for safety handoffs (`docs/research/campus-safety-handoffs.md` §8 (untracked on main)).
- At-risk components (code observation, unmeasured): `py-0.5`/`py-1` pills, persona switcher rows, map search results (`py-1.5`, 11.5 px text), NavigationControl buttons (29 px by default in MapLibre CSS: **unverified**, measure).

### G. Keyboard & switch access

- **2.1.1 Keyboard:** all functionality via keyboard ([2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)). **2.1.2 No Keyboard Trap**, **2.4.3 Focus Order**, **2.4.7 Focus Visible** ([2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)).
- Switch users (iOS Switch Control, [Android Switch Access](https://support.google.com/accessibility/android/answer/6122836)) mostly move through the same focusable/actionable elements, so keyboard-complete, single-tap-operable, non-drag UI covers them. **Unverified:** how Switch Control point-scanning interacts with the MapLibre canvas.
- Sheets as modal dialogs: move focus in, trap Tab, `Esc` closes, return focus to the invoker, background inert ([APG Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)). Native `<dialog>.showModal()` gives inertness for free in current engines (behavior per browser **unverified** here).

### H. Focus Not Obscured (2.4.11)

- When an element gets keyboard focus it must not be **entirely** hidden by author content. Understanding names sticky headers, sticky footers and non-modal dialogs as the usual culprits, and gives scroll padding (technique **C43** `scroll-padding`) or making overlays modal as passing approaches ([2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)). Note 2: content the *user* opened may obscure focus if they can reveal it without moving focus.
- KSUX surfaces (code observation): sticky header (`sticky top-0 z-30`), fixed bottom nav (`fixed bottom-0 z-30`), fixed top toast (`fixed top-3 z-50`), the half-screen Quick Sheet, and absolutely positioned map overlays. **Fix:** `html { scroll-padding-top: <header>; scroll-padding-bottom: <bottom bar + safe-area-inset-bottom> }`; make the Quick Sheet modal (or non-modal with matching padding); auto-dismiss toasts without blocking focused items.

### I. Status messages (4.1.3)

- Status messages must be programmatically determinable without receiving focus ([4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)). Sufficient techniques: ARIA22 `role="status"` for results/success, ARIA19 `role="alert"`/live regions for errors, ARIA23 `role="log"` for sequential updates.
- KSUX candidates: the Slide-Down Toasts, "Update available · Tap to reload", offline badge ("Offline Zero-Tile GeoJSON Mode"), "N Active Buses", building-search "No matching building" / result counts, staleness pills, Parking Report submitted, OTP sent/error. Code observation: no `aria-live`/`role="status"`/`role="alert"` in `src/` today. Don't put rapidly ticking data (bus positions every poll) in a live region. Announce summaries only on change, with throttling.

### J. Non-color encoding & colorblind-safe maps (1.4.1)

- "Color is not used as the only visual means of conveying information" ([1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Parking tiers encoded only by `fill-color` (green/amber/red/dark-red: a red–green pair that's also low in luminance difference) fail this on the map. **Fix:** add a second channel: per-tier fill pattern or line style (`fill-pattern` / `line-dasharray`), a text or symbol label per lot ("Full", "~60%"), and a visible legend with icons and text. The DOM list carries the textual status, and the map stays the visual aid.

### K. Other AA criteria with direct KSUX hits

- **3.3.8 Accessible Authentication (Minimum)** (new in 2.2): no cognitive-function test unless a mechanism assists, e.g. paste/password managers ([3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)). KSUX uses 6-digit email OTPs, so allow paste and `autocomplete="one-time-code"`. Never split the code into 6 inputs that block paste.
- **3.3.7 Redundant Entry** ([3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)): onboarding, composers and Deal Chat flows shouldn't re-ask for already-provided info in the same process.
- **3.2.6 Consistent Help** ([3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html)): if Scrappy, a help link, or the Campus Safety resources appear on multiple pages, keep them in the same relative order.
- **1.4.13 Content on Hover or Focus** ([1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)): MapLibre popups/tooltips must be dismissible (`Esc`), hoverable and persistent.
- **1.3.4 Orientation** ([1.3.4](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html)): don't lock the PWA to portrait in `manifest.ts`.
- **2.2.1 Timing Adjustable** ([2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)): the 10-minute OTP expiry is a security time limit. Confirm it qualifies for the real-time/essential exceptions or offer resend (KSUX already has resend). Auto-dismissing toasts with important info need another persistent route.

## "Done when" — SC → KSUX implication checklist

Legend: **Shell** = header/bottom bar/Campus switcher/Judge Demo pill/toasts; **Sheets** = Quick Sheet, persona menu, detail sheets, popups; **Maps** = `CampusGeoMap` (`/`, `/parking`, `/transit`, Meetup Spots); **Forms** = Welcome/OTP/onboarding/composers/search.

### Perceivable
- [ ] **1.1.1 Non-text Content (A)** — *Maps:* specific `Map.Title` via `locale`, plus a visible "list view" equivalent of every feature shown, always rendered next to or toggleable with the map (not only in the no-WebGL fallback, and not capped at 12). *Shell:* emoji-only icons (🗺️ 🚌 🦉) get text alternatives or `aria-hidden` with adjacent text.
- [ ] **1.3.1 Info and Relationships (A)** — *Shell:* `header`/`nav`/`main` landmarks, heading per module. *Maps:* the list equivalent uses list/table semantics. *Forms:* labels programmatically tied (fix the current `combobox` whose options are `<li role="option">` wrapping `<button>`s and never update `aria-selected`; follow [APG Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).
- [ ] **1.3.4 Orientation (AA)** — *Shell:* no `orientation` lock in `app/manifest.ts`.
- [ ] **1.3.5 Identify Input Purpose (AA)** — *Forms:* `autocomplete="email"`, `one-time-code`, `nickname`/`username` for handle.
- [ ] **1.4.1 Use of Color (A)** — *Maps:* parking tier = color + pattern/label + legend; bus route lines differ by dash or label, not hue alone. *Shell:* unread/status chips include text, not just a colored dot.
- [ ] **1.4.3 Contrast (Minimum) (AA)** — *All:* keep ≥4.5:1. Never put gold `#FDBB30` text on white. Verify all `text-[10px]` grey/colored chip pairs.
- [ ] **1.4.4 Resize Text (AA)** — *All:* pass at 200% Safari Page Zoom / Chrome zoom with no clipped pills or bottom-bar labels. Prefer `rem` and `min-height`. *Progressive:* `<meta name="text-scale" content="scale">`, Safari `-apple-system-*` fonts.
- [ ] **1.4.10 Reflow (AA)** — *Shell/Sheets/Forms:* 320 CSS px with no horizontal scroll. *Maps:* 2-D panning is exempt, but overlay chips, search box and popups must reflow (they're currently absolutely positioned at `w-44`).
- [ ] **1.4.11 Non-text Contrast (AA)** — *Maps:* lot fills or outlines ≥3:1 vs the basemap, and NavigationControl buttons and markers ≥3:1. *Forms:* input borders `#E4E7EE` (1.24:1) need a darker border or another visual cue. *All:* focus ring ≥3:1 against adjacent colors (gold works on `#111317`, not on white).
- [ ] **1.4.12 Text Spacing (AA)** — *All:* test with the four overrides. Fixed-height pills and the bottom bar must not clip.
- [ ] **1.4.13 Content on Hover or Focus (AA)** — *Maps:* popups dismissible with Esc, persistent, hoverable.

### Operable
- [ ] **2.1.1 Keyboard (A)** — *Maps:* keep `keyboard: true`, add a visible key hint, and make every map action reachable from the list. *Sheets:* open/close/act by keyboard. *Shell:* persona switcher and Campus switcher keyboard-operable.
- [ ] **2.1.2 No Keyboard Trap (A)** — *Maps:* Tab leaves the canvas. *Sheets:* trap only while modal, Esc exits.
- [ ] **2.1.4 Character Key Shortcuts (A)** — *Maps:* MapLibre's `+`/`-` are focus-scoped (OK). Don't add page-global single-key shortcuts.
- [ ] **2.2.1 Timing Adjustable (A)** — *Forms:* OTP expiry + resend. *Shell:* toasts carrying actionable info need a persistent route (badge/inbox).
- [ ] **2.2.2 Pause, Stop, Hide (A)** — *Maps:* consider a pause toggle for live bus movement. *Shell:* no auto-advancing carousels without pause.
- [ ] **2.3.1 Three Flashes (A)** — *All:* no flashing alerts/badges.
- [ ] **2.4.3 Focus Order (A)** — *Sheets:* focus moves into an opened sheet and returns to its trigger. *Maps:* overlay controls → canvas → list in a logical order.
- [ ] **2.4.7 Focus Visible (AA)** — *All:* replace `outline-none` (e.g. map search input) with a visible `:focus-visible` ring.
- [ ] **2.4.11 Focus Not Obscured (Minimum) (AA)** — *Shell:* `scroll-padding-top`/`-bottom` = header / bottom bar + `env(safe-area-inset-bottom)` (C43). *Sheets:* modal Quick Sheet, or padding equal to its height. *Shell:* fixed toast must not fully cover a focused control.
- [ ] **2.5.1 Pointer Gestures (A)** — *Maps:* zoom `+`/`−` buttons (add `NavigationControl` or custom). No mobile `cooperativeGestures` without an alternative.
- [ ] **2.5.2 Pointer Cancellation (A)** — *Sheets/Maps:* activate on up-event (default for `click`). Don't trigger actions on `pointerdown`.
- [ ] **2.5.3 Label in Name (A)** — *All:* accessible name starts with the visible label (e.g. "🚌 3 Active Buses" → name "3 Active Buses").
- [ ] **2.5.7 Dragging Movements (AA)** — *Maps:* pan buttons, or a documented single-tap equivalent (list select → center; Recenter). *Sheets:* drag-to-dismiss/resize also has a close button and size toggle. *Forms:* no drag-to-reorder images without up/down buttons.
- [ ] **2.5.8 Target Size (Minimum) (AA)** — *Shell/Sheets/Forms:* ≥24×24 CSS px, design rule 44 px. *Maps:* dense pins may use Essential, but the list equivalent must have full-size targets.

### Understandable
- [ ] **3.2.6 Consistent Help (A)** — *Shell:* Scrappy/help/safety resources in a stable relative position across routes.
- [ ] **3.3.1 / 3.3.3 Error Identification & Suggestion (A/AA)** — *Forms:* OTP, handle denylist and Post-length errors in text, linked with `aria-describedby`, announced via `role="alert"`.
- [ ] **3.3.7 Redundant Entry (A)** — *Forms:* onboarding/composers keep prior answers within a flow.
- [ ] **3.3.8 Accessible Authentication (Minimum) (AA)** — *Forms:* OTP paste allowed, `autocomplete="one-time-code"`, no 6-box paste blockers, no CAPTCHA.

### Robust
- [ ] **4.1.2 Name, Role, Value (A)** — *Maps:* clickable custom markers are `<button>`s with names and states. *Shell:* Campus switcher exposes the selected state (`aria-pressed`/radio group). *Sheets:* `role="dialog"` + `aria-modal` + label.
- [ ] **4.1.3 Status Messages (AA)** — *Shell:* toast host `role="status"` (errors `role="alert"`), update-available pill, offline badge. *Maps:* "N results"/"No matching building", live-bus count changes (throttled). *Forms:* "Code sent", "Parking Report submitted".

### Non-WCAG but recommended
- [ ] Honor `prefers-reduced-motion` in CSS (sheets, toasts) and never pass `essential: true` to cosmetic `flyTo` (2.3.3 is AAA).
- [ ] Device smoke test per release: VoiceOver (iOS Safari + Home Screen PWA), TalkBack (Chrome), Switch Control/Access, 200% zoom, the four text-spacing overrides. Add `@axe-core/playwright` to the existing Playwright layer (free, $0-compatible). Automated checks can't verify canvas equivalence.

## Open questions / unverified

1. **Pan alternative:** does "select feature in list → map centers" plus Recenter fully satisfy 2.5.7 for exploratory panning, or are arrow buttons required? The Understanding example shows buttons. It's not stated as the only way. *Interpretive.*
2. **Live bus motion and 2.2.2:** essential real-time info, or moving content that needs pause? *Interpretive.*
3. **MapLibre version drift:** installed 5.24.1 makes every marker `role="button"`. v6.x uses `img` vs `button` and app-owned custom elements. Re-check after any upgrade.
4. **NavigationControl default button size** vs 24 px / 44 px: not measured.
5. **AT behavior:** VoiceOver/TalkBack announcement of the canvas region, live-region reliability in iOS standalone PWAs, `<dialog>` inertness on target engines, and Switch Control over canvas were all **not tested**.
6. **`<meta name="text-scale">`** ship status: Chrome Platform Status lists it as "Proposed" (Chrome 146). Recheck before relying on it. No WebKit/Gecko signal found.
7. **WCAG2Mobile** is a W3C *Draft* Note (6 May 2025): informative, not normative.
8. **Legal applicability** (ADA Title II web rule, Section 508, KSU/USG policy) is out of scope here and not researched.

## Sources

**W3C / WAI (normative and informative)**
- [WCAG 2.2, W3C Recommendation 12 Dec 2024](https://www.w3.org/TR/WCAG22/)
- Understanding docs: [1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html), [1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html), [1.3.4](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html), [1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), [1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html), [2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html), [2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html), [2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html), [2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html), [2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html), [2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html), [2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html), [3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html), [3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html), [4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html), [4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- [WAI Tutorials: Complex Images](https://www.w3.org/WAI/tutorials/images/complex/)
- [WAI-ARIA APG: Patterns index](https://www.w3.org/WAI/ARIA/apg/patterns/), [Dialog (Modal)](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), [Keyboard interface / roving tabindex](https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/), [Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [W3C Mobile Accessibility overview](https://www.w3.org/WAI/standards-guidelines/mobile/); [WCAG2Mobile Group Draft Note](https://www.w3.org/TR/wcag2mobile-22/)
- CSSWG: [CSS Fonts 5 §2 text-scale meta](https://drafts.csswg.org/css-fonts-5/), [CSS Env 1 `preferred-text-scale`](https://drafts.csswg.org/css-env-1/), [issue #12380](https://github.com/w3c/csswg-drafts/issues/12380)

**MapLibre (first-party docs and source)**
- [MapOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MapOptions/) (`keyboard`, `locale`, `reduceMotion`, `cooperativeGestures`), [KeyboardHandler](https://maplibre.org/maplibre-gl-js/docs/API/classes/KeyboardHandler/), [NavigationControl](https://maplibre.org/maplibre-gl-js/docs/API/classes/NavigationControl/), [MarkerOptions](https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/MarkerOptions/)
- Source: [v6.19.0 `map.ts`](https://github.com/maplibre/maplibre-gl-js/blob/v6.19.0/src/ui/map.ts#L4288-L4290), [v6.19.0 `marker.ts`](https://github.com/maplibre/maplibre-gl-js/blob/v6.19.0/src/ui/marker.ts#L966-L1002), [`default_locale.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/default_locale.ts), [`browser.ts`](https://github.com/maplibre/maplibre-gl-js/blob/main/src/util/browser.ts); installed `node_modules/maplibre-gl@5.24.1/dist/maplibre-gl-dev.js`

**Platform vendors**
- Apple: [VoiceOver rotor](https://support.apple.com/guide/iphone/control-voiceover-using-the-rotor-iph3e2e3a6d/ios), [Safari Page Zoom](https://support.apple.com/guide/iphone/customize-your-safari-settings-iphb3100d149/ios), [HIG Accessibility (44×44 pt)](https://developer.apple.com/design/human-interface-guidelines/accessibility); WebKit: [system font / Dynamic Type styles](https://webkit.org/blog/3709/using-the-system-font-in-web-content/), [iOS 10 zoom behavior](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)
- Google/Android: [Get started with TalkBack](https://support.google.com/accessibility/android/answer/6283677), [TalkBack gestures](https://support.google.com/accessibility/android/answer/6151827), [Switch Access](https://support.google.com/accessibility/android/answer/6122836), [Chrome Android zoom](https://support.google.com/chrome/answer/96810?co=GENIE.Platform%3DAndroid), [Android accessible apps (48 dp)](https://developer.android.com/guide/topics/ui/accessibility/apps), [Chrome Platform Status: meta text-scale](https://chromestatus.com/feature/5112244702674944)

**Prior KSUX research (cited, not redone)**
- `docs/research/campus-safety.md`, `docs/research/campus-safety-handoffs.md` §8 (untracked local files on main) (2.5.8 / 4.1.3 already flagged for safety handoffs)
