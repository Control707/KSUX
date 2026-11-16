# KSUX — Day 0 Provisioning, Seed & Deployment Runbook

> Companion operations runbook to [`docs/SPEC.md`](./SPEC.md) for running KSUX locally and deploying to `$0` free-tier production.

---

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
| `UPLOADTHING_TOKEN` | **Yes** | Shared with UploadThing `/api/uploadthing` Next.js Route Handler. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Optional | Omit to hide OS Web Push subscription prompt while keeping Tier-0 in-app toasts active. |
| `CONVEX_DEPLOY_KEY` | Prod CI only | Set in Vercel Project Env so `npx convex deploy --cmd 'pnpm build'` deploys schema + functions atomically. |

### B. Convex Deployment Environment (`npx convex env set KEY VALUE`)

| Variable | Required? | Local-Dev / Missing-Key Fallback |
| :--- | :---: | :--- |
| `GMAIL_SMTP_USER` / `GMAIL_SMTP_APP_PASSWORD` | Prod **Yes** | If unset and `KSUX_ALLOW_DEV_OTP_LOG=true`, 6-digit OTPs print to Convex dev logs (`rejected` in production). |
| `GMAIL_SMTP_FALLBACK_USER` / `_APP_PASSWORD` | Optional | Secondary `500/day` Gmail relay used only if primary hits daily quota. |
| `KSUX_ALLOW_DEV_OTP_LOG` | Dev only | Set `"true"` in local Convex dev; must remain unset/`"false"` in production. |
| `GROQ_API_KEY` | **Yes** | Primary `Scrappy` tier (`openai/gpt-oss-120b` & `openai/gpt-oss-20b`). |
| `GEMINI_API_KEY` | Recommended | Skips Tier-2 overflow if unset (`Scrappy` degrades to Groq → Cloudflare). |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` | Recommended | Skips Tier-3 fallback and vector embeddings if unset (`Scrappy` falls back to Convex full-text search + structured tools). |
| `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Optional | Example subject: `mailto:your-handle@students.kennesaw.edu`. If unset, Web Push dispatches no-op cleanly. |
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
3. **Verify / refresh static KSU seed snapshots (optional — checked-in snapshots already work offline)**:
   - Public KSU geometries live in `public/data/*.geojson` (`parking-lots.geojson`, `campus-buildings.geojson`, `shuttle-routes.geojson`, `meetup-spots.geojson`).
   - Normalized institutional JSON snapshots live in `data/ksu-seed/*.json`. To re-harvest from live KSU endpoints before deploy:
     ```bash
     pnpm tsx scripts/harvest-ksu-seed.ts
     ```
4. **Hydrate `"ksu"` institutional catalogs (`internalMutation` via admin CLI)**:
   ```bash
   npx convex run seed:bootstrapKsu
   ```
   *(Idempotent: safe to re-run; inserts `72` `Parking Lots` + `168`-hr priors, `57` `Study Rooms`, `11` `Shuttle Routes`, `17` `Dining Venues`, `544` `Clubs`, initial `Events`, `14` `Meetup Spots`, `Fall 2026` + `Spring 2027` `Course Hubs` & `courseSections`.)*
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
   # Repeat for GMAIL_SMTP_*, GEMINI_API_KEY, CLOUDFLARE_*, VAPID_*, UPLOADTHING_TOKEN, KSUX_MAINTAINER_EMAILS
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
4. Verify live production smoke URL: `https://<app>.vercel.app/?demo=1`.

---

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
