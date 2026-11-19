/**
 * Public accessibility statement shown on /profile/about (SPEC-v2 §15,
 * docs/accessibility/statement.md). Fill these in from the latest entry in
 * docs/accessibility/results-log.md. Never describe KSUX as "compliant",
 * "certified" or "accessible to everyone".
 */
export interface AccessibilityStatement {
  /** WCAG target, e.g. "WCAG 2.2 AA". */
  standard: string;
  /** Date of the last full manual pass (ISO YYYY-MM-DD), or null if not yet run. */
  lastTested: string | null;
  /** Assistive technology and setups covered by that pass. */
  assistiveTech: readonly string[];
  /** Known barriers, each with the phase that targets a fix. */
  knownIssues: readonly { issue: string; target: string }[];
  /** Where Students report a barrier. */
  feedback: { label: string; href: string };
}

export const ACCESSIBILITY_STATEMENT: AccessibilityStatement = {
  standard: "WCAG 2.2 AA",
  lastTested: null,
  assistiveTech: [
    "VoiceOver on iOS Safari and the Home Screen app",
    "TalkBack on Chrome for Android",
    "keyboard only",
    "200% zoom with text-spacing overrides",
  ],
  knownIssues: [
    {
      issue: "The first full test with screen readers and Switch Access on real phones hasn't been done yet",
      target: "before the v2 launch",
    },
    {
      issue: "Exploring the map by dragging has no button alternative; choose a place from the list instead",
      target: "added if testing shows it's needed",
    },
    {
      issue: "On Parking, the map list sits beside the panel instead of inside it",
      target: "Phase 1B",
    },
  ],
  feedback: {
    label: "Tell us about a barrier on GitHub",
    href: "https://github.com/Control707/KSUX/issues/new?labels=accessibility&title=Accessibility%20barrier%3A%20",
  },
};
