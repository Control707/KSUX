import { ConvexError } from "convex/values";

const SLUR_PATTERNS = [
  /\bn+[i1l]+g+[ge3]+r+s?\b/i,
  /\bf+[a@]+g+g?[o0]+t+s?\b/i,
  /\bk+[i1]+k+e+s?\b/i,
  /\br+e+t+a+r+d+(?:ed|s)?\b/i,
  /\bkill\s+yourself\b/i,
];

const DOXXING_SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const DOXXING_PHONE_REGEX =
  /(?:dox|call\s+them\s+at|their\s+number\s+is|leak)[^0-9]{0,20}(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}|\b(?:\+?1[-.\s])?\(\d{3}\)\s?\d{3}-\d{4}\b/i;
const DOXXING_STREET_ADDRESS_REGEX =
  /\b(?:lives\s+at|home\s+address\s*:?|doxx?\s*:?)\s*\d{2,5}\s+[a-z0-9.\s]{3,35}\b(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|blvd|apt)\b/i;

const PROHIBITED_LISTING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern:
      /\b(?:firearm|handgun|glock|ar-?15|rifle|shotgun|ammunition|ammo|switchblade|brass\s+knuckles)\b/i,
    label: "weapons or ammunition",
  },
  {
    pattern:
      /\b(?:weed|marijuana|thc|edibles|adderall|xanax|vyvanse|cocaine|fentanyl|juul|elf\s*bar|geek\s*bar|vape\s*pen|disposable\s*vape|fake\s*id|handles\s+of\s+vodka|alcohol\s+for\s+sale)\b/i,
    label: "alcohol, tobacco/vapes, or controlled substances",
  },
  {
    pattern:
      /\b(?:write\s+your\s+essay|take\s+your\s+(?:exam|quiz|midterm|final)|chegg\s+unlock|do\s+your\s+homework\s+for\s+pay|guaranteed\s+a\s+on\s+your\s+final|academic\s+ghostwriting)\b/i,
    label: "academic dishonesty or exam/essay completion services",
  },
  {
    pattern:
      /\b(?:ksu\s+parking\s+(?:pass|permit|decal)|selling\s+(?:my\s+)?(?:central|east|west|shuttle|economy)\s+(?:deck\s+)?parking\s+permit|t2\s+parking\s+pass)\b/i,
    label: "KSU parking permits (non-transferable per KSU Parking & Transportation)",
  },
];

const OFF_PLATFORM_SCAM_REGEX =
  /\b(?:zelle|cash\s*app|cashapp|venmo|apple\s*pay\s+deposit|wire\s+transfer|western\s+union|hold\s+deposit|send\s+deposit)\b/i;

export function assertPublishSafety(
  text: string,
  opts: { isMarketplaceListing?: boolean } = {}
): void {
  for (const pattern of SLUR_PATTERNS) {
    if (pattern.test(text)) {
      throw new ConvexError({
        code: "SAFETY_REJECTED",
        message:
          "This content violates KSUX community safety standards (harassment or hate speech).",
      });
    }
  }

  if (
    DOXXING_SSN_REGEX.test(text) ||
    DOXXING_PHONE_REGEX.test(text) ||
    DOXXING_STREET_ADDRESS_REGEX.test(text)
  ) {
    throw new ConvexError({
      code: "SAFETY_REJECTED",
      message:
        "Sharing private phone numbers, SSNs, or personal street addresses (doxxing) is blocked on KSUX.",
    });
  }

  if (opts.isMarketplaceListing) {
    for (const item of PROHIBITED_LISTING_PATTERNS) {
      if (item.pattern.test(text)) {
        throw new ConvexError({
          code: "PROHIBITED_LISTING",
          message: `Prohibited Marketplace Listing: ${item.label} cannot be listed on KSUX.`,
        });
      }
    }
  }
}

export function detectDealScamWarning(body: string): boolean {
  return OFF_PLATFORM_SCAM_REGEX.test(body);
}

export function computePostHotScore(params: {
  likeCount: number;
  replyCount: number;
  repostCount: number;
  publishedAtMs: number;
}): number {
  const engagement = Math.max(
    params.likeCount + 2 * params.replyCount + 3 * params.repostCount,
    1
  );
  const createdAtSec = params.publishedAtMs / 1000;
  return Math.log10(engagement) + createdAtSec / 45000;
}

export function extractHashtags(body: string, explicitTags?: string[]): string[] {
  const found = new Set<string>();
  if (explicitTags) {
    for (const t of explicitTags) {
      const cleaned = t.trim().replace(/^#+/, "").toLowerCase();
      if (/^[a-z0-9_]{2,30}$/.test(cleaned)) {
        found.add(cleaned);
      }
      if (found.size >= 3) break;
    }
  }
  if (found.size < 3) {
    const matches = body.matchAll(/#([a-zA-Z0-9_]{2,30})/g);
    for (const m of matches) {
      found.add(m[1]!.toLowerCase());
      if (found.size >= 3) break;
    }
  }
  return Array.from(found).slice(0, 3);
}
