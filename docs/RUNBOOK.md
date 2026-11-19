# KSUX — Day 0 Provisioning, Seed & Deployment Runbook

> Companion operations runbook to [`docs/SPEC.md`](./SPEC.md) for running KSUX locally and deploying to `$0` free-tier production.

## Private agenda (#76)

- `/agenda`, linked from the desktop You rail and Quick Sheet, shows the next 14 Eastern calendar days across both Campuses. It reads the owning Student's private schedule, enrollments, RSVP records (Going and Interested), and joined Study Sessions, including archived Session Chats. It never accepts a Student/workspace selector. Campus location preferences do not filter it. Cancelled Events and Study Sessions remain labelled until their scheduled window passes; removed RSVPs and departed attendance disappear. Hidden, blocked, cross-workspace and Course Hub-ineligible content is excluded.
- Imported class meetings override their matched Banner meetings. Repeated imports and legacy/private copies of a deadline are deduplicated. Class recurrence follows the existing calendar-term convention (Jan–Apr / May–Jul / Aug–Dec), preserving Eastern wall time over DST. No registrar end dates, holidays or class cancellations are inferred. Owl Express and D2L handoffs are provided for authoritative records and coursework. Imported calendar bytes and subscription URLs are never stored.
- All reads are bounded: latest 20 private terms, 100 enrollments, 200 RSVP records and 200 Study Session chat memberships; reaching a limit shows a notice. Attendance and session visibility are rechecked against the original session; chat membership is only the indexed discovery path. No new cron or materialized agenda copy is needed.
- **Export Events (.ics)** downloads only the RSVPed Events shown in that 14-day view. Stable per-Event UIDs, UTC timestamps, escaped/folded UTF-8 text and `STATUS:CANCELLED` are included. Classes, deadlines, Study Sessions, student identities and reminder alarms are omitted. This is a snapshot, not a calendar subscription: export again after changes. Removing an RSVP omits the Event on the next export; KSUX cannot remove an earlier import from an external calendar.
- `/profile/notifications#agenda` holds four independent switches (Class, Deadline, Event, Study Session), all off by default. Reminders are **in-app only**, respecting ADR-0005/0007. An enabled type is checked once a minute while the shell is visible and online and when the tab returns online/visible. It can appear in the 15 minutes before the start/deadline; missed starts are never replayed. There is no background scheduling or OS push permission request. Turning a switch on inside that window permits the upcoming reminder immediately.
- Each claim rereads current sources and settings in a Convex mutation. Cancelling, removing an RSVP or leaving attendance suppresses pending delivery. The deduplication key is the stable item/occurrence key plus its start/deadline instant: title/location changes do not redeliver; time changes may generate a new reminder; moving back to an already claimed time does not repeat it. Claims serialize across tabs/devices, giving at-most-once claim semantics. Closing/navigating after a successful claim can lose the visible toast; an already displayed toast cannot be retracted. Pending receipt keys expire at their occurrence's start time and are pruned on the next enabled check, with a 1,000-key cap that defers excess claims rather than evicting live keys. Settings/receipts are private, removed on Student cleanup, and purged with expired/reset Demo workspaces by the existing hourly batch job.
- Verify with `pnpm test -- tests/convex/private-agenda.test.ts`, `pnpm test:e2e --project=chromium tests/e2e/private-agenda.spec.ts`, and `pnpm test:e2e --project=a11y tests/a11y/agenda.spec.ts`. The new route/settings use shared accessible primitives, target sizes, rem text and live announcements. The existing release-level manual AT matrix still applies.

---

## Repeatable team setup wizard

Run `./scripts/setup-env.sh` from your own interactive terminal. See the
[setup guide](../scripts/setup-production.md) for prerequisites, credential
destinations, confirmations, and offline validation commands. One production
owner should configure shared services; teammates should use separate development
settings. Never paste secrets into chat or issues. No live deployment is implied
by completing the isolated wizard tests.

The wizard reflects the current implementation: Web Push also needs
`NEXT_PUBLIC_VAPID_PUBLIC_KEY` in **Convex** as well as Vercel, and
`seed:backfillEmbeddings` currently returns zero embeddings. Provider plan limits
and model availability must be verified at provisioning time, not assumed from
this planning document. The remaining sections describe the planned bootstrap.

## 1. Prerequisites & `$0` Service Provisioning

All accounts below require **zero credit cards** and **zero custom domains**:

