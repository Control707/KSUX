# KSUX v2: Implementation Specification

> Addendum to [`SPEC.md`](./SPEC.md), resolved across Wayfinder [Map #35](https://github.com/Control707/KSUX/issues/35) (decision tickets #36–#68), [`GLOSSARY.md`](../GLOSSARY.md), [ADR-0007](./adr/0007-official-alert-source-adapter-and-opt-in-alert-push.md) and ADR-0008…0011 ([PR #63](https://github.com/Control707/KSUX/pull/63)).
>
> **How to read it.** `SPEC.md` still holds for everything this file doesn't change. Where they disagree, this file wins, and every replaced v1 section is listed in [Amendments to SPEC.md](#amendments-to-specmd). Each decision links the ticket that holds its full reasoning. Copy in quotes is the agreed wording; small edits for length are fine if the meaning is kept.

---

## Problem Statement

KSUX v1 works, but much of it can't be used by Students who rely on screen readers, larger text, keyboards or colour-blind-safe status. The baseline audit found:
- text fixed at 9–11 px that doesn't resize;
- most targets under 44 px;
- unnamed buttons and selects;
- dialogs with no Esc key or focus trap;
- maps with no zoom buttons, no attribution and colour-only fullness;
- 46 contrast failures;
- no live regions and no reduced-motion handling.

A single global Campus switcher also silently hides Posts, Listings and Clubs from the other Campus, even though Students study and trade across both.

Students also have nowhere in KSUX to see what's happening on campus that affects getting around safely, or to see official KSU safety notices next to their daily logistics. Every existing tool that does this either acts like 911 or dispatch (which KSUX can't be), monetises fear, or names and hunts people.

Finally, parking fullness depends entirely on Students choosing to report, because KSU publishes no live occupancy. There is little reason to report, and nothing stops spam.

## Solution

v2 adds four things while staying $0, PWA-only and free of KSU IT approvals:

1. **An accessible overhaul of every screen** in the Direction C ("Campus Brief") visual language, built to WCAG 2.2 AA. A CI accessibility job and a scripted manual assistive-technology pass gate releases. Campus becomes a location setting: it applies only on screens about a physical place.
2. **Incidents**: Students can post an unverified, building-level community account of something they saw, behind a full-screen Emergency Panel that comes first every time. Volunteer Moderators review Incidents through a dedicated console with an action log and one Appeal per decision. Incidents never appear in the Feed, never become Alerts and never earn Clout.
3. **Official Alerts**: at P0, links to KSU's own safety resources. At P1, a bounded, attributed copy of two public KSU Police pages, with honest stale and quiet states and opt-in, source-named push. KSUX never claims to be 911, dispatch, official or monitored around the clock.
4. **Clout**: small, capped points for *corroborated* logistics (Parking Reports, Line Checks, Study Room vibes, confirmed Spot Openings, completed handoffs), shown privately on Profile and on a weekly per-Campus Leaderboard. Clout is purely cosmetic and is never earned from or shown on safety content.

---

## User Stories

### Shell, Campus and accessibility

1. As a Student, I want every screen to use one consistent visual language with readable type, so that KSUX feels like one app instead of fifteen.
2. As a low-vision Student, I want all text to grow with my browser text size up to 200% without clipping or sideways scrolling, so that I can read every screen.
3. As a Student using a screen reader, I want every button, select and icon to have a name, so that I know what each control does.
4. As a Student using a screen reader, I want each screen to have one heading that receives focus when I navigate, so that I know where I am.
5. As a keyboard-only Student, I want a skip link and a visible focus ring on every control, so that I can move through KSUX without a mouse.
6. As a Student with a motor impairment, I want every control to be at least 44 px, so that I can hit it reliably.
7. As a Student who gets motion sick, I want reduced motion respected everywhere, including maps that jump instead of flying, so that the app doesn't make me ill.
8. As a colour-blind Student, I want every status shown by shape, word, pattern and colour, so that I never have to tell colours apart.
9. As a Student, I want dialogs and sheets that close with Esc, trap focus while open and return focus to what opened them, so that I never get lost behind an overlay.
10. As a Student, I want announcements for toasts, submitted reports and new messages, so that I know something happened without watching the screen.
11. As a Student who lives on one Campus and studies on the other, I want the Feed, Marketplace, Clubs, Chats and Course Hubs to show all of KSU, with a campus badge on each item, so that I don't miss content from the other Campus.
12. As a Student, I want the Campus switcher only on Now, Parking, Transit, Study, Dining, Events and Safety, so that changing where I am never changes what I can read or buy.
13. As a Student, I want my new Posts to default to my home Campus, so that they don't take a Campus from wherever I last checked parking.
14. As a Student, I want Marketplace and Clubs to keep their own optional Campus filter, so that I can narrow results when I choose to.
15. As a Student, I want the Feed stream formerly called "Campus" to be named "All KSU", so that its name matches what it shows.
16. As a Student in a chat thread or Ask Scrappy, I want the bottom bar hidden and the message box pinned at the bottom, so that typing is comfortable.
17. As a Student on desktop, I want a left rail grouping every destination and a right Campus Pulse rail, so that I can move around quickly.
18. As a Student, I want the centre "Ask Scrappy" pill to open a Quick Sheet with an Ask field, four create tiles and chips for every destination, so that everything is one tap away.
19. As a Student selling something, I want photo-first Listings with up to 4 photos, a cover and a gallery, so that buyers can see what they're getting.
20. As a Student, I want the About page to say when KSUX was last tested for accessibility and list its known issues, so that I can trust the claim.

### Maps, Parking and Transit

21. As a Student, I want every map paired with an always-on list that holds the same items in the same order, so that I can do every map task without the map.
22. As a screen-reader Student, I want a "Skip map" link and announcements when I select a lot, stop or Incident, so that the map canvas doesn't trap me.
23. As a Student, I want 44 px zoom and recenter buttons and no rotation or tilt, so that the map is easy to control.
24. As a Student, I want OpenStreetMap attribution always visible, so that KSUX respects the map data licence.
25. As a Student, I want a full-bleed parking map with a bottom sheet holding a one-tap "Just parked at <lot>?" strip, so that I can report fullness the moment I park.
26. As a Student leaving a lot, I want "I'm leaving" to also ask how full it is, so that my exit helps the next driver.
27. As a Student, I want a lot with no recent report to say "No recent reports" with a dashed edge and no made-up percentage, so that I'm not misled by an estimate.
28. As a Student, I want one campus-wide "Usually busy/quieter now · per KSU class-enrollment chart" line on weekdays, so that I get honest context when no report exists.
29. As a Student, I want a single report shown as "unconfirmed" until another Student agrees, so that I can weigh it.
30. As a Student on Transit, I want routes identified by code text, line pattern and colour, so that I can tell them apart without colour.
31. As a Student, I want buses to show as stale with "~N min · schedule" when GPS stops updating, so that I don't trust an old position.
32. As a screen-reader Student, I want to hear only when my stop's next bus is 2 minutes away (at most once a minute), and not every bus movement, so that announcements stay useful.
33. As a Student, I want one stop card from map or list with arrivals, Shuttle Notices, a 3-tap stop report and "Make this your stop", so that I have everything about a stop in one place.
34. As a Student, I want Shuttle Notices styled as neutral operator notices that say "not a KSU safety Alert", so that I don't confuse a detour with an emergency.
35. As a commuter offline, I want the static campus map with routes, stops and hours but no live times, so that I can still find my way.

### Safety page and Emergency Panel

36. As a Student in danger, I want a full-screen choice of Call 911, Call KSU Police or Text KSU Police before any reporting form, so that I contact real help first.
37. As a deaf or hard-of-hearing Student, I want the text line shown with KSU's own qualifier and no gatekeeping, so that I can use it when a voice call isn't possible.
38. As a Student, I want the Emergency Panel to work without sign-in, GPS or network, and never auto-dial, so that it's there when everything else fails.
39. As a Student, I want `/safety` to show Official Alerts at the top, then community Incidents, each clearly labelled by source, so that I can tell official notices from community reports.
40. As a Student opening Safety for the first time, I want a short card explaining what KSUX is and isn't (not 911, not 24/7, not official, community reports unverified), so that I understand its limits.
41. As a Student, I want an About KSUX Safety page with the full list of what KSUX never claims and its independence statement, so that I can check exactly what it does.
42. As a Student offline, I want Safety to say "Offline: can't load community Incidents" and "Offline: can't check official sources" while still showing the Emergency Panel and contacts, so that silence is never mistaken for safety.

### Reporting an Incident

43. As a Student, I want to report what I saw in 7 short steps (category, where, when, what, photo, name, preview), so that it's quick on a phone.
44. As a Student, I want medical, sexual-misconduct and "suspicious person" choices to divert me to the right official help and never post publicly, so that sensitive cases go to people who can act.
45. As a Student, I want to pick a building or area by hand, with an optional one-time "near me" sort that is never saved, so that my location stays private.
46. As a Student, I want to give when I saw it separately from when I post, so that the timeline is honest.
47. As a Student, I want KSUX to block names, handles, room numbers, phone numbers, plates and claims like "all clear" or "verified" before I post, so that I don't accidentally harm someone or overstate what I know.
48. As a Student, I want to choose whether my handle shows or reads "Student · name hidden", knowing Moderators can still see it, so that I decide how visible I am.
49. As a Student wanting full anonymity, I want to be pointed to LiveSafe, so that I use a channel built for it.
50. As a Student, I want the confirmation to say plainly that posting did not contact police or KSU, so that I don't assume help is coming.
51. As a Student, I want to fix a typo within 5 minutes of posting, and after that add dated Author Updates, so that corrections are visible and honest.
52. As a Student, I want to delete my own Incident and leave a "Deleted by author" tombstone, so that links don't break.
53. As a Student offline, I want the report flow to refuse to start, save or queue, saying "Nothing has been sent or saved", so that sensitive text never sits on a shared device.

