# KSUX — Implementation Specification

> Consolidated implementation specification resolved across Wayfinder [Map #1](https://github.com/Control707/KSUX/issues/1) (tickets `#2–#12`), [`GLOSSARY.md`](../GLOSSARY.md), and [`docs/adr/0001–0006`](./adr/).
>
> **v2:** [`SPEC-v2.md`](./SPEC-v2.md) amends §1, §3, §4.5, §5, §6.4, §7, §8 and §9 and wins wherever the two disagree. Its "Amendments to SPEC.md" table lists every change.

---

## 1. Product Scope, Budget & Domain Rules

- **Mission**: A mobile-first progressive web app (PWA) unifying Kennesaw State University's `Kennesaw` and `Marietta` `Campuses` across 10 capabilities: `Now` commuter HUD, `Parking`, `Study Rooms` & `Study Sessions`, `Events`, `Clubs`, `Course Hubs`, Big Owl Bus `Shuttle Routes`, `Dining Venues`, campus `Feed` + `Direct Messages` / `Group Chats`, peer-to-peer `Marketplace` `Listings` + `Deal Chats`, and `Scrappy` the Owl AI.
- **Hard Constraints**:
  - **$0 Total Cost**: Zero paid hosting, database, email/domain, storage, map, or LLM dependencies; no credit-card-gated services (no Cloudflare R2, Firebase Storage/Blaze, Clerk Pro, Cerebras, Resend custom domain).
  - **Zero KSU IT Approvals**: No NetID/Entra SSO app registration, no D2L private `.ics` token polling, no `owllife.kennesaw.edu` (redirects to Suitable `401`).
  - **5-Day Hackathon Target**: Complete end-to-end deployed Next.js + Convex app with `Judge Demo Mode` instant evaluation.
- **Out of Scope**:
  - Separate native iOS/Android apps.
  - In-app `Marketplace` payment processing, escrow, or shipping.
  - Closed KSU ERP/registrar/bursar/gradebook mutations.
- **Canonical Vocabulary**: Strictly follow [`GLOSSARY.md`](../GLOSSARY.md) across UI copy, schema names, tests, and documentation (`Student`, `Campus`, `Judge Demo Mode`, `Post`, `Feed`, `Direct Message`, `Group Chat`, `Club`, `Course Hub`, `Listing`, `Deal Chat`, `Meetup Spot`, `Parking Lot`, `Parking Report`, `Study Room`, `Study Session`, `Event`, `Shuttle Route`, `Dining Venue`, `Scrappy`).

---

## 2. Zero-Cost Stack & Quota Architecture

| Layer | Choice | Free-Tier Limits & Mandatory Guardrails |
| :--- | :--- | :--- |
| **Repo & Toolchain** | Single root `pnpm` repo: **Next.js App Router (React 19, TypeScript strict, Tailwind CSS v4)**, `lucide-react`, `maplibre-gl`, `vitest` + `convex-test`, Playwright | Use a hand-written versioned `public/sw.js` (avoiding `@serwist/next` / `next-pwa` Turbopack/webpack build friction). |
| **Hosting** | **Vercel Hobby** (`*.vercel.app` under personal GitHub `Control707/KSUX`) | `100 GB` Fast Data Transfer, `1M` invocations, `300s` max Node.js duration. **Zero** `vercel.json` crons; deploy atomically via `npx convex deploy --cmd 'pnpm build'`. |
| **Database, Realtime & Crons** | **Convex Free (S16)** | `1,000` concurrent WebSocket sessions, `1M` calls/mo, `1 GB/mo` DB I/O, `0.5 GB` DB+index, `0.5 GB` search/vector, `20 GB-hrs/mo` Action compute, no 7-day auto-pause. Mount-scoped `.paginate({ numItems: 25 })` / `.take(25)` (never unbounded `.collect()`), single `shellSummary` header subscription, zero typing/presence DB writes, V8 `internalAction`s (`64 MB`) for KSU HTTP syncs. |
| **Auth Email** | **Gmail App-Password SMTP (`smtp.gmail.com:465`)** via `nodemailer` in `"use node"` `internalAction` | `500 emails / 24h` (optional secondary Gmail fallback; console OTP log in local dev when `KSUX_ALLOW_DEV_OTP_LOG=true`). Send 6-digit numeric OTPs (never magic links, which KSU Safe Links pre-fetches). |
| **Media Storage** | **UploadThing Free ("2GB App")** | `2 GB` storage, unlimited egress. Still images only, client-side Canvas WebP re-encoding (`≤1440px`, quality `0.8`, `1 MB` hard route limit, strips EXIF/GPS). Caps: `4` images/`Post` or `Listing`, `1`/chat message, `1` avatar, `20` uploads/`demoSessionId`. |
| **Campus Maps** | **`MapLibre GL JS` + `OpenFreeMap`** (`tiles.openfreemap.org`) | No card, no API key; OSM/Carto raster fallback; static `/public/data/*.geojson` polygons & offline embedded background style. |
| **`Scrappy` LLMs** | **3-Tier OpenAI-Compatible Router** | **Tier 1 (Primary)**: Groq Cloud Free (`openai/gpt-oss-120b` for `Ask Scrappy`, `openai/gpt-oss-20b` for `@scrappy` mentions; ZDR enabled, `60 RPM` / `2,000 RPD` / `400k uncached TPD`). **Tier 2 (Overflow on `429` / `>4,500` uncached input tokens)**: Google Gemini Free (`gemini-3.5-flash-lite` / `gemini-4-hydrogen`, `.edu` emails & internal IDs stripped). **Tier 3 (ZDR Fallback)**: Cloudflare Workers AI (`@cf/google/gemma-4-26b-a4b-it`, `10k Neurons/day`). |
| **Embeddings** | **Cloudflare Workers AI** (`@cf/google/embeddinggemma-2`, `768` dims) | `3,000 RPM`, ZDR. Selective indexing strictly on `posts`, `listings`, `events`, and `clubs` (`~24–32 MB`). |

---

## 3. Navigation Shell, Layout & `Campus` Switcher

Prototype reference: [`prototype/ksux-shell.html`](https://github.com/Control707/KSUX/blob/prototype/ksux-shell/prototype/ksux-shell.html) (`Variant B + A Hybrid`).

1. **5-Slot Mobile Bottom Bar**:
   - **`Now` (`/`)**: Default 0-tap Commuter Bento HUD (pinned `Parking Lot` fullness + overflow `Shuttle Route` reroute, next Big Owl Bus ETA, open `Study Rooms` & `Study Sessions`, `Dining Venue` highlights, today's `Events`, `Scrappy` brief).
   - **`Feed` (`/feed`)**: Stream pills (`Campus` | `Following` | `Trending (24h)`), topped by quick-filter rings for enrolled `Course Hubs` & joined `Clubs` plus `Browse All Hubs & Clubs`.
   - **`🦉 Scrappy / ⚡ Quick Sheet` (Center Hero)**: Half-screen command sheet with `Ask Scrappy` entry, 1-tap composers (`+ Post`, `+ Parking Report`, `+ Listing`, `+ Study Session`), and 2×5 icon grid linking all 10 capabilities.
   - **`Marketplace` (`/marketplace`)**: `Listings`, `Meetup Spot` badges, and instant `Deal Chat` creation.
   - **`Chats` (`/chats`)**: Unified inbox (`All`, `Direct Messages`, `Group Chats`, `Deal Chats`) with unread indicators.
2. **Desktop Responsive (`≥1024px`)**: 3-column workspace — left nav rail, center active module pane, right always-visible `Campus` Pulse rail (`Shuttle Routes` + `Parking Lots`).
3. **Sticky Top Header**:
   - **3-Way `Campus` Switcher**: `Kennesaw` | `Marietta` | `All KSU` (persisted per `Student`, defaulting to `homeCampus`; stored records remain strictly `Kennesaw` or `Marietta`, with `All KSU` as a UI filter). Always preserves active `Chats`, enrolled `Course Hubs`, and the intercampus `Kennesaw–Marietta` `Shuttle Route`.
   - **`Judge Demo Mode` Chrome**: High-contrast amber pill **`⚡ JUDGE DEMO · Maya (Kennesaw) ▾`** (3-persona switcher, `Copy Co-Test Link`, `Moderation Queue (Demo)`, `Reset Demo State`, `Verify KSU .edu Email`).
4. **Frozen URL Contract**: `/`, `/feed`, `/marketplace`, `/chats`, `/chats/[chatId]`, `/scrappy`, `/courses/[subjectCourse]`, `/clubs/[slug]`, `/events/[eventId]`, `/parking`, `/study`, `/study/[sessionId]`, `/agenda`, `/transit`, `/dining`, `/profile`, `/moderation`. `/agenda` is Student-private and KSU-wide, with per-item Campus badges and no location switcher (issue #76; ADR-0008).

---

## 4. Identity, `.edu` Verification, Moderation & `Judge Demo Mode`

1. **Cold-Start Gate**: Dual-Path Welcome (`Sign in with KSU .edu Email` | `⚡ Enter Judge Demo Mode`), plus `?demo=1` direct boot. Unauthenticated internet visitors never see real `"prod"` `Student` content.
2. **`.edu` Eligibility & Canonicalization**:
   - Allowed domains: `@students.kennesaw.edu` (`Verified Student` badge) and `@kennesaw.edu` (`KSU Faculty · Staff` badge). Equal module access.
   - Canonicalize lowercase + strip `+tag` subaddressing before `@` prior to lookup/OTP storage.
   - Raw `.edu` emails and NetID prefixes are **never** returned to public views or client profiles.
3. **OTP & Session Security**:
   - SHA-256-hashed 6-digit OTPs in `emailOtps`: `10m` expiry, `5`-attempt cap (invalidates code on 5th failure), `1 resend / 60s`, `5 OTPs / 24h` per canonical email, `10 OTPs / hr` per hashed IP.
   - Opaque 256-bit `sessionToken` stored hashed in `studentSessions` (`30d` sliding expiry refreshed at most once per `24h`), mirrored to `HttpOnly; SameSite=Lax; Path=/` cookie (`Secure` enabled when `NODE_ENV === "production"`).
   - Next.js Route Handlers (`/api/uploadthing`, `/api/scrappy/stream`, `/api/auth/session`) contain zero duplicated auth logic; they forward the `sessionToken` cookie (or `x-ksux-demo-session` + `x-ksux-demo-persona`) to Convex `viewerContext` validation.
4. **Onboarding (`<30s`) & Handles**:
   - Step 1 (required): Display name, unique `@handle` (`3–20` `[a-z0-9_]`, case-insensitive uniqueness, reserved denylist blocking `scrappy`, `ksu`, `kennesaw`, `marietta`, `admin`, `mod`, `moderator`, `police`, `ksupd`, `owllife`, `support`, `system`, `official`, `maya_cs`, `jordan_me`, `alex_owl`, `sam_cpe`, `taylor_bio`, max `1` change / `30d`), and `homeCampus`.
   - Step 2 (skippable): Major, class year, avatar upload, `.ics` schedule upload or `Course Hub` search.
5. **Safety, Moderation & Tombstones**:
   - **Write-Time Guardrails**: Deterministic regex/keyword check rejects slurs, phone/SSN/street-address doxxing, and prohibited `Marketplace` items (weapons, drugs/alcohol/vapes, academic dishonesty, parking permits). Off-platform payment keywords (`Zelle`, `CashApp`, `Venmo`, `deposit`, `wire`) in `Deal Chats` trigger an inline in-person `Meetup Spot` safety banner.
   - **1-Tap `Report`**: Immediately hides item for reporter; **`3` distinct verified `Students`** auto-quarantines to `visibilityStatus: "under_review"` (hidden from public views and `Scrappy`). Selecting `Campus Safety` displays KSU Police (`470-578-6666`) / `911` / LiveSafe callout.
   - **Mutual `Block`**: Hides each party's `Posts` and `Listings` from the other, freezes 1:1 `Direct Messages`, blocks new `Deal Chats`/co-party invites, and collapses shared `Group Chat` messages behind tap-to-reveal placeholders.
   - **Self-Delete vs. Suspension**: Retains `students` row (`accountStatus: "deleted" | "suspended"`) rendering historical chat messages as **`[Removed Student]`**, revokes push, closes open `Posts`/`Listings`/`Study Sessions`/`Parking Reports` and purges UploadThing assets. Self-delete revokes sessions and scrubs `canonicalEmail` (`30d` `handleReservations`). Under SPEC-v2 §8 (#87), suspension preserves the identity and restricted sessions for in-app notices and one Appeal; OTP reauthentication during that window reaches only the restricted screen, with ordinary viewer functions blocked. Legacy permanent email-hash locks remain enforced.
   - **Moderator console**: SPEC-v2 §8 (#87) replaces the maintainer queue with appointed Student Moderators, CSA/conflict guards, confirmed actions, the retained Action log and different-reviewer Appeals at `/moderation`. Maintainers alone manage appointments and suspensions. Feed health remains production-maintainer-only in its own section. Author notices and Appeals are at `/profile/moderation`. Demo adds `@sam_cpe` as a fourth switchable persona for a second reviewer; every action stays scoped to `"demo:<demoSessionId>"`.
6. **`Judge Demo Mode` Two-Way Isolation**:
   - `?demo=1` or `?demo=<shortCode>` provisions/attaches a `demoSessionId` (`24h` TTL) cloning ~50 boot-relative fixture rows (`@maya_cs`, `@jordan_me`, `@alex_owl`, plus `@sam_cpe` and `@taylor_bio`) into `workspaceKey: "demo:<demoSessionId>"`.
   - `"ksu"` institutional rows are **100% read-only** to demo mutations; demo RSVPs, club joins, enrollments, and reports write exclusively to `"demo:<demoSessionId>"` and overlay at read time.
   - `activePersonaHandle` lives in **per-tab `sessionStorage`** (passed via `viewerContext` / `x-ksux-demo-persona`); `Copy Co-Test Link` generates `?demo=<shortCode>&persona=alex_owl` for 2-tab live WebSocket co-testing without overwriting Tab 1.

---

## 5. Hybrid KSU Data Feeds, Sync Schedules, Caching & PWA

1. **Three-Tier Ingestion Split (`<3%` of Convex Free Quotas)**:
   - **Tier A — Scheduled V8 `convex/crons.ts` (payload-hash diff-gated via `feedSyncState.lastPayloadHash`)**:
     - `Shuttle Routes` (Passio GO `vehiclePositions.json`, `tripUpdates.json`, `serviceAlerts.json`): **`2m`** during operating hours (`Mon–Fri 06:30–23:30 ET`, `Sat–Sun 10:00–19:00 ET`), **`30m`** overnight; weekly `feed_info.txt` check (`Sun 04:00 ET`). Active `Transit & Map` tabs poll Passio GO directly via `CORS: *`.
     - `Events` (`calendar.kennesaw.edu/api/2/events?days=30` + `kennesaw.campuslabs.com/engage/events.ics` & `events.rss`): **`30m`** (`:07`, `:37`), deduplicated on `(normalized title + start ±15m)` with Localist winning ties, `isVirtual` mapped to `campusScope: "Both"`, and missing upcoming RSVPed `Events` marked `Cancelled Upstream`. Selectively embed only new/changed `Events`.
     - `Dining Venues` (`17` venues): `hours-locations.php` daily (`05:00 ET`), Nutrislice `Today + Tomorrow` menus twice daily (`05:15 ET`, `11:15 ET`).
   - **Tier B — On-Demand Single-Flight SWR + Warm Cron (`Study Rooms`)**:
     - `kennesaw.libcal.com` (`Sturgis` `lid=10524`, `Johnson` `lid=10526`, `Marietta AI Lab` `lid=24727`, respecting `Crawl-delay: 10`): `5m` SWR TTL (`60s` `refreshInFlightUntil` single-flight lease) + `30m` daytime warm cron (`07:12–23:12 ET`, sequential POSTs) + `6h` `api_hours_today.php`. Stores rolling `Today + Tomorrow` `v.int64()` 48-bit masks (`slotMask48`).
   - **Tier C — CLI-Seeded Catalogs & Lazy `7d` Simple Syllabus Cache**:
     - Seed `72` `Parking Lots` + `168`-hr Banner 9 priors, `47` LibCal + `10` walk-in `Study Rooms`, `11` `Shuttle Routes`, `17` `Dining Venues`, `544` active Engage `Clubs`, initial `Events`, `14` `Meetup Spots`, and `Fall 2026` (`202608`) + `Spring 2027` (`202701`) `Course Hubs` (`~1,600`) & `courseSections` (`~14,600`) via `internalMutation` `seed:bootstrapKsu`.
     - Fetch Simple Syllabus lazily into `courseSyllabiCache` (`≤8 KB` summary, `7d` TTL, `24h` `"not_found"` cache, `500`-row LRU cap).
2. **Crowdsourced Decay Windows (Read-Time `expiresAt`, Zero Per-Minute Crons)**:
   - `Parking Reports` (4-tier): `45m` window (`≥2` reports = `Live · Student-verified`, `≥3` within `20m` trims `≥2`-tier outliers; `1` = `70/30` blend with Banner 9 prior; `0` = `Estimated · Typical <Day Hour> class load`; `1 / 10m` per `Student`/lot).
   - `Spot Opening` pings: `10m` window (broadcast only, cleared on author cancel or `2` `Gone` votes).
   - Walk-in `Study Room` vibes (`Quiet`/`Moderate`/`Packed`): `45m`.
   - `Shuttle Route` stop pulses: `15m`.
   - `Dining Venue` `Line Checks`: `30m` (`1 / 15m` cooldown).
   - `Study Sessions`: Auto-end at `endTime`; `Study Session` `Group Chat` locks read-only at `endTime + 24h`.
3. **Outage Guardrails & `:42` Hourly Cursor Purge**:
   - Every upstream HTTP call uses `AbortSignal.timeout(8000)`, max `1` retry, `3`-strike exponential backoff (`15m → 30m → 60m` cap), and aborts upserts on `0` rows or `>80%` drop. Staleness pills appear past `15m` (`Shuttle`/`Study`), `2h` (`Events`), `24h` (`Dining`).
   - One `:42` hourly cron chains `≤200`-doc cursor batches: (a) `UTApi.deleteFiles` for expired `demoSessions` (`>24h`) and abandoned `pending` uploads (`>2h`), (b) cascade-delete expired `demoSessionId` rows, (c) prune expired `emailOtps` (`>1h`), `studentSessions` (`>30d`), `rateLimitBuckets`, `interpersonalLedgers`, `handleReservations`, aged pulses (`>24h`), and mark `>30d` untouched `Available` `Listings` `"expired"`.
4. **Notifications & Offline PWA Scope**:
   - **Tier 0 (Universal)**: Reactive `shellSummary` badges, top Slide-Down Toasts, `(N) KSUX` tab title.
   - **Tier 1 (Opt-In VAPID Web Push, `"prod"` only)**: Low-fan-out only (`Direct Messages`, `Message Requests`, `Deal Chats`, `@scrappy` replies; max `1` push / `(recipient, chatId)` / `60s`, handle-only payloads, suppressed if muted/blocked/active tab/read `<15s`, max `3` endpoints/`Student`, disabled in `Judge Demo Mode`).
   - **Service Worker (`public/sw.js`)**: Network-First (`3s` timeout) HTML, Cache-First `/_next/static/*`, SWR `/public/data/*` (`<3 MB`), passthrough `/api/*` + Convex + Passio + UploadThing; non-disruptive `"Update available · Tap to reload"` pill. Offline MapLibre renders embedded style + precached GeoJSON + read-only `ksux_commuter_cache` (`0` offline writes, `0` offline `chatMessages`).

---

## 6. Social, Messaging, `Marketplace` & `Scrappy` Behavior

1. **`Feed` & Communities**:
   - Streams: `Campus` (`showInCampusFeed === true`), `Following` (`≤200` follows + joined `Clubs` + enrolled `Course Hubs`), `Trending (24h)` (write-time `hotScore = log10(max(likes + 2*replies + 3*repostsAndQuotes, 1)) + createdAtSec / 45000` + top 8 `hashtagDailyCounts`).
   - `Course Hub` `Posts` default `crossPostToCampusFeed: false`; `Club` `Posts` default `true`.
   - `Post`: `500` chars, `4` WebP images, `3` tags, `1` optional entity embed, flat single-root threads (`rootPostId`), `5m` typo edit window (never re-triggers `@scrappy`), hard-delete leaf / `[Deleted Post]` tombstone if replied.
2. **Unified `Chats`**:
   - **Cold `Direct Messages`**: Unrestricted if recipient follows sender or shares active `Study Session`/`Club` officer roster; otherwise inline `Message Request` (`1` text-only opener, `Accept` / `Decline` / `Block`, `30d` cooldown on `Decline`).
   - **`Group Chats`**: Lazy `(workspaceKey, parentType, parentId)` rooms for `Clubs`, `Course Hubs`, and `Study Sessions` (`24h` grace after `endTime` + `Convert to Closed Group Chat`), plus invite-only custom `Group Chats` (`≤50` `Students`).
   - **Payloads & Cursors**: `2,000` chars, `1` WebP image, reply quote, `5` reactions (`🦉 👍 ❤️ 😂 🔥`), `5m` edit, `[Message deleted]` tombstone. Zero-scan unread state via monotonic `chats.messageSeq` & `chatMembers.lastReadSeq` (`badgeMode: "dot"` for `Club`/`Course Hub`, `"count"` for `Direct Messages`/`Deal Chats`/custom).
3. **`Marketplace` & `Deal Chats`**:
   - `5` categories, `3` pricing modes (`$ Price / OBO`, `Free Pickup`, `Open to Trade`), `15` active `Listing` cap/`Student`, `30d` expiry.
   - Isolated `Deal Chat` per `(Listing, primaryBuyer)` (`2–6` `Students` via co-buyer/co-seller invites); pinned curated `Meetup Spot` Handoff Card (`Available` ↔ `Pending` ↔ `Sold` controlled strictly by primary seller; `Confirm Pickup` by primary buyer increments completed handoff counts capped at `1 / 7d` per `(seller, buyer)` pair).
4. **`Scrappy` Architecture & Isolation**:
   - **Hard Chat & Write Exclusion**: `convex/scrappy/tools.ts` exports `internalQuery` only, contains **zero** imports or queries touching `chats`, `chatMembers`, or `chatMessages`, and exposes **zero** server mutation tools (writes use client-side Pre-Filled Draft Cards).
   - **Tool Registries**: `ASK_SCRAPPY_TOOLS` (`7` tools: `searchFeedPosts`, `searchMarketplaceListings`, `searchEventsAndClubs`, `getCampusDailyPulse`, `lookupCourseHubAndSyllabus`, `getEntityDetail`, `getMyPersonalContext`) vs. `FEED_MENTION_TOOLS` (`6` tools, physically omitting `getMyPersonalContext`). Max `8` compact rows/tool; `<untrusted_campus_content>` fencing; clickable Citation Pills.
   - **Execution & Caps**: `@scrappy` in `Feed` uses 2 DB writes (`status: "thinking"` child reply → single final patch, no self-trigger, `5 / 10m` & `30 / day`, `error` refunds slot with author-only `Retry`); `Ask Scrappy` streams SSE (`≤6` prior turn pairs, `15 / 10m`).

---

## 7. `convex/schema.ts` (`40` Tables) & `viewerContext` Builders

Every `Student`-authored table leads B-tree, `.searchIndex`, and `.vectorIndex` filters with non-nullable `workspaceKey` (`"prod"` | `"demo:<demoSessionId>"` | `"ksu"`). Complete table & index contract (from [Ticket #11](https://github.com/Control707/KSUX/issues/11)):

- **Identity, Auth, Tombstones & Moderation (`7`)**: `students`, `emailOtps`, `studentSessions`, `demoSessions`, `handleReservations`, `studentBlocks`, `moderationReports`.
- **Social `Feed`, Saves & Trends (`4`)**: `studentFollows`, `posts`, `savedInteractions`, `hashtagDailyCounts`.
- **`Marketplace`, `Meetup Spots`, `Chats` & Push (`6`)**: `listings`, `meetupSpots`, `chats`, `chatMembers`, `chatMessages`, `pushSubscriptions`.
- **Daily-Life Catalogs, Snapshots, Enrollments & Pulses (`18`)**: `feedSyncState`, `parkingLots`, `parkingReports`, `studyRooms`, `studyRoomSnapshots` (`v.int64()` `slotMask48`), `studySessions`, `events`, `eventRsvps`, `clubs`, `clubMembers`, `courseHubs`, `courseSections` (strictly `2` B-tree indexes: `by_term_crn`, `by_hub_term`), `courseSyllabiCache` (`500`-row LRU), `studentEnrollments`, `shuttleRoutes`, `shuttleSnapshots`, `diningVenues`, `campusPulses`.
- **`Scrappy`, Media & Ledgers (`5`)**: `scrappyThreads`, `scrappyMessages`, `mediaAssets`, `rateLimitBuckets`, `interpersonalLedgers`.

**Function Builders (`convex/lib/viewer.ts`)**: `publicAuthQuery`/`Mutation`/`Action` (Welcome/OTP/Demo bootstrap only), `viewerQuery`/`Mutation`, `verifiedStudentMutation`, `moderatorMutation`. `filterVisibleContent` strips non-`visible`, `hiddenTargetKeys`, and `blockedStudentIds` across every read path. `studentEnrollments` and `course_members_only` `Study Sessions` assert ownership/enrollment.

---

## 8. 5-Day Tracer-Bullet Build DAG & Scope-Protection Cut-Lines

### Day 1 — Shared Trunk (Sequential, Mandatory Exit Gate)
1. **Scaffold & Tokens**: Root `pnpm` Next.js App Router + Tailwind v4 + Convex + `vitest` + `convex-test` + Playwright + `app/manifest.ts` + `/public/data/*.geojson`.
2. **Backend Core**: Complete `40`-table `convex/schema.ts`, `convex/lib/viewer.ts`, `internalMutation` `seed:bootstrapKsu`, `convex/demo/fixtures.ts`, and skeleton `convex/crons.ts` (split-ownership hook targets).
3. **Frozen UI/URL Shell**: `app/(shell)/layout.tsx` (5-slot mobile bar, 3-col desktop rail, sticky `Campus` switcher, `Judge Demo Mode` header pill, Quick Sheet, Toast host), Dual-Path Welcome + `?demo=1`, shared `<CampusEntityCard />` & `<ReportTrigger />` contracts.
4. **Day 1 Exit Gate**: `pnpm typecheck` passes, `npx convex dev --once` + `npx convex run seed:bootstrapKsu` succeeds, and `?demo=1` loads the 5-slot shell with seeded `Now` HUD data.

### Days 2–4 — 5 Disjoint Parallel Vertical Slices
- **Slice A (Identity, Moderation & Media)**: `convex/auth.ts`, `convex/students.ts`, `convex/moderation.ts`, `convex/uploads.ts`, `convex/authCleanup.ts`, `convex/demo/purge.ts`, `app/api/auth/*`, `app/api/uploadthing/*`, Welcome/OTP/Onboarding/`/profile`/`/moderation` UI.
- **Slice B (Social & Communities)**: `convex/feed.ts`, `convex/communities.ts`, `/feed`, `/courses/[subjectCourse]` (+ stateless `.ics` import), `/clubs/[slug]`, `/events/[eventId]` UI.
- **Slice C (`Marketplace`, Messaging & Push)**: `convex/marketplace.ts`, `convex/chats.ts`, `convex/push.ts`, `/marketplace`, `/chats`, `/chats/[chatId]` (`Direct Messages`, `Message Requests`, `Group Chats`, per-buyer `Deal Chats`, `Meetup Spot` Handoff Cards), Push settings.
- **Slice D (Daily Life, Map & KSU Sync)**: `convex/dailyLife.ts`, `convex/sync/*`, `/` (`Now` HUD), `/parking`, `/study`, `/transit` (`MapLibre GL JS` + browser-direct Passio GO), `/dining` UI.
- **Slice E (`Scrappy` & Offline PWA)**: `convex/scrappy/*`, `app/api/scrappy/stream/route.ts`, `/scrappy` (`Ask Scrappy` SSE), `@scrappy` `Feed` replies + Citation Pills + Pre-Filled Draft Cards, `public/sw.js`, `ksux_commuter_cache`.

### Day 4/5 Scope-Protection Cut-Lines
- **Never Cut (P0)**: Dual-Path Welcome + `.edu` OTP + `Judge Demo Mode` 3-persona switcher & `?demo=<shortCode>` 2-tab co-testing, all 5 shell slots + Quick Sheet, `Now` HUD, all 10 capabilities (`Parking`, `Study Rooms`, `Events`, `Clubs`, `Course Hubs`, `Shuttle Routes`, `Dining Venues`, `Feed`, `Direct Messages`/`Group Chats`/`Deal Chats`, `Scrappy` chat-isolated), and offline GeoJSON + `ksux_commuter_cache`.
- **Cuttable / Graceful Fallback (P1)**:
  1. Defer VAPID OS Web Push registration while keeping universal Tier-0 in-app Slide-Down Toasts and unread badges.
  2. Use checked-in sample syllabi for `@maya_cs`/`@jordan_me` courses + official Simple Syllabus deep-link fallback if live Simple Syllabus HTML/API shifts.
  3. Run `Scrappy` and browse search purely on Convex full-text search + structured queries if Cloudflare vector backfill lags.
  4. Parse standard `.ics` `VEVENT` (`SUMMARY`, `DTSTART`, `DTEND`, `LOCATION`, `RRULE:FREQ=WEEKLY;BYDAY=...`), skipping rare `EXDATE`/`RDATE` overrides.

---

## 9. Three-Layer Verification Gate

1. **Layer 1 — `convex-test` Invariant Suite**:
   - `viewerContext` rejects unauthenticated calls; strict `"prod"` vs `"demo:<id>"` vs immutable `"ksu"` isolation.
   - `studentEnrollments` (`CRN`/`.ics`) & `Course Hub Members Only` `Study Sessions` reject non-enrolled `Students`.
   - `Scrappy` tool outputs obey `viewerContext` visibility/blocks; `@scrappy` never self-triggers; error refunds quota.
   - Mutual `Block`, `3`-reporter `Under Review` quarantine, `[Removed Student]` tombstones, `handleReservations`.
   - `Deal Chat` `(Listing, primaryBuyer)` isolation & buyer-confirmed `Sold` `1/7d` pair trust cap.
   - `:42` cursor-batched purge clears expired `demoSessions` + `mediaAssets` batches.
2. **Layer 2 — Vitest Node & Static-Boundary Suite**:
   - Mocked Action tests verifying Groq → PII-stripped Gemini → Cloudflare failover, `>80%` feed-drop sanity abort, and `3`-strike exponential circuit breaker.
   - Static AST/regex test verifying `convex/scrappy/` has **zero** imports or `ctx.db` queries touching `chats`, `chatMembers`, or `chatMessages`.
3. **Layer 3 — Playwright 2-Tab Live WebSocket Smoke Test**:
   - Tab 1 (`?demo=1` as `@maya_cs`) → `Copy Co-Test Link` → Tab 2 (`?demo=<shortCode>&persona=alex_owl`) → verify `Campus` switcher, `Parking Report` + `Spot Opening` on `Now`, `@scrappy` Feed mention + `Ask Scrappy` SSE, 2-tab `Deal Chat` `Confirm Meetup` → `Pending` → `Sold` → `Confirm Pickup`, `Moderation Queue (Demo)` restore, and `Reset Demo State`.
