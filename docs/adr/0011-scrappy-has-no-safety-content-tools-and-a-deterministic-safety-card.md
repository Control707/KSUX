---
status: proposed
amends: ADR-0004 (adds a safety-content exclusion; existing clauses unchanged)
---

# Scrappy has no safety-content tools and answers safety questions with a deterministic Safety Card

Neither Scrappy tool registry (`ASK_SCRAPPY_TOOLS`, `FEED_MENTION_TOOLS`) gets any tool that reads `incidents`, `incidentUpdates`, `alertItems` or `alertSources`. This is enforced the same way ADR-0004 enforces chat isolation: `convex/scrappy/tools.ts` has zero imports or queries touching those tables. A deterministic server-side gate checks every Ask Scrappy prompt and `@scrappy` mention **before any quota check and before any LLM call** (today both entry points charge quota first, so this changes their order). On a safety question it returns a fixed, non-AI **Safety Card** (Emergency Panel, `/safety`, KSU Police, LiveSafe), using no LLM call and no quota or rate-limit slot, even when the Student's quota is exhausted. Requests to identify people are refused. Scrappy never says "safe", "all clear", "no incidents" or "nothing reported" about campus safety. There is no Clout tool, and Scrappy never states anyone's rank or points. The Now brief stays logistics-only.

A summarising assistant over unverified community reports would launder them into authoritative-sounding answers. It would also infer an all-clear from silence, misquote official Alerts, and invite prompt injection through Incident text. KSUX-authored AI summaries also fall outside §230's protection for user content. Making the exclusion structural at the tool boundary, rather than relying on prompt instructions, means model behaviour cannot leak **Incident or Alert records**. The guarantee is deliberately that narrow: `searchFeedPosts` in both registries still returns Student-written Post text, and the gate can miss a phrasing, so this ADR does not promise Scrappy can never repeat a safety claim. A system-prompt rule (never describe campus safety from Posts; emit the Safety Card if the gate missed) covers that residual risk.

## Considered Options

- **Read-only Incident/Alert tools with strict prompting:** rejected. Prompt rules are not a guarantee, and a summary is itself a claim KSUX would be making.
- **Alert-only tool (official content):** rejected. It risks misquoting the source and implying safety during stale or quiet states.
- **LLM-generated safety answers with disclaimers:** rejected for the same reasons, and they would also cost rate-limit slots on the questions where accuracy matters most.

## Consequences

Static tests assert that `tools.ts` never references the safety tables. Unit tests assert that gate prompts return the Safety Card in both entry points with exhausted quota, zero LLM calls and zero quota use. Shuttle Notices may still be cited through `getCampusDailyPulse` as "Shuttle Notice · Passio". ADR-0004's chat-isolation and no-writes clauses are unchanged.
