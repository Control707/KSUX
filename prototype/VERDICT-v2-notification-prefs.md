# Verdict: KSUX v2 notification settings

Settled on the Wayfinder ticket **[Prototype notification preferences screen](https://github.com/Control707/KSUX/issues/65)** (Map: KSUX v2, [#35](https://github.com/Control707/KSUX/issues/35)), 2026-11-18. Prototype: [`v2-notification-prefs.html`](./v2-notification-prefs.html) (`?variant=A|B|C`), built on Direction C. The copy is placeholder wording to carry into the spec.

## Decision (human-confirmed)

**Variant A, one page in Profile, wins.** B (a sheet opened from anywhere) and C (a phone-first checklist) were rejected but stay in the file. C's test push and "Inside KSUX / Push" table are **not** carried over.

## The screen

- **Route `/profile/notifications`**, a SPEC §3 URL-contract addition under ADR-0008. It is not a location screen, so there is no Campus switcher, and the bottom bar is hidden in favour of a Back header.
- **Entry points:**
  - the Profile row "Notifications" with a one-line summary (e.g. "On · 4 message types + Official Alerts", "Off on this phone", "Demo: no push", "Not available here");
  - the `/safety` Official Alerts card row "Alert push", which deep-links to `#alerts`;
  - the Chats header bell (named "Notification settings, <summary>"), which deep-links to `#messages`. This replaces today's "Enable Web Push" button in `ChatsInboxView`.

  A deep link moves focus to that section's heading.
- **Intro:** "Push is extra. KSUX always shows new things inside the app; push only reaches you when KSUX is closed."
- **Sections in order:**
  1. **This phone:** one status block with a symbol, a word and a colour. The states are listed below.
  2. **Messages:** a switch each for Direct Messages, Message Requests, Deal Chats and @scrappy replies, each describing its handle-only payload, plus a fixed note on the 60 s / muted / blocked / already-open rules (ADR-0005).
  3. **Official Alerts:** one switch, off by default (ADR-0007). It describes the source-named payload ("KSU Police posted a new Timely Warning") and the 3/day cap. A fixed callout says "KSUX push is not an emergency channel… KSU Alert (Rave)… call 911". Turning it on opens a confirm `alertdialog` covering the 5-minute polling and seen-twice lag, possible non-delivery, the 3/day cap and Rave. **P0:** "Not available yet", plus a KSU Alert (Rave) sign-up pointer. **Source stale or kill switch:** a "paused / switched off by KSUX" notice with a link to Official Alerts. The setting is kept.
  4. **Never pushed:** Group Chats, Spot Openings, Incidents (community reports) and Clout, each with a one-line reason.
  5. **Your devices:** "n of 3 used", "This one", and **Remove** for the others. Enabling while 3 are used asks the Student to remove one first.
- **Switches** are `role="switch"` buttons of at least 44 px, with a visible On/Off word and the description linked by `aria-describedby`. When push can't work they are `aria-disabled` and say why. Every change is announced politely.
- **Enabling:** turning on any type while push is off starts the permission sequence.
  1. A KSUX explanation dialog ("Your browser will ask next… if you choose Block, KSUX can't ask again"), with Not now / Continue.
  2. The browser prompt.
  3. On Allow, the type turns on with the toast "Push is on for this phone".
  4. On Block, the status changes to blocked and focus moves to it.

  Turning push off for the phone keeps the saved per-type choices.

## "This phone" states

| State | Copy (gist) | Action |
|---|---|---|
| Not asked yet | "Push is off on this phone" | Turn on push for this phone |
| Allowed + subscribed | "Push is on for this phone. Only what you switch on below is pushed." | Turn off push on this phone |
| Blocked | "Notifications are blocked for KSUX". Steps for Chrome/Edge, the iPhone Home Screen app and Android | I changed it · check again |
| Unsupported browser | "This browser can't get push". In-app toasts still work, plus which browsers do support push | none |
| iPhone in a Safari tab | "On iPhone, push only works from the Home Screen". 4 numbered Share › Add to Home Screen steps | I opened it from the Home Screen |
| iPhone on iOS below 16.4 | "Push needs iOS 16.4 or later". Where to update | none |
| Judge Demo Mode | "Demo Mode: no push". Never asks for permission, every switch disabled, toasts still shown | none |

## Inputs to the spec

- Add `/profile/notifications` to SPEC §3, and add its entry points to the Profile, `/safety` and Chats sections.
- The SPEC §4 push tier text points to this screen. Remove the push button in `ChatsInboxView`.
- `tests/a11y/` covers this route in every phone state: switch names and state, the alertdialog focus trap and Esc, and focus on the deep-link heading.
