# Manual assistive-technology test matrix

Run this pass once per release in Judge Demo Mode (`/?demo=1`), plus Switch Access once per phase. Log every run in [results-log.md](results-log.md) with the date, build commit, devices and findings.

**Pass rule:** CI must be green. A manual finding blocks release only if it stops a task in a P0 flow: sign-in/OTP, Parking Report, Incident report with the Emergency Panel, Official Alerts view, Deal Chat, or Feed post. Anything else becomes a known issue with a target phase and is listed in the [public statement](statement.md).

## Setups

| ID | Setup | Frequency |
|---|---|---|
| VO-S | VoiceOver, iOS Safari | Every release |
| VO-P | VoiceOver, iOS Home Screen PWA | Every release |
| TB | TalkBack, Chrome for Android | Every release |
| KB | Keyboard only, desktop Chrome or Firefox | Every release |
| ZT | 200% browser zoom plus the four WCAG 1.4.12 text-spacing overrides | Every release |
| SW | iOS Switch Control or Android Switch Access | Once per phase (advisory) |

## Tasks

Mark each cell **Pass**, **Fail (blocking)**, **Fail (known issue)** or **N/A**.

| # | Task | Expected | VO-S | VO-P | TB | KB | ZT | SW |
|---|---|---|---|---|---|---|---|---|
| 1 | Open KSUX and move past the header | "Skip to main content" is first and lands on the screen | | | | | | |
| 2 | Move between Now, Feed, Marketplace and Chats with the bottom bar | Each item is named and announces "current page"; the new screen's heading gets focus | | | | | | |
| 3 | Open the Quick Sheet, ask a question, then close it with Escape or the Close button | Focus starts in the Ask field, stays in the sheet and returns to the Ask Scrappy button | | | | | | |
| 4 | Open Safety and Report an incident from the Quick Sheet chips | Both are reachable and named | | | | | | |
| 5 | Change Campus on Parking | The switcher shows only on location screens, the pressed state is announced, and "Showing Marietta" is announced | | | | | | |
| 6 | Use Skip map on Parking, choose a lot from the list | Focus lands on the list; the selection is announced and outlined on the map | | | | | | |
| 7 | Zoom in, zoom out and Recenter the Parking map | Buttons are 44 px, named and announce the result; the map never rotates or tilts | | | | | | |
| 8 | Read a lot's status without colour | Each status has a glyph and a word ("Nearly Full", "No recent reports") | | | | | | |
| 9 | Open the Transit map and list | Route codes come before colour; the attribution names Passio GO / Big Owl Bus | | | | | | |
| 10 | Open `/safety` signed out and offline | The Emergency Panel shows with Call 911, Call KSU Police and Text KSU Police; nothing dials automatically | | | | | | |
| 11 | In Demo, tap Call 911 | "Demo Mode: nothing dialled" is announced and nothing opens | | | | | | |
| 12 | Receive a new chat message on another screen | The toast is announced politely and can be dismissed | | | | | | |
| 13 | Turn on Reduce Motion and open the Quick Sheet | The sheet fades in without sliding; map moves jump | | | | | | |
| 14 | Set text to 200% (ZT) or largest Dynamic Type size on a phone | Nothing clips, there is no sideways scrolling, and bar labels collapse to names | | | | | | |
| 15 | Rotate the phone | KSUX works in both orientations | | | | | | |
| 16 | Open a chat thread and Ask Scrappy | The bottom bar hides; Back is first and named | | | | | | |

## Recorded untested risks

These come from SPEC-v2 §15. Note any evidence in the results log.

- AT announcements of the MapLibre canvas region
- `aria-live` reliability in iOS standalone PWAs (VO-P)
- Dialog inertness on target engines
- Switch Access over the map canvas
- MapLibre 5 → 6 marker role drift
- 2.5.7 dragging with no pan buttons: if exploratory panning is needed in tasks 6 and 7, add pan buttons
