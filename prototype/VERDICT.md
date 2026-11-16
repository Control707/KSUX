# Verdict: KSUX Unified Shell, Navigation & Campus Switcher

Settled on Wayfinder ticket **[Prototype unified KSUX shell, navigation, and Campus switcher](https://github.com/Control707/KSUX/issues/5)** using [`prototype/ksux-shell.html`](./ksux-shell.html) (`?variant=A|B|C`).

## Validated Architecture (Variant B + A Hybrid)

1. **Mobile-First 5-Slot Bottom Navigation**:
   - **`Now`** (Launch default): 0-tap commuter Bento HUD surfacing live `Parking Lots` (+ 1-tap `Parking Report`), next Big Owl Bus `Shuttle Route` ETA, open Sturgis/Johnson `Study Rooms` (+ active `Study Sessions`), live `Dining` highlights (`The Commons` / `Stingers`), today's `Events`, and a `Scrappy` brief. Interactive Kennesaw/Marietta maps embed inside the `Shuttle Routes`, `Parking`, and `Meetup Spot` detail views rather than making the entire shell map-first.
   - **`Feed`**: Real-time `Posts` stream topped by horizontal quick-filter rings for enrolled `Course Hubs` and joined `Clubs` (plus a `Browse All Hubs & Clubs` pill).
   - **`🦉 Scrappy / ⚡ Quick Sheet`** (Center action button): Opens a half-screen command sheet with `Ask Scrappy`, 1-tap creation actions (`+ Post`, `+ Parking Report`, `+ Listing`, `+ Study Session`), and a 2×5 jump grid to all 10 KSUX capabilities.
   - **`Marketplace`**: Dedicated peer-to-peer `Listings` & `Meetup Spots` tab with 1-tap `Deal Chat` launch.
   - **`Chats`**: Unified inbox segmented by `All`, `Direct Messages`, `Group Chats`, and `Deal Chats`.

2. **Sticky `Campus` Switcher & Scoping Boundary**:
   - Persistent 3-way `Kennesaw` | `Marietta` | `All KSU` pill in the top header (persisted per `Student`, defaulting to home `Campus`).
   - **Filtered by `Campus`** (unless `All KSU` is active): `Now` Bento tiles, `Parking Lots` & `Parking Reports`, `Study Rooms` & `Study Sessions`, `Dining`, local `Shuttle Routes`, `Events`, `Marketplace` `Listings`, and default `Feed`.
   - **Always preserved across `Campus` switches**: Intercampus `Kennesaw–Marietta` `Shuttle Route`, active `Direct Messages` / `Group Chats` / `Deal Chats`, and enrolled `Course Hubs`.
   - Domain entities store `Campus` strictly as `Kennesaw` or `Marietta` (plus dual-campus transit where physical routes span both); `All KSU` is strictly a UI filter state.

3. **Desktop Responsive Adaptation (`≥1024px`)**:
   - Expands into a 3-column workspace: **left navigation rail** (`Now`, `Feed`, `Course Hubs & Clubs`, `Marketplace`, `Chats`, `Ask Scrappy`), **center active module pane**, and **always-visible right `Campus` Pulse rail** (`Shuttle Routes` + `Parking Lots`).

4. **`Judge Demo Mode` Chrome**:
   - High-contrast `⚡ Judge Demo Mode` pill in the top-right header allowing hackathon evaluators to toggle between two pre-seeded `Student` personas (`Kennesaw` CS commuter vs. `Marietta` Engineering resident) or jump to `.edu` OTP sign-in in one click.
