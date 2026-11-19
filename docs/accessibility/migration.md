# Screen migrations

Phase 0 ([#72](https://github.com/Control707/KSUX/issues/72)) shipped the Direction C tokens, the shell, the shared primitives and the shared map frame. Phase 1A ([#74](https://github.com/Control707/KSUX/issues/74)) migrated every remaining screen. The px-text allow-list in `tests/unit/a11y-static-boundaries.test.ts` is now empty and must stay empty. The same test also blocks hex colours outside the token sheet and the MapLibre paint code.

Every route is checked whole by a `screenMatrix` spec in `tests/a11y/`. Each spec covers light and dark at 390 px and 1440 px (axe with zero serious or critical, 44 px targets, no text under 13 px, one `h1`) plus reflow at 320 px and 200% text.

## Baseline findings (#45) closed

| Baseline finding | Where it was fixed | Checked by |
|---|---|---|
| 1. Fixed 9–11 px text; clipping at 200% | Every screen on the rem type tokens | `a11y-static-boundaries.test.ts` (no px text); every `screenMatrix` reflow test |
| 2. Targets under 44 px | Every screen (`min-h-[var(--target)]`) | `expectTargetSizes` in every `screenMatrix` |
| 3. 14 unlabelled `<select>`s | `MarketplaceView`, `ParkingView` ("Your permit"), `DiningView`, `ClubsViews`, `CourseHubView`, `OnboardingFlow` | axe `label` / `select-name` rules in `marketplace`, `parking`, `campus-life`, `onboarding` specs |
| 4. 13 unnamed icon buttons | `EduOtpModal` (Close sign-in), `QuickSheet`, `FeedView` (post actions), `MarketplaceView`, `ChatThreadView` (Delete your message) | axe `button-name`; `feed`, `chats`, `onboarding` specs |
| 5. OTP modal and Quick Sheet not dialogs | `EduOtpModal` and every other modal and sheet now use `Dialog` | `onboarding.spec.ts`, `shell.spec.ts`, `feed`, `marketplace`, `campus-life`, `profile`, `parking`, `report-dialog` dialog tests |
| 6. Maps: no zoom, attribution off, colour-only status | `CampusGeoMap` (#72), `ParkingView`, `TransitView` | `map.spec.ts`, `parking.spec.ts`, `transit.spec.ts` |
| 7. 46 contrast failures; 1.7:1 route badges | Tokens in both themes; `RouteBadge` picks ink or white text to reach 4.5:1 | axe `color-contrast` in every spec; badge-contrast test in `transit.spec.ts` |
| 8. No live regions | Toast host and announcer (#72); Feed publish, Report sent, OTP sent and errors, Scrappy answer, new chat message, Parking and Transit announcements | `feed`, `report-dialog`, `onboarding`, `scrappy`, `chats`, `parking`, `transit` specs |
| 9. Duplicate nav landmark, Feed without `h1`, skipped levels | Shell (#72); one `h1` per screen | one-`h1` check in every `screenMatrix`; axe `heading-order`, `landmark-unique` |
| 10. No reduced-motion handling | Global CSS (#72); Transit markers jump; Parking and Transit sheets do not animate movement | `shell.spec.ts`, `map.spec.ts` reduced-motion tests |

## Specs per area

| Area | Spec |
|---|---|
| Welcome, OTP, onboarding | `onboarding.spec.ts`, `tests/unit/onboarding-markup.test.ts` (onboarding needs a real `.edu` Student, so its markup is checked statically) |
| Report to KSUX moderators | `report-dialog.spec.ts` |
| Now, Feed | `now.spec.ts`, `feed.spec.ts` |
| Marketplace, Chats, Scrappy | `marketplace.spec.ts`, `chats.spec.ts`, `scrappy.spec.ts` |
| Parking, Transit, shared map | `parking.spec.ts`, `transit.spec.ts`, `map.spec.ts` |
| Study, Dining, Events, Clubs, Course Hubs | `campus-life.spec.ts` |
| Profile, About, Moderation | `profile.spec.ts` |
| Shell, Quick Sheet, Safety, Emergency Panel | `shell.spec.ts`, `safety.spec.ts` |

## Follow-ups

- Parking does not yet use the shared map's `fill` and `renderPanel` props, so its map is not full-bleed under the sheet and the map list sits beside the sheet rather than in it.
- The Transit "posted" time on a Shuttle Notice is the time KSUX retrieved it. Passio GO does not supply a posted time.
- The Incidents map layer arrives with Phase 1B.
