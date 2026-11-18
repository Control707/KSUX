---
status: accepted
---

# Clout is an append-only, corroboration-only, cosmetic ledger with zero for safety content

**Clout** is earned only for **corroborated** low-stakes logistics: a Parking Report, Line Check or Study Room vibe matched by a different Student within a short window, a confirmed Spot Opening, or a completed Marketplace handoff at a confirmed Meetup Spot (a pickup with no confirmed Meetup Spot still completes and counts toward completed deals, but earns no Clout, because Clout must be attributed to a Campus). It is recorded in an **append-only ledger** (`cloutEvents`). Parking Reports, Line Checks, Study Room vibes and Spot Openings are short-lived and are **not** Moderation Report targets. A Listing put under review *holds* its handoff Clout (hidden and not counted); restoring the Listing or dismissing the reports *releases* the hold, and removing it *reverses* it. Suspending an account reverses all of its Clout. The Student who corroborated keeps their own payout unless their own content is removed, and a Moderation Report never directly takes Clout. Nothing is ever edited in place. **Safety content (Incidents, Moderation Reports, the Emergency Panel) earns zero and is never counted or shown.** Clout is purely cosmetic: no perks, levels, badges, streaks, privileges, ranking boosts or redeemable value. Other Students' Clout appears only on a **weekly, per-Campus Leaderboard** (Top 25 by handle plus your own exact rank, opt-out). It never appears on cards or other Students' profiles, and it never triggers push. A Student sees their own Clout only on a private Profile card.

The research found no evidence that points improve report quality, and adjacent evidence suggests they cause harm. Paying for safety reports would reward false or sensational Incidents. Paying for uncorroborated reports would reward spam. Showing points next to content would turn them into a trust signal, and "trust" is deliberately not a domain term. An append-only ledger makes holds, reversals and caps auditable without mutable counters.

## Considered Options

- **Points per report without corroboration:** rejected because it pays for fabricated reports.
- **Clout for safety reports, or Clout shown as reputation on content:** rejected. It incentivises false Incidents and implies verification.
- **Mutable per-Student counters:** rejected. Reversals and caps can't be audited or replayed.
- **Streaks, levels, all-time or combined-campus boards:** rejected. They drive compulsive and gamed behaviour.
- **Location checks, device fingerprinting, ML fraud scoring:** rejected on privacy and $0 cost grounds.

## Consequences

`submitWalkInVibe` needs a cooldown before Study vibes can earn. Caps (the daily cap, per-target and per-pair limits) are derived from the ledger at read time, with no counter tables. Point values, windows and caps live in the spec and may be tuned without a new ADR. The zero-for-safety rule and the cosmetic-only rule may not.
