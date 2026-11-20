import { ConvexError } from "convex/values";
import { sha256Hex } from "./crypto";

const BROWSER_SESSION_MS = 15 * 60_000;
const encoder = new TextEncoder();

function serverSecret() {
  const secret = process.env.OWLSIDE_SERVER_SECRET;
  if (!secret) {
    throw new ConvexError({ code: "SERVICE_UNAVAILABLE", message: "The server credential is not configured." });
  }
  return secret;
}

function signingKey() {
  return crypto.subtle.importKey("raw", encoder.encode(serverSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function requireServerSecret(candidate: string) {
  const [actual, expected] = await Promise.all([sha256Hex(candidate), sha256Hex(serverSecret())]);
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  if (mismatch !== 0) {
    throw new ConvexError({ code: "FORBIDDEN", message: "This operation requires the OwlSide server." });
  }
}

export async function mintBrowserCredential(tokenHash: string, sessionExpiresAt: number, now: number) {
  const expiresAt = Math.min(sessionExpiresAt, now + BROWSER_SESSION_MS);
  const payload = `b1.${tokenHash}.${expiresAt}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(payload));
  const hex = Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { browserCredential: `${payload}.${hex}`, expiresAt };
}

export async function resolveStudentSessionHash(token: string, now: number) {
  if (!token.startsWith("b1.")) return sha256Hex(token);
  const parts = /^b1\.([0-9a-f]{64})\.(\d{1,16})\.([0-9a-f]{64})$/.exec(token);
  if (!parts) return null;
  const [, tokenHash, rawExpiry, signature] = parts;
  const expiresAt = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + BROWSER_SESSION_MS) return null;
  const bytes = Uint8Array.from(signature.match(/../g)!, (byte) => Number.parseInt(byte, 16));
  const verified = await crypto.subtle.verify("HMAC", await signingKey(), bytes, encoder.encode(`b1.${tokenHash}.${rawExpiry}`));
  return verified ? tokenHash : null;
}