1. **Vercel Hobby** (`vercel.com`): Sign in with personal GitHub (`Control707`); link personal repository `Control707/KSUX`.
2. **Convex Free (S16)** (`dashboard.convex.dev`): Create one Convex project (`ksux`); generate a **Production Deploy Key** for Vercel CI (`CONVEX_DEPLOY_KEY`).
3. **UploadThing Free ("2GB App")** (`uploadthing.com`): Create an app and copy `UPLOADTHING_TOKEN`.
4. **Gmail 2FA App Password** (Google Account Security → 2-Step Verification → App Passwords): Create a `16`-character App Password for `KSUX` (`500 emails / 24h` SMTP limit; optional second Gmail account for fallback).
5. **Groq Cloud Free** (`console.groq.com`): Enable **Zero Data Retention (ZDR)** in org settings and create `GROQ_API_KEY`.
6. **Google Gemini Developer API Free** (`aistudio.google.com`): Create `GEMINI_API_KEY` (unpaid tier; `Scrappy` strips `.edu` emails & internal IDs before failover).
7. **Cloudflare Workers AI Free** (`dash.cloudflare.com`): Copy Account ID (`CLOUDFLARE_ACCOUNT_ID`) and create a Workers AI token (`CLOUDFLARE_API_TOKEN`, `10,000 Neurons/day`).
8. **Self-Hosted VAPID ECDSA Keypair**: Generate locally once with:
   ```bash
   pnpm dlx web-push generate-vapid-keys
   ```

---

## 2. Environment Variable Partitioning

### A. Vercel / Next.js Environment (`.env.local` in dev, Vercel Project Env in prod)

| Variable | Required? | Notes |
| :--- | :---: | :--- |
| `NEXT_PUBLIC_CONVEX_URL` | **Yes** | Convex deployment `.convex.cloud` URL (auto-populated locally by `npx convex dev`). |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | **Yes** | Convex HTTP Actions `.convex.site` URL. |
| `KSUX_SERVER_SECRET` | **Yes** | Same private value as the Convex deployment. Used for OTP, browser credentials, uploads, and Scrappy streaming. |
| `UPLOADTHING_TOKEN` | **Yes** | Shared with UploadThing `/api/uploadthing` Next.js Route Handler. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional | Omit to hide OS Web Push subscription prompt while keeping Tier-0 in-app toasts active. |
| `CONVEX_DEPLOY_KEY` | Prod CI only | Set in Vercel Project Env so `npx convex deploy --cmd 'pnpm build'` deploys schema + functions atomically. |

### B. Convex Deployment Environment (`npx convex env set KEY VALUE`)

| Variable | Required? | Local-Dev / Missing-Key Fallback |
| :--- | :---: | :--- |
| `KSUX_SERVER_SECRET` | **Yes** | Use the same randomly generated 32-byte secret in Convex and the Next.js server. Keep it out of browser bundles. |
| `GMAIL_SMTP_USER` / `GMAIL_SMTP_APP_PASSWORD` | Prod **Yes** | If unset and `KSUX_ALLOW_DEV_OTP_LOG=true`, 6-digit OTPs print to Convex dev logs (`rejected` in production). |
| `GMAIL_SMTP_FALLBACK_USER` / `_APP_PASSWORD` | Optional | Secondary `500/day` Gmail relay used only if primary hits daily quota. |
| `KSUX_ALLOW_DEV_OTP_LOG` | Dev only | Set `"true"` in local Convex dev; must remain unset/`"false"` in production. |
| `GROQ_API_KEY` | **Yes** | Primary `Scrappy` tier (`openai/gpt-oss-120b` & `openai/gpt-oss-20b`). |
| `GEMINI_API_KEY` | Recommended | Skips Tier-2 overflow if unset (`Scrappy` degrades to Groq → Cloudflare). |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Recommended | Skips Tier-3 fallback and vector embeddings if unset (`Scrappy` falls back to Convex full-text search + structured tools). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optional | Set the same public key in both Next.js and Convex. Convex requires the key pair to dispatch. Example subject: `mailto:your-handle@students.kennesaw.edu`. |
| `UPLOADTHING_TOKEN` | **Yes** | Required inside `"use node"` `UTApi.deleteFiles(...)` cleanup actions. |
| `KSUX_MAINTAINER_EMAILS` | Recommended | Comma-separated canonical `.edu` emails granted `"prod"` `Moderation Queue` access. |
| `KSUX_ALERT_COPY_MODE` | Optional | `off` (default, links-only), `shadow` or `display`. See Official Alerts copy below. |
| `KSUX_ALERT_PUSH` | Optional | `true` allows opt-in Alert push once the copy is displayed and signed off. |
| `KSUX_ALERT_SHADOW_HOURS` | Hackathon only | Shortens the required shadow window, in hours (minimum 1). Unset means the full 14 days. |

---

## 3. Day 0 Seed & Local Bootstrap Order