### Reading Incidents

54. As a Student, I want a Campus-scoped map and list of Incidents from the last 24 hours sorted by latest update, so that I see what's current near me.
55. As a Student, I want every card to read "Community report · not verified" with posted and updated times, so that I never mistake it for verified news.
56. As a Student, I want older Incidents (24 h–7 d) behind a disclosure labelled by age, not resolution, so that age is never presented as "resolved".
57. As a Student, I want no likes, reposts, replies or Clout on Incidents, so that nothing rewards sensational reports.
58. As a Student, I want "Report to KSUX moderators" and "This post identifies me" on every Incident, so that I can flag harm quickly.
59. As a Student who is identified in an Incident, I want one "identifies me" claim to hide it until a Moderator reviews it, so that harm stops at once.
60. As a Student, I want a removed, redacted or deleted Incident to update in place when I reconnect, never flashing the old text, so that removed content stays removed.

### Moderators

61. As a Moderator, I want one queue ordered "identifies me" claims → held photos → other Incident reports → Posts and Listings, oldest first, with ages shown, so that the most urgent harm comes first.
62. As a Moderator on a phone, I want tapping an item to open a full review page with the actions pinned at the bottom, so that I can review comfortably.
63. As a Moderator on desktop, I want the queue on the left and the review on the right, so that I can work through items quickly.
64. As a Moderator, I want to see the original text, its updates, the claimed time, the building, the author's handle and the report counts, so that I can decide fairly.
65. As a Moderator, I want held photos hidden until I choose "Show photo", with the time left before automatic discard, so that I'm not ambushed by images.
66. As a Moderator, I want every action to show exactly what will happen, who is told and the log line it writes before I confirm, so that I never act by accident.
67. As a Moderator, I want Remove to require a reason the author will see, so that removals are explained.
68. As a Moderator, I want Redaction to require the exact words from the original and preview the result, so that I remove only what's needed.
69. As a Moderator, I want notes only from fixed templates, including one that links an Official Alert, so that KSUX never authors free-text claims.
70. As a Moderator restoring an Incident that had "false or misleading" reports, I want to choose whether to add "Several Students reported this as inaccurate", so that the note fits the case.
71. As a Moderator, I want to approve, approve with blur, or reject a held photo, so that only safe images are shown.
72. As a Moderator, I want items involving me (my own Incident, report or claim) left out of my queue with a note, so that I never judge my own case.
73. As a Moderator who is a campus security authority, I want no access to Incident items, so that KSUX doesn't create Clery reporting duties.
74. As a Moderator, I want to review Appeals on decisions I didn't make, so that every author gets a second opinion.
75. As a Moderator, I want an action log of who did what to which item, with content snapshots kept 30 days and entries kept 1 year, so that decisions are auditable without hoarding content.
76. As a maintainer, I want to be the only one who can suspend accounts and appoint or revoke Moderators, so that heavy powers stay with the project owners.
77. As an author whose Incident was removed, I want an in-app notice with the reason and one Appeal, so that I can contest the decision.

### Official Alerts and notifications

78. As a Student, I want Official Alerts to show their exact source, category and issued/updated/retrieved times, so that I know where each came from.
79. As a Student, I want a quiet source shown in the source's own words with its check time, never as "safe", so that silence isn't presented as an all-clear.
80. As a Student, I want an Alert copy older than 20 minutes shown as stale and never presented as current, so that I don't rely on old information.
81. As a Student, I want a thin, dismissible banner only for a fresh issued or updated Alert, so that real notices reach me without constant noise.
82. As a Student, I want to opt in to source-named Alert push ("KSU Police posted a new Timely Warning") with honest limits stated, so that I choose an extra, unreliable channel knowingly.
83. As a Student, I want one Notifications page in Profile showing whether push works on this phone, each message type, the Official Alerts switch and my devices, so that push settings are in one place.
84. As an iPhone Student in a Safari tab, I want clear Home Screen steps when push isn't available, so that I know how to enable it.

### Scrappy

85. As a Student asking Scrappy "is campus safe?", I want a fixed Safety Card pointing to Safety, the Emergency Panel, KSU Police and LiveSafe, so that an AI never guesses about safety.
86. As a Student, I want safety questions to never use up my Scrappy quota, so that I'm never blocked from the Safety Card.
87. As a Student, I want Scrappy to refuse to help identify people, so that it can't be used to hunt someone.
88. As a Student, I want Scrappy's Now brief to cover logistics only, so that it never comments on safety or Clout.

### Clout and Leaderboard

89. As a Student who parks, I want 5 Clout when another Student's report on the same lot agrees with mine within 20 minutes, so that accurate reporting is rewarded.
90. As a Student leaving a spot, I want 5 Clout when someone confirms "I took this spot", so that sharing spots pays off.
91. As a Student, I want Line Checks and Study Room vibes to earn the same way when corroborated, so that every logistics report counts.
92. As a buyer and seller, I want 10 Clout each for a completed handoff at a confirmed Meetup Spot, so that safe in-person trades are rewarded.
93. As a Student, I want my pending Clout shown until corroboration, with Undo, so that I understand why it hasn't arrived.
94. As a Student, I want a payout toast ("+5 Clout · your Lot P40 report was confirmed") and never a push, so that Clout stays low-key.
95. As a Student, I want a private "Your Clout" card on Profile with this week per Campus, my lifetime total, a 30-day payout log and a hide-me toggle, so that I can track my own points.
96. As a Student, I want a weekly per-Campus Leaderboard showing the Top 25 and my exact rank, so that I can see how I compare.
97. As a Student, I want to hide myself from leaderboards, so that I can earn without being ranked publicly.
98. As a Student, I want no Clout, rank or badge on anyone's cards or profile, so that points never look like trustworthiness.
99. As a maintainer, I want a daily cap, per-target and per-pair limits and reversal on removal, so that farming doesn't pay.

### Judge Demo Mode

100. As a judge, I want every v2 feature (Incidents, Moderation, Appeals, Alerts in every state, Clout and Leaderboard) to work in Demo Mode with "Demo · not real" labels, so that I can evaluate everything without real side effects.
101. As a judge, I want a demo persona to corroborate my Parking Report a few seconds after I file it, so that I see a real payout happen.
102. As a judge acting as a Moderator, I want to switch personas to reach the conflict rule, a different-reviewer Appeal and maintainer-only suspend, so that I can exercise every moderation path.
103. As a judge, I want Demo Mode to never dial, text, push or fetch real KSU pages, so that nothing reaches real people.

---

## Implementation Decisions

### 1. Scope, constraints and claims

