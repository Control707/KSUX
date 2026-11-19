"use client";

import React from "react";

/** Shared Direction C styles for Study, Dining, Events, Clubs and Course Hubs. */
export const ui = {
  page: "space-y-[var(--sp-4)] p-[var(--sp-4)]",
  card: "min-w-0 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] [overflow-wrap:anywhere]",
  subCard: "min-w-0 rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--sp-3)] [overflow-wrap:anywhere]",
  h1: "font-display text-[length:var(--fs-2xl)] font-bold leading-tight",
  h2: "font-display text-[length:var(--fs-xl)] font-bold leading-tight",
  h3: "font-display text-[length:var(--fs-lg)] font-bold leading-tight",
  muted: "text-sm text-[var(--muted)]",
  label: "block text-sm font-bold text-[var(--ink)]",
  input:
    "mt-[var(--sp-1)] block min-h-[var(--target)] w-full min-w-0 rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-body text-[var(--ink)]",
  primary:
    "inline-flex min-h-[var(--target)] min-w-[var(--target)] max-w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--accent)] px-[var(--sp-4)] text-sm font-bold text-[var(--on-accent)] disabled:opacity-60",
  strong:
    "inline-flex min-h-[var(--target)] min-w-[var(--target)] max-w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] bg-[var(--ink)] px-[var(--sp-4)] text-sm font-bold text-[var(--bg)] disabled:opacity-60",
  secondary:
    "inline-flex min-h-[var(--target)] min-w-[var(--target)] max-w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-3)] text-sm font-bold text-[var(--ink)] hover:bg-[var(--surface-2)] disabled:opacity-60",
  danger:
    "inline-flex min-h-[var(--target)] min-w-[var(--target)] max-w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--bad-fg)] bg-[var(--surface)] px-[var(--sp-3)] text-sm font-bold text-[var(--bad-fg)] hover:bg-[var(--bad-bg)]",
  link: "inline-flex min-h-[var(--target)] max-w-full items-center gap-[var(--sp-1)] font-bold text-[var(--ink)] underline",
  row: "flex min-w-0 flex-wrap items-center gap-[var(--sp-2)]",
  checkRow: "flex min-h-[var(--target)] min-w-0 cursor-pointer items-center gap-[var(--sp-2)] text-sm",
  checkbox: "h-5 w-5 shrink-0 accent-[var(--ink)]",
} as const;

/** Toggle button style with a pressed state that also shows a ✓ glyph. */
export function toggleClass(pressed: boolean) {
  return pressed
    ? "inline-flex min-h-[var(--target)] min-w-[var(--target)] max-w-full items-center justify-center gap-[var(--sp-2)] rounded-[var(--r-sm)] border border-[var(--ink)] bg-[var(--ink)] px-[var(--sp-3)] text-sm font-bold text-[var(--bg)]"
    : ui.secondary;
}

export type Tone = "ok" | "warn" | "bad" | "neutral" | "info";

const TONES: Record<Tone, { fg: string; bg: string; border: string }> = {
  ok: { fg: "var(--ok-fg)", bg: "var(--ok-bg)", border: "var(--ok-fg)" },
  warn: { fg: "var(--warn-fg)", bg: "var(--warn-bg)", border: "var(--warn-fg)" },
  bad: { fg: "var(--bad-fg)", bg: "var(--bad-bg)", border: "var(--bad-fg)" },
  info: { fg: "var(--mar-fg)", bg: "var(--mar-bg)", border: "var(--mar-fg)" },
  neutral: { fg: "var(--muted)", bg: "var(--surface-2)", border: "var(--line-strong)" },
};

/** Glyph + word chip. The glyph and word carry the meaning; colour only reinforces it. */
export function StateChip({
  tone,
  glyph,
  children,
  testId,
  dashed = false,
}: {
  tone: Tone;
  glyph: string;
  children: React.ReactNode;
  testId?: string;
  dashed?: boolean;
}) {
  const t = TONES[tone];
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={`inline-flex max-w-full items-center gap-[var(--sp-1)] rounded-full border px-[var(--sp-2)] text-sm font-bold [overflow-wrap:anywhere] ${dashed ? "border-dashed" : ""}`}
      style={{ color: t.fg, backgroundColor: t.bg, borderColor: t.border }}
    >
      <span aria-hidden="true">{glyph}</span>
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/** Text appended to links that open a new tab. */
export function NewTab() {
  return <span className="sr-only"> (opens in a new tab)</span>;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") {
      return (data as { message: string }).message;
    }
    if (typeof data === "string") return data;
    if (err instanceof Error && err.message) return err.message;
  }
  return fallback;
}
