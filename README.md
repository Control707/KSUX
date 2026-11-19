# KSUX 🦉

Unified Kennesaw State University campus social network and daily-life companion progressive web app (PWA) across both the **Kennesaw** and **Marietta** **Campuses** (`$0` free-tier stack).

## Capabilities

- **Dual-Path Identity & Instant Evaluation**: 6-digit numeric `.edu` email OTP (`@students.kennesaw.edu` & `@kennesaw.edu`) + 1-click isolated 3-persona **Judge Demo Mode** (`/?demo=1` & 2-tab `?demo=<shortCode>&persona=alex_owl` WebSocket co-testing).
- **5-Slot Mobile Shell & 3-Column Desktop Workspace**: 0-tap **Now** Commuter Bento HUD, 3-stream **Feed** (`All KSU` | `Following` | `Trending (24h)`), center **Scrappy** + 10-module Quick Sheet, peer-to-peer **Marketplace**, and unified **Chats** (`Direct Messages`, `Group Chats`, and per-buyer `Deal Chats`), with a `Kennesaw` | `Marietta` **Campus** switcher on location screens only (ADR-0008).
- **Public Campus Feeds and Student Reports**: **Parking Reports** and **Spot Openings**, Big Owl Bus **Shuttle Routes**, LibCal **Study Rooms** and **Study Sessions**, Nutrislice **Dining Venues**, **Clubs**, university calendar **Events**, and **Course Hubs** with a verified Banner subset, stateless `.ics` import, and Simple Syllabus lookup. An isolated fixture deployment supports the full judge scenario. [Data provenance](./KSUX.md#campus-data-provenance)
- **Chat-Isolated Scrappy the Owl AI**: 3-tier OpenAI-compatible router (Groq `openai/gpt-oss-120b` / `openai/gpt-oss-20b` → PII-stripped Gemini → Cloudflare Workers AI) with clickable Citation Pills and client-confirmed Pre-Filled Draft Cards, architecturally excluded from all `Chats` and database mutations.
- **Installable Offline Commuter PWA**: Versioned Service Worker (`public/sw.js`), zero-external-tile offline `MapLibre GL JS` campus GeoJSON map, and privacy-safe read-only `ksux_commuter_cache`.
- **Next-class wayfinding**: Now picks the next weekly meeting in Eastern time from the current semester's imported and Banner classes, links known buildings to the shared campus map, and suggests Shuttle Stops including KM intercampus service. Your stop and pinned Parking Lots stay private and remain available with the saved schedule offline.

## Accessibility

KSUX is built to WCAG 2.2 AA. Every route and dialog is checked automatically in light and dark themes at 390 px and 1440 px (axe, 44 px targets, no text under 13 px, reflow at 320 px and 200% text); last automated pass **2026-11-18**. The first full manual pass with VoiceOver on iOS Safari and the Home Screen app, TalkBack on Chrome for Android, keyboard only, and 200% zoom with text-spacing overrides **hasn't been logged yet**.

Known issues are listed on the in-app About page (`/profile/about`) and in [`docs/accessibility/`](./docs/accessibility/README.md). Tell us about a barrier: [open an accessibility issue](https://github.com/Control707/KSUX/issues/new?labels=accessibility&title=Accessibility%20barrier%3A%20).

## Provisioning & production deployment

One designated teammate should provision the shared production services. In your
own interactive terminal, after installing dependencies and linking the intended
Vercel project:

```bash
./scripts/setup-env.sh
```

See the [setup guide](./scripts/setup-production.md) for prerequisites and all
12 stages. Credentials use hidden input and are retained in a Git-ignored,
mode-0600 `.env.production-setup` file (plaintext, not an encrypted vault).
Never paste credentials into chat or GitHub issues. The wizard leaves development
`.env.local` unchanged, confirms production writes and seeding separately, and
requires manual deployment/live checks. Do not copy production credentials into
Preview builds or teammates' development deployments.

## Quickstart & Verification

The text-only **Incident pilot** at `/safety` has an Emergency Panel before every
submission, Campus-scoped community list and map, dated Incident Updates and
Moderation Reports. It runs fully in isolated Judge Demo Mode. Production posting
still requires the Moderator staffing and operations gate. Community Incidents
are never verified, never Feed posts and never official Alerts.
[Pilot behavior and checks](./docs/RUNBOOK.md#text-only-incident-pilot-79)

The **private agenda** at `/agenda` combines upcoming classes, imported deadlines, RSVPed Events and joined Study Sessions in Eastern time. Event-only `.ics` downloads and opt-in, per-type **in-app** reminders are available; reminder settings live at `/profile/notifications#agenda`. [Behavior and verification](./docs/RUNBOOK.md#private-agenda-76)

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
