# Official Alert production release record (#111)

Issue: [#111](https://github.com/Control707/KSUX/issues/111), part of
[#35](https://github.com/Control707/KSUX/issues/35). Implementation:
[#110](https://github.com/Control707/KSUX/pull/110). Procedure:
[RUNBOOK — Official Alerts copy and Alert push](../RUNBOOK.md#official-alerts-copy-and-alert-push-80-adr-0007).
Decision: [ADR-0007](../adr/0007-official-alert-source-adapter-and-opt-in-alert-push.md).

## Current status — 2026-11-19

**Production rollout and physical-device verification remain pending.** This
branch accepts ADR-0007 and prepares the evidence record. It does not establish
that production is polling, displaying copied Alerts, or delivering push.
Keep #111 open until the live acceptance criteria are evidenced below.

The available checkout is configured for anonymous local Convex at
`http://127.0.0.1:3210`. No production Convex target, production credentials,
maintainer session, or physical-device testers have been confirmed. No
production environment variables, source sign-offs, or subscriptions were
changed during preparation.

| Release field | Recorded value |
|---|---|
| Production owner / backup | Pending |
| Production application URL | Pending |
| Convex team / project / production deployment | Pending |
| Deployed main commit / deployment evidence | Pending |
| Window | Full 14 days by default; no hackathon exception selected |
| Production copy mode / push switch / shadow override | Not inspected |
| ADR-0007 | Accepted in this branch; merge and deployment pending |

## Preparation evidence

On 2026-11-19 a single read-only check of each official page used the existing
`fetchSource` adapter from main commit `0929fbf`. These checks ran locally;
they are **not** production cron evidence or the start of a shadow window.

| Source key | Check time (UTC) | Adapter result | Exact quiet text |
|---|---|---|---|
| `ksu_timely_warnings` | 2026-11-19 18:10:34.997Z | `quiet` | No Timely Warnings at This Time. |
| `ksu_emergency_advisories` | 2026-11-19 18:10:35.417Z | `quiet` | No notice found on KSU’s advisory page at last check |

Neither check returned `unrecognized`; no parser correction or new fixture was
needed for these observations. This does not predict subsequent page changes.

Local verification on 2026-11-19:

- 58 tests passed across `official-alert-adapter`, `official-alerts`,
  `safety-page`, `push-device`, `vapid-push`, and `service-worker-workflows`.
  Coverage includes shadow gating, matching fetches, failure recovery, the daily
  cap, batched fan-out, kill switches, device support and Demo suppression.
- All 12 checks in `tests/a11y/safety.spec.ts` passed against an isolated local
  Convex deployment, including light/dark phone/desktop accessibility, offline
  fallback, Alert states/details and the disabled Demo push preference.
- TypeScript typecheck passed (`tsc --noEmit`).
- Repository-wide ESLint passed.

The installed pnpm launcher attempted dependency reinstallation and stopped
because no TTY was available. The existing installed CLIs were used instead:

```powershell
node node_modules/vitest/vitest.mjs run tests/adapters/official-alert-adapter.test.ts tests/convex/official-alerts.test.ts tests/unit/safety-page.test.ts tests/unit/push-device.test.ts tests/adapters/vapid-push.test.ts tests/unit/service-worker-workflows.test.ts
node node_modules/tsx/dist/cli.mjs scripts/run-e2e.ts --project=a11y tests/a11y/safety.spec.ts
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
```

## Production shadow poll

Use the confirmed production project's authenticated terminal. Verify the
deployment identity in Convex before using `--prod`; it targets that project's
default production deployment. Deploy reviewed main per the runbook and confirm
the `poll-official-alerts-5m` cron and both institutional source rows exist.
If rows are missing, run the runbook's `seed:bootstrapKsu` without Demo fixtures.

For the full public-launch window:

```sh
npx convex env set KSUX_ALERT_PUSH false --prod
npx convex env remove KSUX_ALERT_SHADOW_HOURS --prod
npx convex env set KSUX_ALERT_COPY_MODE shadow --prod
```

In **Moderation › Feed health › Official Alert copy**, restart each source if it
has an earlier run or shortened sign-off. A restart clears the earlier sign-off;
manually switched-off sources must also be switched back on to resume polling.
Record each actual `shadowStartedAt` and successful fetch. Confirm Students see
links only and Alert push is unavailable throughout shadow mode.

| Source | Start (UTC) | Latest success (UTC) | Page changes | Unrecognized count | Kill switch | Earliest sign-off / actual sign-off / maintainer |
|---|---|---|---|---|---|---|
| `ksu_timely_warnings` | Pending | Pending | Not measured | Not measured | Not inspected | Pending |
| `ksu_emergency_advisories` | Pending | Pending | Not measured | Not measured | Not inspected | Pending |

Add daily observations and every page change below. Include unavailable checks,
backoff and gaps; elapsed wall time alone is not evidence that polling ran.
For every real page change, review the source against the parsed result. For a
wrong parse or any `unrecognized` result, save the real page as a fixture, add a
regression test, ship the correction and restart the affected shadow poll.

| Check time (UTC) / observer | Source | Last attempt / success / result | Change count / unrecognized count | Page comparison, fixture or outage evidence | Restart / next action |
|---|---|---|---|---|---|
| Pending | — | — | — | — | — |

**Hackathon exception:** only if explicitly selected, set
`KSUX_ALERT_SHADOW_HOURS=1` before starting a fresh run and record the owner,
reason, required window and start time here as a deviation from SPEC-v2 §13.
Wait at least one clean hour, review the recorded checks and page changes, and
sign off each source through the maintainer panel. Before public launch, disable
push, return to shadow mode, remove the override and restart **both** sources;
complete and record the full 14-day run. Removing the override alone does not
clear a stored shortened sign-off.

## Display and push gates

- [ ] Both sources have completed the selected clean window; every recorded
  change has been checked and zero unrecognized results remain in that run.
- [ ] Record each source's maintainer sign-off time and window above, then set
  `KSUX_ALERT_COPY_MODE=display` in the confirmed production deployment.
- [ ] Record `/safety` URL, check time and outcome for each source. A quiet page
  shows its exact quiet line and check time; an actual notice shows its source
  and timestamps instead. Verify links-only, unavailable/stale fallback and the
  “Not seeing an Alert doesn’t mean campus is safe” copy.
- [ ] After the displayed copy has been checked, enable `KSUX_ALERT_PUSH=true`
  in production. Confirm the existing VAPID public key matches frontend/backend
  and that the backend private key is configured, without recording key values
  or rotating an existing pair.
- [ ] Each test device uses a real verified Student session, registers push,
  then separately confirms the off-by-default Official Alert preference.
- [ ] Record real receipt and navigation below; a scheduled push, a `sent`
  decision, or a push-service response is not proof of device receipt.

## Device verification

For an eligible real official notice, record the source, Alert ID, two matching
successful fetch times, receipt time and exact landing URL. The lock-screen
payload names only the official source, without the notice excerpt or urgency
claims. Opening it must navigate to the matching `/safety/alerts/<id>` with its
source and timestamps. Verify opt-out stops subsequent Alert pushes.

| Setup | Tester / OS / browser version | Deployment / commit / time (UTC) | Opt-in or install guidance | Receipt / source-named payload / matching detail URL | Opt-out | Result / evidence |
|---|---|---|---|---|---|---|
| Chrome desktop | Pending | Pending | Pending | Pending | Pending | Not run |
| Android Chrome | Pending | Pending | Pending | Pending | Pending | Not run |
| iPhone Home Screen app, iOS 16.4+ | Pending | Pending | Pending | Pending | Pending | Not run |
| iPhone Safari tab | Pending | Pending | Home Screen steps pending | Not applicable until installed | Not applicable | Not run |

A quiet source cannot trigger an Alert push. Wait for a real notice for production
evidence. If demonstrating receipt with synthetic content, use only an isolated
staging deployment and subscribed test devices, never production or Judge Demo
Mode. Label that evidence as staging and retain production checks as pending.
Never commit credentials, push endpoints, OTPs or credential-bearing screenshots.

## Stop, rollback and completion

To stop polling and display, set `KSUX_ALERT_COPY_MODE=off` in the confirmed
production deployment. To stop push separately, set `KSUX_ALERT_PUSH=false`.
The maintainer's per-source **Switch copy off** also stops that source's fetching
and preserves official links. Record the time, reason and observed fallback.
After a parser correction, restart the affected shadow poll before sign-off.

Close #111 only after the production observations, sign-offs, display checks and
device matrix have evidence. If a hackathon exception is used, record its
remaining full-window public-launch obligation explicitly. Until then this
record is preparation evidence, not a release approval.
