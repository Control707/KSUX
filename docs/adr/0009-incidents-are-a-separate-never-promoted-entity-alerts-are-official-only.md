---
status: proposed
---

# Incidents are a separate, never-promoted entity; Alerts are official-only

A Student's safety account is an **Incident**: its own entity in its own tables (`incidents`, `incidentUpdates`), shown only on `/safety`. It is **not a Post, never appears in the Feed**, and has no likes, reposts, replies, `hotScore` or Clout. An **Alert** is reserved for a copy of a notice from a named official source (see ADR-0007). **No Incident is ever promoted to, or triggered into, an Alert**, whatever its volume or Moderator action. The only edge between them is a Moderator note, which is an Incident Update, that links an existing Alert.

Reusing the Feed would have been cheaper, and earlier drafts said "a Post with an incident label". But Feed mechanics (ranking, reactions, replies, reposts, Scrappy mentions) amplify exactly what the Citizen teardown showed causes harm: naming and hunting people, and spreading unverified claims as fact. Keeping provenance separate is how KSUX upholds its forbidden claims: it is not 911, not dispatch, not official, and community content is never "verified".

Every Incident therefore carries the source line "Community report · not verified". The full-screen Emergency Panel (911 / KSU Police / text line) is shown before every Incident submission flow and every Campus Safety Moderation Report. It uses lifecycle words Active / Older / Under review / Removed / Deleted, never "resolved" or "all clear". It is corrected only by dated Incident Updates. Moderation has exactly two name levels (handle shown, or "Student · name hidden", always known to Moderators). There is no fully anonymous option; anonymous tips are routed to LiveSafe. Moderator notes come only from fixed templates, the author may edit the original for 5 minutes after posting, after which it is locked and **Redaction** is the only change ever made to it, and Incidents are purged at 30 days. The detailed thresholds live in the spec.

## Considered Options

- **Incident as a labelled Post in the Feed:** rejected because of amplification, the missing provenance boundary, and §230 exposure for KSUX-authored labels on Feed content.
- **Moderator-issued or volume-promoted Alerts:** rejected. They would let community content borrow official authority.
- **Fully anonymous Incidents:** rejected. Moderation needs a known author. LiveSafe already serves anonymous reporting.

## Consequences

`moderationReports.targetType` gains `incident`. Transit's Passio `serviceAlerts` is renamed **Shuttle Notice** so that "Alert" stays reserved. Scrappy cannot read either entity (ADR-0011), and Clout has no edge to either (ADR-0010).
