/**
 * Official Alert source adapter (ADR-0007, SPEC-v2 §9).
 *
 * Pure parsing and decision helpers shared by the poller, the read queries
 * and the tests. Nothing here touches the database or the network.
 *
 * The P1 HTML copy reads exactly two public KSU pages. Anything the parser
 * does not positively recognise is `unrecognized`, which trips the automatic
 * kill switch: a parser glitch must never look like an Alert or an all-clear.
 */

import { localTimestamp } from "./easternDate";

export type AlertCategory = "timely_warning" | "emergency_advisory";
export type AdapterResultKind = "ok" | "quiet" | "unavailable" | "unrecognized";

export interface ParsedAlertItem {
  itemKey: string;
  category: AlertCategory;
  headline: string;
  excerpt: string;
  /** Present only when the source states a full date and time. */
  officialIssuedAt?: number;
  /** The source's own date/time words, quoted, when it gives any. */
  officialIssuedText?: string;
  campus?: "Kennesaw" | "Marietta";
  allClear: boolean;
  contentHash: string;
}

export type AdapterResult =
  | { kind: "ok"; items: ParsedAlertItem[] }
  | { kind: "quiet"; quietText: string }
  | { kind: "unavailable"; reason: string; retryAfterMs?: number }
  | { kind: "unrecognized"; reason: string };

export type OfficialSourceKey = "ksu_timely_warnings" | "ksu_emergency_advisories";

export interface OfficialAlertSourceInfo {
  sourceKey: OfficialSourceKey;
  sourceName: string;
  pageTitle: string;
  href: string;
  category: AlertCategory;
  /** Payload when a new item is confirmed; names the source, never the content. */
  pushNew: string;
  pushAllClear: string;
}

export const OFFICIAL_SOURCES: Record<OfficialSourceKey, OfficialAlertSourceInfo> = {
  ksu_timely_warnings: {
    sourceKey: "ksu_timely_warnings",
    sourceName: "KSU Police",
    pageTitle: "Timely Warnings page",
    href: "https://campus.kennesaw.edu/offices-services/public-safety-police/notifications/index.php",
    category: "timely_warning",
    pushNew: "KSU Police posted a new Timely Warning",
    pushAllClear: "KSU Police posted an all clear",
  },
  ksu_emergency_advisories: {
    sourceKey: "ksu_emergency_advisories",
    sourceName: "KSU Campus Security & Advisories",
    pageTitle: "Emergency Advisory page",
    href: "https://www.kennesaw.edu/emergency/",
    category: "emergency_advisory",
    pushNew: "KSU’s Emergency Advisory page posted a new notice",
    pushAllClear: "KSU’s Emergency Advisory page posted an all clear",
  },
};
export const OFFICIAL_SOURCE_KEYS = Object.keys(OFFICIAL_SOURCES) as OfficialSourceKey[];

export function sourceInfo(sourceKey: string): OfficialAlertSourceInfo | null {
  return Object.hasOwn(OFFICIAL_SOURCES, sourceKey) ? OFFICIAL_SOURCES[sourceKey as OfficialSourceKey] : null;
}

export const STALE_AFTER_MS = 20 * 60_000;
export const HEARTBEAT_MS = 10 * 60_000;
export const NO_LONGER_LISTED_SHOWN_MS = 24 * 60 * 60_000;
export const ITEM_PURGE_MS = 30 * 24 * 60 * 60_000;
export const SHADOW_DAYS = 14;
export const SHADOW_MS = SHADOW_DAYS * 24 * 60 * 60_000;
export const CONFIRMATIONS_TO_PUSH = 2;
export const DAILY_PUSH_CAP = 3;
export const FANOUT_BATCH = 100;
export const EXCERPT_MAX = 280;
export const DEFAULT_UNAVAILABLE_BACKOFF_MS = 10 * 60_000;
export const MAX_BACKOFF_MS = 60 * 60_000;
export const ADVISORY_QUIET_TEXT = "No notice found on KSU’s advisory page at last check";

/** Stale is computed at read time from the last success; it is never stored. */
export function isStale(lastSuccessAt: number | undefined, now: number) {
  return lastSuccessAt === undefined || now - lastSuccessAt > STALE_AFTER_MS;
}

// ---------------------------------------------------------------------------
// Rollout switches (SPEC-v2 §13 gate 2(b)).
// ---------------------------------------------------------------------------

