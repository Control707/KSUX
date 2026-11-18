# Verdict: KSUX v2 shell & design system

Settled on the Wayfinder ticket **[Prototype redesigned shell and design system (visual directions)](https://github.com/Control707/KSUX/issues/46)** (Map: KSUX v2), 2026-11-17.

- Round 1: [`v2-shell.html`](./v2-shell.html) (`?variant=A|B|C`) showed three directions: A Gold Bento, B Night Owl Board, C Campus Brief.
- Round 2: [`v2-shell-c.html`](./v2-shell-c.html) applies **Direction C (Campus Brief)** to every current KSUX feature. The inventory was taken from `src/components/**` on `main`.

## Decisions (human-confirmed)

1. **Direction C** is the visual language. It has:
   - a warm paper light theme and a dark theme;
   - serif display type for headings and big numbers, system UI type for body text;
   - large rounded cards;
   - a floating rounded bottom bar whose wide center pill is "Ask Scrappy" and opens the Quick Sheet;
   - a Quick Sheet laid out as an Ask field, 4 "make something" tiles (Post, Parking Report, Listing, Study Session) and chips for every destination;
   - Scrappy's brief shown as the headline of Now, with a provenance line.
2. **Campus is a location setting, not a global filter. This reopens SPEC §3 and the Map #1 shell verdict.**
   - The Campus switcher (`Kennesaw | Marietta | All KSU`) appears only on location-bound screens: Now, Parking, Transit, Study, Dining and Events.
   - Feed, Marketplace, Chats, Ask Scrappy, Course Hubs, Clubs, Profile and Moderation are KSU-wide. Each Post or Listing shows a text campus badge.
   - Marketplace and Clubs keep their own "Any campus / Kennesaw / Marietta" filter. Marketplace sorts the Student's home campus first.
3. **The Feed stream "Campus" is renamed "All KSU"**: it shows the same KSU-wide stream, now unfiltered.
4. **Chat-like screens hide the bottom bar.** A chat thread and Ask Scrappy pin the message box to the bottom and show a Back button in the header.
5. **No feature is dropped.** Feed posting keeps everything it has today: 500 characters, up to 4 photos, a campus card embed, quote/repost/like/bookmark, the 5-minute edit, delete, `@scrappy` replies, hub and club rings with cross-posting, and `#topic` chips.
6. **Listings are photo-first.**
   - Cards show a square cover photo and a photo count.
   - The sell form has a picker for up to 4 photos, with previews and remove buttons; the first photo is the cover.
   - Listing detail opens a gallery with prev/next buttons, thumbnails and arrow-key navigation.

## Tokens to carry into the spec

| Group | Values |
|---|---|
| Type (rem) | xs .8125 · sm .875 · body 1.0625 · lg 1.125 · xl 1.375 · 2xl 1.75 · 3xl 2.25. No fixed-px text and nothing under 13 px. |
| Space (rem) | .25 · .5 · .75 · 1 · 1.5 · 2 |
| Radius | sm 12 · md 18 · lg 24 · card 28 · pill |
| Target | 2.75rem (44 px) on every control |
| Motion | 120 ms, sheet 320 ms, fade 150 ms. Reduced motion means fades only, with no movement. |
| Colour | Light and dark token sets in `v2-shell-c.html`. Every text pair is ≥ 4.5:1 and every UI mark or focus pair is ≥ 3:1, checked live in the "Tokens & decisions" panel. |
| Status | Okabe–Ito-derived Open / Filling / Nearly Full / Full. Each status uses icon shape (○ ◐ ◕ ●), a word, a bar pattern and colour, never colour alone. |

## Components to carry into the spec

- **Dialog/sheet primitive:** `role=dialog`, `aria-modal`, Esc closes, the background is `inert`, focus moves to the first field and returns to the trigger on close. Used for the Quick Sheet, listing detail, sell form, replies, report, OTP and onboarding.
- **Toast region** (`role=status`), plus a toast for new messages.
- **Photo picker and gallery** as described above.
- **Status chip and fill bar; text campus badge.**
- **Map frame:** zoom buttons, a legend, OSM attribution, and an always-available list equivalent.
- **Controls:** segmented control (`aria-pressed`), tabs with arrow keys, labelled selects, and checkbox rows.
- **Report dialog** with a "not police" callout under Campus Safety.
- **Skip link**, one `h1` per screen, and focus moved to the `h1` on route change.
- **Large-text mode** (≥ 150% on a phone): the bottom bar keeps icons and its labels become accessible names only, the Demo pill collapses, and grids drop to one column.

## Known gaps (prototype only)

- The Incident, Alert and Clout surfaces aren't placed yet. That's the map's open navigation question.
- The parking map is a schematic SVG; the real MapLibre treatment belongs to the parking prototype ticket.
- No assistive-technology device testing was done. Only axe and headless-Edge checks ran.
