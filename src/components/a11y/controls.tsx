"use client";

import React, { useEffect, useId, useRef } from "react";

/** Segmented control (SPEC-v2 §2): buttons with aria-pressed inside a labelled group. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  testIdPrefix,
  hideLabel = true,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix?: string;
  hideLabel?: boolean;
}) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-[var(--sp-1)]">
      <span id={labelId} className={hideLabel ? "sr-only" : "text-sm font-bold text-[var(--muted)]"}>
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="lt-grid-1 grid gap-[var(--sp-1)] rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface-2)] p-[var(--sp-1)]"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const pressed = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={pressed}
              data-testid={testIdPrefix ? `${testIdPrefix}-${option.value.toLowerCase().replace(/\s+/g, "-")}` : undefined}
              onClick={() => onChange(option.value)}
              className={`min-h-[var(--target)] rounded-[var(--r-sm)] px-[var(--sp-3)] text-sm font-bold ${
                pressed
                  ? "bg-[var(--ink)] text-[var(--bg)]"
                  : "text-[var(--ink)] hover:bg-[var(--surface)]"
              }`}
            >
              {pressed && <span aria-hidden="true">✓ </span>}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type FullnessStatus = "open" | "filling" | "nearly" | "full" | "none";

export const FULLNESS: Record<FullnessStatus, { glyph: string; word: string; fg: string; bg: string; mark: string }> = {
  open: { glyph: "○", word: "Open", fg: "var(--open-fg)", bg: "var(--open-bg)", mark: "var(--open-mark)" },
  filling: { glyph: "◐", word: "Filling", fg: "var(--filling-fg)", bg: "var(--filling-bg)", mark: "var(--filling-mark)" },
  nearly: { glyph: "◕", word: "Nearly Full", fg: "var(--nearly-fg)", bg: "var(--nearly-bg)", mark: "var(--nearly-mark)" },
  full: { glyph: "●", word: "Full", fg: "var(--full-fg)", bg: "var(--full-bg)", mark: "var(--full-mark)" },
  none: { glyph: "◌", word: "No recent reports", fg: "var(--muted)", bg: "var(--surface-2)", mark: "var(--line-strong)" },
};

export function fullnessFromTier(tier: 0 | 1 | 2 | 3 | null | undefined): FullnessStatus {
  if (tier === 0) return "open";
  if (tier === 1) return "filling";
  if (tier === 2) return "nearly";
  if (tier === 3) return "full";
  return "none";
}

/** Status chip: glyph + word + fill pattern + colour, never colour alone. */
export function StatusChip({ status, testId }: { status: FullnessStatus; testId?: string }) {
  const s = FULLNESS[status];
  return (
    <span
      data-testid={testId}
      data-status={status}
      className={`inline-flex items-center gap-[var(--sp-1)] rounded-full border px-[var(--sp-2)] text-sm font-bold ${status === "none" ? "border-dashed" : ""}`}
      style={{ color: s.fg, backgroundColor: s.bg, borderColor: s.mark }}
    >
      <span aria-hidden="true">{s.glyph}</span>
      {s.word}
    </span>
  );
}

/** Fill bar using the same pattern as the map fill. */
export function FillBar({ status }: { status: FullnessStatus }) {
  const width = { open: "25%", filling: "50%", nearly: "75%", full: "100%", none: "100%" }[status];
  return (
    <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-full border border-[var(--line-strong)] bg-[var(--surface)]">
      <span className={`block h-full status-pattern-${status}`} style={{ width }} />
    </span>
  );
}

/** Text campus badge for KSU-wide screens. */
export function CampusBadge({ campus }: { campus: "Kennesaw" | "Marietta" }) {
  const isMarietta = campus === "Marietta";
  return (
    <span
      className="inline-flex items-center rounded-full px-[var(--sp-2)] text-sm font-bold"
      style={{
        color: isMarietta ? "var(--mar-fg)" : "var(--ken-fg)",
        backgroundColor: isMarietta ? "var(--mar-bg)" : "var(--ken-bg)",
      }}
    >
      {campus}
    </span>
  );
}

/**
 * Large-text mode (SPEC-v2 §2): at ≥150% root text on a phone, sets
 * html[data-large-text] so bar labels become names only and grids collapse.
 */
export function LargeTextMode() {
  const probe = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const el = probe.current;
    if (!el) return;
    const check = () => {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const large = rootPx >= 24 && window.innerWidth < 1024;
      document.documentElement.toggleAttribute("data-large-text", large);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    window.addEventListener("resize", check);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return <span ref={probe} aria-hidden="true" className="pointer-events-none fixed h-[1rem] w-[1rem] opacity-0" />;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
