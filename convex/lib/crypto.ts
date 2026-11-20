export const RESERVED_HANDLES = new Set([
  "scrappy",
  "ksu",
  "kennesaw",
  "marietta",
  "admin",
  "mod",
  "moderator",
  "police",
  "ksupd",
  "owllife",
  "support",
  "system",
  "official",
  "maya_cs",
  "jordan_me",
  "alex_owl",
  "sam_cpe",
  "taylor_bio",
  "removed",
]);

export const DEMO_PERSONA_HANDLES = [
  "maya_cs",
  "jordan_me",
  "alex_owl",
  "sam_cpe",
] as const;

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomHex(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomNumericOtp(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const num = arr[0]! % 1_000_000;
  return num.toString().padStart(6, "0");
}

export function randomShortCode(length = 8): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export type CanonicalEmailResult =
  | {
      ok: true;
      canonicalEmail: string;
      emailDomainBadge: "verified_student" | "faculty_staff";
    }
  | {
      ok: false;
      error: string;
    };

export function canonicalizeKsuEmail(rawEmail: string): CanonicalEmailResult {
  const trimmed = rawEmail.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0 || trimmed.indexOf("@") !== atIndex) {
    return {
      ok: false,
      error: "Enter a valid @students.kennesaw.edu or @kennesaw.edu email.",
    };
  }
  const rawLocal = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (domain !== "students.kennesaw.edu" && domain !== "kennesaw.edu") {
    return {
      ok: false,
      error:
        "Only @students.kennesaw.edu and @kennesaw.edu addresses can sign in.",
    };
  }

  const plusIdx = rawLocal.indexOf("+");
  const baseLocal = plusIdx >= 0 ? rawLocal.slice(0, plusIdx) : rawLocal;
  if (!baseLocal || !/^[a-z0-9._-]+$/.test(baseLocal)) {
    return {
      ok: false,
      error: "Enter a valid KSU .edu email local address.",
    };
  }

  return {
    ok: true,
    canonicalEmail: `${baseLocal}@${domain}`,
    emailDomainBadge:
      domain === "students.kennesaw.edu" ? "verified_student" : "faculty_staff",
  };
}

export function normalizeHandleInput(raw: string): {
  handle: string;
  handleLower: string;
} {
  const cleaned = raw.trim().replace(/^@+/, "");
  return {
    handle: cleaned.toLowerCase(),
    handleLower: cleaned.toLowerCase(),
  };
}

export function validateHandleRules(
  raw: string,
  options: { allowDemoPersonas?: boolean } = {}
): { ok: true; handle: string; handleLower: string } | { ok: false; error: string } {
  const { handle, handleLower } = normalizeHandleInput(raw);
  if (!/^[a-z0-9_]{3,20}$/.test(handleLower)) {
    return {
      ok: false,
      error: "Handle must be 3–20 lowercase letters, numbers, or underscores.",
    };
  }
  if (!options.allowDemoPersonas && RESERVED_HANDLES.has(handleLower)) {
    return {
      ok: false,
      error: `@${handleLower} is reserved on OwlSide.`,
    };
  }
  return { ok: true, handle, handleLower };
}

export function makeStudentPairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
