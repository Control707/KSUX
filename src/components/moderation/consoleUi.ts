export const modButton = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)]";
export const modField = "mt-1 block min-h-11 w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] p-2 text-[var(--ink)]";
export const modCard = "min-w-0 space-y-3 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] p-4";
export const modDate = (ms: number) => new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short", timeZone: "America/New_York" }).format(ms) + " ET";
export const modAge = (ms: number, now = Date.now()) => { const minutes = Math.max(0, Math.floor((now - ms) / 60_000)); return minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} hr` : `${Math.floor(minutes / 1440)} d`; };
export type ModerationAction = "restore" | "dismiss" | "remove" | "redact" | "note" | "suspend";
export const actionLabels: Record<ModerationAction, string> = { restore: "Restore", dismiss: "Dismiss reports", remove: "Remove", redact: "Redact", note: "Add note", suspend: "Suspend author" };
