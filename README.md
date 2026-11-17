# KSUX 🦉

Unified Kennesaw State University campus social network and daily-life companion progressive web app (PWA) across both the **Kennesaw** and **Marietta** **Campuses** (`$0` free-tier stack).

## Capabilities

- **Dual-Path Identity & Instant Evaluation**: 6-digit numeric `.edu` email OTP (`@students.kennesaw.edu` & `@kennesaw.edu`) + 1-click isolated 3-persona **Judge Demo Mode** (`/?demo=1` & 2-tab `?demo=<shortCode>&persona=alex_owl` WebSocket co-testing).
- **5-Slot Mobile Shell & 3-Column Desktop Workspace**: 0-tap **Now** Commuter Bento HUD, 3-stream **Feed** (`Campus` | `Following` | `Trending (24h)`), center **Scrappy** + 10-module Quick Sheet, peer-to-peer **Marketplace**, and unified **Chats** (`Direct Messages`, `Group Chats`, and per-buyer `Deal Chats`), scoped by a sticky `Kennesaw` | `Marietta` | `All KSU` **Campus** switcher.
- **Public Campus Feeds and Student Reports**: **Parking Reports** and **Spot Openings**, Big Owl Bus **Shuttle Routes**, LibCal **Study Rooms** and **Study Sessions**, Nutrislice **Dining Venues**, **Clubs**, university calendar **Events**, and **Course Hubs** with a verified Banner subset, stateless `.ics` import, and Simple Syllabus lookup. An isolated fixture deployment supports the full judge scenario. [Data provenance](./KSUX.md#campus-data-provenance)
- **Chat-Isolated Scrappy the Owl AI**: 3-tier OpenAI-compatible router (Groq `openai/gpt-oss-120b` / `openai/gpt-oss-20b` → PII-stripped Gemini → Cloudflare Workers AI) with clickable Citation Pills and client-confirmed Pre-Filled Draft Cards, architecturally excluded from all `Chats` and database mutations.
- **Installable Offline Commuter PWA**: Versioned Service Worker (`public/sw.js`), zero-external-tile offline `MapLibre GL JS` campus GeoJSON map, and privacy-safe read-only `ksux_commuter_cache`.

## Quickstart & Verification

See [`docs/RUNBOOK.md`](./docs/RUNBOOK.md), [`docs/SPEC.md`](./docs/SPEC.md), [`GLOSSARY.md`](./GLOSSARY.md), and [`docs/adr/`](./docs/adr/).

```bash
pnpm install
CONVEX_AGENT_MODE=anonymous npx convex dev --once
CONVEX_AGENT_MODE=anonymous npx convex run seed:bootstrapKsu '{"includeFixtures":true}'
pnpm typecheck && pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```
