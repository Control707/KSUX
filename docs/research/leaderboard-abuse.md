# Leaderboard and points-system gaming, abuse and countermeasures

**Date:** 2026-11-17 (America/New_York). **Ticket:** [Control707/KSUX#41](https://github.com/Control707/KSUX/issues/41), part of [map #35](https://github.com/Control707/KSUX/issues/35). **Status:** research findings and proposals for the **Clout** working name. Not a decision, ADR, or glossary entry. No product code was changed.

## Question

How do points/reputation systems and leaderboards get gamed and abused? Which countermeasures work at small scale with no paid infrastructure? Should the crowdsourced actions KSUX already has (`Parking Reports`, Dining `Line Checks`, walk-in `Study Room` vibes, `Marketplace` handoffs) and the planned Incident reports earn points? What evidence exists about rewarding safety reports?

## Executive answer

1. **Every mature points system studied caps, reverses, or gates points.** Stack Overflow caps vote-earned reputation at **200/day**, reverses reputation from votes judged fraudulent ("voting corrected"), and docks **−100** for spam/offensive flags. Waze credits one edit per road segment per day and caps a single save at **150 points**. Strava removes flagged efforts from leaderboards and revokes flagging from people who abuse the flag. Duolingo removes players with "illegitimate XP gains" and lets people opt out. These are the countermeasures that work, and nearly all of them are cheap counters and ledger rows, not machine learning. Sources are cited below.
2. **KSUX already has the most expensive sybil defense.** Only `@students.kennesaw.edu` / `@kennesaw.edu` accounts verified by OTP are eligible, with per-email and per-IP OTP caps ([SPEC §4.2–4.3](../SPEC.md)). Douceur showed that without a logically central identity authority, sybil attacks are always possible ([Douceur 2002](https://doi.org/10.1007/3-540-45748-8_24)). For KSUX that authority is the KSU mailbox. **Proposal: only verified Students earn or rank Clout; Judge Demo Mode Clout stays inside its `demo:<id>` workspace.**
3. **Do not award Clout for Incident reports or any safety report.** No peer-reviewed evidence was found that points improve safety-report quality. The adjacent evidence points the other way. Reward schemes for reports work only when there are sanctions for false reports and accurate adjudication ([Buccirossi, Immordino & Spagnolo](https://doi.org/10.2139/ssrn.2993776)). KSUX has neither: volunteer moderation, no fact-finding, and KSUX is not the responder. Neighborhood-reporting platforms are documented to enable racialized surveillance ([Kurwa 2019](https://doi.org/10.24908/ss.v17i1/2.12927)). Prior KSUX research already says popularity is not verification and that incident Posts must not look official ([community-feed research](campus-safety-community-feed.md)). Adding points would add an incentive to post more, more dramatic reports.
4. **Reward low-stakes logistics, with limits.** `Parking Reports`, `Line Checks`, `Study Room` vibes and confirmed `Marketplace` handoffs can earn small Clout amounts. Apply per-action cooldowns that already exist, a daily cap, corroboration-or-delay before awarding, the existing 1-per-7-days pair cap for handoffs, and automatic reversal when content is quarantined or an account is suspended.
5. **Prefer a weekly, Campus-scoped, opt-out-able leaderboard over an all-time global one, and no streaks.** Classroom leaderboards lowered motivation and satisfaction over a semester ([Hanus & Fox 2015](https://doi.org/10.1016/j.compedu.2014.08.019)). Points and leaderboards raised performance *quantity*, not motivation ([Mekler et al. 2017](https://doi.org/10.1016/j.chb.2015.08.048)). Adolescents keep Snapchat streaks alive with content-free "streak snaps" ([Hristova et al. 2019](https://doi.org/10.31234/osf.io/nszex)). Streaks are associated with FOMO ([van Essen & Van Ouytsel 2023](https://doi.org/10.1016/j.teler.2023.100087)).

The ranked countermeasure list with Convex Free cost is in [§5](#5-done-when-ranked-countermeasures-and-cost-on-convex-free).

## 1. Method and scope

Following the research brief (`.dsh/wayfinder/research-brief.md`), I read [`GLOSSARY.md`](../../GLOSSARY.md), [`docs/SPEC.md`](../SPEC.md), map [#35](https://github.com/Control707/KSUX/issues/35), and the prior campus-safety research. That research exists only as **untracked local files on `main`** (`docs/research/campus-safety*.md`), so links to it from this branch do not resolve on GitHub. I cite it rather than redo it. I also inspected current code read-only to see what already exists (§4).

Sources are primary where possible: first-party help centers (Stack Overflow, Reddit, Strava, Snapchat, Duolingo, Waze/Wazeopedia), the Convex component READMEs, and peer-reviewed papers whose DOIs were resolved through the Crossref API. Abstracts were read through Crossref, OpenAlex, Semantic Scholar or arXiv. Where only a short summary was available instead of the full text, I say so. No paid or login-gated source was used.

Evidence labels:

- **Documented:** a retrieved first-party page or paper states it.
- **Inference/proposal:** my reasoning for KSUX, not a finding from a source.
- **Unverified:** I could not confirm it from a primary source.

## 2. Attack patterns, with first-party evidence

| Attack | What platforms document | KSUX exposure |
| --- | --- | --- |
| **Sock puppets / sybils** (one person, many accounts) | Sockpuppets across nine communities write shorter posts, cluster their ego-networks, and pairs controlled by one person post in the same discussion at the same time, often supporting each other ([Kumar, Cheng, Leskovec & Subrahmanian 2017, arXiv:1703.07355](https://arxiv.org/abs/1703.07355); [DOI](https://doi.org/10.1145/3038912.3052677)). Sybils are always possible without a central identity authority ([Douceur 2002](https://doi.org/10.1007/3-540-45748-8_24)). | **Low in prod.** One account per canonical KSU email; `+tag` stripped; OTP caps per email and per hashed IP ([SPEC §4.2–4.3](../SPEC.md)). Residual risk: one Student with both a student and a staff address, or friends lending accounts. **Demo Mode is unlimited** by design, so demo Clout must never mix with prod. |
| **Vote rings / collusion / targeted voting** | Stack Overflow's daily automated process removes votes when "a single user continually votes … on many of your posts within a short period", and staff investigate mutual patterns; intentional inflation can lead to suspension ([SO: voting corrected](https://stackoverflow.com/help/serial-voting-reversed)). | **Medium if likes earn Clout.** Likes, replies and reposts already drive `hotScore` ([`convex/lib/safety.ts` `computePostHotScore`](../../convex/lib/safety.ts)). If received likes also earned Clout, a dorm floor could trade likes. **Proposal:** received likes earn no Clout. |
| **Spam/volume farming** | Waze credits each segment once per 24 h and caps one save at 150 points ([Wazeopedia: Your Rank and Points](https://www.waze.com/discuss/t/your-rank-and-points/377943)). Stack Overflow caps vote reputation at 200/day ([SO: reputation](https://stackoverflow.com/help/whats-reputation)). Reddit uses karma thresholds to keep new accounts from spamming communities ([Reddit: What is karma?](https://support.reddithelp.com/hc/en-us/articles/204511829-What-is-karma)). | **High for crowdsourced pulses.** `submitWalkInVibe` has **no cooldown** today ([`convex/study.ts`](../../convex/study.ts)), unlike `Parking Reports` (1/10 min per lot, [`convex/parking.ts`](../../convex/parking.ts)) and `Line Checks` (1/15 min, [SPEC §5.2](../SPEC.md)). Points would turn that gap into a farm. |
| **Low-effort, content-free posting** | Adolescents uphold Snapchat streaks with "streak snaps": mass snaps, "good morning" snaps, and black pictures sent only to keep the count ([Hristova et al. 2019](https://doi.org/10.31234/osf.io/nszex)). Snapchat documents that a streak needs a snap from both people every day ([Snapchat: How do Streaks work](https://help.snapchat.com/hc/en-us/articles/7012394193684)). Badges cause users to "put in non-trivial amounts of work to achieve particular badges" ([Anderson et al. 2013](https://doi.org/10.1145/2488388.2488398)). | **High for "any Post earns Clout".** **Proposal:** Posts earn nothing by themselves. |
| **Fabricated data to rank** | Strava bans manipulated GPS, runs every activity through an ML check, and removes community-flagged activities from segment leaderboards ([Strava: Segment Leaderboard Guidelines](https://support.strava.com/en-us/articles/15401921-segment-leaderboard-guidelines)). Duolingo removes learners with "illegitimate XP gains" ([Duolingo blog](https://blog.duolingo.com/duolingo-leagues-leaderboards/)). | **Medium.** A fake "Lot full" report diverts commuters. The 4-tier blending and outlier trimming in [SPEC §5.2](../SPEC.md) limit the damage to the displayed value, not to Clout. |
| **Rewarded reports become false or sensational reports** | Theory: rewards for whistleblowers are viable only with sanctions for false reports and accurate courts; otherwise false reports rise ([Buccirossi, Immordino & Spagnolo](https://doi.org/10.2139/ssrn.2993776)). Rewards can encourage frivolous reports when people can rationalize them ([Waeye & Maussen 2023, SSRN](https://doi.org/10.2139/ssrn.4671878), working paper, not peer reviewed). | **High for Incidents.** See §3.3. |
| **Abusing the flag/report tool** | Strava: "The Flag feature is not designed to be overused or abused"; abusers lose flagging and risk deletion ([Strava: The Activity Flag](https://support.strava.com/en-us/articles/15402000-the-activity-flag-remove-an-activity-s-segment-results-from-the-leaderboard)). | **Present today.** 3 distinct verified reporters auto-quarantine content ([SPEC §4.5](../SPEC.md)). If quarantine also removed a *rival's* Clout, it becomes a weapon. See countermeasure 4. |

## 3. Countermeasures, wellbeing and safety-report evidence

### 3.1 What first-party systems actually do

- **Daily caps.** Stack Overflow: max 200 rep/day from votes and suggested edits; accepted answers and bounties are exempt ([SO: reputation](https://stackoverflow.com/help/whats-reputation)). Waze: one credited edit per segment per day; ≤150 points per save; driving points changed to a flat 5 per drive ([Wazeopedia](https://www.waze.com/discuss/t/your-rank-and-points/377943)).
- **Reversal.** Stack Overflow reverses reputation when a vote is reversed or removed as fraud; posts with 4 spam/offensive flags cost −100; deleted posts usually stop affecting reputation ([SO: reputation](https://stackoverflow.com/help/whats-reputation); [SO: voting corrected](https://stackoverflow.com/help/serial-voting-reversed)).
- **Points as trust that unlocks privileges, not just ranking.** Stack Overflow gates flagging and upvoting at 15, downvoting at 125 and review queues at 500 ([SO: privileges](https://stackoverflow.com/help/privileges)). Waze ties editor rank to editing area, and higher ranks need human review of quality, not only edit count ([Wazeopedia](https://www.waze.com/discuss/t/your-rank-and-points/377943)).
- **Relative and resetting rankings.** Duolingo matches each weekly league with people with "similar study habits" in a similar time zone, and a new league starts each Sunday ([Duolingo blog](https://blog.duolingo.com/duolingo-leagues-leaderboards/)). Waze's top tiers are percentiles recalculated monthly by state, so "no one gets the 'Waze Royalty' level for good" ([Wazeopedia](https://www.waze.com/discuss/t/your-rank-and-points/377943)).
- **Opt-out.** Duolingo: "Leaderboards aren't for everyone"; turning off a public profile removes you ([Duolingo blog](https://blog.duolingo.com/duolingo-leagues-leaderboards/)). Strava removes efforts from public leaderboards when activity privacy is "Only You" or "Followers" ([Strava guidelines](https://support.strava.com/en-us/articles/15401921-segment-leaderboard-guidelines)).
- **Removal over silent correction.** Duolingo removes the cheater from leaderboards. Strava removes the flagged activity's results but keeps the activity ([Strava: The Activity Flag](https://support.strava.com/en-us/articles/15402000-the-activity-flag-remove-an-activity-s-segment-results-from-the-leaderboard)).
- **Stated purpose: karma is not the goal.** Reddit: "Don't set out to accumulate karma; just set out to be a good contributor" ([Reddit: What is karma?](https://support.reddithelp.com/hc/en-us/articles/204511829-What-is-karma)). Stack Overflow: "Reputation is entirely optional" ([SO: reputation](https://stackoverflow.com/help/whats-reputation)).

### 3.2 Wellbeing and incentive research

- **Context-dependent effects.** A review of empirical gamification studies found mostly positive effects, but "greatly dependent on the context … as well as on the users" ([Hamari, Koivisto & Sarsa 2014](https://doi.org/10.1109/HICSS.2014.377)).
- **Leaderboards can backfire on motivation.** In a semester-long classroom study, students in the gamified course (leaderboards and badges) showed less motivation, satisfaction and empowerment over time than the control class ([Hanus & Fox 2015](https://doi.org/10.1016/j.compedu.2014.08.019); summary via Semantic Scholar, full text not retrieved). Points, levels and leaderboards worked "as extrinsic incentives, effective only for promoting performance quantity" ([Mekler et al. 2017](https://doi.org/10.1016/j.chb.2015.08.048); summary only).
- **Extrinsic rewards and intrinsic motivation.** A meta-analysis of 128 experiments examined extrinsic rewards' effects on intrinsic motivation ([Deci, Koestner & Ryan 1999](https://doi.org/10.1037/0033-2909.125.6.627)). Its widely reported headline is that expected tangible rewards undermine intrinsic motivation. **The abstract was not retrieved in full here**, so treat that as a summary, not a verified quote.
- **Introducing a price can change the norm.** Small monetary incentives produced worse performance than none ([Gneezy & Rustichini 2000a](https://doi.org/10.1162/003355300554917)). A fine for late daycare pickup increased lateness and it stayed high after removal ([Gneezy & Rustichini 2000b](https://doi.org/10.1086/468061)). *Inference:* tokenizing a civic act like warning neighbors can turn it into a transaction. This is analogy, not a test on points.
- **Streaks and compulsive use.** In 2,483 Belgian early adolescents, FOMO was associated with Snapchat streak engagement, and problematic smartphone use correlated weakly with streak length and number ([van Essen & Van Ouytsel 2023](https://doi.org/10.1016/j.teler.2023.100087)). KSU Students are mostly adults, so the population differs (inference).
- **Newcomers.** A badge model shows that a reward's placement determines how hard users work just before and how they stop just after ([Anderson et al. 2013](https://doi.org/10.1145/2488388.2488398); abstract read, results section not retrieved). *Inference, no direct study found:* an all-time leaderboard is unreachable for a first-week Student. Duolingo's cohort matching and Waze's recalculated percentiles are first-party designs that address this.

### 3.3 Rewarding safety reports: what evidence exists

- **No peer-reviewed study was found that tested points or leaderboards for campus or community safety reports.** I searched Crossref and OpenAlex for crime/safety reporting combined with incentives, gamification and Crime Stoppers rewards. No relevant result came back. **Unverified either way:** absence of results is not proof that no study exists.
- **Closest evidence: whistleblower rewards.** Programs can avoid floods of fraudulent reports only by balancing reward size with sanctions for false reports and a precise adjudicator; they are "not viable … where sanctions against false reporting are mild" ([Buccirossi, Immordino & Spagnolo](https://doi.org/10.2139/ssrn.2993776)). *Inference:* a volunteer-moderated student app has no adjudicator and no sanction beyond suspension, so the condition fails.
- **Neighborhood-reporting harms.** Nextdoor has been analyzed as a platform for the surveillance and policing of race in residential space ([Kurwa 2019, *Surveillance & Society*](https://doi.org/10.24908/ss.v17i1/2.12927)). A qualitative study found users use it as a "high-tech Neighborhood Watch" built around perceptions of suspicious behavior and incivility ([Parker & Dodge 2024](https://doi.org/10.6000/1929-4409.2024.13.04)). Neither paper studied points. *Inference:* rewarding volume of suspicion reports would amplify the documented failure mode.
- **Privacy harms of location posts.** Reddit bans sharing "live or near-live locations that could enable the physical tracking" of a private person and crowdsourcing identification ([Reddit: Personal Information](https://support.reddithelp.com/hc/en-us/articles/360043066452)). Rewarding reports would push toward exactly the detail these rules prohibit (inference).
- **KSUX's own prior research** says popularity ranking is not verification, that KSUX's three-reporter quarantine is moderation rather than fact-finding, and that incident Posts must not look official ([campus-safety-community-feed.md §2](campus-safety-community-feed.md)). A Clout badge on a reporter would read as authority.
- **False reports to police are a crime in Georgia** (O.C.G.A. § 16-10-26). **Unverified:** the statute page was blocked (HTTP 403) and was not read. Confirm before citing.

**Answer:** Incident reports, `Campus Safety` moderation reports, and police-contact handoffs should earn **zero** Clout and should not be counted toward any badge, rank, or streak. Do not show reporter Clout on Incident Posts. This is the cheapest countermeasure, and it is consistent with all the evidence found.

## 4. What KSUX already has (read-only code inspection, `main` @ `6cef41a`)

| Existing mechanism | Where | Clout relevance |
| --- | --- | --- |
| `.edu` OTP identity, `+tag` stripping, OTP caps | [SPEC §4.2–4.3](../SPEC.md) | Sybil resistance at near-zero marginal cost. |
| Generic `rateLimitBuckets` (`key`, `count`, `windowStart`, `expiresAt`, `by_key`, `by_expires`) | [`convex/schema.ts`](../../convex/schema.ts) | Reusable for daily caps; already purged hourly by `:42` housekeeping. |
| `Parking Report` cooldown 1/10 min per Student per lot per kind | [`convex/parking.ts`](../../convex/parking.ts) | Reuse. |
| `Line Check` cooldown 1/15 min | [SPEC §5.2](../SPEC.md); `submitDiningLineCheck` in [`convex/transitDining.ts`](../../convex/transitDining.ts) | Reuse. |
| `Study Room` vibe: **no cooldown** | `submitWalkInVibe` in [`convex/study.ts`](../../convex/study.ts) | **Gap.** Must add a cooldown before it earns anything. |
| `Marketplace` `completedDealCount` incremented only on buyer `Confirm Pickup`, at most once per 7 days per (seller, buyer) pair via `interpersonalLedgers` `marketplace_trust_pair` | [`convex/marketplace.ts`](../../convex/marketplace.ts) | Already a collusion cap; Clout should reuse the same `trustIncremented` decision. |
| 3 distinct verified reporters → `under_review` | [SPEC §4.5](../SPEC.md); [`convex/moderation.ts`](../../convex/moderation.ts) | Natural trigger to hold or reverse Clout, but see the weaponization caveat. |
| Suspension keeps the `students` row | [SPEC §4.5](../SPEC.md) | Lets a ledger reverse a suspended Student's Clout and drop them from boards. |
| `workspaceKey` partitioning, demo 24 h TTL | [SPEC §4.6, §7](../SPEC.md) | Demo Clout naturally isolated and purged. |

## 5. Done when: ranked countermeasures and cost on Convex Free

Ranking is **effectiveness against the attacks in §2 per unit of build and quota cost**. "Cost" is estimated against the Convex Free limits in [SPEC §2](../SPEC.md) (1M calls/month, 1 GB/month DB I/O, 0.5 GB storage). All estimates are **inference** from the code's existing patterns, not measured. Assume ~1,000 active Students and ~5 Clout-earning actions per Student per day as a high case, i.e. ~150k awards/month.

| # | Countermeasure | Defeats | Convex Free cost | Build effort |
| --- | --- | --- | --- | --- |
| 1 | **No Clout for safety content**: Incidents, `Campus Safety` reports, police handoffs, moderation reports. Also no Clout for plain Posts or received likes. | False/sensational reports, vote rings, spam Posts | **Zero.** Fewer writes. | Trivial (a policy line + one test). |
| 2 | **Verified-only, workspace-scoped eligibility**: only `verifiedStudentMutation` callers earn; ranks filter `accountStatus === "active"`; demo Clout lives only in `demo:<id>`. | Sybils, demo leakage | **Zero.** Reuses existing builders and `workspaceKey` index prefix. | Trivial. |
| 3 | **Per-action cooldowns** (reuse existing; add one for `Study Room` vibes) | Spam/volume farming | 1 indexed read + 1 upsert per action, as `Parking Reports` already does. Rows expire and are purged by `:42`. | Small. |
| 4 | **Append-only Clout ledger with reversal**: one `cloutEvents` row per award (`workspaceKey`, `studentId`, `source`, `sourceId`, `points`, `weekKey`, `status`). On quarantine, *hold* (do not show) the award; *reverse* only if a moderator removes the content or suspends the account. Never let a reporter's report directly debit another Student. | Fabrication, coordinated spam, report weaponization | ~150k inserts/month (high case) at well under 1 KB each, roughly 100 MB/month before the purge. Needs a retention rule (e.g. keep raw events 30 days, keep weekly totals) to stay inside 0.5 GB. | Medium: one table, one helper, hooks in moderation. |
| 5 | **Daily cap** per Student (e.g. Stack Overflow-style ceiling across all sources) | Farming, compulsive grinding | One `rateLimitBuckets` row per Student per day; 1 read + 1 patch per award. The Convex [Rate Limiter component](https://www.npmjs.com/package/@convex-dev/rate-limiter) (Apache-2.0, runs inside the deployment, transactional, token-bucket or fixed-window) is an alternative; it does not add a paid service. | Small. |
| 6 | **Pairwise cap for two-party actions**: reuse `marketplace_trust_pair` (1 / 7 d) so Clout follows `trustIncremented`. | Collusion between friends | **Zero extra.** Already computed. | Trivial. |
| 7 | **Corroboration or delay for crowdsourced pulses**: award Parking/Line/vibe Clout only if another distinct Student's report agrees within the decay window, or settle after the window closes if not contradicted. | Fabricated reports, lone spam | One extra indexed `.take(n)` read over recent reports for that lot or venue (already loaded for the 4-tier blend). Delayed settlement needs either read-time computation or one scheduled function per report; prefer read-time. | Medium. |
| 8 | **Diminishing returns**: e.g. full value for the first report per lot per day, less after. | Grinding one target | Uses the same cooldown/cap row (#3/#5); no new storage. | Small. |
| 9 | **Weekly, Campus-scoped leaderboard instead of all-time global**: one `cloutWeekly` row per (workspace, campus, weekKey, student) with an index ending in `score`; the board is a `.take(25)` read. Old weeks purged. | Newcomer discouragement, permanent incumbency | One patch per award to the weekly row (≤1,000 rows/week). Board reads are one bounded indexed query; subscribe only on the board screen, not in `shellSummary`. Computing a viewer's *exact* rank among 1,000 rows needs either a bounded scan or the free [Aggregate component](https://raw.githubusercontent.com/get-convex/aggregate/main/README.md) (`indexOf`, O(log n), namespace per week). Showing "Top 25 + your score" avoids that. | Medium. |
| 10 | **Opt-out and private-by-default display**: Clout visible to the Student; appearing on the public board is a setting; never show other Students' ranks in Feed or on Incident Posts. | Social-comparison harm, harassment of top reporters | One boolean on `students`; one filter field. | Small. |
| 11 | **No streaks, no loss-framed nudges, no push for rank changes.** | Compulsive use | **Negative cost.** Avoids a daily job and push traffic, and stays within ADR-0005's personal-push scope. | Trivial. |
| 12 | **Maintainer anomaly view**: "top weekly gainers" and "most-reversed" lists in the existing `Moderation Queue`. | Collusion that slips past caps | Bounded indexed reads on `cloutWeekly`/`cloutEvents`, only when a maintainer opens it. | Small. |
| 13 | **Tenure gating** (e.g. no public board appearance until onboarding is complete and the account is ≥7 days old) | Throwaway accounts, alt staff/student pair | Read `joinedAt` (already stored). | Trivial. |
| — | **Not recommended**: device fingerprinting, IP-based scoring, ML fraud models, phone verification, paid anti-bot services. | — | Privacy cost and/or $; beyond a $0 hackathon. Strava's ML classifier is first-party evidence of what large platforms do, not a small-scale requirement. | — |

### Proposed eligibility per KSUX action

| Action | Clout? | Conditions (proposal) |
| --- | --- | --- |
| `Parking Report` (fullness / spot opening) | Yes, small | Existing 1/10 min/lot cooldown; corroboration or settle-after-window; daily cap; reversed if quarantined and removed. |
| Dining `Line Check` | Yes, small | Existing 1/15 min; corroboration; daily cap. |
| Walk-in `Study Room` vibe | Only after a cooldown is added | Add per-room cooldown first (gap in `submitWalkInVibe`); then as above. |
| `Marketplace` confirmed handoff | Yes, for both parties | Only when existing `trustIncremented === true` (1 / 7 d / pair, buyer-confirmed). |
| Plain `Post`, received likes/reposts | No | Farmable via vote rings and low-effort posting. |
| Incident report / `Campus Safety` report / police handoff / moderation `Report` | **No** | See §3.3. |

## 6. Open questions and unverified items

- **Product decisions needed (map #35 grilling):** whether Clout unlocks any privilege (Stack Overflow model) or is purely cosmetic; cap values; whether faculty/staff accounts rank; whether `All KSU` gets a combined board; retention period for `cloutEvents`.
- **Weaponization tradeoff:** holding Clout on quarantine can still be used to delay a rival's points with 3 coordinated reports. Bounded by "hold, don't reverse" plus moderator review, but not eliminated.
- **Not verified:** Georgia's false-report statute text; Deci et al. full abstract; Hanus & Fox and Mekler et al. full texts (summaries only); Anderson et al. results section. No primary engineering write-up from Stack Overflow on its fraud *algorithm* beyond the help page was retrieved. Waze's official "get more points" help page redirected and was not read in full; the points table cited is from the community-maintained Wazeopedia on waze.com, which links to that help page.
- **Strava "segment updates / leaderboard cleanup"** and **Waze report-trust weighting** (higher ranks' reports carry more routing influence, per Wazeopedia's "Client Ranks" section) were noted but not examined in depth.
- **Quota figures are estimates**, not load tests. Validate with `convex-test` and the dashboard usage page before committing.
- Prior research files are untracked on `main`; links to them from this branch will not resolve on GitHub until they are committed.

## Sources

**First-party platform documentation**

- Stack Overflow — [What is reputation?](https://stackoverflow.com/help/whats-reputation); [Voting corrected](https://stackoverflow.com/help/serial-voting-reversed); [Privileges](https://stackoverflow.com/help/privileges)
- Reddit — [What is karma?](https://support.reddithelp.com/hc/en-us/articles/204511829-What-is-karma); [Personal Information policy](https://support.reddithelp.com/hc/en-us/articles/360043066452)
- Strava — [Segment Leaderboard Guidelines](https://support.strava.com/en-us/articles/15401921-segment-leaderboard-guidelines); [The Activity Flag](https://support.strava.com/en-us/articles/15402000-the-activity-flag-remove-an-activity-s-segment-results-from-the-leaderboard)
- Duolingo — [How do Duolingo Leaderboards work?](https://blog.duolingo.com/duolingo-leagues-leaderboards/) (2023)
- Snapchat — [How do Streaks work and when do they expire?](https://help.snapchat.com/hc/en-us/articles/7012394193684)
- Waze — [Your Rank and Points, USA Wazeopedia](https://www.waze.com/discuss/t/your-rank-and-points/377943) (community-maintained on waze.com)
- Convex — [Rate Limiter component README](https://www.npmjs.com/package/@convex-dev/rate-limiter); [Aggregate component README](https://raw.githubusercontent.com/get-convex/aggregate/main/README.md)

**Peer-reviewed and working papers** (DOIs resolved via Crossref)

- Anderson, Huttenlocher, Kleinberg, Leskovec (2013). Steering user behavior with badges. WWW '13. [10.1145/2488388.2488398](https://doi.org/10.1145/2488388.2488398)
- Buccirossi, Immordino, Spagnolo. Whistleblower Rewards, False Reports, and Corporate Fraud. [10.2139/ssrn.2993776](https://doi.org/10.2139/ssrn.2993776)
- Deci, Koestner, Ryan (1999). A meta-analytic review of experiments examining the effects of extrinsic rewards on intrinsic motivation. *Psychological Bulletin*. [10.1037/0033-2909.125.6.627](https://doi.org/10.1037/0033-2909.125.6.627)
- Douceur (2002). The Sybil Attack. IPTPS, LNCS. [10.1007/3-540-45748-8_24](https://doi.org/10.1007/3-540-45748-8_24)
- Gneezy, Rustichini (2000). Pay Enough or Don't Pay at All. *QJE*. [10.1162/003355300554917](https://doi.org/10.1162/003355300554917)
- Gneezy, Rustichini (2000). A Fine is a Price. *J. Legal Studies*. [10.1086/468061](https://doi.org/10.1086/468061)
- Hamari, Koivisto, Sarsa (2014). Does Gamification Work? HICSS. [10.1109/HICSS.2014.377](https://doi.org/10.1109/HICSS.2014.377)
- Hanus, Fox (2015). Assessing the effects of gamification in the classroom. *Computers & Education*. [10.1016/j.compedu.2014.08.019](https://doi.org/10.1016/j.compedu.2014.08.019)
- Hristova, Dumit, Lieberoth, Slunecko (2019). Snapchat Streaks: How Adolescents Metagame Gamification in Social Media. PsyArXiv preprint. [10.31234/osf.io/nszex](https://doi.org/10.31234/osf.io/nszex)
- Kumar, Cheng, Leskovec, Subrahmanian (2017). An Army of Me: Sockpuppets in Online Discussion Communities. WWW '17. [10.1145/3038912.3052677](https://doi.org/10.1145/3038912.3052677), [arXiv:1703.07355](https://arxiv.org/abs/1703.07355)
- Kurwa (2019). Building the Digitally Gated Community: The Case of Nextdoor. *Surveillance & Society*. [10.24908/ss.v17i1/2.12927](https://doi.org/10.24908/ss.v17i1/2.12927)
- Mekler, Brühlmann, Tuch, Opwis (2017). Towards understanding the effects of individual gamification elements on intrinsic motivation and performance. *Computers in Human Behavior*. [10.1016/j.chb.2015.08.048](https://doi.org/10.1016/j.chb.2015.08.048)
- Parker, Dodge (2024). The New Neighborhood Watch: An Exploratory Study of the Nextdoor App and Crime Narratives. [10.6000/1929-4409.2024.13.04](https://doi.org/10.6000/1929-4409.2024.13.04)
- van Essen, Van Ouytsel (2023). Snapchat streaks and problematic smartphone use and FOMO among early adolescents. *Telematics and Informatics Reports*. [10.1016/j.teler.2023.100087](https://doi.org/10.1016/j.teler.2023.100087)
- Waeye, Maussen (2023). Financial rewards: The Trojan horse of frivolous whistleblowing? SSRN working paper. [10.2139/ssrn.4671878](https://doi.org/10.2139/ssrn.4671878)

**KSUX repository**

- [`GLOSSARY.md`](../../GLOSSARY.md), [`docs/SPEC.md`](../SPEC.md), [`convex/schema.ts`](../../convex/schema.ts), [`convex/parking.ts`](../../convex/parking.ts), [`convex/study.ts`](../../convex/study.ts), [`convex/transitDining.ts`](../../convex/transitDining.ts), [`convex/marketplace.ts`](../../convex/marketplace.ts), [`convex/moderation.ts`](../../convex/moderation.ts), [`convex/lib/safety.ts`](../../convex/lib/safety.ts)
- Prior research (untracked on `main`): `docs/research/campus-safety.md`, `campus-safety-handoffs.md`, `campus-safety-alert-ingestion.md`, `campus-safety-community-feed.md`
