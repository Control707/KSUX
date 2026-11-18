# Citizen app teardown: incident lifecycle, verification, location and failures

**Date:** 2026-11-17 (America/New_York). **Ticket:** [Control707/KSUX#37](https://github.com/Control707/KSUX/issues/37), part of Wayfinder map [#35](https://github.com/Control707/KSUX/issues/35). **Status:** research findings only — not a decision, ADR, or authorization to build.

## Question

How does the **Citizen** app (sp0n, Inc.) actually work, and which of its patterns transfer to a campus incident feature for KSUX — a $0 Next.js PWA on Vercel Hobby + Convex Free + UploadThing Free + MapLibre/OpenFreeMap, with zero KSU IT approvals ([SPEC §1–2](../SPEC.md))?

KSU-specific safety research (official alerts, LiveSafe/police handoffs, Feed incident Posts) is **not** redone here; it lives in `docs/research/campus-safety.md`, `campus-safety-handoffs.md`, `campus-safety-alert-ingestion.md` and `campus-safety-community-feed.md` (untracked local files on `main` at time of writing) and is cited where relevant.

## Executive answer

Citizen is **not** primarily a crowdsourcing app. Its core is a **staffed newsroom that turns monitored 911/first-responder radio into curated "incidents"**, filtered by a published inclusion policy, geolocated and pushed to users within a radius of the incident. User live video is a **secondary input** that a human moderator reviews in real time and attaches to (or uses to create) an incident ([How does Citizen work?][H-work]; [criteria][H-criteria]; [Can I report an incident?][H-report]). Precise "Always On" device location is collected to target pushes, while public incident locations are shown on a map ([location FAQ][H-loc-precise]; [ToS §1C][ToS]).

Its best-documented failures — the 2016 **Vigilante** launch pulled by Apple within days ([TechCrunch 2016][TC-2016]), and the 2021 **Palisades fire manhunt** in which the company put a $30,000 bounty on an innocent man and pushed it to 848,816 LA users ([Vice/Motherboard 2021][Vice-2021]) — both came from the same root: **staff or users publicly naming/hunting individuals, amplified by push notifications optimised for engagement**. Critics also documented fear amplification and racist comment sections ([Mother Jones 2019][MJ-2019]; [Vice 2021][Vice-2021]).

**For KSUX:** the transferable parts are the *policy* patterns, not the *infrastructure*: a written inclusion/exclusion list, "no identifying details of parties" moderation rules, coarse public location, explicit "call 911/KSU Police first" framing, honest "no resolution available" states, recency-bounded map views, and never ranking/gamifying incidents. The parts that do **not** transfer are the 24/7 analyst desk, radio-scanner ingestion, live video, background precise location, and radius push fan-out — all of which exceed a $0, no-staff, no-approval student PWA and several of which caused Citizen's worst harms.

## Evidence method

Primary sources first: Citizen's Help Center (support.citizen.com, articles showing "Updated" dates in Sept–Nov 2026, retrieved 2026-11-17), Terms of Use (last updated 2024-09-26), Privacy Policy (last updated 2026-10-19), the Apple App Store listing (version 0.1317.0, released 2026-11-11) and citizen.com. Controversies come from credible reporting that directly quoted company statements or internal documents (TechCrunch, Vice/Motherboard, The Intercept, Mother Jones). Wikipedia was used **only** to locate original articles; nothing is cited to it. No account was created and no in-app UI was observed first-hand — UI descriptions are from Citizen's own text and press, and are labelled accordingly.

Labels: **[Citizen]** = Citizen's own words; **[Reported]** = credible journalism; **[Inference]** = this researcher's reasoning; **[Unverified]** = not settled by sources found.

## 1. Incident lifecycle

### 1.1 Who creates incidents

- **[Citizen]** "Citizen monitors a variety of public data sources using proprietary technology, allowing us to provide real-time alerts [of] emergencies reported to 911. Our team is made up of individuals with writing and public safety backgrounds, who are trained to make on-the-fly decisions about what goes into the App based on a set of complex criteria." ([How does Citizen work?][H-work])
- **[Citizen]** Published inclusion criteria: "We report a subset of events that are reported to 911, focusing on major, in-progress incidents… Our highly trained 24/7 team makes this determination case by case." Typically **included**: crimes in progress (assaults, robberies, weapons), fires/smoke/gas leaks/hazmat, heightened police activity. Generally **excluded**: most medical calls, routine traffic stops, **reports of suspicious persons**, verbal disputes without weapons. **Past incidents are usually excluded** unless there is an ongoing threat, suspect search or new development. ([Criteria][H-criteria])
- **[Reported]** At the 2017 relaunch the CEO said NYC had "about 10,000 911 calls per day… We include 300–400 on average," and suspicious-person/suspicious-bag/drug calls were excluded — but the vetting criteria were not then published. ([TechCrunch 2017][TC-2017]) The criteria are now public (above).
- **[Reported]** Former employees told Motherboard that analysts were measured on incident volume, reach and speed, that standards were "relaxed" on slow days, and that some scanner work was outsourced to CloudFactory; Citizen replied that "all incident updates and alerts continue to be reviewed by our 24/7 team of Citizen analysts." ([Vice 2021][Vice-2021])
- **[Citizen]** Missing persons/pets go through a **live agent**, who requires name/description, last known location/time, a photo, and confirmation the person was reported to police in the last 7 days, then "if appropriate, create[s] an incident." ([Missing person/pet][H-missing])

### 1.2 How user reports and video attach

- **[Citizen]** "If you witness or are a victim of a crime or see an emergency situation, please call 911 immediately." Users then report by **starting a live video** via "Alert Community" — for collisions, heavy police activity, fires, severe weather, lost pets and "other community updates." "All user-submitted videos are reviewed by a moderator in real-time." ([Can I report an incident?][H-report])
- **[Citizen]** Uploading pre-recorded video is **not** allowed: "We do not allow users to upload videos from their phones or computers at this time." Users are told to "keep a safe distance… Citizen does not condone users putting themselves in harm's way." ([How do I broadcast?][H-broadcast])
- **[Citizen]** If a broadcast surfaces a major incident, "our team can review your video and create an incident" ([Criteria][H-criteria]). Broadcasts are blocked if "unrelated to an incident" or ToS-violating; repeat offenders lose broadcast ability ([Video blocked][H-blocked]; [Not published][H-notpub]).
- **[Reported]** In 2020 Citizen said about 5% of incidents came from live broadcasts, which are "merged with 911-reported incidents" and moderator-reviewed before appearing. ([The Intercept 2020][Intercept-2020])
- **[Citizen]** The current App Store listing advertises "go live yourself to alert your community **and get rewarded**." ([App Store][AppStore]) **[Unverified]** what the reward is. This contrasts with 2019 reporting that videos were not paid or "gamified with rankings or 'likes'" ([Forbes, via Wikipedia's citation — not independently retrieved; treat as unverified](https://www.forbes.com/sites/stevenbertoni/2019/07/15/murder-muggings-mayhem-how-an-ex-hacker-is-trying-to-use-raw-911-data-to-turn-citizen-into-the-next-billion-dollar-app/)).

### 1.3 Moderation

- **[Citizen]** Removable content includes: harassment/hate; "**specific personal information that could identify parties involved in an incident**"; content inciting harm or publicising illegal activity; obscene/graphic content; "**details that jeopardize the safety of first responders**"; spam/self-promotion. Repeat removals lead to temporary then permanent contribution restrictions. Users can report content and users. ([How does Citizen moderate content?][H-moderate])
- **[Citizen]** ToS: Citizen "may, but [is] not required to, monitor or control the Content" and does "not endorse… or guarantee the completeness, truthfulness, accuracy, or reliability of any Content." ([ToS §3A][ToS])

### 1.4 Updates, resolution and removal

- **[Citizen]** "We may not receive follow-up for every incident… Once an incident has been resolved, the conclusion is not always made publicly available." ([No resolution][H-resolution])
- **[Citizen]** The App Store listing now promotes "**NEW: Incident Resolution** … real-time updates and resolution status on active events," with a map "color co[d]ed to see what's an active threat versus something that is resolved." ([App Store][AppStore]) **[Inference]** This is a response to the missing-closure gap the help article admits; how resolution is determined is **[Unverified]**.
- **[Citizen]** Users can hide a video from their profile (still visible on the incident) or permanently delete it from incident and profile. ([Hide/delete videos][H-videos]) Public content is "public data" the user can delete; account deletion is available. ([Privacy Policy][Privacy])
- **[Reported]** In 2020 Citizen said that when users delete content it "loses access within 30 days," though law enforcement can request preservation. ([Fast Company 2020](https://www.fastcompany.com/90512846/why-citizen-has-become-the-unofficial-social-network-for-protests) — cited via its Wikipedia reference; not independently retrieved, **[Unverified]**.)

### 1.5 Map/list time window

- **[Citizen]** The home screen shows incidents around the user's *immediate* location; users can search other places. "As you pan…, zoom out, and pinch the map, the incidents displayed will adjust… the time range adjust[s] to show you incidents reported in the past 2 hours or up to 7 days ago. If you are zoomed in, you're likely to see older incidents. If you are zoomed out, … more recent incidents." ([View incidents in an area][H-area])

## 2. Location

| Aspect | What sources say |
| --- | --- |
| Reporter/user device location collected | **[Citizen]** ToS asks users to permit location "even in the background… the Services are designed to deliver push notifications to users within a certain radius of a reported incident" ([ToS §1C][ToS]). Help: Citizen needs location "Always On" and "Precise" "only to send you relevant… notifications… All location data is deleted after 30 days." ([Always On/Precise][H-loc-precise]) Privacy Policy: "we lower the resolution of historical location data where possible." ([Privacy][Privacy]) |
| Who sees a user's location | **[Citizen]** "Only users who you explicitly share your location with on Citizen are able to see your location." ([Can others see my location?][H-loc-others]) Verified partners (first responders, agencies, municipalities, enterprises, **media**) get "publicly available incident information, including video streams and incident location" but not the user's own location/PII; users can opt out of partner access but "all videos created on Citizen remain publicly viewable and downloadable." ([Verified partners][H-partners]) |
| Public incident precision | **[Reported]** Alerts "contain a brief description, exact address and distance from the user" ([Forbes 2019, via Wikipedia citation — **Unverified**](https://www.forbes.com/sites/stevenbertoni/2019/07/15/murder-muggings-mayhem-how-an-ex-hacker-is-trying-to-use-raw-911-data-to-turn-citizen-into-the-next-billion-dollar-app/)). **[Reported]** Per former staff, "domestic violence incidents are recorded at an intersection rather than an address." ([Vice 2021][Vice-2021]) **[Citizen]** Marketing samples on citizen.com show neighbourhood-level labels (e.g. "Queens, New York") ([citizen.com][Home]). |
| Notification radius | **[Citizen]** Delivery depends on "location and nearby activity… population density, incident severity, and your personal notification preferences." ([Enable notifications][H-notify]) A **custom** radius is a paid Premium feature ([Premium][H-premium]); "Alert Zones" for school/work exist ([App Store][AppStore]). **[Unverified]** the default radius — not published. |
| What a reporter's broadcast reveals | **[Inference]** A live broadcast is by definition at the scene, so the incident pin plus a publicly viewable/downloadable video reveals where the broadcaster *was*, even though Citizen does not share the account's location field. Witness-exposure risk was raised by WITNESS's Sam Gregory in 2017 ([TechCrunch 2017][TC-2017]). |
| Scale of reach | **[Reported]** Individual pushes reached 13,500–51,700 New Yorkers in 2019 ([Mother Jones][MJ-2019]); the Palisades push reached 848,816 LA users ([Vice][Vice-2021]). |

## 3. Anonymity, identity and legal/safety language

- **[Citizen]** Sign-in uses a mobile phone number/username (ToS §2 refers to "the mobile telephone number, username, or other credentials") ([ToS][ToS]). Users must be **18+** ([ToS §1A][ToS]); the App Store rating is 17+ ([App Store][AppStore]). Accounts have public profiles that display broadcasts ([Hide/delete videos][H-videos]). **[Unverified]** whether comments show real names — sources only establish handles/profiles.
- **[Citizen]** Safety language: "please call 911 immediately" before reporting ([Report][H-report]); the App Store notes "Citizen may notify you of a crime in progress before the police respond… please use it responsibly" ([App Store][AppStore]). ToS assumption-of-risk: users "should not travel to or remain in any area during, before, or after a crime or other hazardous situation" and must not "incite, encourage, cause, or engage in any criminal, hazardous… or otherwise unsafe activity" ([ToS §1A][ToS]).
- **[Citizen]** On 911: "YOU ARE FREE TO CONTACT 911… USING THE PREMIUM SERVICES INSTEAD OF CONTACTING 911… IS YOUR CHOICE AND NOT REQUIRED," and "We cannot guarantee that the Premium Services will be able to connect you to 911… Please call 911 directly… if there is any problem or delay." ([ToS, "Your Personal Responsibility" and "911 Disclaimer" subsections][ToS]) **[Inference]** The literal phrase "not a substitute for 911" was not found in the retrieved text; the substance is present.
- **[Citizen]** Liability: content is "the sole responsibility of the person who originated" it; aggregate liability capped at US$100 (or six months' fees); mandatory individual arbitration in New York; broad perpetual, sublicensable licence to user content, including syndication to "news outlets" ([ToS §3, "Limitation of Liability", §14][ToS]; [Privacy][Privacy]).
- **[Citizen]** Law enforcement: personal information is disclosed "without your knowledge or consent" on an order, subpoena, warrant or other legal requirement ([Privacy][Privacy]).

## 4. Known failures and how Citizen changed

| Failure | Evidence | Citizen's response |
| --- | --- | --- |
| **Vigilante (Oct–Nov 2016)** encouraged users to intervene; risk of profiling and harassment | Pulled from the App Store about a week after its NYC launch; TechCrunch confirmed it was under Apple's rule against apps risking physical harm. Launch post said "average and ordinary" citizens should approach crime "as a group." NYPD: "Crimes in progress should be handled by the NYPD and not a vigilante with a cell phone." ([TechCrunch 2016][TC-2016]; [Intercept 2020][Intercept-2020]) | Relaunched as **Citizen** (Mar 2017): pop-up guidance to "never approach a crime scene, interfere with an incident, or get in the way of police"; excluded suspicious-person calls; CEO promised to remove the "Report Incident" button ([TechCrunch 2017][TC-2017]). |
| **User reporting reintroduced (2020)** | Citizen quietly reintroduced user live-video reporting, ~5% of incidents; experts warned of racism, surveillance and panic ([Intercept 2020][Intercept-2020]). | Reports are moderator-reviewed and merged with 911 incidents ([Intercept][Intercept-2020]); today framed as "Alert Community" with call-911-first copy ([Report][H-report]). |
| **Palisades fire manhunt (May 2021) — misidentification** | CEO directed staff to "publish ALL info," name and show a photo of a supposed arsonist, raised a reward to $30,000 and pushed "Tap to join the live search" to 848,816 LA users; a staffer flagged it violated the company's own rule against identifying parties; the man was innocent. CEO said he "overrode the policy we have for Mission Control." ([Vice 2021][Vice-2021]) | Publicly called it "a mistake we are taking very seriously" and apologised ([Vice][Vice-2021]). **[Unverified]** any published policy change specifically resulting from it. |
| **Fear amplification / anxiety** | 2019: frequent pushes create "a culture of fear" while NYC major felonies fell >80% 1990–2018; scanner traffic is unreliable mid-incident (CJR's Mathew Ingram) ([Mother Jones][MJ-2019]). 2021: ex-employees described an "anxiety sweatshop" and alleged the subscription model benefited from anxiety; CEO Slack: "We send so many dumb notifs" ([Vice][Vice-2021]). | Citizen denied the anxiety-monetisation claim and said it was "reducing the reach of notifications about violent incidents, and increasing… missing people or pets being reunited" ([Vice][Vice-2021]). Its site now leads with rescue/reunion "Real stories" ([citizen.com][Home]). |
| **Racism/homelessness in comments and incidents** | Ex-employee: part of the user base is "insanely racist"; many incidents/comments concern people experiencing homelessness despite policy ([Vice][Vice-2021]). TechCrunch drew the Nextdoor profiling parallel ([TC 2016][TC-2016]). | Citizen states it "does not report on suspicious people, nor… people experiencing homelessness" ([Vice][Vice-2021]); moderation rules ban hate and identifying details ([Moderate][H-moderate]). |
| **Misinformation from scanner audio** | Scanner chatter is officers' best guess mid-event; Boston Marathon scanner-following led to innocent people being named ([Mother Jones][MJ-2019]). | Unconfirmed reports "are listed as such," per a spokesperson ([Mother Jones][MJ-2019]). **[Unverified]** current UI labelling. |
| **Location-always controversy (2019)** | **[Unverified]** — only found via secondary summary of The Intercept; not independently confirmed. | Help center now justifies Always/Precise with 30-day deletion ([Always On][H-loc-precise]). |

## 5. UI patterns (map-plus-list) — copy vs. avoid

UI descriptions are from Citizen's own copy and press, **not first-hand use**.

**Worth copying (adapted):**
1. **Recency-bounded map** — only show a time window (Citizen: 2 h–7 d by zoom) so old events don't read as current ([Area][H-area]). For KSUX: a fixed, labelled window (e.g. "last 24 h") is simpler and more honest than zoom-dependent windows. **[Inference]**
2. **Active vs. resolved colour state** plus an explicit "no update available" state ([App Store][AppStore]; [No resolution][H-resolution]).
3. **Card = short headline + place label + relative time + source** ("CITIZEN · 4m ago · Queens, New York") ([citizen.com][Home]).
4. **Call-emergency-first gate before reporting** ([Report][H-report]).
5. **Published inclusion/exclusion criteria** shown in-app ([Criteria][H-criteria]).
6. **"No identifying details of parties" and "no responder-endangering details"** as explicit moderation categories ([Moderate][H-moderate]).
7. **Search "what's going on here?"** framing for helicopters/closures ([citizen.com][Home]).

**Avoid:**
1. **Live video and "get rewarded" incentives** — the manhunt, witness exposure and "go near danger" risks all flow from this ([Vice][Vice-2021]; [TC 2017][TC-2017]; [App Store][AppStore]).
2. **Reaction buttons / engagement on incidents** (2019 "whoa" button, comments as a draw) ([Mother Jones][MJ-2019]).
3. **Broadcast pushes to everyone in a region**, and push volume as a growth metric ([Vice][Vice-2021]).
4. **Exact addresses** for sensitive categories (Citizen itself downgrades DV to intersections) ([Vice][Vice-2021]).
5. **Paywalling safety controls** like notification radius ([Premium][H-premium]).

## 6. Transfers / doesn't transfer to a $0 campus PWA ("Done when")

| Citizen pattern | Transfers? | Why (KSUX constraints) |
| --- | --- | --- |
| Written inclusion/exclusion criteria (exclude "suspicious person", past events, medical) | **Yes** | Pure policy text; directly mitigates profiling ([Criteria][H-criteria]). |
| Moderation rule: no identifying info about parties; no responder-endangering detail | **Yes** | Extends SPEC §4.5 write-time guardrails and `Report` flow; matches KSU timely-warning practice of withholding victim identifiers (see `campus-safety-community-feed.md` §3). |
| "Call 911 / KSU Police first" gate before posting | **Yes** | Already proposed in `campus-safety-community-feed.md` §4 (separate Contact police vs Publish actions) and SPEC §4.5 Campus Safety callout. |
| Coarse public location (building/area, not address/GPS) | **Yes** | Static campus GeoJSON + MapLibre already in stack (SPEC §2); avoids reporter-location leakage. |
| Recency-bounded map + list, active/resolved/"no update" states | **Yes** | Fits read-time `expiresAt` decay pattern (SPEC §5.2), zero crons. |
| Map-plus-list view with headline/place/time/source cards | **Yes** | MapLibre/OpenFreeMap, no key, no card. |
| Human review before an incident is public | **Partly** | KSUX has no 24/7 staff; SPEC's maintainer `Moderation Queue` is best-effort. Option: label community Posts "unverified" rather than claim review. **[Inference]** |
| Staff-created incidents from 911/police radio | **No** | Requires paid radio network + 24/7 analysts ([Work][H-work]); scanner data is unreliable ([MJ][MJ-2019]); official KSU sources are covered in `campus-safety-alert-ingestion.md` instead. |
| Live video broadcasting | **No** | SPEC limits media to still WebP images on UploadThing Free (SPEC §2); and it is the root of Citizen's worst harms. |
| Precise "Always On" background location + radius push | **No** | A PWA cannot do reliable background geolocation; SPEC/ADR0005 restrict VAPID push to low-fan-out personal events, not broadcast (SPEC §5.4; `campus-safety.md` §1). |
| Missing-person agent workflow | **No** | Requires staffed verification and police confirmation ([Missing][H-missing]). |
| Rewards, reactions, engagement ranking on incidents | **No (avoid)** | Conflicts with `campus-safety-community-feed.md` §2 finding that hot score ≠ verification. |
| Partner/media syndication, broad content licence | **No** | Out of scope; Student content stays in KSUX. |
| Paid tier for radius/history | **No** | $0 product; no paywalled safety. |

## Open questions / unverified

- Default notification radius and how "severity" changes it — not published.
- What "get rewarded" for going live means today.
- Whether Citizen made a formal policy change after the Palisades incident (only the apology is sourced).
- How "Incident Resolution" status is determined (staff, feed, users).
- Exact current precision of public incident pins (address vs. block vs. intersection) — 2019 reporting says exact address; not verified in the current app.
- The 2019 "location always required" controversy and the 2019 Forbes/2020 Fast Company claims were located via Wikipedia citations but the originals were not retrieved.
- No peer-reviewed study specific to Citizen's psychological effects was found in this pass; fear-amplification evidence here is journalistic plus expert quotes.

## Sources

Citizen first-party (retrieved 2026-11-17):
- [H-work]: https://support.citizen.com/hc/en-us/articles/115000278894-How-does-Citizen-work
- [H-criteria]: https://support.citizen.com/hc/en-us/articles/115000603373-What-is-Citizen-s-criteria-for-reporting-incidents
- [H-report]: https://support.citizen.com/hc/en-us/articles/115000424533-Can-I-report-an-incident-on-Citizen
- [H-broadcast]: https://support.citizen.com/hc/en-us/articles/115000459553-How-do-I-broadcast-on-the-Citizen-app
- [H-blocked]: https://support.citizen.com/hc/en-us/articles/360006957014-Why-did-my-video-get-blocked
- [H-notpub]: https://support.citizen.com/hc/en-us/articles/360007030153-Why-wasn-t-my-video-published-on-Citizen
- [H-moderate]: https://support.citizen.com/hc/en-us/articles/360006218933-How-does-Citizen-moderate-content
- [H-resolution]: https://support.citizen.com/hc/en-us/articles/115000606253-Why-is-there-no-incident-resolution-or-update
- [H-area]: https://support.citizen.com/hc/en-us/articles/115002151093-How-do-I-view-incidents-reported-in-a-specific-area
- [H-notify]: https://support.citizen.com/hc/en-us/articles/115000606974-How-do-I-enable-notifications-and-location
- [H-loc-precise]: https://support.citizen.com/hc/en-us/articles/12959161118871-Why-does-Citizen-need-my-location-Always-On-and-Precise
- [H-loc-others]: https://support.citizen.com/hc/en-us/articles/12959165730199-Can-other-Citizen-users-see-my-location
- [H-partners]: https://support.citizen.com/hc/en-us/articles/31441596542871-Who-are-verified-partners-and-why-would-they-need-access-to-videos-I-record-on-Citizen
- [H-missing]: https://support.citizen.com/hc/en-us/articles/6272933816599-How-can-I-report-a-missing-person-or-pet-on-Citizen
- [H-videos]: https://support.citizen.com/hc/en-us/articles/360006466673-How-do-I-hide-or-delete-my-videos
- [H-premium]: https://support.citizen.com/hc/en-us/articles/30408014010007-What-is-Citizen-Premium
- [ToS]: https://citizen.com/privacy/tos (Last Updated 2024-09-26)
- [Privacy]: https://citizen.com/privacy/policy (Last Updated 2026-10-19)
- [AppStore]: https://apps.apple.com/us/app/citizen-safety-live-video/id1039889567 (v0.1317.0, 2026-11-11; text via iTunes lookup API)
- [Home]: https://citizen.com/

Reporting:
- [TC-2016]: Sarah Perez, "Controversial crime reporting app Vigilante banned from App Store," TechCrunch, 2016-11-02 — https://techcrunch.com/2016/11/02/controversial-crime-reporting-app-vigilante-banned-from-app-store/
- [TC-2017]: Sarah Perez, "Banned crime reporting app Vigilante returns as Citizen…," TechCrunch, 2017-03-10 — https://techcrunch.com/2017/03/10/banned-crime-reporting-app-vigilante-returns-as-citizen-says-its-report-incident-feature-will-be-pulled/
- [MJ-2019]: Abigail Weinberg, "'It Creates a Culture of Fear': How Crime Tracking Apps Incite Unnecessary Panic," Mother Jones, 2019-08-09 — https://www.motherjones.com/politics/2019/08/it-creates-a-culture-of-fear-how-crime-tracking-apps-incite-unnecessary-panic/
- [Intercept-2020]: "Citizen App Again Lets Users Report Crimes — And Experts See Big Risk," The Intercept, 2020-03-02 — https://theintercept.com/2020/03/02/citizen-app/
- [Vice-2021]: Joseph Cox & Jason Koebler, "'FIND THIS F***:' Inside Citizen's Dangerous Effort to Cash In On Vigilantism," Vice/Motherboard, 2021-05-27 — https://www.vice.com/en/article/inside-crime-app-citizen-vigilante/

Project context: [SPEC](../SPEC.md); `docs/research/campus-safety*.md` (untracked on `main`).

[H-work]: https://support.citizen.com/hc/en-us/articles/115000278894-How-does-Citizen-work
[H-criteria]: https://support.citizen.com/hc/en-us/articles/115000603373-What-is-Citizen-s-criteria-for-reporting-incidents
[H-report]: https://support.citizen.com/hc/en-us/articles/115000424533-Can-I-report-an-incident-on-Citizen
[H-broadcast]: https://support.citizen.com/hc/en-us/articles/115000459553-How-do-I-broadcast-on-the-Citizen-app
[H-blocked]: https://support.citizen.com/hc/en-us/articles/360006957014-Why-did-my-video-get-blocked
[H-notpub]: https://support.citizen.com/hc/en-us/articles/360007030153-Why-wasn-t-my-video-published-on-Citizen
[H-moderate]: https://support.citizen.com/hc/en-us/articles/360006218933-How-does-Citizen-moderate-content
[H-resolution]: https://support.citizen.com/hc/en-us/articles/115000606253-Why-is-there-no-incident-resolution-or-update
[H-area]: https://support.citizen.com/hc/en-us/articles/115002151093-How-do-I-view-incidents-reported-in-a-specific-area
[H-notify]: https://support.citizen.com/hc/en-us/articles/115000606974-How-do-I-enable-notifications-and-location
[H-loc-precise]: https://support.citizen.com/hc/en-us/articles/12959161118871-Why-does-Citizen-need-my-location-Always-On-and-Precise
[H-loc-others]: https://support.citizen.com/hc/en-us/articles/12959165730199-Can-other-Citizen-users-see-my-location
[H-partners]: https://support.citizen.com/hc/en-us/articles/31441596542871-Who-are-verified-partners-and-why-would-they-need-access-to-videos-I-record-on-Citizen
[H-missing]: https://support.citizen.com/hc/en-us/articles/6272933816599-How-can-I-report-a-missing-person-or-pet-on-Citizen
[H-videos]: https://support.citizen.com/hc/en-us/articles/360006466673-How-do-I-hide-or-delete-my-videos
[H-premium]: https://support.citizen.com/hc/en-us/articles/30408014010007-What-is-Citizen-Premium
[ToS]: https://citizen.com/privacy/tos
[Privacy]: https://citizen.com/privacy/policy
[AppStore]: https://apps.apple.com/us/app/citizen-safety-live-video/id1039889567
[Home]: https://citizen.com/
[TC-2016]: https://techcrunch.com/2016/11/02/controversial-crime-reporting-app-vigilante-banned-from-app-store/
[TC-2017]: https://techcrunch.com/2017/03/10/banned-crime-reporting-app-vigilante-returns-as-citizen-says-its-report-incident-feature-will-be-pulled/
[MJ-2019]: https://www.motherjones.com/politics/2019/08/it-creates-a-culture-of-fear-how-crime-tracking-apps-incite-unnecessary-panic/
[Intercept-2020]: https://theintercept.com/2020/03/02/citizen-app/
[Vice-2021]: https://www.vice.com/en/article/inside-crime-app-citizen-vigilante/
