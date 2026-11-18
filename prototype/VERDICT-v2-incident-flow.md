# Verdict: KSUX v2 incident report flow

Settled on the Wayfinder ticket **[Prototype incident report flow on mobile](https://github.com/Control707/KSUX/issues/48)** (Map: KSUX v2, [#35](https://github.com/Control707/KSUX/issues/35)), 2026-11-18. Prototype: [`v2-incident-flow.html`](./v2-incident-flow.html) (`?variant=A|B|C`), built on Direction C ([`VERDICT-v2-shell.md`](https://github.com/Control707/KSUX/blob/prototype/v2-shell/prototype/VERDICT-v2-shell.md)) and the parking map patterns ([`VERDICT-v2-parking.md`](https://github.com/Control707/KSUX/blob/prototype/v2-parking/prototype/VERDICT-v2-parking.md)).

**Incident** is still a working name until [#50](https://github.com/Control707/KSUX/issues/50) settles it. All copy below is placeholder wording to carry into the spec, not final.

## Decisions (human-confirmed)

1. **Variant A, step by step, wins.** It shows one question per full screen, with "Step n of 7", a progress bar, Back (header) and Next (sticky footer). B (one page) and C (card builder) were rejected but stay in the file.
2. **Everything else shown in the prototype is accepted as is**, including the shared pieces listed below.
3. **Navigation placement was delegated to the agent.** The rule is under [Navigation](#navigation).

## The flow

The report opens as a full-screen dialog over the Incidents screen and is not a route. Esc or ✕ discards the draft with the toast "Report discarded. Nothing was posted." Focus moves to each screen's `h1`, and a polite live region announces "Step n of 7. <question>".

| # | Screen | Content and rules |
|---|---|---|
| 0 | **Emergency panel** (every report, per [#49](https://github.com/Control707/KSUX/issues/49)) | "Is anyone in danger right now?" / "If so, contact help first. KSUX can't send help and doesn't contact police." Three large actions: **Call 911** (Fire, medical, crime in progress), **Call KSU Police** (470-578-6666 · answered 24/7) and **Text KSU Police** (770-356-3866), followed by KSU's qualifier for the text line (deaf, hard of hearing, speech disability, or when a voice call is dangerous or impossible). A small LiveSafe pointer marked "outside KSUX". Last comes the action **"Not an emergency · post to the community"**. No sign-in, GPS or network is needed. Nothing auto-dials. |
| 1 | **What happened?** | A radio list of 8 categories, each with a shape, a word, a one-line hint and a redundant colour: Fire, smoke or alarm ▲ · Hazard ◆ · Crash or road blocked ■ · Theft or break-in ● · Vandalism or damage ✚ · Power, water or building outage ⬢ · Area closed ▬ · Something else ○. Under "Something else?" are **diverts**, which are never posted (see [Diverts](#diverts)). |
| 2 | **Where was it?** | Campus segmented control (Kennesaw / Marietta). Then a searchable radio list of buildings and areas, with a count of results. An optional "Pick on the map instead" disclosure opens a pin picker. **"Suggest places near me"** is optional: it uses location once, only to sort the list, then says "It wasn't saved or posted." Optional "Where exactly?" accepts up to 60 characters, and room or unit numbers are rejected. Housing is offered only at complex level. Nothing is inferred from the Campus filter, home campus or GPS. |
| 3 | **When did you see it?** | "When you saw it, not when you're posting." Choices: Just now / About 15 min ago / About an hour ago / Earlier today, where Earlier today asks "About what time?". This is stored as a claimed observed time, separate from the posted time. |
| 4 | **What did you see?** | A textarea of at most 280 characters with a counter. Hint: "Only what you saw or heard yourself. Don't name or describe people, and don't say it's over or safe." A soft warning appears while typing. On Next, a hard error blocks **identifying details** (@handles, names, room numbers, phone numbers, plates) and **banned claims** ("all clear", "resolved", "verified", "confirmed", "police on scene", "it's safe now"). |
| 5 | **Add a photo?** | Optional, with Skip. "A moderator reviews photos before other Students can see them. Location data is removed from the file." A **"Blur the whole photo"** option, plus "Don't include faces, plates or anything that identifies a person." |
| 6 | **How should your name show?** | **Show my handle** or **Hide my handle from other Students** ("Student · name hidden"). Fixed note: moderators can still see who posted, KSUX may have to share account details if the law requires it, this isn't anonymous reporting to police, and LiveSafe is the place for that. |
| 7 | **Check your post** | "This is exactly what other Students will see." Shows the real card, plus the fixed fine print "Posting does not contact police. KSUX moderators are volunteers and may not see this for hours." Primary button: **Post to the community**. |
| ✓ | **Posted** | "Posted to the KSUX community". The text says other Students can see it, labelled "Community report · not verified". Fine print: "This did not contact police or KSU…". A photo note appears if one is pending review. Actions: **See it on Incidents** (focuses the new card), **Still need help? Call or text** (back to the emergency panel), and **Delete this post**. |

Validation runs on Next. The error appears under the field, focus moves to the field, and the error is announced. Nothing is conveyed by colour alone.

### Diverts

Diverted categories are never offered a public post. Each has a **Choose something else** way back.

- **Someone needs medical help** → Call 911 / Call KSU Police.
- **Sexual misconduct, dating violence or stalking** → "KSUX doesn't post these publicly". Shows the KSU Title IX office, confidential counseling (KSU CPS), LiveSafe and Call KSU Police.
- **A person seems suspicious** → "KSUX doesn't post about people who seem suspicious". Explains that such posts single people out, and offers Call KSU Police.

## How an Incident appears

- **Incidents screen**: a location-bound screen with the Campus switcher.
  - **Header and intro:** a heading and a one-line scope ("Community reports from the last 24 hours on <campus>. Not verified by KSUX or KSU."). Above the list, a dismissible first-run "What KSUX Incidents is, and isn't" card (#49), then the primary **Report something you saw** button.
  - **Map:** follows the parking patterns. 44 px zoom, zoom-out and recenter buttons, OSM attribution, a **Skip map** link, and a key. Pins combine a category shape with a building label. A solid edge means updated in the last 2 h; dashed means older. Selection is a focus-blue outline. Tapping a pin selects it, moves that card to the top of the list and announces it.
  - **List:** latest first by **updated** time, never by engagement or Clout. "Older than 24 h" sits behind a disclosure and is labelled "Removed from the map after 24 h. That is its age, not a resolution."
- **Incident card** contents:
  - category chip and campus badge;
  - building or area as the heading, with the detail;
  - "Seen <n> ago" and the text;
  - photo, shown only after review;
  - **Author update** and **Moderator note** entries listed under the original post;
  - the provenance line "Community report · not verified · Posted t · Updated t · by @handle | Student · name hidden";
  - "Demo · not real" in Judge Demo Mode.

  Cards have no likes, reposts, Clout or rank. Actions are **Details** and **Report to KSUX moderators**.
- **Details sheet**: for the author, **Add an update** (same text checks, and "don't say it's over, safe or all clear") and **Delete my post**. For everyone, **Report to KSUX moderators** and **This post identifies me**. The original post is never edited after the existing 5-minute window. Corrections are updates added under it.
- **Moderation report**: reasons are "It identifies a person / It's false or misleading / Harassment or hate / Campus Safety: someone is in danger / Something else". Campus Safety opens the emergency panel first ("This reports the post to KSUX volunteer moderators. It does not contact police."). The confirmation says "Sent to KSUX moderators."
- **Call actions**: real builds open `tel:` or `sms:` with honest copy only ("Opening your phone app… KSUX can't confirm the call or a police response."). Judge Demo Mode never dials, texts or opens anything ("Demo Mode: nothing dialled").

## Navigation

The human delegated this. The decision covers **Incidents only**; Alerts and the Clout leaderboard stay open on the map.

- **New route `/safety`**, the Incidents screen, plus **`/safety/<incidentId>`**, which opens the details sheet over it. This is an addition to the SPEC §3 URL contract, which the shell prototype has already reopened. The report flow is a dialog with no route of its own.
- **Not in the 5-slot bar.** The bar stays Now · Feed · Ask Scrappy · Chats · Me. Incidents don't need one-tap access from every screen, and a permanent tab would make campus feel more dangerous than it is.
- **Entry points:**
  - a **Safety** chip in the Quick Sheet destinations;
  - a **"Report an incident"** chip in the Quick Sheet, which opens the emergency panel and then the flow. It is not added as a fifth "make something" tile, so the 2×2 grid stays;
  - **Safety** in the desktop rail, alongside the location group;
  - an "Incidents" link from Profile's "About KSUX Safety".
- **Location-bound:** `/safety` joins Now, Parking, Transit, Study, Dining and Events in showing the Campus switcher, because an Incident is tied to a place.
- **No proactive surfacing:**
  - no Incident cards on Now;
  - no unread counts or badges;
  - no push, consistent with #49.
- **Room for Alerts:** the screen is named Safety so that official Alerts can be added above the Incidents list if [#53](https://github.com/Control707/KSUX/issues/53) decides so. That ticket decides it, not this one.
- **Feed:** whether an Incident is also stored as or shown as a Feed `Post` is a data-model question for #50. This decision fixes only where the view lives.

## Inputs to downstream tickets

- [Incident anonymity, moderation and correction policy](https://github.com/Control707/KSUX/issues/51) should start from what is accepted here:
  - the two name choices (shown, or hidden from Students but known to moderators), with no fully anonymous option;
  - photos held for review, with whole-photo blur;
  - write-time blocks on identifying details and banned claims;
  - updates and moderator notes instead of edits;
  - the "This post identifies me" path;
  - 24 h on the map, with older posts kept behind a disclosure;
  - the three diverts.

  Still open there: retention and purge, quarantine thresholds, moderation hours and staffing, and what is logged.
- [Define Incident, Alert and Clout and how they interact](https://github.com/Control707/KSUX/issues/50) inherits the Incident fields this flow collects:
  - category, campus, area, optional detail;
  - claimed observed time, text, optional photo plus a blur flag;
  - name visibility;
  - author updates and moderator notes;
  - posted and updated times.

## Known gaps (prototype only)

- The map is a schematic SVG. Building names are a hand-picked subset of `public/data/campus-buildings.geojson`.
- "Near me" and the call/SMS hand-offs are simulated. No real `tel:` or `sms:` links are opened.
- The identifying-detail and banned-claim checks are rough regexes, not the spec's rules.
- Title IX, CPS and LiveSafe links are placeholders.
- Only automated headless-Edge runs: all three variants were completed end to end with no page errors, and the divert and moderation-report paths were exercised. There has been no assistive-technology device testing and no contrast measurement of category shapes on the map styles.
