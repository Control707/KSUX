# Accessibility results log

Add one entry per run, newest first. The automated rows record the Layer 4 `a11y` job. The manual rows record a pass of [manual-test-matrix.md](manual-test-matrix.md), which needs real devices and a human tester.

## Manual passes

| Date | Commit | Setups | Tester | Blocking findings | Known issues added |
|---|---|---|---|---|---|
| _pending_ | — | — | — | — | Required before the v2 P0 launch gate. Not run for #74: it needs VoiceOver, TalkBack and Switch Access on real devices |

## Automated passes

| Date | Scope | Result |
|---|---|---|
| 2026-11-18 | #74 Phase 1A: every route, the Quick Sheet and every dialog × light/dark × 390/1440, plus 320 px and 200% text reflow (`pnpm test:e2e --project=a11y`) | See the PR for #74 |
