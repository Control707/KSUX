# Accessibility

OwlSide v2 is built to **WCAG 2.2 Level AA** on every screen, sheet and dialog, with the hard rules in [SPEC-v2 §15](../SPEC-v2.md#15-accessibility-commitment): 44 px targets, rem-only text no smaller than 13 px, reduced motion honoured, and a synced list for every map. Policy and the verification gate come from [#54](https://github.com/Control707/KSUX/issues/54).

| File | Contents |
|---|---|
| [statement.md](statement.md) | Source for the public statement on the About page and in the README |
| [manual-test-matrix.md](manual-test-matrix.md) | Scripted manual assistive-technology pass, run once per release |
| [results-log.md](results-log.md) | Dated results of each manual pass |
| [migration.md](migration.md) | How each #45 baseline finding was closed, the spec per area, and follow-ups |

## Automated checks (Layer 4)

- `tests/a11y/` holds the Playwright specs, run in Judge Demo Mode by the `a11y` CI job (`pnpm test:e2e --project=a11y`).
- axe runs with the WCAG 2.0, 2.1 and 2.2 A and AA tags and must report **zero serious or critical** violations.
- Custom assertions cover what axe can't: 44 px targets (map pins exempt), no text under 13 px, the live regions, dialog role, name, Escape, focus trap and restore, map controls, attribution and list parity, skip links and route heading focus, no horizontal overflow at 320 px or 200% text, and reduced-motion behaviour.
- Every screen has a `screenMatrix` spec (`tests/a11y/screens.ts`): whole-page axe, targets, text size and one `h1` for light/dark × 390/1440, plus reflow at 320 px and 200% text.
- `tests/unit/a11y-static-boundaries.test.ts` blocks px-literal text and hex colours outside the token sheet and map paint code, and checks the type tokens. Its legacy allow-list is empty and must stay empty.
- Locally, run Playwright with its output outside the repo (`--output=/tmp/…`). Writing traces inside the workspace makes `next dev` recompile and stalls Demo boot.

## Shared primitives

| Need | Use |
|---|---|
| Dialog or bottom sheet | `Dialog` in `src/components/a11y/Dialog.tsx` (`variant="sheet"` or `"dialog"`, `role="alertdialog"` when a decision is required) |
| Toast or announcement | `useAnnouncer()` from `src/components/a11y/Announcer.tsx`: `toast()` for visible messages (errors use `role=alert`), `announce()` for screen-reader-only updates |
| Segmented control, status chip, fill bar, campus badge | `src/components/a11y/controls.tsx` |
| Map with list, zoom, Recenter and attribution | `CampusGeoMap` in `src/components/map/CampusGeoMap.tsx` |
| Emergency Panel | `EmergencyPanel` in `src/components/safety/EmergencyPanel.tsx`; offline copy at `/emergency` |
| Campus switcher | `CampusSwitcher` (shown automatically on location screens by the shell) |

Each screen renders exactly one `h1`. The shell moves focus to it after a route change.
