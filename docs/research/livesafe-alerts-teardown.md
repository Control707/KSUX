# LiveSafe safety-alert and broadcast teardown

- **Date:** 2026-11-17
- **Ticket:** [Control707/KSUX#38](https://github.com/Control707/KSUX/issues/38) (part of wayfinder map [#35](https://github.com/Control707/KSUX/issues/35))
- **Branch:** `research/livesafe-alerts-teardown` (research-only, never merged)
- **Scope:** product teardown of LiveSafe's *broadcast / alert* model and in-app alert experience. KSU's LiveSafe deployment, police routes, reporting handoffs, location privacy, and Rave/KSU Alert ingestion are already covered in [campus-safety.md](campus-safety.md), [campus-safety-handoffs.md](campus-safety-handoffs.md), [campus-safety-alert-ingestion.md](campus-safety-alert-ingestion.md), and [campus-safety-community-feed.md](campus-safety-community-feed.md) (untracked on `main`); they are cited, not redone.

## Question

What does LiveSafe (Vector Solutions) do for safety alerts/broadcasts and the in-app experience around them? Specifically: the broadcast model (senders, targeting, message types, follow-ups/all-clear, acknowledgements, history), alert UI (in-app vs push, severity, accessibility), how official broadcasts are separated from community tips plus any "not monitored" disclaimers, and comparable apps only where they show a pattern LiveSafe lacks.

## Executive answer

LiveSafe's broadcast feature is a **one-to-many, administrator-originated channel sent from a web "command dashboard"**. Vector documents delivery over SMS, voice, email, and push. Targeting can be the whole organization, designated groups, geofenced areas, or scheduled times. Vector also documents a separate **Check-in** message type that requires a reply: **"I'm OK"** or **"I need help."** In the app, messages appear in an **inbox in the bottom navigation bar**. [V1] [V2] [V3] [V5]

Official and community content are kept apart by direction. **Broadcasts go out** from administrators. **Tips come in** from users, are routed to designated officials, and get private two-way chat. Tips do not become broadcasts in any documented flow; the only documented admin-curation surface is a "published reports" layer on the Safety Map. [V2] [V4] [V7]

**Publicly undocumented:** severity tiers, all-clear/cancel/update message semantics, read receipts for ordinary broadcasts, broadcast retention/history rules, and which roles may send. LiveSafe's strongest disclaimer is **store-listing legal text**: "Should an emergency arise, always dial 911." Reports are not received by police unless the organization has integrated. **No first-party "not monitored 24/7" statement was found.** [A1] [A2]

For KSUX, LiveSafe offers several patterns to reuse. KSUX can split *official* and *peer* content structurally. It can treat freshness and provenance as UI data, and add a "check-in" style acknowledgement for low-stakes things. It should copy the plain "always call 911" placement and offline-ready reference content (an AppArmor pattern LiveSafe doesn't advertise). None of this requires KSUX to originate emergency alerts.

## Evidence labels

Same convention as the prior KSUX safety research:

- **Vendor statement**: from Vector/LiveSafe or Motorola/Rave first-party pages, handouts, store listings, or policy. These are product capabilities. They are **not** evidence of what KSU has enabled.
- **Platform/spec statement**: from a standards body or OS vendor.
- **Unverified**: a claim that public first-party material does not settle. Not finding documentation is not proof that a feature is absent.
- **Implication**: KSUX reasoning only. It is not a decision.

## 1. Broadcast / alert model

### 1.1 Who can send

- **Vendor statement:** Administrators send broadcasts from the cloud-based **command dashboard**. Vector says administrators "can manage all incoming and outgoing communications, including tips, broadcasting, and check-in messaging." [V6] The general product page lists "Broadcast emergency notifications quickly" as a dashboard function. [V1]
- **Vendor statement:** The higher-ed page describes "cross-functional use": the platform can be configured for Security, Student Affairs, HR, and others. [V2] The 2024 app release notes add a mobile admin role, but only for **tips**: users with the **"Tip Admin on Mobile"** privilege can view and respond to tips from the app. That release does not mention broadcasting from mobile. [A1]
- **Unverified:** the role and permission model for *sending* broadcasts (approval workflows, two-person rule, templates, audit log). The dashboard's broadcast screens are not publicly documented. Nothing in public material establishes who at KSU can send a LiveSafe broadcast, or whether KSU uses LiveSafe broadcast at all. KSU names **Rave Alert** as its mass-notification system ([campus-safety.md §3](campus-safety.md)).

### 1.2 Targeting

| Mechanism | Evidence |
| --- | --- |
| Whole organization | "Message your entire community or customizable groups." [V2] "Easily schedule organization-wide notifications." [V1] |
| Designated groups | Same "Designated Groups" bullet. [V2] |
| Geofence | "Geo-Fencing / Timed – Target and message specific areas on campus and/or specific times throughout the day." [V2] The application privacy policy explains the mechanism: the organization may message "any and all App users in a certain geographic area and your last-used location information may be used to target such messages. Your location information will not be provided to your organization when targeting these messages." [V8] |
| Scheduled / timed | "Timed" targeting [V2]; "set up scheduled messages" [V6]. |
| External groups | "Connect to External Groups – Communicate securely with external groups, such as local law enforcement." [V2] |

**Vendor statement on Android:** LiveSafe's developer reply on Google Play says a **persistent notification** was added "in order to ensure we can deliver timely location based updates due to Android operating system restrictions." Users can turn off that persistent notification in OS settings without affecting other notifications. A user review in the same thread says the app warns that disabling it means missing push notifications. That review is **not** a first-party claim. [A2]

**Implication:** geofencing depends on the device's last-known location, which keeps changing. That needs background location. The listings warn that background GPS "can dramatically decrease battery life." [A1] [A2] KSUX's PWA would face the same need. It is outside the existing [ADR0005](../adr/0005-diff-gated-sync-read-time-expiry-and-read-only-commuter-pwa.md) scope.

### 1.3 Message types

| Type | What is documented | Source |
| --- | --- | --- |
| **Broadcast** | One-way message to the targeted audience. Vector's examples run "from weather advisories and policy updates to shift changes or crime alerts." Vector recommends sending routine broadcasts too (events, closures, weather, broken elevators, nearby protests). Its reason: "regular notifications help students, faculty, and staff grow familiar with your safety communications platform." | [V1] [V5] |
| **Check-in** | A prompt that "require[s] a response." The user taps **"I'm OK"** or **"I need help."** "I need help" lets Security "determine your location if you have location services enabled and … contact you via your … profile info." | [V2] [V3] |
| **Panic alarm** (user-originated, not a broadcast) | One-tap "silent" alert to Security. It opens a chat and starts location sharing, which the user can stop by tapping a blue bar. | [V9] [V6] |
| **SafeWalk alerts** (peer, not official) | A user invites up to three companions. SafeWalk "alerts their virtual companions or authorities if the person does not check in at their final destination on time." | [V6] |

### 1.4 Follow-ups and all-clear

- **Unverified:** no public LiveSafe source describes a structured **update**, **cancel**, or **all-clear** message type, or linking a follow-up to an earlier broadcast. Public material only shows broadcasts as standalone sends. A follow-up is presumably just another broadcast, but that is **unverified**.
- **Spec contrast:** OASIS CAP v1.2 (the format Rave says it can emit outbound; see [campus-safety-alert-ingestion.md §3](campus-safety-alert-ingestion.md)) defines `msgType` values. These include **Alert**, **Update** ("supercedes the earlier message(s) identified in `<references>`"), **Cancel**, **Ack**, and **Error**, plus a separate `status` (Actual/Exercise/System/Test/Draft) and an optional `expires`. [P1] An alert system can make all-clear a first-class, linked message, and LiveSafe's public material does not show that it does.

### 1.5 Read receipts and acknowledgement

- **Vendor statement:** the dashboard shows **"real-time responses and success rates"** [V1]. Check-in collects an explicit OK / need-help reply. [V3]
- **Vendor statement (privacy policy):** location may be shared with the organization "on confirmation that you received a broadcast message to users in a certain geographic area." [V8] So at least geofenced broadcasts can carry a user-side **receipt confirmation** that discloses location.
- **Unverified:** whether ordinary broadcasts have read receipts. It is also unverified whether "success rate" counts delivery, opens, or replies, and whether the user is told that confirming shares location.

### 1.6 Alert history in the app

- **Vendor statement:** check-in prompts can also be found "within the app's inbox in the bottom navigation bar." [V3]
- **Unverified (user review, not first-party):** a 2019 App Store review describes the bottom bar as home, walking-home, and **"announcements"** icons. [A1] Retention period, sorting, expiry, and deletion of past broadcasts are **not documented**.

## 2. Alert UI

### 2.1 Push vs in-app

- **Vendor statement:** each broadcast can be sent over SMS, voice, email, and/or push. [V1] [V2] For a check-in, users "open the link provided (for SMS text and email) or tap the notification bubble (for push notification)." Both paths lead to the same in-app/web response screen. [V3] The privacy policy says sending "safety and service-related notifications from your organization" over email, SMS, push, and live chat relies on the contact data users submit. [V8]
- **Vendor statement:** recent app release notes include "Fixed push notification delivery problem" and "Fixed issues with push notifications not loading." [A1] Push delivery has had real defects. Treat this as general context for treating push as best-effort, not a reliability measurement.

### 2.2 Severity treatment

- **Unverified:** no public LiveSafe source documents **severity levels**, color coding, distinct sounds, or use of iOS **Critical** / **Time Sensitive** interruption levels for broadcasts. The App Store listing does not mention critical alerts. [A1]
- **Platform statement:** Apple defines four interruption levels. **Passive** goes to the list silently. **Active** lights the screen and can play a sound. **Time Sensitive** "breaks through system notification controls." **Critical** "bypasses the mute switch." [P2] Critical alerts need a special Apple entitlement (Apple's general documentation; the entitlement process was **not** re-verified here). A PWA can't select these levels. The WHATWG Notifications standard instead offers `tag`, `renotify`, `silent`, and `requireInteraction` ("should remain readily available until the end user activates or dismisses the notification" on large-screen devices). [P3]

### 2.3 Accessibility

- **Vendor statement:** the App Store version history repeatedly lists "Accessibility enhancements/improvements" (2022–2025). It names no specific features or WCAG target. [A1]
- **Platform-reported:** App Store "Accessibility: **The developer has not yet indicated which accessibility features this app supports.**" [A1]
- **Unverified:** VoiceOver/TalkBack labels for alert content, haptic and visual alternatives, text scaling for broadcasts, or multilingual broadcasts. The app UI is listed in English plus six languages [A1], but nothing says broadcast *content* is translated.

## 3. Official broadcasts vs community tips; disclaimers

### 3.1 Separation model

- **Direction:** broadcasts are admin → users [V1] [V6]. Tips are user → officials, "routed to the appropriate campus official", with "two-way secure chat." [V2] [V5]
- **Visibility:** tips are private to the routing officials and the submitter. Vector says tips can be anonymous "or not." [V2] Their anonymity limits are covered in [campus-safety-handoffs.md §6](campus-safety-handoffs.md).
- **Curation bridge:** the Safety Map has a toggleable layer for **"published reports"**, alongside "Safety Places" and "organization areas of interest." [V7] The Android listing calls this "local incident info." [A2] **Unverified:** who publishes a report to the map, whether tips become map items, and how published reports are labeled versus official notices.
- No public peer-to-peer feed is documented. The higher-ed page says "Share insights … with a customizable group of hand-selected peers" for **chat**, not a public feed. [V1]

### 3.2 Disclaimers

- **Vendor statement (both store listings, verbatim excerpt):** "DO NOT USE THIS APPLICATION TO REPORT REAL-TIME EMERGENCIES IF YOUR LOCAL POLICE ORGANIZATION IS NOT LISTED IN THE ORGANIZATIONS SCREEN IN THE APP. Reports will not be immediately received by police or emergency authorities until LiveSafe coordinates with authorities… Should an emergency arise, always dial 911." The listings also include a liability disclaimer covering "expectations of safety and security." [A1] [A2]
- **Not found:** a first-party LiveSafe or KSU statement that tips or chat are "not monitored 24/7", or that states monitoring hours. The KSU LiveSafe page says the app "streamline[s] communication with University Police" and makes no monitoring claim. [K1] Absence is **not** proof either way. Monitoring hours are configured by each organization and are **unverified** for KSU (see [campus-safety.md §6](campus-safety.md)).
- **Observation (user review, not first-party):** an App Store reviewer at another campus said the app "doesn't really specify how long it will take your report to be processed." [A1] The response-time gap is a user-reported UX issue, not a measured fact.

## 4. Comparable apps (only where they show a gap)

| Pattern | Comparable source | Gap in LiveSafe's public material |
| --- | --- | --- |
| **Offline-ready reference content** | AppArmor: "Content can be stored in the app for offline-ready conditions where end users lack connectivity". It also provides "offline-ready emergency plans, maps, answers to frequently asked questions." [M1] [M2] | LiveSafe documents resources and a Safety Map but no offline guarantee. [V2] [V7] |
| **Designated "channel for truth"** | AppArmor: "In a media environment saturated with misleading or false information, AppArmor gives your audience a clear designated channel for truth." It is custom-branded under the institution's own App Store account. [M2] | LiveSafe is one shared app where the user selects an organization ([campus-safety-handoffs.md §3](campus-safety-handoffs.md)), so provenance depends on the user picking the right organization. |
| **Routine non-emergency notices built into the product** | AppArmor: "Automate game-day notices and other relevant alerts." [M1] | LiveSafe *recommends* routine broadcasts [V5]. This is the same pattern, documented as advice rather than a feature. |
| **Opt-in, location-based push spelled out to users** | Rave Guardian listing: "If you allow Guardian, you can receive important notification based on your location". It also says the app "requires a connection to a mobile network data connection." [M3] | LiveSafe's consent wording is in the privacy policy, not the store feature list. [V8] |
| **Escalation when a check-in is missed** | AppArmor "Work alone": "If a user does not check in, a call is made to an emergency contact." [M1] | LiveSafe documents this for SafeWalk arrival [V6]. For organization check-ins, no documented escalation for a missing reply. |

## 5. Answering "Done when"

- **Findings doc on `research/livesafe-alerts-teardown`:** this file.
- **Each claim sourced:** inline `[ID]` citations below. Unsettled items are labeled **unverified**.
- **Short "patterns KSUX could reuse without being an official alert system":** below.

### Patterns KSUX could reuse without being an official alert system

All of these are **implications/proposals**. Each respects Decision #10 / ADR0005 (VAPID push is for personal messaging only), the $0 constraint, and the prior research's "no emergency broadcast" boundary.

1. **Direction-based separation.** LiveSafe separates *official outbound* content from *peer inbound* content by direction and audience, not by a label on a shared feed. [V1] [V2] KSUX can do the same: official KSU material goes in a separate, link-out "Official KSU sources" surface (never mixed into the Feed). Student `Post`s carry no official styling. Neither ever imitates the other's typography or icons.
2. **"Always call 911 / 470-578-6666" placed beside the action, in plain words.** LiveSafe puts the disclaimer in store legal text. [A1] KSUX should put the equivalent sentence next to the report button and on any safety surface. This matches the existing [ReportTrigger emergency callout](../../src/components/shared/ReportTrigger.tsx#L216-L239).
3. **Provenance and freshness as visible data.** LiveSafe documents no update/cancel/expiry semantics; CAP models all three. [P1] If KSUX ever links or mirrors KSU advisories, show *source, retrieved-at, and "check the official page"*. Never show an implied all-clear. This repeats [campus-safety.md §2](campus-safety.md).
4. **Check-in style acknowledgement, for low stakes only.** "I'm OK / I need help" is a useful pattern. [V3] KSUX should **not** offer "I need help" (there is no responder). It could reuse the binary-acknowledgement idea for non-safety coordination, such as Study Session or Meetup Spot confirmations. That keeps it clearly separate from safety use.
5. **Inbox history over transient toasts.** LiveSafe keeps prompts in an in-app inbox, so a missed push can still be found. [V3] KSUX's existing notification and messaging surfaces should keep a persistent, readable record rather than toast-only messages. Use `requireInteraction` and `tag` sensibly for personal-message pushes. [P3]
6. **Routine notices build familiarity.** Vector's advice to send non-emergency updates [V5], and AppArmor's game-day notices [M1], map onto KSUX's existing non-safety content: Shuttle, Parking, Dining, and Events updates. This builds a habit without claiming emergency authority.
7. **Offline reference card** (an AppArmor pattern). A versioned, human-reviewed list of *phone numbers and official links* could be cached. It must show its own "verified on" date and must never claim to be current incident status. This needs a separate human decision ([campus-safety.md §7](campus-safety.md) item 5).
8. **Don't copy:** geofenced alerts (needs background location; privacy and battery cost [A1] [V8]), panic alarm, check-in "I need help", and location sent on receipt confirmation [V8]. Each implies a monitored responder and data collection that KSUX does not have.

## 6. Open questions / unverified

1. Does KSU use LiveSafe broadcast at all, or only Rave Alert? Who can send, and does KSU publish an all-clear through LiveSafe?
2. LiveSafe broadcast severity levels, sounds, iOS critical-alert use, and the actual inbox UI and retention. These need a sanctioned demo account or vendor documentation. **Not verified**; no login was attempted.
3. Are read receipts or "success rates" based on delivery, open, or reply? Is the user told that confirming a geofenced broadcast shares location? [V8]
4. Who publishes "published reports" on the Safety Map, and how are they labeled? [V7]
5. KSU LiveSafe tip and chat monitoring hours, and any in-app "not monitored" text. Not found in public first-party sources.
6. Accessibility conformance of alert screens. The developer has made no App Store accessibility declaration. [A1]
7. Search limitations: web search engines served bot challenges during this research, and no CAPTCHA bypass was attempted. Discovery relied on known vendor URL trees, the LiveSafe handout index, and app store listings. Customer/admin documentation behind Vector's support portal was **not** accessed.

## Sources

All retrieved 2026-11-17 unless noted. Vendor pages are marketing material, not KSU deployment evidence.

- **[V1]** Vector Solutions, *Vector LiveSafe* product page. <https://www.vectorsolutions.com/solutions/vector-livesafe/>
- **[V2]** Vector Solutions, *Higher Education Anonymous Tip Reporting & Safety Communications*. <https://www.vectorsolutions.com/solutions/vector-livesafe/higher-education/>
- **[V3]** Vector Solutions, *How to Use: Check-in* handout (2022 PDF). <https://resources.vectorsolutions.com/hubfs/COM/LS/LS%20-%20Content%20Marketing/LS%20-%20Toolkits/Toolkit%20Files/Check-in%20How%20To%202022.pdf?hsLang=en>, linked from the handout index <https://resources.vectorsolutions.com/ls-how-to-handouts>
- **[V4]** Vector Solutions, *Report Incident How To* (2022). <https://resources.vectorsolutions.com/hubfs/LiveSafe%20Report%20Incident%20How%20To%202022.pdf?hsLang=en> (also cited in campus-safety-handoffs.md)
- **[V5]** Vector Solutions blog, *6 Ways to Use Vector LiveSafe on Campus* (Aug 4, 2021). <https://www.vectorsolutions.com/resources/blogs/6-ways-to-use-vector-livesafe-on-campus/>
- **[V6]** Vector Solutions press release, *Vector Solutions Adds Silent Panic Alarm Feature to LiveSafe Platform for Schools* (Sept 23, 2021; K-12 framing). <https://www.vectorsolutions.com/resources/press-releases/vector-solutions-adds-silent-panic-alarm-feature-to-livesafe-platform-for-schools/>
- **[V7]** Vector Solutions, *How to Use: Safety Map* handout (2022). <https://resources.vectorsolutions.com/hubfs/COM/LS/LS%20-%20Content%20Marketing/LS%20-%20Toolkits/Toolkit%20Files/LiveSafe%20Safety%20Map%20How%20To%202022.pdf?hsLang=en>
- **[V8]** Vector Solutions, *Application Privacy Policy* (last updated March 20, 2023), "location information" and "contact information" paragraphs. <https://www.vectorsolutions.com/application-privacy-policy/>. Read via a text relay of that URL, as in the earlier research.
- **[V9]** Vector Solutions, *How to Use: Panic Alarm* handout (2022). <https://resources.vectorsolutions.com/hubfs/COM/LS/LS%20-%20Content%20Marketing/LS%20-%20Toolkits/Toolkit%20Files/LiveSafe%20Panic%20Alarm%20How%20To%202022.pdf?hsLang=en>
- **[A1]** Apple App Store, *LiveSafe* (LiveSafe, Inc., id653666211): description, disclaimer, version history, App Privacy and Accessibility sections. <https://apps.apple.com/us/app/livesafe/id653666211>
- **[A2]** Google Play, *LiveSafe* (`com.livesafe.activities`): description, disclaimer, developer reply on persistent notification. <https://play.google.com/store/apps/details?id=com.livesafe.activities&hl=en_US>
- **[K1]** Kennesaw State University, *LiveSafe*. <https://campus.kennesaw.edu/offices-services/livesafe/>
- **[M1]** Motorola Solutions, *Rave AppArmor* product page. <https://www.motorolasolutions.com/en_us/products/command-center-software/apparmor.html>
- **[M2]** Motorola Solutions, *AppArmor Fact Sheet* (03-2025 PDF). <https://www.motorolasolutions.com/content/dam/msi/docs/products/command-center-software/rave/apparmor/apparmor-fact-sheet.pdf>
- **[M3]** Google Play, *Rave Guardian* (`com.ravemobilesafety.raveguardian`). <https://play.google.com/store/apps/details?id=com.ravemobilesafety.raveguardian&hl=en_US>
- **[P1]** OASIS, *Common Alerting Protocol Version 1.2*, OASIS Standard, 01 July 2010: `status`, `msgType`, `references`, `expires`. <http://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html>
- **[P2]** Apple Developer, *UNNotificationInterruptionLevel*. <https://developer.apple.com/documentation/usernotifications/unnotificationinterruptionlevel>
- **[P3]** WHATWG, *Notifications API* Living Standard (last updated 12 November 2026): tag, renotify, silent, and require-interaction preferences. <https://notifications.spec.whatwg.org/>
- Prior KSUX research (not re-verified here): [campus-safety.md](campus-safety.md), [campus-safety-handoffs.md](campus-safety-handoffs.md), [campus-safety-alert-ingestion.md](campus-safety-alert-ingestion.md), [campus-safety-community-feed.md](campus-safety-community-feed.md).

**Unreachable during this research:** the Motorola Rave Guardian product page and the Apple App Store listings for Rave Guardian/AppArmor at the guessed URLs returned 404. Those URLs were guesses, not documented links, so no claim rests on them.