/**
 * `off` — links-only, no polling (P0).
 * `shadow` — poll and record in prod with the UI hidden and no push.
 * `display` — show the copy; allowed only after a recorded 14-day shadow sign-off.
 */
export type AlertCopyMode = "off" | "shadow" | "display";

export function alertCopyMode(env: string | undefined = process.env.OWLSIDE_ALERT_COPY_MODE): AlertCopyMode {
  const value = env?.trim().toLowerCase();
  return value === "shadow" || value === "display" ? value : "off";
}

export function alertPushRequested(env: string | undefined = process.env.OWLSIDE_ALERT_PUSH) {
  return env?.trim().toLowerCase() === "true";
}

export interface ShadowEvidence {
  shadowStartedAt?: number;
  shadowUnrecognizedCount?: number;
  shadowSignedOffAt?: number;
  /** The window that applied when this source was signed off. */
  shadowWindowMs?: number;
}

/** The shortest shadow window a maintainer may choose: 12 polls at 5 minutes. */
export const MIN_SHADOW_MS = 60 * 60_000;

/**
 * Required shadow window. SPEC-v2 §13 asks for 14 days; `OWLSIDE_ALERT_SHADOW_HOURS`
 * shortens it (never below 1 hour) for a time-boxed event such as a hackathon.
 * A shortened window is recorded on each signed-off source and shown to maintainers.
 */
export function shadowWindowMs(env: string | undefined = process.env.OWLSIDE_ALERT_SHADOW_HOURS) {
  const hours = Number(env?.trim());
  if (!env?.trim() || !Number.isFinite(hours) || hours <= 0) return SHADOW_MS;
  return Math.min(SHADOW_MS, Math.max(MIN_SHADOW_MS, Math.round(hours * 60 * 60_000)));
}

/** A source may be shown only after a clean shadow poll a maintainer signed off. */
export function shadowGatePassed(source: ShadowEvidence) {
  const required = Math.max(MIN_SHADOW_MS, source.shadowWindowMs ?? SHADOW_MS);
  return source.shadowSignedOffAt !== undefined && source.shadowStartedAt !== undefined
    && source.shadowSignedOffAt - source.shadowStartedAt >= required
    && (source.shadowUnrecognizedCount ?? 0) === 0;
}

export function shadowReadyForSignOff(source: ShadowEvidence, now: number, windowMs = shadowWindowMs()) {
  return source.shadowStartedAt !== undefined && now - source.shadowStartedAt >= windowMs
    && (source.shadowUnrecognizedCount ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// HTML helpers. Regex-based on purpose: the pages are small, server-rendered
// and fixed-layout, and anything unexpected must fail closed.
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};

export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

export function cleanText(html: string) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/[\s\u00a0]+/g, " ").trim();
}

function withoutNoise(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, "");
}

interface Block { heading: boolean; text: string }

/** Headings (h2–h4 or role="heading") and text blocks (p, li), in page order. */
function blocksOf(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h[1-6]|p|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(re)) {
    const tag = match[1]!.toLowerCase();
    const text = cleanText(match[3]!);
    if (!text) continue;
    const heading = /^h[2-4]$/.test(tag) || /\brole\s*=\s*["']heading["']/i.test(match[2]!);
    if (tag === "h1") continue;
    blocks.push({ heading, text });
  }
  return blocks;
}

