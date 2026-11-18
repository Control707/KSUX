# KSUX — Day 0 Provisioning, Seed & Deployment Runbook

> Companion operations runbook to [`docs/SPEC.md`](./SPEC.md) for running KSUX locally and deploying to `$0` free-tier production.

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

Maintain this weekly during the pilot. The maintainer panel projects each measured total over 30 days, flags 50% and 70% of 1 GB, and marks samples older than seven days stale. Compare with the full team budget separately. Use the §13 rollout rules before enabling the Leaderboard. Above 70%, keep the Leaderboard off first and then lengthen Incident list refresh intervals if needed.

### P0 release record

Record the checked commit, test run URLs, manual accessibility log, I/O measurement window, and Moderator readiness sign-off.

- [ ] Phase 0 passes typecheck, isolated Convex deploy and seed, Judge Demo shell, route stubs, and shell accessibility automation.
- [ ] Phase 1A passes the Layer 4 route, theme, and viewport matrix on migrated screens.
- [ ] Phase 1B passes Incident, moderation, Appeals, official resources, offline, and Scrappy boundary checks.
- [ ] Phase 1C passes Clout ledger, corroboration, payout and private Profile checks.
- [ ] Layers 1–4 are green. Log VoiceOver on iOS Safari and Home Screen, TalkBack, keyboard, 200% zoom and text spacing, and phase Switch Access. Record remaining findings and confirm none stops a P0 flow.
- [ ] The I/O meter has a fresh measured pilot sample. Keep gated safety and P1 controls off until their separate readiness rules are met.

## 5. Verification Gate Commands

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

## Verified Banner catalog refresh

The [public Owl Express class schedule](https://srs-owlexpress.kennesaw.edu/StudentRegistrationSsb/ssb/term/termSelection?mode=search) provides public term codes. The importer reads the [public class listing](https://owlexpress.kennesaw.edu/prodban/bwckctlg.p_disp_listcrse?crse_in=3305&schd_in=E&subj_in=CS&term_in=202608) without a NetID, stored credentials, personal schedules, or instructor email addresses.

Run a refresh for the current term weekly during registration and once for the incoming term when it is published. Use the approved Convex deployment from your own terminal. Review coverage on an isolated deployment before running the same command in production.

```bash
npx convex run courses:refreshBannerTerm '{"termCode":"202608","courses":["CS 3305","SWE 3313","ME 3101","MATH 1190"]}'
```

The sample scope was verified against both public terms on November 18, 2026. It returned 57 Kennesaw/Marietta sections for Fall 2026 and 36 for Spring 2027. These counts cover four courses, across both Campuses. The importer accepts up to eight course requests and 300 validated sections per term, makes sequential requests with a delay, and never fetches a private portal. Other sites and fully remote records without a physical Campus are outside this import’s scope.

Course Hubs show the number of accepted sections from the last successful scope and its refresh date. A timeout, invalid page (including missing section headings, times, or weekday cells), missing course, or unusually large drop in the same scope leaves the preceding catalog and refresh time in place. Explicit published TBA/arranged times remain unscheduled. Existing section and Course Hub IDs are reused; a verified CRN cannot be reassigned to a different Course Hub. Promoting a fixture Course Hub retires its unverified fixture sections without deleting existing references or retaining synthetic enrollment counts.

Refreshes are single-flight per term with a two-minute lease. Failures record the attempt and retain the last accepted count/hash; after three consecutive failures, retries back off for 15 minutes, then 30 minutes, capped at one hour. A successful refresh clears the circuit. A term whose first refresh failed is not added to the term picker. The institutional seed remains a small fallback and stays isolated from the Judge Demo fixtures.
