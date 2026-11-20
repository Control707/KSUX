# Public accessibility statement (source)

Use this wording on the About page and in the README. Fill in the date and assistive technology from the latest entry in [results-log.md](results-log.md). Never describe OwlSide as "compliant", "certified" or "accessible to everyone".

> OwlSide is built to WCAG 2.2 AA. Last tested **<date>** with **<VoiceOver on iOS Safari and the Home Screen app, TalkBack on Chrome for Android, keyboard only, and 200% zoom with text-spacing overrides>**.
>
> Known issues:
> - <issue> (target: <phase>)
>
> Tell us about a barrier: <feedback link>.

## Status

The statement is published on the About page (`/profile/about`, from `src/components/profile/accessibilityStatement.ts`) and in the README. Both say the first full manual pass hasn't been logged yet. When it is, set `lastTested` in that file and the date in the README from [results-log.md](results-log.md), and replace the known issues with the pass's findings.