function looksComplete(html: string) {
  return /<\/html>\s*$/i.test(html.trim()) && /<\/main>|<footer\b/i.test(html);
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";
const DATE_RE = new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})(?:[^0-9]{1,12}?(\\d{1,2})(?::(\\d{2}))?\\s*([ap])\\.?\\s*m\\.?)?`, "i");

/** Quote the source's own date words; derive an instant only when a time is stated. */
export function parseOfficialTime(text: string): { officialIssuedText?: string; officialIssuedAt?: number } {
  const m = DATE_RE.exec(text);
  if (!m) return {};
  const officialIssuedText = m[0].trim();
  if (!m[4] || !m[6]) return { officialIssuedText };
  const monthIndex = MONTHS.split("|").findIndex((name) => name.toLowerCase() === m[1]!.toLowerCase());
  const month = (monthIndex >= 12 ? [0, 1, 2, 3, 5, 6, 7, 8, 8, 9, 10, 11][monthIndex - 12]! : monthIndex) + 1;
  let hour = Number(m[4]) % 12;
  if (m[6]!.toLowerCase() === "p") hour += 12;
  const parts = { year: Number(m[3]), month, day: Number(m[2]), hour, minute: Number(m[5] ?? 0) };
  if (parts.day < 1 || parts.day > 31 || parts.minute > 59) return { officialIssuedText };
  const officialIssuedAt = localTimestamp({ ...parts, second: 0 });
  return officialIssuedAt === null ? { officialIssuedText } : { officialIssuedText, officialIssuedAt };
}

function campusNamed(text: string): "Kennesaw" | "Marietta" | undefined {
  const marietta = /\bMarietta\b/i.test(text);
  const kennesaw = /\bKennesaw\s+Campus\b/i.test(text);
  if (marietta === kennesaw) return undefined; // neither, or both: never inferred
  return marietta ? "Marietta" : "Kennesaw";
}

/** A short stable hash for keys; deterministic and synchronous (FNV-1a, 2×32-bit). */
export function stableHash(input: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export function excerptOf(text: string) {
  if (text.length <= EXCERPT_MAX) return text;
  const cut = text.slice(0, EXCERPT_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return (space > EXCERPT_MAX * 0.6 ? cut.slice(0, space) : cut) + "…";
}

function buildItems(sections: { headline: string; body: string[] }[], category: AlertCategory): ParsedAlertItem[] {
  const seen = new Set<string>();
  return sections.map(({ headline, body }) => {
    const bodyText = body.join(" ").trim();
    const keyBase = headline.toLowerCase().replace(/^\s*(update(d)?|all[\s-]clear)\s*[:\-–—]\s*/i, "").replace(/\s+/g, " ");
    let itemKey = stableHash(category + "|" + keyBase);
    while (seen.has(itemKey)) itemKey = stableHash(itemKey + "+");
    seen.add(itemKey);
    const all = headline + " " + bodyText;
    return {
      itemKey, category, headline: excerptOf(headline), excerpt: excerptOf(bodyText),
      ...parseOfficialTime(all),
      campus: campusNamed(all),
      allClear: /\ball[\s-]+clear\b/i.test(all),
      contentHash: stableHash(headline + "\n" + bodyText),
    };
  });
}

function sectionsFrom(blocks: Block[]) {
  const sections: { headline: string; body: string[] }[] = [];
  for (const block of blocks) {
    if (block.heading) sections.push({ headline: block.text, body: [] });
    else sections.at(-1)?.body.push(block.text);
  }
  return sections;
}

/** Text left over once every recognised block is removed; non-empty means a layout we don't know. */
function leftoverText(regionHtml: string, known: string[]) {
  let rest = cleanText(regionHtml);
  for (const text of known.sort((a, b) => b.length - a.length)) rest = rest.split(text).join(" ");
  return rest.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// KSU Police · Timely Warnings
// ---------------------------------------------------------------------------

const TW_QUIET = /No Timely Warnings at This Time\.?/i;
const TW_INTRO = /^Kennesaw State University.{0,40}Department of Public Safety/i;

export function parseTimelyWarningsPage(rawHtml: string): AdapterResult {
  const html = withoutNoise(rawHtml);
  if (!looksComplete(html)) return { kind: "unavailable", reason: "partial page" };
  const container = /<div class="content_container">([\s\S]*?)<\/main>/i.exec(html)?.[1];
  if (!container) return { kind: "unrecognized", reason: "content container not found" };
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(container);
  if (!h1 || cleanText(h1[1]!) !== "Timely Warnings") return { kind: "unrecognized", reason: "Timely Warnings heading not found" };
  const afterHeading = container.slice(h1.index + h1[0].length);
  const blocks = blocksOf(afterHeading);
  if (!blocks.length || blocks[0]!.heading || !TW_INTRO.test(blocks[0]!.text)) {
    return { kind: "unrecognized", reason: "intro paragraph changed" };
  }
  const rest = blocks.slice(1);
  if (leftoverText(afterHeading, blocks.map((b) => b.text))) return { kind: "unrecognized", reason: "unexpected text outside known blocks" };
  const quiet = rest.find((b) => TW_QUIET.test(b.text));
  const headed = rest.some((b) => b.heading);
  if (quiet && !headed && rest.length === 1) return { kind: "quiet", quietText: TW_QUIET.exec(quiet.text)![0] };
  if (quiet || !headed || rest[0]!.heading === false) {
    return { kind: "unrecognized", reason: quiet ? "quiet text alongside other content" : "warnings without a recognised heading" };
  }
  return { kind: "ok", items: buildItems(sectionsFrom(rest), "timely_warning") };
}

// ---------------------------------------------------------------------------
// KSU Campus Security & Advisories · Emergency Advisory page
// ---------------------------------------------------------------------------

const ADVISORY_FIXED_HEADINGS = new Set(["Important Contact Information", "Emergencies", "Non-Emergencies", "Hospitals"]);
const ADVISORY_CHANNELS = ["Emergency Management", "KSU Police"];

export function parseEmergencyAdvisoryPage(rawHtml: string): AdapterResult {
  const html = withoutNoise(rawHtml);
  if (!looksComplete(html)) return { kind: "unavailable", reason: "partial page" };
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!h1 || cleanText(h1[1]!) !== "Campus Security & Advisories") return { kind: "unrecognized", reason: "advisory heading not found" };
  const start = html.search(/<div id="main"[^>]*>/i);
  const end = html.search(/<footer\b/i);
  if (start < 0 || end <= start) return { kind: "unrecognized", reason: "main region not found" };
  let main = html.slice(start, end);
  // The two fixed channel buttons (Emergency Management, KSU Police) sit in one list.
  const channelList = /<ul\b[^>]*class="[^"]*\bchannels\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(main);
  if (channelList) {
    const channels = [...channelList[1]!.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => cleanText(m[1]!));
    if (channels.some((c) => !ADVISORY_CHANNELS.includes(c))) return { kind: "unrecognized", reason: "unexpected channel buttons" };
    main = main.replace(channelList[0], " ");
  }
  const blocks = blocksOf(main);
  const contactIndex = blocks.findIndex((b) => b.heading && b.text === "Important Contact Information");
  if (contactIndex < 0) return { kind: "unrecognized", reason: "contact section not found" };
  if (leftoverText(main, blocks.map((b) => b.text))) return { kind: "unrecognized", reason: "unexpected text outside known blocks" };

  // Everything from the contact heading on is the fixed contact block.
  const fixed = blocks.slice(contactIndex);
  if (fixed.some((b) => b.heading && !ADVISORY_FIXED_HEADINGS.has(b.text))) {
    return { kind: "unrecognized", reason: "contact section changed" };
  }
  const notices = blocks.slice(0, contactIndex);
  if (!notices.length) return { kind: "quiet", quietText: ADVISORY_QUIET_TEXT };
  if (!notices[0]!.heading) return { kind: "unrecognized", reason: "notice without a recognised heading" };
  return { kind: "ok", items: buildItems(sectionsFrom(notices), "emergency_advisory") };
}

export function parseSourcePage(sourceKey: OfficialSourceKey, html: string): AdapterResult {
  return sourceKey === "ksu_timely_warnings" ? parseTimelyWarningsPage(html) : parseEmergencyAdvisoryPage(html);
}

/** Honour Retry-After (seconds or an HTTP date), bounded to an hour. */
export function retryAfterMs(header: string | null | undefined, now: number): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  const seconds = /^\d+$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now;
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.min(seconds, MAX_BACKOFF_MS);
}

export type PageFetch = (url: string, init: RequestInit) => Promise<{
  status: number; ok: boolean; headers: { get(name: string): string | null }; text(): Promise<string>;
}>;

/** One bounded, read-only GET of one source page, mapped to an adapter result. */
export async function fetchSource(sourceKey: OfficialSourceKey, now: number, fetchImpl: PageFetch): Promise<AdapterResult> {
  const { href } = OFFICIAL_SOURCES[sourceKey];
  let response: Awaited<ReturnType<PageFetch>>;
  try {
    response = await fetchImpl(href, {
      headers: { Accept: "text/html", "User-Agent": "OwlSide student project (read-only official notice check)" },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return { kind: "unavailable", reason: err instanceof Error ? err.message.slice(0, 200) : "fetch failed" };
  }
  if (!response.ok) {
    return { kind: "unavailable", reason: `HTTP ${response.status}`, retryAfterMs: retryAfterMs(response.headers.get("retry-after"), now) };
  }
  const body = await response.text();
  if (body.length > 500_000) return { kind: "unavailable", reason: "page too large" };
  return parseSourcePage(sourceKey, body);
}

/** Push copy names the source, never the content, and links to the Alert. */
export function officialAlertPushPayload(sourceKey: string, alertId: string, allClear: boolean) {
  const info = sourceInfo(sourceKey);
  if (!info) return null;
  return {
    title: "OwlSide · Official Alert",
    body: allClear ? info.pushAllClear : info.pushNew,
    href: `/safety/alerts/${alertId}`,
    tag: `owlside-official-alert-${alertId}`,
  };
}
