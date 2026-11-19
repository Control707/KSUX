"use client";

import React, { useState } from "react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useViewerMutation, useViewerQuery } from "@/lib/viewerClient";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge, SegmentedControl } from "@/components/a11y/controls";

type Filter = "all" | "posts" | "listings";

const card = "flex flex-wrap items-start justify-between gap-[var(--sp-2)] rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-3)]";
const action = "inline-flex min-h-[var(--target)] items-center rounded-[var(--r-pill)] border border-[var(--line-strong)] px-[var(--sp-3)] text-sm font-bold hover:border-[var(--ink)]";

function priceLabel(item: { pricingMode?: string; priceCents?: number }) {
  if (item.pricingMode === "free_pickup") return "Free";
  if (item.pricingMode === "open_to_trade") return "Trade";
  return `$${((item.priceCents ?? 0) / 100).toFixed(0)} OBO`;
}

/** Private saved Posts and Listings (#77). Only the viewer ever sees this list. */
export function SavedView() {
  const { toast } = useAnnouncer();
  const [filter, setFilter] = useState<Filter>("all");
  const items = useViewerQuery(api.search.listSavedItems, { type: filter });
  const remove = useViewerMutation(api.search.removeSavedItem);

  const onRemove = async (savedId: Id<"savedInteractions">, label: string) => {
    try {
      await remove({ savedId });
      toast({ message: `Removed ${label} from Saved.`, tone: "success" });
    } catch (err: any) {
      toast({ message: err?.data?.message || err?.message || "Couldn’t remove that item.", tone: "error" });
    }
  };

  const noun = filter === "posts" ? "Posts" : filter === "listings" ? "Listings" : "Posts or Listings";

  return (
    <div className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <h1 data-route-heading="" tabIndex={-1} className="font-display text-[length:var(--fs-2xl)] font-bold">Saved</h1>
      <p className="text-sm text-[var(--muted)]">Only you can see what you save. Use the bookmark button in Feed or Marketplace to add more.</p>
      <SegmentedControl<Filter>
        label="Show"
        hideLabel={false}
        testIdPrefix="saved-filter"
        options={[{ value: "all", label: "All" }, { value: "posts", label: "Posts" }, { value: "listings", label: "Listings" }]}
        value={filter}
        onChange={setFilter}
      />
      {items === undefined ? (
        <p role="status" className="text-sm text-[var(--muted)]">Loading saved items…</p>
      ) : items.length === 0 ? (
        <p role="status" data-testid="saved-empty" className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)]">
          No saved {noun} yet.
        </p>
      ) : (
        <ul data-testid="saved-list" className="space-y-[var(--sp-2)]" aria-label={`Saved ${noun}`}>
          {items.map((item) => {
            const kindLabel = item.kind === "post" ? "Post" : "Listing";
            let body: React.ReactNode;
            let label: string;
            if (item.kind === "post" && item.available) {
              label = `Post by @${item.authorHandle}`;
              body = (
                <Link href={`/feed?post=${item.rootPostId}`} className="block min-h-[var(--target)] min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block text-sm font-bold">Post · {item.authorDisplayName} <span className="font-normal text-[var(--muted)]">@{item.authorHandle}</span> <CampusBadge campus={item.campus} /></span>
                  <span className="mt-[var(--sp-1)] line-clamp-3 block">{item.body}</span>
                </Link>
              );
            } else if (item.kind === "listing" && "title" in item && item.title) {
              label = item.title;
              body = (
                <Link href={`/marketplace?q=${encodeURIComponent(item.title)}`} className="block min-h-[var(--target)] min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <span className="block text-sm font-bold">Listing · {priceLabel(item)} {item.campus && <CampusBadge campus={item.campus} />}</span>
                  <span className="mt-[var(--sp-1)] block font-bold">{item.title}</span>
                  {!item.available && <span className="block text-sm text-[var(--muted)]">This Listing has ended.</span>}
                </Link>
              );
            } else {
              label = `unavailable ${kindLabel}`;
              body = (
                <p className="min-w-0 flex-1 text-[var(--muted)]">
                  <span className="block text-sm font-bold">{kindLabel}</span>
                  This {kindLabel} is no longer available.
                </p>
              );
            }
            return (
              <li key={item.savedId} data-testid="saved-item" className={card}>
                {body}
                <button type="button" className={action} onClick={() => void onRemove(item.savedId, label)}>
                  Remove<span className="sr-only"> {label} from Saved</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