- **Audience**: real KSU Students. Judge Demo Mode still exercises every feature with no real-world side effects ([#36](https://github.com/Control707/KSUX/issues/36)).
- **Constraints that stand**: $0 total cost with no card on file; PWA only (no native or Capacitor build); zero KSU IT approvals. The Alert source sits behind a swappable adapter for a future approved feed. Moderation is a $0 volunteer operation with no 24/7 claim. The 5-day target is replaced by phases ([§13](#13-build-phases-cut-lines-and-launch-switches)).
- **Never claimed** ([#49](https://github.com/Control707/KSUX/issues/49)). KSUX never says or implies any of these:
  1. that it is 911, police or dispatch;
  2. that it is monitored 24/7;
  3. that it is official KSU (nothing KSUX authors carries "KSU" or "Official"; official content shows only under its exact source name);
  4. that community content is verified;
  5. an all-clear inferred from silence, age or expiry;
  6. that something was received or acknowledged when it was only sent ("Sent to police", "Help is on the way" and "We're monitoring" are banned);
  7. that a moderation report is police contact;
  8. that Clout means trust;
  9. legal confidentiality.
- **Banned on community content**: "Resolved", "All clear", "Safe", "Verified", "Confirmed", "Police on scene". An all-clear appears only when an official source says it, quoted and attributed.
- **Copy placements**: contextual, with no consent checkbox. All placements are real static text, reachable by screen reader, resizable, and never carried only by colour, an icon or a disappearing toast.

| Placement | Copy |
|---|---|
| First-run Safety intro (first open of `/safety`) | One dismissible card: not 911, not 24/7, not official, community reports unverified, Clout isn't trust |
| Emergency Panel | [§5](#5-safety-page-and-emergency-panel) |
| Incident form, fixed fine print | "Posting does not contact police. KSUX moderators are volunteers and may not see this for hours." |
| Every Incident card | "Community report · not verified · Posted [t] · Updated [t] · by @handle \| Student · name hidden" |
| Every Alert card | "Source: [exact source] · issued [t] · updated [t] · retrieved [t]" |
| Moderation Report menu | Renamed **"Report to KSUX moderators"**. Confirmation: "Sent to KSUX moderators" |
| Police handoffs | Honest states only: "Opening your phone app… KSUX can't confirm the call or a police response." |
| About KSUX Safety (linked from Profile and the panel) | The full never-claim list, plus "KSUX is an independent student project, not operated or endorsed by Kennesaw State University." The independence line appears **only** here (user's choice); KSU marks are never used in a way that implies endorsement |
| Judge Demo Mode | Every Incident and Alert is a fixture labelled "Demo · not real". Handoffs never dial, text or open real numbers ("Demo Mode: nothing dialled") |

### 2. Design system (Direction C)

From [#46](https://github.com/Control707/KSUX/issues/46) ([verdict](https://github.com/Control707/KSUX/blob/prototype/v2-shell/prototype/VERDICT-v2-shell.md)):

| Group | Values |
|---|---|
| Type (rem) | xs .8125 · sm .875 · body 1.0625 · lg 1.125 · xl 1.375 · 2xl 1.75 · 3xl 2.25. Serif display for headings and big numbers, system UI for body. **No px text and nothing under 13 px** |
| Space (rem) | .25 · .5 · .75 · 1 · 1.5 · 2 |
| Radius (px) | sm 12 · md 18 · lg 24 · card 28 · pill |
| Target | 2.75rem (44 px) minimum on every control (map pins excepted; the paired list carries full-size targets) |
| Motion | 120 ms, sheet 320 ms, fade 150 ms. Reduced motion means fades only, no movement |
| Colour | Light (warm paper) and dark sets. Every text pair ≥4.5:1; every UI mark and focus pair ≥3:1 |
| Status | Okabe–Ito-derived Open / Filling / Nearly Full / Full, each shown by glyph (○ ◐ ◕ ●), word, fill pattern and colour |

**Shared components** (built once in Phase 0, then frozen):
- dialog/sheet primitive (`role=dialog` or `alertdialog`, `aria-modal`, Esc, `inert` background, focus moved in and restored on close);
- toast host (`role=status`; errors use `role=alert`);
- photo picker and gallery;
- status chip and fill bar;
- text campus badge;
- map frame ([§4](#4-maps-campusgeomap-parking-and-transit));
- segmented control (`aria-pressed`), arrow-key tabs, labelled selects;
- skip link, one `h1` per screen with focus moved to it on route change;
- large-text mode: at ≥150% text on a phone, bar labels become accessible names only, the Demo pill collapses and grids drop to one column.

### 3. Shell, navigation, URL contract and Campus

- **Five-slot bar**: Now · Feed · centre **"Ask Scrappy"** pill · Marketplace · Chats. Profile is in the header.
  - The pill opens the **Quick Sheet**: an Ask field, four create tiles (Post, Parking Report, Listing, Study Session) and chips for every destination, including **Safety**, **Report an incident** and **Leaderboard**.
  - Desktop (≥1024 px) has a left rail grouping destinations under Everyday / Campus life / You (Safety in Campus life, Leaderboard under Profile in You), plus the right Campus Pulse rail.
  - Chat threads and Ask Scrappy hide the bar and show a Back header.
- **URL contract** (the v1 15 routes plus):
  - `/safety`, `/safety/<incidentId>` (a details sheet over the list) and `/safety/alerts/<alertId>`;
  - `/leaderboard` (`?campus=kennesaw|marietta`);
  - `/profile/notifications` (deep links `#messages`, `#alerts`, `#agenda`);
  - `/agenda` (private, KSU-wide classes, deadlines, RSVPed Events and joined Study Sessions; #76), plus `/study/<sessionId>` for a joined Study Session's details.
  - `/search` (`?q=`; KSU-wide Buildings, Events, Clubs, Course Hubs and Listings with an optional visible Campus filter; never Incidents or Alerts) and `/saved` (the private saved Posts and Listings view);
  - `/feed?post=<postId>` opens that Post's thread and `/marketplace?q=` pre-fills the Listing search.

  The Incident report flow is a dialog with no route.
- **Campus is a location setting** (ADR-0008):
  - **Location screens** show the switcher (Kennesaw | Marietta): Now, Parking, Transit, Study, Dining, Events and `/safety` (Incidents only; Official Alerts stay KSU-wide).
  - **KSU-wide screens** show a text campus badge on each item and no global switcher: Feed, Marketplace, Chats, Scrappy, Course Hubs, Clubs, Profile, private agenda, Search, Saved and Moderation. Joined Study Session detail is also KSU-wide; `/study` keeps its location switcher.
  - Marketplace and Clubs keep a **local, visible** campus filter; Marketplace sorts the home Campus first.
  - `/leaderboard` has its own Kennesaw | Marietta control.
  - Stored records remain strictly `Kennesaw` or `Marietta`.
  - The Feed stream "Campus" is renamed **"All KSU"**.
- **Server-side Campus boundary** (resolved during spec review; folded into ADR-0008):
  - KSU-wide reads (Feed pages, Feed trends, Marketplace browse, Clubs browse) **ignore** the Student's persisted location setting. A Campus narrows them only when the caller passes an explicit local filter.
  - A **new Post defaults to the Student's home Campus**, never to the last location-screen choice.
  - The persisted setting is read only by location screens.
- **Now** stays logistics-only: no Incident cards, Alerts, safety badges or Clout. Its Scrappy brief never mentions Incidents, Alerts or Clout.

### 4. Maps, CampusGeoMap, Parking and Transit

**Patterns for every map** ([#47](https://github.com/Control707/KSUX/issues/47), [#54](https://github.com/Control707/KSUX/issues/54)):
- **Base map:** MapLibre with OpenFreeMap positron or dark, following the theme.
- **Attribution:** always on, adding "Routes & stops: Passio GO / Big Owl Bus" where routes are shown.
- **Status:** shown by fill pattern + glyph + label + colour (pattern matching the list's fill bar).
- **Confidence:** a solid edge means live crowd data; a dashed edge means estimate, stale or none.
- **Selection:** a focus-blue outline, never a status colour.
- **List parity:** an always-on synced HTML list with every map feature in the same order and no item cap. A map tap opens and announces the matching row; "Show on map" goes the other way.
- **Controls:** 44 px zoom in/out and Recenter. Rotation and pitch are off. A "Key" legend. A "Skip map" link comes first. The canvas has a specific accessible title. Popups are Esc-dismissible. No mobile `cooperativeGestures`.
- **Camera:** fit to the visible features, padded for the sheet. Under reduced motion it jumps, never flies.
- **Labels:** scale with the text setting. At ≥150% text the list is the equivalent.
- **Failure:** if the map fails, it says so and points to the list.
- **2.5.7 dragging:** no pan buttons. List selection centres the map, plus Recenter and zoom. This is recorded as an accessibility risk: if the AT pass shows exploratory panning is needed, pan buttons are added.

**`CampusGeoMap`** is one shared component with layers `lots | routes | stops | buses | incidents` and modes `live | static`. Static mode (offline commuter view) shows routes, stops and hours only: no buses, times or live tiers.

**Parking** ([#47](https://github.com/Control707/KSUX/issues/47), [#64](https://github.com/Control707/KSUX/issues/64)):
- Layout A: a full-bleed map with a bottom sheet that snaps to peek, half and full. Desktop: the map plus a 26rem side list.
- The peek holds the slim arrival strip "Just parked at `<lot code>`? ○ ◐ ◕ ●" (one tap publishes; the lot defaults to the pinned or nearest lot; tapping the code changes it; after reporting it collapses to one line with Undo), the "Best bet for your permit" card, **Parking Report** and **I'm leaving ~5 min**, and the Student's pending/earned Clout.
- "I'm leaving" asks for an optional fullness rating, which is a normal Parking Report. Other Students see **I took this spot** and **Gone** (2 Gone votes remove it).
- **Fullness comes only from Student Parking Reports. There is no per-lot estimate.**

| Reports in the 45-min window | Display |
|---|---|
| 0 | Neutral dashed state with its own pattern and the words "No recent reports". No tier, no % |
| 1 | The reported tier, solid edge, "Live · 1 Student report (N min ago) · unconfirmed". No blend |
| ≥2 | Existing multi-report logic and outlier trim ("Live · Student-verified") |

- **Campus line:** one campus-wide line in the sheet from a hand-typed, dated table in the seed (Mon/Wed 10 AM–1 PM, Tue/Thu 11 AM–3 PM): "Usually busy now" or "Usually quieter now · per KSU class-enrollment chart, <date checked>" with a link. No line on Fridays, weekends or evenings. It is re-checked by hand once per term.
- **Best bet and overflow reroute** need live tiers on both sides. With no live data, best bet shows a static fallback ("No recent reports. Lots with shuttle service: …") plus the Report button; it never ranks by an estimate.
- Scrappy's parking tool returns `noRecentReports` plus the campus line, and Now's pinned-lot card shows the same neutral state.
- The per-lot hourly prior and its generator are deleted.

**Transit** ([#67](https://github.com/Control707/KSUX/issues/67), [verdict](https://github.com/Control707/KSUX/blob/prototype/v2-transit/prototype/VERDICT-v2-transit.md)):
- Layout A (map + bottom sheet). Peek: a "Your stop" card with its next 3 arrivals and a link to the "N Shuttle Notices on <Campus> routes". Half/full: the route list, each route expanding to an ordered stop line with buses placed between stops. Desktop: the map plus a 27rem panel. "Your stop" also feeds Now.
- **Route identity:** route code text first (badges, line labels at zoom ≥13.6, a label under every bus), then line pattern (solid/dashed/dotted), then Okabe–Ito colour. No two routes on one Campus share both colour and pattern. KM stays KSU gold at 1.35× width. Badge text switches between ink and white to reach ≥4.5:1. Every line has a surface casing.
- **Buses:** a ringed glyph, a heading wedge and a code label. A bus is **stale** after 36 s with no update (3 missed 12 s polls) or while the feed is down: a dashed, faded ring with no wedge, and every ETA becomes "~N min · schedule". The feed pill reads "Bus GPS not updating · last N min ago". A route not running today shows "Not today · runs <days>".
- **Announcements:** bus movement is never announced. Only your stop's next bus reaching ≤2 min (at most once a minute), feed state changes, and map selections are. Markers glide about 0.9 s; under reduced motion they jump. There is no pause toggle (live motion is essential real-time information).
- **Stop card** (the same from map or list): arrivals per route (live or scheduled), the Shuttle Notices for those routes, a 3-tap **stop report** (No line / Long line / Passed full; 15 min; Undo; anonymous to Students; "not sent to Big Owl Bus or KSU"), the last 15 min of reports, "Make this your stop" and "Show on map". **Stop reports earn no Clout.**
- **Shuttle Notice** (renamed from `serviceAlerts` in UI and data): a neutral surface card with a grey double rule and the source line "Shuttle Notice · from Big Owl Bus via Passio GO · posted <t> · not a KSU safety Alert". It is never red, never a banner, never on `/safety`, never pushed, and appears only with the routes it affects.

### 5. Safety page and Emergency Panel

- **`/safety` layout:**
  - **Official Alerts** at the top, KSU-wide ([§9](#9-official-alerts));
  - then the first-run intro card (until dismissed);
  - then **Report something you saw**;
  - then the Campus-scoped **Incidents** map and list ([§7](#7-incidents-reading-lifecycle-and-offline)).

  No badges, unread counts or push for Incidents. Entry points: Quick Sheet chips, the desktop rail, and Profile → About KSUX Safety.
- **Emergency Panel** is shown before **every** Incident report and **every** Campus Safety Moderation Report, not just the first time:
  - heading "Is anyone in danger right now?" with "KSUX can't send help and doesn't contact police";
  - **Call 911** (fire, medical, crime in progress);
  - **Call KSU Police** (470-578-6666 · answered 24/7);
  - **Text KSU Police** (770-356-3866) with KSU's qualifier (deaf, hard of hearing, speech disability, or when a voice call is dangerous or impossible), and no gatekeeping;
  - a small LiveSafe pointer marked "outside KSUX";
  - last, **"Not an emergency · post to the community"**.

  It needs no sign-in, GPS or network; it never auto-dials or plays audio; and it is precached for offline use. Calls use `tel:`/`sms:` with honest-state copy; Demo Mode intercepts them.
- **P0 Alerts surface** = official resources and links: KSU Police contacts, KSU Alert (Rave) sign-up guidance, LiveSafe, and links to the KSU Police Timely Warnings and Emergency Advisory pages.

### 6. Incident report flow

From [#48](https://github.com/Control707/KSUX/issues/48) ([verdict](https://github.com/Control707/KSUX/blob/prototype/v2-incident-flow/prototype/VERDICT-v2-incident-flow.md)) and [#51](https://github.com/Control707/KSUX/issues/51).

- **Flow shape:** a full-screen dialog, one question per screen, with "Step n of 7", a progress bar, Back (header) and Next (sticky footer). Focus moves to each step's `h1`, and a polite announcement reads "Step n of 7. <question>". Validation runs on Next: the error appears under the field, focus moves to it and it is announced. Esc or ✕ discards with "Report discarded. Nothing was posted."

| # | Step | Rules |
|---|---|---|
| 0 | Emergency Panel | §5 |
| 1 | What happened? | 8 categories with shape + word + hint + colour: Fire, smoke or alarm ▲ · Hazard ◆ · Crash or road blocked ■ · Theft or break-in ● · Vandalism or damage ✚ · Power, water or building outage ⬢ · Area closed ▬ · Something else ○. **Diverts, never posted:** medical → Call 911 / KSU Police; sexual misconduct, dating violence or stalking → "KSUX doesn't post these publicly" + Title IX office, KSU CPS, LiveSafe, KSU Police; "a person seems suspicious" → why KSUX doesn't post about people + Call KSU Police. Each divert has "Choose something else" |
| 2 | Where? | Campus control, then a searchable building/area list (from campus buildings) or a map picker that snaps to a building/area. Optional "Suggest places near me" uses location once to sort, then "It wasn't saved or posted." Optional "Where exactly?" ≤60 chars, rejecting room/unit numbers. Housing only at complex level. Nothing inferred from Campus setting, home Campus or GPS |
| 3 | When did you see it? | Just now / ~15 min / ~1 hour / Earlier today (+ "About what time?"). Stored as the claimed observed time, separate from the posted time |
| 4 | What did you see? | ≤280 chars with a counter. Hard blocks on identifying details (@handles, names, room numbers, phone numbers, plates) and on banned claims ("all clear", "resolved", "verified", "confirmed", "police on scene", "it's safe now") |
| 5 | Photo? (**P1**) | Optional; held for review; location data stripped; "Blur the whole photo". At P0 the step is omitted and the flow has 6 steps ("Step n of 6") |
| 6 | Your name | **Show my handle** or **Student · name hidden**. Fixed note: Moderators can see who posted; KSUX may have to share account details if the law requires; not anonymous to police; LiveSafe for anonymous tips |
| 7 | Preview | The exact card + the fixed fine print. Primary: **Post to the community** |
| ✓ | Posted | "Posted to the KSUX community … This did not contact police or KSU". Actions: See it on Incidents · Still need help? Call or text · Delete this post |

- **Posting limits:** any verified Student, 3 Incidents/hour, 6/day, 5 Author Updates per Incident. Text publishes **immediately** once write-time checks pass.
- **Author edits:** the author may edit the original for **5 minutes** after posting. After that the original is locked, and **Redaction is the only change ever made to it** (resolved during spec review; folded into ADR-0009 and the glossary). Corrections after lock are dated Author Updates.
- **Offline:** the flow never starts, saves, queues or auto-submits ([§7](#7-incidents-reading-lifecycle-and-offline)).

### 7. Incidents: reading, lifecycle and offline

- **Entity** (ADR-0009): an Incident is its own entity, **not a Post, never in the Feed**, with no likes, reposts, replies, ranking score or Clout. It is never promoted to or triggered into an Alert. The only Incident→Alert edge is a moderator note that links an Alert.
- **Lifecycle words:** **Active** (≤24 h, map + list) → **Older** (24 h–7 d, behind a disclosure: "Removed from the map after 24 h. That is its age, not a resolution.") → hidden from Students after 7 d. Moderator states: **Under review**, **Removed**. Author: **Deleted**. Never "resolved", "closed" or "cleared". Age is computed at read time from the posted time, never from the observed time and never by a cron.
- **List and map:** Campus-scoped; latest **updated** first, never by engagement or Clout. Pins show the category shape + building label; a solid edge means updated in the last 2 h, dashed means older. Tapping a pin selects it, moves its card to the top and announces it.
- **Card** contents:
  - category chip and campus badge;
  - building as the heading, with the detail;
  - "Seen <n> ago" and the text;
  - the approved photo (P1);
  - Author Updates and Moderator notes, in order;
  - the provenance line;
  - "Demo · not real" in Demo.

  Actions: **Details**, **Report to KSUX moderators**. The details sheet adds **This post identifies me** for everyone, and **Add an update** (same checks) and **Delete my post** for the author.
- **Block:** a Student who blocked the author sees "Student · name hidden", but the Incident still shows; safety information never disappears on Block.
- **Retention:**

| State | Rule |
|---|---|
| Active / Older | as above; text, location, media and Updates purged 30 d after posting |
| Removed | hidden at once; purged 30 d after removal (kept for Appeals and audit) |
| Deleted by author | text and media purged at once; a "Deleted by author" tombstone keeps links working |
| Direct link past 7 d | a neutral "no longer available" tombstone until purge |

- **Offline** ([#60](https://github.com/Control707/KSUX/issues/60)):
  - Incident data is network-only. `/safety` and every descendant bypass service-worker HTML caching and are never stored; the cached root shell renders the offline Safety state without old data.
  - Offline Safety shows the precached Emergency Panel, contacts and official links, plus "Offline: can't load community Incidents. Reconnect to see current reports. Saved schedules and campus maps may still be available elsewhere in KSUX." and, separately, "Offline: can't check official sources."
  - **Report an Incident** offline opens the panel, then "You're offline. Posting to the KSUX community needs a connection. Nothing has been sent or saved." with Retry connection / Close.
  - If connectivity drops mid-flow, the in-memory step stays only in that tab. Submit is disabled with "Not posted — reconnect to submit". Closing discards after a confirm. Reconnect never auto-submits.
  - On reconnect, both Alerts and Incidents are re-queried: "Back online · checking for updates…" then "Updated just now" (polite, no focus steal). A failed refresh keeps the offline state with Retry and never reuses the old result.
  - Server truth replaces the screen without flashing old content: Removed → "Removed by KSUX moderators" + reason; Redacted → spans become "[removed by moderators]" + note; Deleted → tombstone; Under review → hidden; aged out → moved to Older or the tombstone.
  - The commuter cache never holds Incident ids, text, locations, photos, Updates, states or drafts.

### 8. Moderation: policy and the Moderator console

**Policy** ([#51](https://github.com/Control707/KSUX/issues/51)):
- **Quarantine thresholds** (each counts distinct verified reporters; any of them puts the item **Under review** at once):

| Reason | Reporters needed |
|---|---|
| "This post identifies me" | 1 |
| "Identifies a person" / "False or misleading" | 2 |
| Anything else, including Campus Safety | 3 |

  - "Identifies me" claims: max 3 per account per day. After 3 rejected claims in 30 days the account loses the one-tap hide, and its later claims count toward the 2-reporter threshold.
  - Campus Safety also opens the Emergency Panel ("This reports the post to KSUX volunteer moderators. It does not contact police.").
  - Moderation Report reasons on an Incident: It identifies a person · It's false or misleading · Harassment or hate · Campus Safety: someone is in danger · Something else.
- **Disputes:** restoring after "false or misleading" reports lets the **Moderator choose** whether to add the "Several Students reported this as inaccurate" note ([#68](https://github.com/Control707/KSUX/issues/68), amending #51). There is no "Disputed" badge, ranking penalty or verdict word.
- **Moderator notes** come only from fixed templates (code constants, no free text): Identifying details removed · Several Students reported this as inaccurate · An official notice exists [link to a listed Official Alert] · Possible duplicate [link to another visible Incident] · Photo not approved. Notes are dated and carry no Moderator handle; maintainers may remove one on a takedown notice.
- **Redaction:** chosen spans become "[removed by moderators]" plus the "Identifying details removed" note. The pre-redaction text exists only in the 30-day action snapshot.
- **Moderator role:**
  - appointed and revoked by maintainers by handle; `@students.kennesaw.edu` only; maintainers are always Moderators; Faculty · Staff never moderate;
  - **CSA guard**: on appointment a Moderator states in plain text (no checkbox) that they are not a Clery campus security authority; anyone who is (maintainers included) gets **no access to Incident items or Incident Appeals**;
  - no Moderator acts on their own Incidents, reports or claims;
  - **no review time is promised** anywhere.
- **Maintainer-only:** suspending accounts, appointing and revoking Moderators, takedowns of notes, and the Alert kill switch.
- **Author notice:** in-app only (never push), with the template reason. **One Appeal per decision** until the 30-day purge, reviewed by a different Moderator, or a maintainer if none exists.

**Console** (`/moderation`, KSU-wide, [#68](https://github.com/Control707/KSUX/issues/68), [verdict](https://github.com/Control707/KSUX/blob/prototype/v2-moderation/prototype/VERDICT-v2-moderation.md)):
- **Sections:** Queue · Appeals · Action log. Phones show them as a segmented control under a Back header with the bar hidden. Desktop shows them as a rail group with counts for Queue and open Appeals.
- **Queue order:** "identifies me" claims → held photos (P1) → other Incident reports → Post and Listing reports; oldest first within each band. Ages are shown ("waiting 25 min"). This replaces the v1 maintainer-only queue.
- **Layout (Variant A):**
  - **Phone:** one list. Each row is a single button: a kind chip (glyph + word + colour), the target, the category, reasons with counts, and the wait time. A row opens a **Review page**; Back or Esc returns focus to the row. The review page's actions sit in a **sticky bar** pinned at the bottom.
  - **Desktop:** the list on the left and the review pane on the right, with a short "How this works" guide in the right column.
- **Review page (Incident):** category and Campus chips; a fact list (Where · Claimed seen with posted and lock times · Author handle + what Students see · Status · Reports with reasons, counts and the number of verified reporters); the **Original**; Incident Updates in order. A held photo stays hidden until **Show photo** (`aria-pressed`), with "discarded in <time> if nobody reviews it".
- **Actions and confirm rules.** Every action opens an `alertdialog` showing:
  - the target;
  - a bullet list of exactly what will happen, who is told (always in-app, no push) and whether an Appeal opens;
  - a preview of the log line ("Logged as remove · Incident I-3F2 · by @handle · time").

  Cancel is focused first. Esc or Cancel announces "Cancelled. Nothing changed." and returns focus to the button that opened it. Confirm stays `aria-disabled` until required input is given, with a note on what's missing.

| Item | Actions | Required input | Effect |
|---|---|---|---|
| Incident under review | Restore · Redact · Note · Remove | Restore: optional "add inaccurate note" (unchecked) | Visible again; reports closed; claimants told |
| Visible Incident with reports | Dismiss reports · Redact · Note · Remove | — | Content unchanged; reporters not told the outcome |
| Remove (any) | | Reason: Identifies or targets a person · False or misleading · Not a campus safety incident · Harassment or hate · Duplicate | Hidden at once; author told the reason; one Appeal; purged at 30 d |
| Redact | | Exact words present in the original, highlighted live, with a result preview | As in policy; an Under-review Incident becomes visible |
| Note | | Template; Official notice needs a listed Official Alert; Duplicate needs another visible Incident | Dated note; the item **stays** in the queue |
| Held photo (P1) | Approve · Approve with blur · Reject | — | Reject deletes the photo and adds "Photo not approved" |
| Post / Listing | Dismiss · Remove | Remove: reason | As v1 |
| Any | Suspend author | — | Maintainer-only; shown `aria-disabled` to Moderators with "Suspending accounts is maintainer-only." The author's Incidents become Removed, Clout is reversed, one Appeal |

- **After confirm:** the item leaves the queue (unless it was a Note), a toast reads "<result>. Logged. Next: <kind>, <title>." and focus moves to the next row; on desktop the next item opens in the pane.
- **Hidden-items notes:** "N items not shown: they involve you… Another Moderator handles them." For a CSA viewer: "You can't see Incident items. You told the maintainers you are a campus security authority (CSA)."
- **Appeals** are cards showing: status (Open / Decision upheld / Decision reversed) and sent age; the decision with reason, Moderator and time; the appellant's message; and a "Show the removed Incident" disclosure. **Uphold decision** / **Reverse decision** each use the same confirm step ("One Appeal per decision. Your answer is final."). The deciding Moderator and the Incident's author see a note instead of buttons.
- **Action log:** a captioned table in a labelled, focusable horizontal-scroll region with columns When · Action · Item · Moderator · Reason or template · Content snapshot ("kept until <date>" / "none (purged)"). Intro: "Every Moderator action, kept 1 year. It records who did what to which item, never the content. A content snapshot is kept 30 days for Appeals, then deleted." Visible to every Moderator.
- **Action values:** restore · dismiss · remove · redact · note · photo_approve · photo_approve_blur · photo_reject · suspend · appeal_upheld · appeal_reversed. Remove reasons and note templates are code constants.

### 9. Official Alerts

From [#53](https://github.com/Control707/KSUX/issues/53) and ADR-0007.

- **Phasing:** P0 = official resources and links (§5). P1 = a bounded, read-only HTML copy of the **KSU Police Timely Warnings** and **Emergency Advisory** pages. No human-reviewed copy.
- **Source adapter:** one interface whose fetch returns `ok | quiet | unavailable | unrecognized`. Implementations: links-only, HTML copy, and a stub for a future KSU-approved Rave RSS/CAP feed.
  - Each item carries: exact source name, category (emergency advisory / timely warning), the official issued time only if the source states it (otherwise "unknown"), first observed, last success and last attempt.
  - Fetch every 5 min; DB writes only on content change; back off on errors and honour `Retry-After`.
- **Stale** = last success >20 min ago, **computed at read time** (never stored, never flipped by a cron). The client compares against a server clock offset. The heartbeat writes last-success at most every 10 min when content is unchanged.
- **Kill switch:** a maintainer-only DB field, auto-tripped on `unrecognized`; falls back to links-only.
- **States shown:** issued · updated · all clear (only when the source says so, quoted) · no longer listed by the source (shown 24 h as "No longer listed on [source] as of [t]", then Older, then purged at 30 d) · stale.
- **Presentation:**
  - KSU-wide, ignoring the switcher. A Campus is shown only when the source names one ("Campus not specified" otherwise); never inferred.
  - Source headline plus an excerpt of up to ~280 chars, quoted word for word and attributed, with "Read the full notice on KSU's page". No full copy and no AI summary.
  - **Quiet state** in the source's own words with the check time ("KSU Police page: 'No Timely Warnings at This Time.' Checked 2:05 PM"; for the Advisory page, "No notice found on KSU's advisory page at last check"). Never green or "safe". The line "Not seeing an Alert doesn't mean campus is safe" is always visible.
  - A **thin app-wide banner** appears only for a fresh issued or updated Alert: source-named, linking to `/safety`, dismissible per Alert. No banner for quiet, stale or unavailable.
  - Alert status is never served from cache as current.
- **Opt-in Alert push (P1):**
  - its own switch, off by default, enabled only from `/profile/notifications` after a confirm dialog;
  - triggers only when a new item reaches issued, or on a quoted official all-clear, and only after **2 consecutive successful fetches with identical content**;
  - blocked while the source is stale, `unrecognized` or kill-switched;
  - **global cap of 3 pushes per day** (derived from today's pushed items);
  - payload names the source, not the content ("KSU Police posted a new Timely Warning"), links to `/safety/alerts/<id>`, with no excerpt and no "URGENT";
  - fan-out is a scheduler chain of 100 subscriptions per batch;
  - Demo sends none.
- **P1 rollout:** ADR-0007 merged, then a **14-day shadow poll** in prod with the UI hidden that parses every real page change with zero false `unrecognized`/state errors.

### 10. Notifications and push

From [#65](https://github.com/Control707/KSUX/issues/65) ([verdict](https://github.com/Control707/KSUX/blob/prototype/v2-notification-prefs/prototype/VERDICT-v2-notification-prefs.md)).

- **Page and entry points:** one page at `/profile/notifications` (not a location screen; Back header, bar hidden). Reached from the Profile row "Notifications" with a one-line summary, the `/safety` Alert card (`#alerts`) and the Chats header bell (`#messages`, replacing the v1 "Enable Web Push" button). A deep link moves focus to that section's heading.
- **Intro:** "Push is extra. KSUX always shows new things inside the app; push only reaches you when KSUX is closed."
- **Sections:**
  1. **This phone:** one status (symbol + word + colour):

| State | Copy (gist) | Action |
|---|---|---|
| Not asked yet | "Push is off on this phone" | Turn on push for this phone |
| Allowed + subscribed | "Push is on for this phone. Only what you switch on below is pushed." | Turn off push on this phone |
| Blocked | "Notifications are blocked for KSUX", with steps for Chrome/Edge, the iPhone Home Screen app and Android | I changed it · check again |
| Unsupported browser | "This browser can't get push"; in-app toasts still work; which browsers do support push | — |
| iPhone in a Safari tab | "On iPhone, push only works from the Home Screen", with 4 numbered Share › Add to Home Screen steps | I opened it from the Home Screen |
| iPhone below iOS 16.4 | "Push needs iOS 16.4 or later", plus where to update | — |
| Judge Demo Mode | "Demo Mode: no push"; never asks; switches disabled; toasts still shown | — |

  2. **Messages:** a switch each for Direct Messages, Message Requests, Deal Chats and @scrappy replies, each describing its handle-only payload, plus a fixed note on the 60 s / muted / blocked / already-open rules (ADR-0005).
  3. **Official Alerts:** one switch, off by default. It describes the source-named payload and the 3/day cap, plus a fixed callout: "KSUX push is not an emergency channel… KSU Alert (Rave)… call 911". Turning it on opens a confirm `alertdialog` covering 5-minute polling, the seen-twice lag, possible non-delivery, the cap and Rave. **P0:** "Not available yet" plus a Rave sign-up pointer. **Stale or kill switch:** "paused / switched off by KSUX"; the setting is kept.
  4. **Never pushed:** Group Chats, Spot Openings, Incidents and Clout, each with a one-line reason.
  5. **Your devices:** "n of 3 used", "This one", and Remove for the others. Enabling while 3 are used asks the Student to remove one first.
- **Switches:** `role="switch"` buttons of at least 44 px, with a visible On/Off word and the description linked by `aria-describedby`. When push can't work they are `aria-disabled` with the reason. Every change is announced politely.
- **Enabling:** turning on any type while push is off opens a KSUX explanation dialog ("Your browser will ask next… if you choose Block, KSUX can't ask again") with Not now / Continue, then the browser prompt. Allow turns the type on with "Push is on for this phone"; Block shows the blocked state with focus on it. Turning push off for the phone keeps the saved choices. There is **no test push**.
- **Push kinds:** the allowed kinds gain `official_alert` (ADR-0007 supersedes only ADR-0005's push-scope clause). **Clout, Incidents, Group Chats and Spot Openings never push.**

### 11. Scrappy

ADR-0011 amends ADR-0004 (whose chat-isolation and no-writes clauses are unchanged) ([#59](https://github.com/Control707/KSUX/issues/59)).

- **No safety tools:** neither registry gets any tool reading Incidents, Incident Updates, Alert items or Alert sources. The Scrappy tool module has zero imports or queries touching those tables. There is also **no Clout tool**, and personal context never returns Clout.
- **The guarantee is narrow** (resolved during spec review): Scrappy has **no access to Incident or Alert records**. It is **not** a promise that Scrappy can never echo a safety claim, because Feed Post search still returns Student-written text and the gate can miss a phrasing. The system prompt tells the model never to describe campus safety from Posts, and to emit the Safety Card itself if the gate misses.
- **Deterministic safety gate:**
  - **Placement and quota:** a server-side classifier runs on every Ask Scrappy prompt and every `@scrappy` mention **before any quota check and before any LLM call**. Today both paths charge quota first, so the order changes.
  - **On a match:** returns the fixed, non-AI **Safety Card**, with no LLM call and no quota or rate-limit use, even when the Student's quota is exhausted. A Feed reply is a single write holding the card.
  - **Card links:** the Emergency Panel, `/safety` (Official Alerts plus community reports), KSU Police and LiveSafe.
  - **Copy:**
    - "Is campus safe?" / "What happened at <building>?" → "I can't see safety reports or official alerts, so I can't say whether anything is happening. Check Official Alerts and community reports in Safety. In an emergency, call 911."
    - Identification requests → "I can't help identify people." plus the Emergency Panel (KSU Police, LiveSafe for anonymous tips).
  - **Banned in all Scrappy output about campus safety:** "safe", "all clear", "no incidents", "nothing reported", or the same claim in other words.
- **Other rules:**
  - Clout questions are answered from static help text with a `/leaderboard` link; Scrappy never states anyone's rank or points.
  - Shuttle Notices may be cited as "Shuttle Notice · Passio", never as an "alert".
  - Demo behaves identically, and Demo fixtures aren't readable either.
  - The glossary entry for Scrappy is narrowed: public modules **except** safety content and Clout.

### 12. Clout and Leaderboard

ADR-0010; [#52](https://github.com/Control707/KSUX/issues/52), [#57](https://github.com/Control707/KSUX/issues/57).

**Scoring:**

| Action | Corroborated when | Clout |
|---|---|---|
| Parking Report | a different Student reports the same lot within **20 min**, within one tier, and the same deck floor when both name one | **5** to each report |
| Spot Opening | another Student taps "I took this spot" | **5** to the leaver; 0 to the taker |
| Line Check | a different Student reports the same Dining Venue within **15 min**, same or adjacent level | **5** to each |
| Study Room vibe | a different Student reports the same room within **20 min**, same or adjacent vibe | **5** to each |
| Completed handoff | buyer taps Confirm Pickup, the existing 1-per-7-days pair rule increments, **and the Deal Chat has a confirmed Meetup Spot** (resolved during spec review) | **10** to buyer and seller |
| Stop reports, Incidents, Moderation Reports, Emergency Panel, any safety content | never | **0**; never counted or shown |

- **Payout rules:**
  - Each report pays at most once.
  - Two Students corroborating each other pay at most **once per day per lot/venue/room**.
  - Uncorroborated reports earn nothing; the Student sees them as pending.
  - A pickup without a confirmed Meetup Spot still completes and still counts toward completed deals; it just earns no Clout.
  - Clout counts toward the Campus where it was earned: the lot, venue or room's Campus, or the Meetup Spot's.
- **Limits:**
  - only verified Students earn;
  - existing cooldowns, plus a **new 1 per 20 min per room cooldown on Study Room vibes**;
  - a **50/day cap** across all sources (midnight ET reset);
  - at most **2 paid reports per target per day**;
  - the pair caps.

  Caps are derived from today's ledger rows, with no counter tables.
- **Ledger** (append-only events: earn · hold · release · reverse), resolved during spec review:
  - Parking Reports, Line Checks, Study vibes and Spot Openings are **not reportable** to Moderators (they expire within 45 min).
  - A **Listing put under review holds** its handoff Clout (hidden, not counted). The hold is **released** if the Listing is restored or the reports are dismissed, and **reversed** if it's removed.
  - **Suspension reverses** all of the account's Clout and drops it from every board.
  - The corroborating partner keeps their own payout unless their own content is removed. A Moderation Report never directly takes Clout.
- **Display:**
  - A payout shows an in-app toast ("+5 Clout · your Lot P40 report was confirmed" + "See leaderboard"), **never push**.
  - Profile has a private **"Your Clout"** card: this week per Campus, lifetime total, 30-day payout log, and the **"Hide me from leaderboards"** toggle.
  - Other Students' Clout appears **only** on the Leaderboard: never on cards, profiles, Incidents or moderation tools.
  - Clout is purely cosmetic: no perks, levels, badges, streaks, seasons or redeemable value.
- **Leaderboard** (`/leaderboard`, **P1**):
  - weekly, one board per Campus, resetting Monday 00:00 ET; no all-time, combined or friends board;
  - its own Kennesaw | Marietta control, defaulting to where the viewer earned most this week (else home Campus), kept in `?campus=`; never All KSU;
  - Top 25 by handle plus the viewer's exact rank ("#83 of 412 this week"), computed at read time;
  - footer: "Clout counts helpful logistics reports, not reliability";
  - edge states: opted out ("You're hidden from leaderboards · Show me"); nothing earned ("No Clout yet this week. Corroborated Parking Reports, Line Checks and Study vibes earn it."); after reset ("New week. Board resets Mondays 00:00 ET."); suspended (absent, no rank line); Demo (seeded boards labelled "Demo · not real");
  - before the P1 gate the route shows a "coming soon" state, and earning is unaffected.
- **Anomaly view (P1):** a maintainer view of top weekly gainers and most-reversed accounts.
- **Ruled out:** location checks, fingerprinting, IP scoring, ML fraud models, phone verification.

### 13. Build phases, cut-lines and launch switches

Replaces SPEC §8 for v2 ([#61](https://github.com/Control707/KSUX/issues/61)).

| Phase | Contents | Exit gate |
|---|---|---|
| **0 · Trunk** (sequential) | Direction C tokens; new shell and URL contract with `/safety*`, `/leaderboard`, `/profile/notifications` stubs; the server-side Campus boundary; the 51-table schema (§14) incl. the Shuttle Notice rename and Demo fixtures for every new state; shared primitives (dialog, map + synced list, 44 px controls, OSM attribution on, Emergency Panel, toast host); the CI `a11y` job | `pnpm typecheck`; `convex dev --once` + seed; `?demo=1` loads the new shell; a11y job green on the shell |
| **1A · Overhaul** | Every existing screen plus Welcome, OTP, Onboarding and Quick Sheet in Direction C; Parking Layout A + no-estimate display; Transit Layout A; Shuttle Notice in UI; every #45 baseline AA failure fixed | Layer 4 green for every existing route × theme × 390/1440 |
| **1B · Safety P0** | Incidents (text-only flow, list + map, details, updates, quarantine), Moderators and the console, action log, Appeals, Moderation Report changes, Alerts P0 (resources + links), offline rules, the Scrappy safety gate, never-claim copy | Layer 1 Incident + moderation invariants; Layer 2 Scrappy boundary; Playwright flow/update/quarantine/appeal/offline; Layer 4 on `/safety*` and `/moderation` |
| **1C · Clout ledger** | Ledger, corroboration hooks, the Study vibe cooldown, payout toast, Profile "Your Clout" card (mounted by 1A), the Demo corroboration persona | Layer 1 Clout invariants; Playwright judge report → corroboration → toast → Profile |
| **P0 launch** | — | Phases 0–1C gates + Layers 1–4 green + the full manual AT pass logged with no finding that stops a P0 flow + the v2 I/O meter live |
| **2 · P1** | (a) Leaderboard; (b) Alerts HTML copy, staleness, kill switch, opt-in push, notification preferences' Alert section; (c) incident photos (hold, blur, 48 h discard, console photo review) | (a) after ≥14 days of P0, projected DB I/O <50 % of 1 GB; (b) ADR-0007 merged + a clean 14-day shadow poll; (c) Moderators can review held media + Playwright hold → approve/discard |
| **Later** | Video media; a Rave RSS/CAP source if KSU approves; Dynamic Type / `text-scale` | own ticket each |

- **Launch switches:**
  - **Incident posting in prod is hard-gated** on ≥2 appointed Moderators plus the moderation ops checklist. Until then `/safety` shows Official Alerts, resources and the panel, and Demo always runs the full flow.
  - The Leaderboard shows "coming soon" until gate 2(a) passes.
- **Parallel write scopes after the trunk:** 1A owns existing screens (except `/safety*`, `/leaderboard`); 1B owns Incidents, Moderators, the Incident parts of moderation, `/safety*`, the Scrappy gate and the service-worker bypass; 1C owns the Clout module, its hooks in parking/study/dining/marketplace, and Clout UI components. Schema, tokens, primitives and the shell are frozen after Phase 0 and change only through a trunk PR.
- **Budget levers:** if the I/O meter projects >70 % of 1 GB, keep the Leaderboard off first, then lengthen the Incident list refresh interval.

### 14. Data model

Extends ADR-0006 partitioning and ADR-0002 guardrails; 41 existing + 10 new = **51 tables** ([#58](https://github.com/Control707/KSUX/issues/58)).

**Partitioning:**
- `prod` / `demo:<id>`: incidents, incidentUpdates, moderatorActions, appeals, cloutEvents, cloutWeeklyTotals, cloutBoardCounts.
- `ksu` / `demo:<id>` fixtures, never `prod`: alertSources, alertItems.
- `prod` only: moderators (demo personas moderate their own workspace by rule).

Every new index starts with the workspace key, and every demo row is purged with its session.

| Table | Key fields | Notes |
|---|---|---|
| **incidents** | author, category, campus, building id, area detail ≤60, claimed observed time, text ≤280, name level (show_handle/hidden), photo asset?, visibility (visible/under_review/removed/deleted), published at, **locked at (= +5 min)**, last activity, update count, purge at | lifecycle computed at read time; index by (campus, visibility, published) |
| **incidentUpdates** | incident, kind (author_update/moderator_note), author?, text?, template id?, linked Alert? / official URL?, created, purge | max 5 author updates; bumps last activity |
| **moderators** | student, appointed by, CSA statement text, is CSA, appointed, revoked? | maintainers stay env-derived, and a maintainer CSA row may exist |
| **moderatorActions** (append-only) | action, target type/key, actor, template/reason id?, content snapshot?, snapshot purge (30 d), purge (1 yr) | the snapshot is patched away at 30 d; the entry is kept |
| **appeals** | decision action (**unique**), appellant, status, reviewer (≠ actor), created, purge (= target's) | one per decision |
| **alertSources** | source key, adapter kind (links_only/html_copy/rave_stub), last result, quiet text?, last success/attempt, backoff until?, last payload hash, kill switch (off/manual/auto) + reason | 2 rows |
| **alertItems** | source, stable item key, category, headline, excerpt ≤280, campus?, official issued?, first observed, last seen, state (issued/updated/all_clear/no_longer_listed), confirmed fetches, pushed at?, purge | stale is never stored |
| **cloutEvents** (append-only) | student, kind (earn/hold/release/reverse), amount, source type/key, target key, partner?, campus, week key, day key ET, created, purge (30 d) | unique payout per source; caps derived |
| **cloutWeeklyTotals** | student, campus, week, counted total, held total, hidden, purge (12 wk) | board index (campus, week, hidden, total) |
| **cloutBoardCounts** | campus, week, visible count, purge (12 wk) | for exact rank by counting the shorter side |

- **Changes to existing tables:**
  - students: + lifetime Clout, leaderboard hidden.
  - mediaAssets: + incident purpose, review status (held/approved/rejected), hold expires (48 h).
  - moderationReports: + `incident` target; + reasons `identifies_me`, `identifies_person`, `false_misleading`; + `dismissed` status; + priority (0 identifies-me, 1 held photo, 2 other Incident, 3 rest) with a queue-priority index.
  - pushSubscriptions: + official Alert opt-in (default false), opted-in at, opt-in index.
  - shuttle snapshots: `serviceAlerts` → `shuttleNotices` (drop and rebuild).
  - parkingLots: hourly prior removed.
- **Viewer context:** gains `isModerator` / `isCsa`.
- **Purge:** every new table has a purge time in the existing `:42` hourly purge at 200-row batches. **No new cron, and no cron flips state.**
- **Self-delete:** the author's Incidents become tombstones (text and media purged now); their Updates are purged; their Clout events, weekly totals and lifetime total are deleted; Moderator notes they wrote stay (no handle).
- **Suspension:** their Incidents become Removed, their Clout is reversed, and they disappear from every board.
- **Quota-bearing query shapes:**
  - `alertSourceStatus` is a tiny separate query.
  - `activeIncidents(campus)` is one card projection for pins + list (Active only, ≤50); Older is a separate 20-per-page query run only when opened; detail loads the full text and Updates.
  - The Leaderboard is a **one-shot query** (on visit, pull-to-refresh and the payout toast), never reactive.
  - Estimate: ~200k calls and ~0.6 GB DB I/O per month for v2, ~0.3 GB without the Leaderboard.
- **Judge Demo Mode:**
  - fixtures for every Incident state (Active, Older, Under review from an identifies-me claim, Redacted + note, Photo pending), the queue kinds, an open Appeal, and log entries before and after 30 days;
  - Alert fixtures for all 7 states with times relative to now, shown **only** in Demo with a "Live official notices: KSU Police page ↗" link (no real fetch, no push);
  - seeded Clout boards;
  - `@jordan_me` corroborates the judge's report 4 s after it's filed, through the normal path;
  - the Demo menu lets the judge act as a Moderator, as a second Moderator persona, or as a maintainer persona;
  - demo photos are static public files, never uploads.

**Private agenda addition (#76):** `agendaReminderState` stores one row per `(workspaceKey, studentId)` with four opt-in in-app reminder settings and at most 1,000 unexpired delivery keys. This durable preference table has no per-occurrence cron; keys expire at the corresponding start and are pruned during delivery checks. Rows join the existing Demo workspace purge and Student deletion/suspension cleanup. The agenda itself is a projection of the private schedule, RSVP and attendance records, never a public or Scrappy-readable schedule index.

### 15. Accessibility commitment

From [#54](https://github.com/Control707/KSUX/issues/54).

- **Target:** WCAG 2.2 AA on every v2 screen, sheet and dialog. Maps get only the 1.4.10 two-way-scrolling and 2.5.8-Essential (dense pins) carve-outs.
- **Hard rules beyond AA:** 44 px targets; rem-only text ≥13 px; reduced motion honoured; a synced list for every map.
- **Also required:** OTP paste + `autocomplete="one-time-code"`; no orientation lock; `scroll-padding` for sticky bars and safe areas; labelled `nav` landmarks.
- **Public wording** (About + README): "Built to WCAG 2.2 AA; last tested <date> with <AT list>; known issues: …" plus a feedback link. **Never "compliant", "certified" or "accessible to everyone".**
- **Recorded untested risks:** MapLibre canvas announcements, `aria-live` in iOS standalone PWAs, `<dialog>` inertness on target engines, Switch Access over the canvas, MapLibre 5→6 marker role drift, 2.5.7 without pan buttons.
- **Deferred:** `text-scale` / Dynamic Type, per-release Switch testing, pan buttons (only if needed), AAA polish.

---

## Testing Decisions

- **What a good test is:** tests check behaviour a Student, Moderator or maintainer can observe through a public seam (a Convex function's result and its effects on other queries, a rendered page, an announced message), never internal helpers or table layouts. Tests run in Judge Demo Mode or an isolated test backend and never need production credentials. Four layers, extending SPEC §9; no new seams.
- **Layer 1 — `convex-test` invariants** (prior art: the existing Convex test suites for moderation and safety, parking and reroute, marketplace, and Scrappy isolation):
  - **Incidents:** posting limits (3/h, 6/day, 5 updates); text checks; the 5-minute author edit then lock, with Redaction the only later change; Active/Older/hidden by age at read time; each quarantine threshold (1/2/3) and the identifies-me abuse rule; Remove and Delete purge timing and tombstones; Incidents never returned by any Feed query or Scrappy tool; Block shows "name hidden" but keeps the Incident.
  - **Moderation:** queue order and the own-item and CSA exclusions; every action writes exactly one log entry with the right snapshot purge time; templates only, with links validated; one Appeal per decision, never reviewed by the deciding Moderator or the author; suspend maintainer-only; snapshots patched away at 30 d and entries kept 1 yr.
  - **Clout:** corroboration windows and tier rules for each source; one payout per report; 50/day cap; 2 per target per day; pair-once-per-day; zero for safety content and stop reports; handoff Clout only with a confirmed Meetup Spot; hold on Listing review, release on restore or dismiss, reverse on removal; suspension reversal; partner keeps payout; the Study vibe cooldown; weekly per-Campus totals, opt-out and exact rank.
  - **Alerts:** adapter results map to states; stale at 20 min computed at read time; push only after 2 matching fetches, blocked when stale, `unrecognized` or kill-switched; global 3/day cap; Demo sends none.
  - **Campus:** changing the location setting on Parking leaves Feed pages, Feed trends and default Marketplace browse unchanged; a new Post defaults to the home Campus.
  - **Isolation:** `prod` vs `demo:<id>` vs `ksu` for every new table.
- **Layer 2 — Vitest node and static boundaries** (prior art: the existing Scrappy router-and-boundary and service-worker tests):
  - the Scrappy tool module never references the Incident, Incident Update or Alert tables, and has no Clout tool;
  - the safety gate returns the Safety Card for gate prompts in **both** entry points with zero LLM calls and zero quota use, including when quota is exhausted, and the banned-phrase list is checked against the card copy;
  - the service worker sends `/safety` and every descendant straight to network and never caches them;
  - no px-literal text in source;
  - the Alert HTML adapter parses saved copies of both KSU pages (issued, updated, quiet, changed layout → `unrecognized`, partial page, `Retry-After`).
- **Layer 3 — Playwright in Demo Mode** (prior art: the existing Judge Demo and offline end-to-end spec):
  - the full Incident report flow, including the panel, a divert and a write-time block;
  - adding an Author Update;
  - an identifies-me claim quarantining an Incident;
  - a Moderator redacting, noting and removing;
  - an Appeal reviewed by a second persona;
  - offline refusal and reconnect reconciliation;
  - judge Parking Report → demo corroboration → payout toast → Profile card;
  - Leaderboard edge states;
  - notification preferences states and confirm dialogs;
  - the Campus boundary check from the UI.
- **Layer 4 — Accessibility (new, required on PRs to `main`):**
  - A GitHub Actions `a11y` job runs Playwright specs in Demo Mode: axe (WCAG 2.0/2.1/2.2 A and AA tags) on every route and open sheet/dialog state × light/dark × 390/1440, passing with **zero serious or critical** violations.
  - Custom assertions: every target ≥44 px (pins exempt); no computed text under 13 px; required live regions exist and announce; dialogs expose role and name and handle Esc, focus trap and restore; every map has zoom, Recenter, attribution and a paired list with a matching item count; no horizontal overflow at 320 px or at 200% text; reduced-motion emulation produces no transforms.
  - **Manual scripted pass per release:** VoiceOver iOS (Safari and Home Screen PWA), TalkBack, keyboard-only, and 200% zoom + text-spacing overrides, with Switch Access once per phase; results logged with dates.
  - **Pass rule:** CI green. A manual finding blocks only if it stops a P0 flow (sign-in/OTP, Parking Report, Incident report + Emergency Panel, Official Alerts view, Deal Chat, Feed post); anything else becomes a listed known issue with a target phase.

---

## Out of Scope

- Building anything during this map; implementation starts from the tickets.
- KSUX acting as dispatch, a responder or an emergency channel, or receiving emergencies for police.
- Native iOS/Android or Capacitor apps.
- Fully anonymous Incidents (LiveSafe serves that).
- Moderator-issued or volume-promoted Alerts; any "community alert".
- Incidents in the Feed, with likes or replies, or earning Clout.
- Scanner/911 ingestion, live video, radius or location-based push, and rewards for safety reports.
- Clout perks, levels, badges, streaks, seasons, all-time or combined boards, and redeemable value.
- Location checks, device fingerprinting, IP scoring or ML fraud detection.
- Per-lot parking estimates and Banner-derived priors.
- Pan buttons on maps (unless the AT pass shows they're needed), a bus-motion pause toggle, and a test push.
- KSU outreach for approvals during v2.
- **Later phases, not P0/P1:** video incident media, a Rave RSS/CAP source, and Dynamic Type / `text-scale`.

---

## Further Notes

- **Open review items folded in during spec writing** (owner-confirmed 2026-11-18, from the review of [PR #63](https://github.com/Control707/KSUX/pull/63)): the narrower Scrappy guarantee and gate-before-quota order (§11); the 5-minute author edit before lock (§6); handoff Clout requires a confirmed Meetup Spot (§12); which Clout sources can be held or reversed (§12); and the server-side Campus boundary (§3). ADR-0008…0011 and the glossary are updated to match in PR #63.
- **Known gaps carried from research:**
  - OSM attribution is currently disabled in the campus map;
  - Study Room vibes have no cooldown today;
  - video media would need direct client upload plus in-browser re-encode;
  - incident media have no free automated moderation, so human review comes first;
  - the 2024 Title IX rule status and KSU's view on whether Moderators are CSAs are unverified, and the CSA guard stands until KSU answers.
- **Legal posture** ([#40](https://github.com/Control707/KSUX/issues/40)): Clery, FERPA and open-records duties bind KSU, not an independent KSUX, but could attach if KSU names, adopts or contracts KSUX, or if a maintainer is personally a CSA. A Post or Incident is never a police, CSA or Title IX report. §230 covers Student content but not KSUX-authored labels or Scrappy output, which is why notes are templates and Scrappy has no safety tools.
- **Prototypes** (throwaway branches, never merged): [shell](https://github.com/Control707/KSUX/blob/prototype/v2-shell/prototype/v2-shell-c.html), [parking](https://github.com/Control707/KSUX/blob/prototype/v2-parking/prototype/v2-parking.html), [incident flow](https://github.com/Control707/KSUX/blob/prototype/v2-incident-flow/prototype/v2-incident-flow.html), [notification prefs](https://github.com/Control707/KSUX/blob/prototype/v2-notification-prefs/prototype/v2-notification-prefs.html), [transit](https://github.com/Control707/KSUX/blob/prototype/v2-transit/prototype/v2-transit.html), [moderator console](https://github.com/Control707/KSUX/blob/prototype/v2-moderation/prototype/v2-moderation.html).

## Amendments to SPEC.md

| SPEC.md section | Change |
|---|---|
| §1 | 5-day target → phases (§13 here). Audience is real Students; Judge Demo Mode is still required |
| §3 | Global 3-way switcher → location-only Campus (§3 here); new routes; Quick Sheet and rail as in §3; Feed stream "Campus" → "All KSU" |
| §4.5 | `Report` → "Report to KSUX moderators"; Campus Safety opens the Emergency Panel; v1 3-reporter quarantine kept for Posts and Listings, with the Incident thresholds added; maintainer-only queue → appointed Moderators + console (§8) |
| §5.1 Tier C, §5.2 | Remove "168-hr Banner 9 priors" and the 70/30 blend / "Estimated · Typical <Day Hour> class load" (§4 here). Passio `serviceAlerts` → Shuttle Notices |
| §5.4 | Push gains the opt-in `official_alert` kind (ADR-0007); notification settings move to `/profile/notifications`; `/safety/**` bypasses the service worker |
| §6.4 | Scrappy: the safety gate before quota, no safety or Clout tools (ADR-0011) |
| §7 | 40 → 51 tables (§14 here) |
| §8 | Replaced by §13 here |
| §9 | Adds the v2 invariants and Layer 4 (Testing Decisions here) |
