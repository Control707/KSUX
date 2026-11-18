# Verdict: KSUX v2 Moderator console

Settled on the Wayfinder ticket **[Prototype Moderator console for Incidents, reports and Appeals](https://github.com/Control707/KSUX/issues/68)** (Map: KSUX v2, [#35](https://github.com/Control707/KSUX/issues/35)), 2026-11-18. Prototype: [`v2-moderation.html`](./v2-moderation.html) (`?variant=A|B|C`, `?frame=fluid` for 1440 px), built on Direction C. Copy is placeholder wording to carry into the spec.

## Decision (human-confirmed)

**Variant A wins: one queue, then a review page.** On phones the review page uses **C's sticky action bar**, a decision block pinned to the bottom. B (tabs by kind and a dense table) was rejected because tabs split the single priority order that [#51](https://github.com/Control707/KSUX/issues/51) decided. C's one-case deck and "Skip for now" are **not** carried over. All three stay in the file.

**Policy amendment to #51 (user's choice):** when a Moderator restores an Incident that had "false or misleading" reports, **the Moderator chooses** whether to add the "Several Students reported this as inaccurate" note. The restore confirm step shows an unchecked option, and the note is not added automatically. #51's "the note stays if restored" now means a note that was added stays; it is no longer added on its own.

## Layout

- **Route `/moderation`** (existing). It has three sections: **Queue**, **Appeals** and **Action log**. Phones show them as a segmented control under a Back header with the bottom bar hidden. Desktop shows them in the rail's "Moderation" group, with counts for Queue and open Appeals. There is no Campus switcher because moderation is KSU-wide.
- **Queue (phone):** one ordered list. Each row is a single button holding a kind chip (glyph + word + colour: "Identifies me" claim / Held photo / Incident report / Post report / Listing report), the building or target, the category, the reasons with counts, and "waiting <age>". Tapping a row opens the **Review page**. Back or Esc returns focus to that row.
- **Queue (desktop ≥1024 px):** the list on the left and the review pane on the right, which stays in place as you scroll. The right column has a short "How this works" guide (order, confirm + log, no review time).
- **Order:** "identifies me" claims → held photos → other Incident reports → Posts and Listings, oldest first within each. Ages are shown and no review time is promised anywhere.
- **Review page (Incident):** category + Campus chips, plus a fact list:
  - **Where:** building · ≤60-char detail.
  - **Claimed seen:** with posted time and the 5-minute lock time.
  - **Author:** the handle, plus what Students see (handle or "Student · name hidden").
  - **Status.**
  - **Reports:** reasons and counts, from N verified Students.

  Below that: the **Original** as a quote, then the **Incident Updates** (author updates and moderator notes) in order.
- **Held photo:** **hidden until the Moderator presses "Show photo"** (a toggle button), with "discarded in <time> if nobody reviews it. Students can't see it."
- **Sticky action bar (phone):** pinned to the bottom of the review page and shown only for the actions that apply. Desktop shows the same group at the bottom of the review pane.

## Actions and confirm rules

Every action opens a confirm `alertdialog` with three parts:
- the target ("Incident I-3F2");
- a bullet list of exactly what will happen, who is told (always **in-app, no push**) and whether an Appeal opens;
- a **preview of the log line** it will write ("Logged as remove · Incident I-3F2 · by @handle · time").

Cancel is focused first. Esc or Cancel announces "Cancelled. Nothing changed." and returns focus to the button that opened it. The confirm button stays `aria-disabled` until the required input is given, with a short note on what's missing.

| Item | Actions | Required in confirm | Effect |
|---|---|---|---|
| Incident under review | **Restore**, Redact, Note, Remove | Restore: optional "add inaccurate note" (unchecked) | Visible again; reports closed; claimants told |
| Visible Incident with reports | **Dismiss reports**, Redact, Note, Remove | none | Content unchanged; reporters not told the outcome |
| Remove (any) | | **Reason** from a fixed list (identifies a person · false or misleading · not a campus safety incident · harassment or hate · duplicate) | Hidden at once; author told the reason; one Appeal; purged at 30 d |
| Redact | | **Exact words** from the original, highlighted live, with a result preview; words not in the text are rejected | Words become "[removed by moderators]", the "Identifying details removed" note is added, the pre-redaction text lives only in the 30-day snapshot, an under-review Incident becomes visible |
| Add note | | **Template** (inaccurate · official notice · possible duplicate). Official notice needs a **listed Official Alert**; duplicate needs **another visible Incident**. "Identifying details removed" and "Photo not approved" come only from Redact and Reject | Dated, no Moderator name; the item **stays in the queue** |
| Held photo | **Approve**, **Approve with blur**, **Reject** | none | Reject deletes the photo and adds the "Photo not approved" note |
| Post / Listing | Dismiss, Remove | Remove: reason | As today |
| Any | Suspend author | none | **Maintainer-only:** shown `aria-disabled` to Moderators with "Suspending accounts is maintainer-only." All their Incidents become Removed, Clout is reversed, one Appeal |

After a confirm, the item leaves the queue (unless it was a Note), a toast reads "<result>. Logged. Next: <kind>, <title>." and focus moves to the next row. On desktop, the next item opens in the pane.

## Appeals

- They are listed as cards with:
  - the status (Open / Decision upheld / Decision reversed) and when it was sent;
  - the decision being appealed, with its reason, Moderator and time;
  - the appellant's message;
  - a "Show the removed Incident" disclosure.
- **Uphold decision** / **Reverse decision** each go through the same confirm step. "One Appeal per decision. Your answer is final."
- The Moderator who made the decision, or the Incident's author, sees a note instead of buttons ("a different Moderator reviews the Appeal"). If no other Moderator exists, it goes to a maintainer (#51).

## Action log

A table with a horizontal-scroll region. Columns: When, Action, Item, Moderator, Reason or template, and Content snapshot ("kept until <date>" or "none (purged)"). The intro says: "Every Moderator action, kept 1 year. It records who did what to which item, never the content. A content snapshot is kept 30 days for Appeals, then deleted." It is visible to every Moderator.

## Hidden items

- **Conflict:** items involving the viewer (their own Incident, report or claim) are left out, with a note: "1 item not shown: it involves you… Another Moderator handles it."
- **CSA guard:** a Moderator flagged as a CSA sees **no Incident items or Incident Appeals**, only Posts and Listings, with a note naming why.

## Judge Demo Mode

Every item carries **"Demo · not real"**. The Demo pill opens a persona menu (judge · Moderator, `@mo.b` · Moderator, `@zak.s` · Maintainer), so the judge can reach the conflict rule, the different-reviewer Appeal and maintainer-only suspend. Fixtures cover every queue kind, an open Appeal and log entries before and after 30 days. Nothing reaches real Students and no push is sent.

## Accessibility (carry into `tests/a11y/`)

- Rows are single buttons (≥44 px) whose visible text reads in order: kind, title, reasons, age.
- Opening a review moves focus to its heading. Back or Esc returns focus to the row it came from.
- Confirm dialogs are `alertdialog` with a focus trap, Esc, Cancel focused first, and `aria-disabled` confirm with a reason.
- Results are announced through the polite live region, including what's next.
- Kind is shown by glyph + word + colour.
- Tables have captions and scoped headers; the log scroll region is focusable and labelled.
- The photo toggle is `aria-pressed`.
- Checked at 390 and 1440 px, light and dark, and 200% text.

## Inputs to the spec

- SPEC `/moderation` section: the layout above, the confirm table, Appeals, the Action log, and the hidden-items notes.
- Amend the #51 restore rule (the Moderator chooses the inaccurate note).
- `moderatorActions.action` values: restore · dismiss · remove · redact · note · photo_approve · photo_approve_blur · photo_reject · suspend · appeal_upheld · appeal_reversed. Remove reasons are code constants like the note templates.
- Today's `ModerationQueueView` and `reviewModerationTarget` (restore/remove/suspend) are replaced by this.
