# Accessibility results log

Add one entry per run, newest first. The automated rows record the Layer 4 `a11y` job. The manual rows record a pass of [manual-test-matrix.md](manual-test-matrix.md), which needs real devices and a human tester.

## Manual passes

| Date | Commit | Setups | Tester | Blocking findings | Known issues added |
|---|---|---|---|---|---|
| _pending_ | — | — | — | — | Required before the v2 P0 launch gate. Not run for #74: it needs VoiceOver, TalkBack and Switch Access on real devices |

## Automated passes

| Date | Scope | Result |
|---|---|---|
| 2026-11-19 | #87: Moderator console Queue/Appeals/Action log, author notices, review and Redaction confirms × light/dark × 390/1440; row/heading and Cancel focus, focus trap, Escape/cancel announcements, 44 px targets, minimum text, captioned scroll table and 320 px / 200% reflow | 9/9 new cases and 10/10 existing Profile/About/restore checks passed locally; axe reported zero serious/critical violations. Manual AT remains pending |
| 2026-11-19 | #79: Incident list/map, details, Campus Safety Emergency Panel, all six text-only steps and Author Update dialog × light/dark × 390/1440; keyboard Skip map/focus/restore, 44 px targets, minimum text and 320 px at 200% text with spacing overrides | 4/4 passed locally; axe reported zero serious/critical violations. Existing Safety coverage also passed 10/10. Manual AT remains pending |
| 2026-11-19 | #76: private agenda, reminder preferences and joined Study Session details × light/dark × 390/1440; keyboard switches/deep-link focus, 44 px targets, minimum text, 320 px and 200% reflow | 10/10 passed locally; axe reported zero serious/critical violations |
| 2026-11-18 | #74 Phase 1A: every route, the Quick Sheet and every dialog × light/dark × 390/1440, plus 320 px and 200% text reflow (`pnpm test:e2e --project=a11y`) | See the PR for #74 |