1. **Install dependencies**:
   ```bash
   pnpm install
   ```
2. **Start / initialize Convex dev deployment**:
   ```bash
   npx convex dev --once
   ```
3. **Configure the local server secret.** Set `KSUX_SERVER_SECRET` in `.env.local` and set the same key in local Convex with `npx convex env set KSUX_SERVER_SECRET`. The Playwright wrapper configures its own secret when it starts the anonymous backend.
4. **Hydrate the local catalog.** The default seed installs campus reference data and the verified Banner subset. It omits generated Club and Event catalogs, example syllabi and dining menus, shuttle positions, and room availability.
   ```bash
   npx convex run seed:bootstrapKsu
   ```
   For an isolated judge deployment, start with a fresh local database and opt in to fixtures.
   ```bash
   npx convex run seed:bootstrapKsu '{"includeFixtures":true}'
   ```
   `pnpm seed:fixtures` regenerates the checked-in synthetic data and approximate GeoJSON locally. See [campus data provenance](../KSUX.md#campus-data-provenance).
5. **Backfill selective 768-dim vectors (optional when Cloudflare credentials are configured)**:
   ```bash
   npx convex run seed:backfillEmbeddings
   ```
6. **Run Next.js + Convex locally**:
   ```bash
   pnpm dev
   ```
   Open `http://localhost:3000/?demo=1` to verify `Judge Demo Mode` immediately.

---

## 4. Production Deployment (Vercel Hobby + Convex Free)

1. Set all Convex production env vars:
   ```bash
   npx convex env set --prod GROQ_API_KEY "..."
   # Repeat for KSUX_SERVER_SECRET, GMAIL_SMTP_*, GEMINI_API_KEY, CLOUDFLARE_*,
   # VAPID_*, NEXT_PUBLIC_VAPID_PUBLIC_KEY, UPLOADTHING_TOKEN, KSUX_MAINTAINER_EMAILS
   ```
2. Configure Vercel Build Command to deploy Convex schema/functions atomically before Next.js builds:
   ```text
   npx convex deploy --cmd 'pnpm build'
   ```
3. Push to `main` (or trigger Vercel deploy), then run the idempotent production seed once:
   ```bash
   npx convex run --prod seed:bootstrapKsu
   npx convex run --prod seed:backfillEmbeddings
   ```
   The default seed retires recognized legacy fixtures when upgrading an older deployment. Keep `includeFixtures` on an isolated judge deployment.
4. Verify live production smoke URL: `https://<app>.vercel.app/?demo=1`.

---

## Moderator console and Appeals (#87)

`/moderation` implements SPEC-v2 §8 and the #68 Variant A verdict. It is KSU-wide,
with one priority queue: identifies-me claims, held photos, other Incident
reports, then Posts/Listings and the retained v1 report types, oldest first within
each band. A phone row opens a review page with sticky actions; desktop keeps
the list and review side by side. Back/Esc restores row focus. Every action has
an `alertdialog` with effects, in-app notices, Appeal eligibility and a log-line
preview; Cancel is focused first. A Note stays in the queue. After other actions,
phones return to the list and desktop opens the next item.

`convex/moderatorConsole.ts` exposes `queue`, `review`, `noteLinks`, `act`,
`actionLog`, `appeals`, `appealSnapshot`, `decideAppeal`, `myNotices`,
`submitAppeal`, `roster`, `appoint` and `revoke`. Production appointments require
an active `@students.kennesaw.edu` Student, their plain-text CSA declaration and
the maintainer's assessment. Ambiguous declarations must be resolved before
granting Incident access. Revoking a CSA maintainer's appointment retains their
CSA declaration: the separate maintainer role must not bypass the guard.
Faculty/Staff cannot receive an appointment.

Both query and mutation boundaries enforce workspace, author/report/claim
conflicts and the CSA Incident exclusion. The author and deciding Moderator
cannot read an Appeal snapshot or decide it. A suspension Appeal requires a
different maintainer. Exclusions are explained with notes; no review time is
promised. Direct API calls cannot bypass these checks. Feed health and V2 launch
readiness remain production-maintainer-only in **Feed health**; the **Moderators**
section retains manual Club officer review alongside the roster.
The Official Alert copy controls from #80 are retained in Feed health. The
maintainer-only **Clout anomalies** section retains #90's anomaly view, including
its isolated Demo exercise. Official-note links use #80's display/shadow/kill
switch rules and open the implemented `/safety/alerts/<id>` detail route.

Remove reasons and Note templates are code constants. Redaction replaces every
occurrence of the exact supplied words and adds the identifying-details template.
It restores an Under-review Incident and closes its pending reports. An inaccurate
note on Restore is optional and unchecked; it is accepted only when there were
false/misleading reports. Official-note links must reference a listed, unexpired
Official Alert from the institutional partition (or the same isolated Demo), and
duplicate links must name another currently visible Incident in the workspace.
Held photos are hidden until **Show photo** and include their remaining hold time;
approval, blur and rejection remain the photo workflow in #89.

Each confirmed decision writes one `moderatorActions` row and closes only pending
reports, preserving earlier outcomes for the identifies-me abuse policy. The new
decision API uses a per-request identifier so a lost-response retry does not write
a second action, notice or note. Snapshots are kept for 30 days and patched away
by existing housekeeping; metadata stays for 365 days. The Action log discloses
metadata and snapshot expiry only, with a captioned table in a labelled focusable
scroll region. Snapshots are disclosed only through a guarded Appeal request.
Reads enforce expiry even before housekeeping runs. No moderation action sends
push or contacts police.

Authors read decisions at `/profile/moderation`, accessible from the You rail and
Quick Sheet, and submit one 1–1000-character Appeal per eligible decision before
its snapshot expires. There is no second Appeal after Uphold or Reverse. Reversal
restores removed content if still available; a newer decision or author deletion
prevents an older Appeal from overwriting it. Reversing a suspension restores
account access; previously removed artifacts and reversed Clout stay removed.
Suspended Students retain their identity and restricted sessions for notices and
Appeals. During that window OTP reauthentication reaches the same restricted
screen and cannot create a replacement profile or access ordinary app APIs.

The queue initially reads up to 200 open and 200 quarantined reports with the
workspace/status/priority index, plus 100 unexpired held assets. It then groups
targets, loads their reports and applies exclusions before projection. Review
loads at most 100 Updates; Note choices load at most 50 Alerts and 50 visible
Incidents per Campus; the log shows the latest 200 entries; Appeals show at most
100 of each status; notices and roster show at most 100 rows. These are bounded
review windows, not total-backlog counts. Measure the RUNBOOK I/O meter before
raising them. The `moderationNotices` table adds recipient-led reads and the
existing workspace-led retention/Demo purge; `moderatorActions.by_request` supports
retry deduplication. No additional content store or notification delivery service
is introduced.

Demo menu: Maya is the maintainer and has fixture report conflicts; Alex is a
Moderator; Sam is a second Moderator for Appeals; Jordan is the Incident author.
Open `/moderation?demo=1`, switch to Alex to review, switch to Jordan at
`/profile/moderation` to Appeal, then Sam to answer. Every fixture is labelled
**Demo · not real**. The restricted suspension screen includes persona-switch
buttons so an evaluator can leave the suspended persona safely.

Verification: `tests/convex/moderator-console.test.ts` covers queue order,
exclusions, held-photo disclosure, fixed templates and link boundaries, exact-word
Redaction, one log on retries, optional inaccurate notes, private notices,
Appeals/Uphold/Reverse, restricted suspension sign-in and retention. Browser
coverage is `tests/e2e/moderator-console.spec.ts`; Layer 4 coverage is
`tests/a11y/moderation.spec.ts` plus the updated Profile/restore checks. Use the
standard `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e` and
`pnpm build` checks in the isolated local deployment. Real-device manual AT
verification remains the release-level checklist.

## KSUX v2 launch and Moderation operations

### Incident posting switch

- [ ] In production, appoint at least two active, verified Students with `@students.kennesaw.edu` addresses as Moderators; Faculty · Staff do not qualify. Record who appointed each and when in the prod-only Moderator roster. Future, expired, revoked, or inactive appointments do not count. Revoke appointments when staffing changes.
- [ ] Ask each appointee to record a plain-text CSA statement. A person who reports being a campus security authority, including a maintainer, does not review Incidents or Incident Appeals. Resolve ambiguous declarations before giving Incident queue access.
- [ ] Publish that volunteer Moderators offer no response-time commitment. Keep emergency contacts and official Alert links available independently of community posting.
- [ ] Practice handling an identifies-me report, a request to remove identifying content, redaction, record retention, and an Appeal in Judge Demo Mode. Suppress public identifying material through the documented queue, preserve the agreed audit record, and use the template-only notes.
- [ ] On a legal request, notify the designated maintainer privately. Record receipt and escalation in the authorized operations record. Preserve the material already in scope and refer disclosure or retention instructions to the authorized decision-maker.
- [ ] Record the Moderation operations checklist sign-off. Set the Convex production variable `KSUX_V2_MODERATOR_OPS_COMPLETE=true` only after sign-off. Keep `KSUX_V2_INCIDENT_POSTING` unset or false until launch.
- [ ] Set `KSUX_V2_INCIDENT_POSTING=true` to request release. The server still requires two eligible appointments and completed operations. Turning off either flag or revoking enough appointments closes the production gate. Incident writes must reuse `getIncidentLaunchGate` immediately before insert. Demo stays enabled.

### Database I/O measurement

From Convex's [function execution usage events](https://docs.convex.dev/platform-apis/track-usage), sum the measured database read and write bytes for the §14 functions during a representative pilot window. Use function-specific measurements from the same window. Include ordinary executions and subscription reruns. Separate other v2 activity and use zero only for a measured zero or a feature that was disabled during the sample. Do not substitute returned JSON bytes for Convex database I/O.

Set the Convex variable `KSUX_V2_DB_IO_SAMPLE` to JSON with `days` (elapsed days), `measuredAt` (UTC end timestamp), and `bytes` (observed totals). Example shape using zero as a placeholder for each value:

```json
{"days":7,"measuredAt":"2026-11-18T00:00:00Z","bytes":{"alertSourceStatus":0,"activeIncidents":0,"olderIncidents":0,"incidentDetail":0,"leaderboard":0,"other":0}}
```

Maintain this weekly during the pilot. The maintainer panel projects each measured total over 30 days, flags 50% and 70% of 1 GB, and marks samples older than seven days stale. Compare with the full team budget separately. The Leaderboard (§13 gate 2(a)) reads the same sample: `/leaderboard` opens in production only when the sample covers at least 14 days of P0, is under seven days old, and projects under 50% of 1 GB. Otherwise it shows "coming soon", and earning Clout is unaffected. If a later sample is stale or projects 50% or more, the board closes again by itself. Above 70%, keep the Leaderboard off first and then lengthen Incident list refresh intervals if needed. The maintainer panel on `/moderation` shows the gate's current state and the Clout anomaly view (top weekly gainers, most-reversed accounts over seven days). Demo always shows its seeded boards.

### Official Alerts copy and Alert push (#80, ADR-0007)

KSUX reads exactly two public KSU pages and nothing else:

| Source shown to Students | Page | Category |
|---|---|---|
| KSU Police | [Timely Warnings](https://campus.kennesaw.edu/offices-services/public-safety-police/notifications/index.php) | Timely Warning |
| KSU Campus Security & Advisories | [Emergency Advisory page](https://www.kennesaw.edu/emergency/) | Emergency advisory |

**KSU's official notification channels**, named in `/safety`, `/safety/alerts/<id>` and `/profile/notifications#alerts`, are **KSU Alert (Rave)** (texts, calls and email from the KSU Office of Emergency Management; Students keep a cell number in OwlExpress), the two pages above, and **911**. KSUX push is supplementary: web push has no critical alerts, iPhone push needs the Home Screen app on iOS 16.4+, and a sent push may never arrive.

Two Convex variables control rollout. Both default off.

| `KSUX_ALERT_COPY_MODE` | Effect |
|---|---|
| unset / `off` | P0 links-only. The 5-minute cron returns at once and fetches nothing. |
| `shadow` | Polls both pages every 5 minutes in production and records results, items and shadow evidence. Students still see links only. No push. |
| `display` | Shows the copy for a source **only after its 14-day shadow poll is signed off**. Otherwise that source stays links-only. |

`KSUX_ALERT_PUSH=true` additionally allows Alert push, and only in `display` with a signed-off source.

**Rollout:**

1. Merge ADR-0007 (mark it accepted) and deploy. Run `seed:bootstrapKsu` if the two `ksu` source rows are missing.
2. Set `KSUX_ALERT_COPY_MODE=shadow`. The first fetch stamps `shadowStartedAt` on each source.
3. Watch **Moderation › Official Alert copy** (maintainers only) daily for 14 days. Each real page change increments the change count; any `unrecognized` result increments the unrecognized count and trips the automatic kill switch.
4. When a parse is wrong, or any result is `unrecognized`, fix the parser: save the real page under `tests/fixtures/official-alerts/`, add an expectation in `tests/adapters/official-alert-adapter.test.ts`, ship it, then **Restart shadow poll**. The 14 days begin again.
5. After 14 days with zero unrecognized results and every recorded change parsed correctly, select **Sign off the 14-day shadow poll** for each source. The server refuses an early sign-off. Record the date, the change count and the fixtures added in the release record.
6. Set `KSUX_ALERT_COPY_MODE=display`. Check `/safety` shows each source's quiet line with its check time.
7. Set `KSUX_ALERT_PUSH=true` only after the copy has been visible without issue. The Notifications switch becomes available.

**Hackathon fast path (deviation from SPEC-v2 §13).** For a time-boxed event the full 14 days can be shortened. This is a recorded exception; the real 14-day poll is still owed before a public launch.

1. Deploy, then set `KSUX_ALERT_SHADOW_HOURS=1` (or longer) and `KSUX_ALERT_COPY_MODE=shadow`.
2. Wait at least one hour (12 polls). The source must have at least one successful check and zero unrecognized results; the server refuses an earlier sign-off.
3. In Moderation › Official Alert copy, sign off each source. The panel shows the shortened window, and each sign-off records the window that applied.
4. Set `KSUX_ALERT_COPY_MODE=display` and `KSUX_ALERT_PUSH=true`. Every other push rule is unchanged: seen twice, 3 a day, blocked when stale or switched off.
5. Before public launch, unset `KSUX_ALERT_SHADOW_HOURS`, select **Restart shadow poll** for each source (this clears the short sign-off and returns the source to links-only), and run the full 14 days.

A real Alert push fires only when KSU actually posts a notice. To show push to judges without waiting for a real notice, use a test device subscribed to a staging deployment, never a fabricated notice in production.

**Behaviour to verify after each step:**

- Every fetch is `ok`, `quiet`, `unavailable` (network, non-2xx, truncated page; honours `Retry-After`, then backs off 15→30→60 min) or `unrecognized` (anything the parser can't positively match). Writes happen only on content change, recovery, or a heartbeat at most every 10 minutes.
- Stale is decided at read time: more than 20 minutes since the last success. Stale copy is labelled out of date, never shown as current, never bannered and never pushed. `/safety*` is never cached by the service worker.
- `unrecognized` auto-trips the kill switch and falls back to links-only; the next recognised fetch clears an automatic trip. **Switch copy off** is a manual trip: it stops fetching and survives recovery until switched back on.
- An item can push once when it first reaches issued, and once more for a quoted official all-clear, only after **two consecutive successful fetches with identical content**. A changed page or any failed fetch in between restarts the count. The payload names only the source ("KSU Police posted a new Timely Warning") and opens `/safety/alerts/<id>`.
- The cap is **3 Alert pushes per Eastern day** for everyone, derived from today's pushed items; later items record `capped`. Fan-out sends 100 opted-in devices per scheduled step and stops if the source turns stale or is switched off between batches.
- Judge Demo Mode reads fixtures for all 7 states, never fetches, and never pushes.

**Kill switch in an incident:** open Moderation › Official Alert copy and select **Switch copy off** for the source, or set `KSUX_ALERT_COPY_MODE=off` to stop polling and display entirely. Students keep the KSU links, KSU Alert (Rave) and 911. Opt-in settings are kept and resume when the copy returns.

Verify with `pnpm test -- tests/adapters/official-alert-adapter.test.ts tests/convex/official-alerts.test.ts tests/unit/safety-page.test.ts tests/unit/push-device.test.ts` and `pnpm test:e2e --project=a11y tests/a11y/safety.spec.ts`. Manually check a real Alert push on Chrome desktop, Android Chrome and an iPhone Home Screen install (iOS 16.4+), and that an iPhone Safari tab shows the Home Screen steps.

### P0 release record

Record the checked commit, test run URLs, manual accessibility log, I/O measurement window, and Moderator readiness sign-off.

- [ ] Phase 0 passes typecheck, isolated Convex deploy and seed, Judge Demo shell, route stubs, and shell accessibility automation.
- [ ] Phase 1A passes the Layer 4 route, theme, and viewport matrix on migrated screens.
- [ ] Phase 1B passes Incident, moderation, Appeals, official resources, offline, and Scrappy boundary checks.
- [ ] Phase 1C passes Clout ledger, corroboration, payout and private Profile checks.
- [ ] Layers 1–4 are green. Log VoiceOver on iOS Safari and Home Screen, TalkBack, keyboard, 200% zoom and text spacing, and phase Switch Access. Record remaining findings and confirm none stops a P0 flow.
- [ ] The I/O meter has a fresh measured pilot sample. Keep gated safety and P1 controls off until their separate readiness rules are met.

## 5. Verification Gate Commands

### Text-only Incident pilot (#79)

Start Judge Demo Mode at `/?demo=1`, then open Safety. Official resources remain
public; community reading and contribution require a verified session or Demo.
Every report starts with the Emergency Panel, including `/safety?report=1`.
The six questions collect an explicit category, Campus and building/area, claimed
observed time, description, name level and preview. Medical concerns, sexual
misconduct/dating violence/stalking and suspicion about a person divert to the
contacts rather than publishing. Photos remain in #89.

The form and server share deterministic text checks, including identifying
patterns and forbidden authority/safety claims. These conservative patterns are
not a promise to detect every name or identifying detail; the Moderation Report
paths remain necessary. Housing choices collapse numbered buildings to a complex
centroid. `node scripts/build-incident-places.mjs` rebuilds the allow-list after
refreshing `public/data/campus-buildings.geojson`; never accept caller coordinates.
The optional near-me sort runs once on the device and sends no coordinates.

`convex/incidents.ts` exposes `create`, `edit`, `addUpdate`, `deleteOwn`,
`activeIncidents`, `olderIncidents`, `incidentDetail` and `report`. All are scoped
by the existing viewer workspace. Submission reuses `getIncidentLaunchGate` at
insert time. Author edits lock after five minutes, Author Updates cap at five,
and deleting does not reset the rolling 3/hour or 6/day allowance. Age uses the
posted time, never the observed time or a recent Update. Original text is never
changed by an author after lock. The Moderator console and Redaction actions are
documented in the Moderator console section above (#87); Scrappy's deterministic Safety Card is #88.

Active reads share one projection for list and pins, bounded to 50 visible rows
per Campus, ordered by last activity. A workspace-led activity index ensures an
updated Incident remains eligible even beyond the first 50 by published time.
Older reads run only when opened, at most 20 per page, using the activity cursor.
Both queries filter eligibility by published time, so an Update never renews
the lifecycle. Each projection includes at most
50 dated Updates (at most five can be author-written). Direct reads return no
text/location/author/Updates for Under review, Removed, Deleted, expired or
foreign-workspace records. Block masks the handle while keeping the Incident.
P0 never returns Incident media, including held Demo photo fixtures.

Incident reads use uncached HTTP requests when mounted, on focus, after a local
Incident write, on manual refresh and once per minute while visible. Offline
unmounts the community view; reconnect starts a fresh empty view and waits for a
new server response. Failed refreshes hide the preceding result and offer Retry.
Requests time out after 15 seconds. Writes also use HTTP, so there is no durable
mutation queue or automatic reconnect submission. A request that loses its
response may still have reached the server; check the list before retrying.
Drafts live only in the mounted form. Closing discards them, with confirmation
if disconnected; changing Student or Demo persona discards the draft too.
The existing `/safety/**` service-worker bypass and precached `/emergency`
fallback remain the network boundary. Incident payloads never enter the commuter
cache, local storage, session storage or IndexedDB.

For #87, Incident Moderation Reports use `targetType: incident`,
`targetKey: incident:<id>`, priority 0 for identifies-me and 2 otherwise.
One distinct pending reporter counts once. The 1/2/3 thresholds hide the record
and quarantine its pending reports in the same mutation. Sensitive reasons share
the two-reporter band. Three rejected identifies-me claims (`restored` or
`dismissed`) in the rolling 30-day report window disable the one-tap hide; three
claims in a rolling day exhaust that day's allowance. Campus Safety requires the
Emergency Panel before sending. The console must preserve these report outcomes
when it reviews a decision. Reporting never creates an Alert, Post, Clout award
or push delivery.

Focused checks: `tests/convex/incidents.test.ts`,
`tests/unit/incident-boundaries.test.ts`,
`pnpm test:e2e --project=chromium incidents.spec.ts`, and
`pnpm test:e2e --project=a11y incidents.spec.ts safety.spec.ts`.
The existing production staffing/operations switches above remain off until
their separate launch prerequisites pass; a merged pilot does not enable them.

1. **Static typecheck & lint**:
   ```bash
   pnpm typecheck && pnpm lint
   ```
2. **Layer 1 & 2 (`convex-test` invariants + Vitest Action/static-boundary suite)**:
   ```bash
   pnpm test
   ```
3. **Layer 3 (Playwright 2-tab live WebSocket smoke test)**:
   ```bash
   pnpm test:e2e
   ```
   Exercises `?demo=1` (`@maya_cs`) → `Copy Co-Test Link` (`?demo=<shortCode>&persona=alex_owl`) across two live tabs: `Campus` switcher, `Parking Report` + `Spot Opening` on `Now`, `@scrappy` `Feed` mention + `Ask Scrappy` SSE, 2-tab `Deal Chat` `Confirm Meetup` → `Pending` → `Sold` → `Confirm Pickup`, `Moderation Queue (Demo)` restore, and `Reset Demo State`.

### Pull request checks

GitHub Actions runs the static checks, Vitest, Next.js build, and Chromium Playwright on pull requests. The build uses loopback Convex URLs. Playwright starts an anonymous local Convex backend and seeds Judge Demo fixtures. It uploads the HTML report and failure traces when the job fails.

Run the browser suite from a local development checkout with ports 3210, 3211, and 3100 free:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e commuter-fallbacks.spec.ts
```

The `a11y` job runs the Layer 4 accessibility specs in `tests/a11y/` (axe plus custom assertions across light/dark and 390/1440, including the keyboard map case). Run it locally with:

```bash
pnpm test:e2e --project=a11y
```

The manual assistive-technology pass, its results log and the remaining screen migrations live in [docs/accessibility](accessibility/README.md).

### Hosted release smoke checks

Record the date, deployment URL, verified commit SHA, tester, and outcome in the release issue.

- [ ] Sign in with a real KSU inbox. Confirm OTP delivery, verification, reload, and sign-out.
- [ ] Upload an image through the hosted media provider and confirm it renders. Verify cleanup for abandoned test media.
- [ ] If Web Push is enabled, opt in on a supported device and confirm receipt and navigation for an eligible message. Record the tested browser and device, or mark push disabled.

## Next-class wayfinding checks (#75)

On Now, the next weekly class is selected across both Campuses, independently of the location-screen Campus setting. Imported meetings override matching Banner meetings; unmatched and online classes retain their schedule cards. Building matching uses the shipped names and aliases and leaves unknown or ambiguous locations unlinked. The current semester is Spring (January–April), Summer (May–July), or Fall (August–December); this weekly schedule does not infer holidays or class cancellations.

Choose **Your stop** on a Transit stop card or pin Parking Lots on Parking. Now's **Start from** control reuses those choices. The stop is stored on the authenticated Student or isolated Demo persona, replacing the previous device-wide preference. Changing it in one Student's session never changes another's. Old device-wide choices are not imported because their owner is unknown.

The class card suggests the nearest destination stop on a relevant published route. For a cross-Campus origin it uses a route serving both Campuses. Distances are straight-line distances, not walking directions or promised transfers. Its arrival query reads one indexed route and the shared snapshot; it only uses the requested boarding stop's ETA. Snapshots older than 36 seconds are labelled stale; missing arrivals show scheduled operating hours without inventing an ETA. Demo estimates are labelled explicitly.

Visit Now online before an offline reload. The existing scoped commuter cache keeps only the schedule, Your stop and pinned-lot coordinates for this feature, never arrival estimates. The shared campus map and shipped route hours remain available offline. Sign-out clears the cache. Existing snapshots without travel preferences remain readable.

Focused verification: `pnpm test:e2e --project=chromium class-wayfinding.spec.ts`; the case checks a Kennesaw class, a Marietta class, a saved Kennesaw stop, a KM trip, keyboard map entry, axe, 320 px reflow and offline reload. Unit and Convex cases are in `tests/unit/class-wayfinding.test.ts` and `tests/convex/class-wayfinding.test.ts`.

## Verified Banner catalog refresh

The [public Owl Express class schedule](https://srs-owlexpress.kennesaw.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search) provides public term codes. The importer reads the [public class listing](https://owlexpress.kennesaw.edu/prodban/bwckctlg.p_disp_listcrse?crse_in=3305&schd_in=E&subj_in=CS&term_in=202608) without a NetID, stored credentials, personal schedules, or instructor email addresses.

Run a refresh for the current term weekly during registration and once for the incoming term when it is published. Use the approved Convex deployment from your own terminal. Review coverage on an isolated deployment before running the same command in production.

```bash
npx convex run courses:refreshBannerTerm '{"termCode":"202608","courses":["CS 3305","SWE 3313","ME 3101","MATH 1190"]}'
```

The sample scope was verified against both public terms on November 18, 2026. It returned 57 Kennesaw/Marietta sections for Fall 2026 and 36 for Spring 2027. These counts cover four courses, across both Campuses. The importer accepts up to eight course requests and 300 validated sections per term, makes sequential requests with a delay, and never fetches a private portal. Other sites and fully remote records without a physical Campus are outside this import’s scope.

Course Hubs show the number of accepted sections from the last successful scope and its refresh date. A timeout, invalid page (including missing section headings, times, or weekday cells), missing course, or unusually large drop in the same scope leaves the preceding catalog and refresh time in place. Explicit published TBA/arranged times remain unscheduled. Existing section and Course Hub IDs are reused; a verified CRN cannot be reassigned to a different Course Hub. Promoting a fixture Course Hub retires its unverified fixture sections without deleting existing references or retaining synthetic enrollment counts.

Refreshes are single-flight per term with a two-minute lease. Failures record the attempt and retain the last accepted count/hash; after three consecutive failures, retries back off for 15 minutes, then 30 minutes, capped at one hour. A successful refresh clears the circuit. A term whose first refresh failed is not added to the term picker. The institutional seed remains a small fallback and stays isolated from the Judge Demo fixtures.
