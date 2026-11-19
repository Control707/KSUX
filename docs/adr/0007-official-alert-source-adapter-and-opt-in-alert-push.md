---
status: accepted
supersedes: ADR-0005 (push-scope clause only)
---

# Official Alerts via a swappable source adapter, with opt-in, source-named Alert push

Accepted for the rollout tracked in [#111](https://github.com/Control707/KSUX/issues/111),
following implementation in [#110](https://github.com/Control707/KSUX/pull/110).
Acceptance of this decision does not sign off either source's shadow poll or
enable display or push. Production evidence belongs in the
[Official Alert release record](../releases/official-alert-rollout-111.md).

An **Alert** is official-sourced only, and v2 needs zero KSU IT approvals. KSUX therefore reads Alerts through one source adapter. Every fetch returns one of `ok`, `quiet`, `unavailable` or `unrecognized`. Every item carries its exact source name and category, an official issued time only when the source states one, plus `firstObservedAt`, `lastSuccessAt` and `lastAttemptAt`. There are three implementations: links-only (P0), a bounded read-only copy of two public KSU pages (the Police Timely Warnings page and the Emergency Advisory page) every 5 minutes (P1), and a stub for a future KSU-approved Rave RSS/CAP feed. A maintainer-only kill switch trips automatically on `unrecognized` and falls back to links-only.

Alert status is judged stale at read time, more than 20 minutes after the last successful fetch. It is never served from the service-worker cache as current. Silence or a quiet page is quoted with its check time and never shown as "safe".

This **supersedes only the push-scope clause of ADR-0005**:

- It adds an `official_alert` push kind, with its own toggle, off by default and opted into from `/safety`.
- It fires only when an item first reaches issued, or when an official all-clear is quoted.
- An item must appear on 2 consecutive successful fetches with the same content before it can push.
- Push is blocked while the copy is `unrecognized`, stale or kill-switched.
- The cap is 3 Alert pushes per subscriber per day, sent through a scheduler-batched fan-out to stay inside Convex Free's 10-minute action limit and its 1 GB/month DB I/O.
- The payload names the source but not the content ("KSU Police posted a new Timely Warning") and links to `/safety/alerts/<id>`.
- Judge Demo Mode remains barred from push.

Personal-messaging push rules (handle-only, 60 s throttle, no Group Chat or Spot Opening fan-out) are unchanged.

## Considered Options

- **No Alert push (keep ADR-0005 intact):** this was recommended. It was rejected by the user in favour of opt-in.
- **Push on every state change, or as soon as an item is seen:** rejected. Under an HTML copy, a parser glitch would broadcast a false Alert to every subscriber.
- **Excerpt in the push body:** rejected. It risks lock-screen misquotes and goes beyond the bounded reuse we can justify.
- **Moderator-issued Alerts or promoted Incidents:** ruled out earlier when Incident, Alert and Clout were defined.

## Consequences

KSUX push is supplementary, never an emergency channel: the web has no critical alerts, iOS push needs a Home Screen install on 16.4 or later, and a sent push may never arrive. The opt-in copy and `/safety` say this and point Students to KSU Alert/Rave and 911. Alert push can't exist before the P1 page copy ships, and it gains structured lifecycle data (IDs, cancellation) only if a KSU-approved feed replaces the HTML copy.
