import places from "./incidentPlaces.json";

export const INCIDENT_PLACES = places;
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const INCIDENT_CATEGORIES = {
  fire: { shape: "▲", label: "Fire, smoke or alarm", hint: "Smoke, flames or an alarm sounding" },
  hazard: { shape: "◆", label: "Hazard", hint: "An obstacle, spill or damaged walkway" },
  crash: { shape: "■", label: "Crash or road blocked", hint: "A collision or blocked road" },
  theft: { shape: "●", label: "Theft or break-in", hint: "Missing property or a break-in you observed" },
  damage: { shape: "✚", label: "Vandalism or damage", hint: "Damage to campus property" },
  outage: { shape: "⬢", label: "Power, water or building outage", hint: "A building service interruption" },
  area_closed: { shape: "▬", label: "Area closed", hint: "An area marked as closed" },
  other: { shape: "○", label: "Something else", hint: "Something you observed, without identifying people" },
} as const;
export type IncidentCategory = keyof typeof INCIDENT_CATEGORIES;
export const INCIDENT_REASONS = {
  identifies_me: "This post identifies me",
  identifies_person: "It identifies a person",
  false_misleading: "It’s false or misleading",
  harassment: "Harassment or hate",
  campus_safety: "Campus Safety: someone is in danger",
  scam_spam: "Something else",
} as const;
export const INCIDENT_NOTES: Record<string, string> = {
  redaction: "Identifying details removed",
  inaccurate: "Several Students reported this as inaccurate",
  official_notice: "An official notice exists",
  duplicate: "Possible duplicate",
  photo_rejected: "Photo not approved",
};
export const INCIDENT_REMOVE_REASONS: Record<string, string> = {
  identifies_person: "Identifies or targets a person",
  false_misleading: "False or misleading",
  not_incident: "Not a campus safety incident",
  harassment: "Harassment or hate",
  duplicate: "Duplicate",
};

// Deterministic blocks run in the form AND on every author write. These are
// deliberately conservative; they do not claim to detect all identifying text.
export function incidentTextError(value: string, max = 280): string | null {
  const text = value.normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  if (!text || value.length > max || text.length > max) return `Use 1–${max} characters.`;
  if (/@[\p{L}\p{N}_]+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu.test(text)
    || /\b(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/.test(text)
    || /\b(?:room|unit|apt|apartment|suite|dorm)\s*(?:number|no\.?|#)?\s*[a-z]?\d+\b/i.test(text)
    || /^#?\s*[a-z]?\d{1,5}[a-z]?$/i.test(text)
    || /(?:\b(?:plate|tag|license|licence)(?:\s+(?:number|plate|is))?\s*[:#-]?\s*[a-z0-9-]{3,}|\b(?=[A-Z0-9-]{5,9}\b)(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z0-9-]+\b)/i.test(text)
    || /\b(?:named|name is|called|suspect|victim|wearing|following|tracking)\b/i.test(text)
    || /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/.test(text)
    || /\b\d{3}-\d{2}-\d{4}\b/.test(text)) return "Remove names, handles, phone numbers, plates, room numbers and details identifying a person.";
  if (/\b(?:all[ -]clear|resolved|verified|confirmed|police\s+(?:are\s+)?on\s+(?:the\s+)?scene|(?:it[’']?s|it is|campus is|area is)\s+safe(?:\s+now)?)\b/i.test(text))
    return "Describe only what you saw. Don’t claim all clear, resolved, verified, confirmed, police on scene or safe now.";
  if (/\b(?:medical|overdose|unconscious|sexual|rape|assault|stalking|dating violence|suspicious person|person (?:seems|looks) suspicious)\b/i.test(text))
    return "KSUX doesn’t post medical emergencies, sexual misconduct, stalking or suspicions about people. Use emergency contacts, Title IX, KSU CPS or LiveSafe.";
  return null;
}

export function incidentAge(publishedAt: number, now: number) {
  const age = now - publishedAt;
  return age <= DAY ? "Active" as const : age <= 7 * DAY ? "Older" as const : "unavailable" as const;
}
