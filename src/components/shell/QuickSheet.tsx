"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Dialog } from "@/components/a11y/Dialog";
import { useViewerClient } from "@/lib/viewerClient";
import { QUICK_SHEET_CHIPS } from "./navigation";

type ComposerKind = "post" | "parking_report" | "listing" | "study_session";

const CREATE_TILES: { label: string; kind: ComposerKind; href: string }[] = [
  { label: "Post", kind: "post", href: "/feed?compose=1" },
  { label: "Parking Report", kind: "parking_report", href: "/parking?report=1" },
  { label: "Listing", kind: "listing", href: "/marketplace?create=1" },
  { label: "Study Session", kind: "study_session", href: "/study?host=1" },
];

/** Quick Sheet (SPEC-v2 §3): Ask field, four create tiles, chips for every destination. */
export function QuickSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { setQuickComposerKind } = useViewerClient();
  const [question, setQuestion] = useState("");

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Ask Scrappy or jump anywhere" variant="sheet" testId="quick-sheet-overlay" closeLabel="Close Quick Sheet">
      <form
        role="search"
        aria-label="Ask Scrappy"
        onSubmit={(event) => {
          event.preventDefault();
          const q = question.trim();
          setQuestion("");
          go(q ? `/scrappy?q=${encodeURIComponent(q)}` : "/scrappy");
        }}
        className="flex gap-[var(--sp-2)]"
      >
        <label htmlFor="quick-sheet-ask" className="sr-only">
          Ask Scrappy about Kennesaw or Marietta
        </label>
        <input
          id="quick-sheet-ask"
          data-testid="quick-sheet-ask-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask Scrappy about campus…"
          autoComplete="off"
          className="min-h-[var(--target)] min-w-0 flex-1 rounded-[var(--r-pill)] border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--sp-4)] text-[length:var(--fs-body)] text-[var(--ink)]"
        />
        <button
          type="submit"
          aria-label="Ask"
          className="min-target inline-flex items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]"
        >
          <Send aria-hidden="true" className="h-5 w-5" />
        </button>
      </form>

      <h3 className="mt-[var(--sp-4)] text-sm font-bold text-[var(--muted)]">Make something</h3>
      <div className="lt-grid-1 mt-[var(--sp-2)] grid grid-cols-2 gap-[var(--sp-2)] sm:grid-cols-4">
        {CREATE_TILES.map((tile) => (
          <button
            key={tile.kind}
            type="button"
            data-testid={`quick-create-${tile.kind}`}
            onClick={() => {
              setQuickComposerKind(tile.kind);
              go(tile.href);
            }}
            className="min-h-[var(--target)] rounded-[var(--r-md)] border border-[var(--line-strong)] bg-[var(--accent-soft)] px-[var(--sp-3)] py-[var(--sp-2)] text-left text-sm font-bold text-[var(--ink)] hover:border-[var(--ink)]"
          >
            <span aria-hidden="true">+ </span>
            {tile.label}
          </button>
        ))}
      </div>

      <nav aria-label="All destinations" className="mt-[var(--sp-4)]">
        <h3 className="text-sm font-bold text-[var(--muted)]">Go to</h3>
        <ul className="mt-[var(--sp-2)] flex flex-wrap gap-[var(--sp-2)]">
          {QUICK_SHEET_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <li key={chip.href}>
                <Link
                  href={chip.href}
                  onClick={onClose}
                  className="inline-flex min-h-[var(--target)] items-center gap-[var(--sp-2)] rounded-[var(--r-pill)] border border-[var(--line)] bg-[var(--surface-2)] px-[var(--sp-3)] text-sm font-bold text-[var(--ink)] hover:border-[var(--ink)]"
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </Dialog>
  );
}
