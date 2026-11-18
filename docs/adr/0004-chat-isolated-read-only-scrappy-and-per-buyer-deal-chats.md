---
status: accepted
amended_by: ADR-0011 (adds a safety-content tool exclusion; clauses here unchanged)
---

# Chat-isolated read-only `Scrappy` tools and per-buyer `Marketplace` `Deal Chats`

KSUX excludes the `chatMessages` store across every conversation type — `Direct Messages`, closed `Group Chats`, `Deal Chats`, and open `Club` or `Course Hub` `Group Chats` — from `Scrappy`'s Convex `internalQuery` tool registry and omits all server-side write/mutation tools in favor of `<untrusted_campus_content>` prompt fencing and client-confirmed Pre-Filled Draft Cards, while isolating `Marketplace` `Deal Chats` per `(Listing, primaryBuyer)` with optional `2–6` `Student` co-buyer/co-seller invites and buyer-confirmed `Sold` handoffs rather than a single shared `Listing` room or seller-only completion toggles. Indexing even joinable `Club`/`Course Hub` `Group Chats` or granting `Scrappy` server mutations would expose untrusted `Student` chat streams and user-generated `Posts`/`Listings` to prompt-injection exfiltration and unauthorized writes, whereas omitting `chatMessages` readers and server mutations at the database-function boundary makes chat leakage and spoofed writes impossible regardless of model behavior. Isolating `Deal Chats` per prospective buyer keeps rival price negotiations and `Meetup Spot` schedules private while still supporting roommate/friend co-party handoffs and two-sided (`1 / 7d` per pair) completed `Marketplace` handoff trust counts.
