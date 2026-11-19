/**
 * Source-named official safety resources for the P0 Alerts surface
 * (SPEC-v2 §5, §9 P0; #49, #53). Static so the precached /emergency page can
 * show them offline. Every fact is quoted from the named KSU page and was
 * checked on RESOURCES_CHECKED_ON; it is a resource check date, never an
 * Alert status or a live timestamp.
 */
export const RESOURCES_CHECKED_ON = "2026-11-19";

export interface KsuSource {
  source: string;
  title: string;
  href: string;
  detail?: string;
}

export const KSU_SOURCES = {
  policeContact: {
    source: "KSU Police",
    title: "KSU Police contact page",
    href: "https://campus.kennesaw.edu/offices-services/public-safety-police/",
  },
  timelyWarnings: {
    source: "KSU Police",
    title: "Timely Warnings",
    href: "https://campus.kennesaw.edu/offices-services/public-safety-police/notifications/index.php",
    detail: "Active timely warnings, posted by KSU Police.",
  },
  advisory: {
    source: "KSU Campus Security & Advisories",
    title: "Emergency Advisory page",
    href: "https://www.kennesaw.edu/emergency/",
    detail: "KSU’s advisory page. It can carry emergency or non-emergency messages.",
  },
  ksuAlert: {
    source: "KSU Office of Emergency Management",
    title: "KSU Alert (Rave) emergency notifications",
    href: "https://campus.kennesaw.edu/offices-services/emergency-management/emergency-notification.php",
    detail:
      "Students are added to KSU Alert automatically. To get text alerts, keep your number in OwlExpress and listed as a cell or mobile phone; other phone types get voice alerts only.",
  },
  liveSafe: {
    source: "KSU",
    title: "KSU LiveSafe app",
    href: "https://campus.kennesaw.edu/offices-services/livesafe/",
    detail:
      "A free, voluntary KSU app for sending safety tips to University Police, including anonymously. It’s outside KSUX.",
  },
} satisfies Record<string, KsuSource>;

export type KsuSourceKey = keyof typeof KSU_SOURCES;
export const sourceOf = (key: KsuSourceKey): KsuSource => KSU_SOURCES[key];

/** The official destinations listed under Official Alerts, in order. */
export const OFFICIAL_ALERT_LINKS: KsuSourceKey[] = ["timelyWarnings", "advisory", "ksuAlert"];

export interface ContactLine {
  label: string;
  number?: string;
  tel?: string;
  email?: string;
  note?: string;
}

/** Non-emergency KSU Police contacts (source: KSU Police contact page). */
export const POLICE_NON_EMERGENCY: ContactLine[] = [
  {
    label: "Non-emergency (administrative)",
    number: "470-578-6206",
    tel: "tel:4705786206",
    note: "For an anonymous non-emergency tip, call this number and say you want to leave an anonymous tip.",
  },
  { label: "Non-emergency email", email: "police@kennesaw.edu", note: "Not for emergencies." },
];

/** Campus-specific contacts (source: KSU Campus Security & Advisories; 2026 ASFR p. 8). */
export const CAMPUS_CONTACTS: { campus: "Kennesaw" | "Marietta"; lines: string[] }[] = [
  {
    campus: "Kennesaw",
    lines: [
      "KSU Police station: 351 Paulding Avenue",
      "From any campus office phone, dial extension 6666 for KSU Police",
    ],
  },
  {
    campus: "Marietta",
    lines: [
      "KSU Police station: 920 Hornet Loop, Norton Hall",
      "From any campus office phone, dial extension 6666 for KSU Police",
    ],
  },
];

/** What KSUX never claims (#49 §A), in plain language. */
export const KSUX_NEVER_CLAIMS = [
  "KSUX isn’t 911, the police or a dispatcher. It never receives an emergency for you.",
  "KSUX isn’t monitored 24/7. Moderators are volunteers and may not see a post for hours.",
  "KSUX isn’t official KSU. Official information is always shown with its exact source.",
  "Community reports aren’t verified. Likes, corroboration, moderator review and Scrappy never make one verified.",
  "Silence doesn’t mean safe. Not seeing an Alert or a report doesn’t mean campus is safe.",
  "Opening your phone app isn’t the same as reaching help. KSUX can’t confirm a call, a text or a police response.",
  "A report to KSUX moderators doesn’t contact police.",
  "Clout counts helpful logistics reports. It isn’t a measure of trust.",
  "KSUX isn’t anonymous or confidential to police. For anonymous tips, use KSU LiveSafe.",
] as const;

export const INDEPENDENCE_STATEMENT =
  "KSUX is an independent student project, not operated or endorsed by Kennesaw State University.";

export const NO_ALERT_ISNT_SAFE = "Not seeing an Alert doesn’t mean campus is safe.";
export const OFFLINE_OFFICIAL = "Offline: can’t check official sources.";
export const OFFLINE_INCIDENTS = "Offline: can’t load community Incidents.";
export const OFFLINE_REPORT =
  "You’re offline. Posting to the KSUX community needs a connection. Nothing has been sent or saved.";
