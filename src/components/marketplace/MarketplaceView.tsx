"use client";

import React, { useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  Bookmark,
  ImagePlus,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import {
  useViewerClient,
  useViewerMutation,
  useViewerQuery,
} from "@/lib/viewerClient";
import { ReportTrigger } from "@/components/shared/ReportTrigger";
import { Dialog } from "@/components/a11y/Dialog";
import { useAnnouncer } from "@/components/a11y/Announcer";
import { CampusBadge, SegmentedControl } from "@/components/a11y/controls";
import { BTN_ACCENT, BTN_PRIMARY, BTN_SECONDARY, FIELD, LABEL } from "./styles";

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "textbooks_gear", label: "Textbooks & Course Gear" },
  { value: "electronics", label: "Electronics" },
  { value: "dorm_furniture", label: "Dorm & Furniture" },
  { value: "subleases_housing", label: "Subleases & Housing" },
  { value: "services_tutoring", label: "Campus Services & Tutoring" },
] as const;

type Campus = "Kennesaw" | "Marietta";
type BrowseCampus = "All KSU" | Campus;

function priceLabel(item: { pricingMode: string; priceCents?: number | null }) {
  if (item.pricingMode === "free_pickup") return "Free Pickup";
  if (item.pricingMode === "open_to_trade") return "Open to Trade";
  return `$${((item.priceCents ?? 0) / 100).toFixed(0)} OBO`;
}

export function MarketplaceView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useAnnouncer();
  const ids = {
    search: useId(),
    category: useId(),
    pricing: useId(),
    title: useId(),
    newCategory: useId(),
    campus: useId(),
    pricingMode: useId(),
    price: useId(),
    trade: useId(),
    description: useId(),
    photo: useId(),
    error: useId(),
  };
  const {
    uploadImage,
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();

  const summary = useViewerQuery(api.shell.shellSummary, {});
  const homeCampus: Campus = summary?.viewer.student?.homeCampus === "Marietta" ? "Marietta" : "Kennesaw";
  const otherCampus: Campus = homeCampus === "Kennesaw" ? "Marietta" : "Kennesaw";

  const [category, setCategory] = useState<string>("");
  const [pricingModeFilter, setPricingModeFilter] = useState<string>("");
  const [queryText, setQueryText] = useState(() => searchParams.get("q")?.slice(0, 100) ?? "");
  const [onlyMine, setOnlyMine] = useState(false);
  const [browseCampus, setBrowseCampus] = useState<BrowseCampus>("All KSU");

  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [campus, setCampus] = useState<Campus | null>(null);
  const [newCategory, setNewCategory] = useState<any>("textbooks_gear");
  const [newPricingMode, setNewPricingMode] = useState<"fixed_obo" | "free_pickup" | "open_to_trade">("fixed_obo");
  const [priceDollars, setPriceDollars] = useState("45");
  const [tradeNote, setTradeNote] = useState("");
  const [mediaItems, setMediaItems] = useState<Array<{ mediaAssetId: Id<"mediaAssets">; url: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const listingCampus = campus ?? homeCampus;

  useEffect(() => {
    if (quickComposerKind === "listing") {
      setCreateOpen(true);
      setQuickComposerKind(null);
    }
  }, [quickComposerKind, setQuickComposerKind]);

  useEffect(() => {
    if (pendingDraftCard && pendingDraftCard.draftKind === "listing") {
      try {
        const parsed = JSON.parse(pendingDraftCard.payloadJson) as {
          title?: string;
          description?: string;
          priceDollars?: number;
        };
        if (parsed.title) setTitle(parsed.title);
        if (parsed.description) setDescription(parsed.description);
        setPriceDollars(parsed.priceDollars === undefined ? "" : String(parsed.priceDollars));
      } catch {
        setTitle(pendingDraftCard.title);
        setDescription(pendingDraftCard.summary);
      }
      setCreateOpen(true);
      setPendingDraftCard(null);
    }
  }, [pendingDraftCard, setPendingDraftCard]);

  const listings = useViewerQuery(api.marketplace.listListings, {
    campusOverride: browseCampus,
    category: (category || undefined) as any,
    pricingMode: (pricingModeFilter || undefined) as any,
    queryText: queryText || undefined,
    onlyMine,
  });

  const createListing = useViewerMutation(api.marketplace.createListing);
  const renewListing = useViewerMutation(api.marketplace.renewListing);
  const toggleBookmark = useViewerMutation(api.marketplace.toggleListingBookmark);
  const openDealChat = useViewerMutation(api.marketplace.openOrResumeDealChat);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || mediaItems.length >= 4) return;
    setError(null);
    try {
      const uploaded = await uploadImage(file, "listing");
      setMediaItems((prev) => [...prev, { mediaAssetId: uploaded.mediaAssetId, url: uploaded.url }]);
    } catch (err: any) {
      setError(err?.message || "Photo upload failed.");
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPricingMode === "fixed_obo" && !priceDollars.trim()) {
      setError("Enter a price before publishing.");
      return;
    }
    try {
      await createListing({
        title,
        description,
        campus: listingCampus,
        category: newCategory,
        pricingMode: newPricingMode,
        priceCents: newPricingMode === "fixed_obo" ? Math.round(Number(priceDollars) * 100) : undefined,
        tradeNote: newPricingMode === "open_to_trade" ? tradeNote : undefined,
        mediaAssetIds: mediaItems.map((m) => m.mediaAssetId),
      });
      setTitle("");
      setDescription("");
      setMediaItems([]);
      setCreateOpen(false);
      toast({ message: "Listing published", detail: title, tone: "success" });
    } catch (err: any) {
      setError(err?.data?.message || err?.message || "Could not publish Listing.");
    }
  };

  const campusOptions = [
    { value: "All KSU" as const, label: "All KSU" },
    { value: homeCampus, label: `${homeCampus} (home)` },
    { value: otherCampus, label: otherCampus },
  ];

  return (
    <div data-testid="marketplace-view" className="space-y-[var(--sp-4)] p-[var(--sp-4)]">
      <section aria-labelledby="marketplace-heading" className="space-y-[var(--sp-3)]">
        <div className="flex flex-wrap items-end justify-between gap-[var(--sp-3)]">
          <div className="min-w-0 space-y-[var(--sp-1)]">
            <h1
              id="marketplace-heading"
              data-route-heading=""
              tabIndex={-1}
              className="font-display text-2xl font-bold"
            >
              Marketplace
            </h1>
            <p className="text-sm text-[var(--muted)] [overflow-wrap:anywhere]">
              Student-to-student Listings across KSU. Every buyer gets their own Deal Chat. Meet at a public KSU Meetup
              Spot and pay in person; KSUX never holds money.
            </p>
          </div>
          <div className="flex flex-wrap gap-[var(--sp-2)]">
            <button
              type="button"
              aria-pressed={onlyMine}
              onClick={() => setOnlyMine((v) => !v)}
              className={onlyMine ? BTN_PRIMARY : BTN_SECONDARY}
            >
              {onlyMine && <span aria-hidden="true">✓</span>}
              My Listings
            </button>
            <button
              type="button"
              data-testid="open-create-listing-btn"
              onClick={() => setCreateOpen(true)}
              className={BTN_ACCENT}
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
              Sell something
            </button>
          </div>
        </div>

        <SegmentedControl
          label="Listing Campus"
          hideLabel={false}
          options={campusOptions}
          value={browseCampus}
          onChange={setBrowseCampus}
          testIdPrefix="marketplace-campus"
        />

        <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-3">
          <div className="min-w-0 sm:col-span-3">
            <label htmlFor={ids.search} className={LABEL}>
              Search Listings
            </label>
            <div className="relative mt-[var(--sp-1)]">
              <Search aria-hidden="true" className="pointer-events-none absolute left-[var(--sp-3)] top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                id={ids.search}
                type="search"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="Textbooks, calculators, dorm gear…"
                className={`${FIELD} pl-[calc(var(--sp-3)*2+1rem)]`}
              />
            </div>
          </div>
          <div className="min-w-0">
            <label htmlFor={ids.category} className={LABEL}>
              Category
            </label>
            <select id={ids.category} value={category} onChange={(e) => setCategory(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={ids.pricing} className={LABEL}>
              Pricing
            </label>
            <select id={ids.pricing} value={pricingModeFilter} onChange={(e) => setPricingModeFilter(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`}>
              <option value="">All pricing</option>
              <option value="fixed_obo">Price / OBO</option>
              <option value="free_pickup">Free Pickup</option>
              <option value="open_to_trade">Open to Trade</option>
            </select>
          </div>
        </div>
      </section>

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Sell something"
        description="Your Listing is visible to verified KSU students. Meet in person at a KSU Meetup Spot."
        variant="sheet"
        testId="create-listing-dialog"
      >
        <form onSubmit={handleCreateListing} className="space-y-[var(--sp-3)]" aria-describedby={error ? ids.error : undefined}>
          <div>
            <label htmlFor={ids.title} className={LABEL}>
              Title
            </label>
            <input
              id={ids.title}
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CLRS 4th Edition textbook"
              className={`${FIELD} mt-[var(--sp-1)]`}
            />
          </div>
          <div className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={ids.newCategory} className={LABEL}>
                Category
              </label>
              <select id={ids.newCategory} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={`${FIELD} mt-[var(--sp-1)]`}>
                {CATEGORIES.slice(1).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.campus} className={LABEL}>
                Campus
              </label>
              <select
                id={ids.campus}
                value={listingCampus}
                onChange={(e) => setCampus(e.target.value === "Marietta" ? "Marietta" : "Kennesaw")}
                className={`${FIELD} mt-[var(--sp-1)]`}
              >
                <option value={homeCampus}>{homeCampus} (home)</option>
                <option value={otherCampus}>{otherCampus}</option>
              </select>
            </div>
            <div className="min-w-0">
              <label htmlFor={ids.pricingMode} className={LABEL}>
                Pricing
              </label>
              <select
                id={ids.pricingMode}
                value={newPricingMode}
                onChange={(e) => setNewPricingMode(e.target.value as any)}
                className={`${FIELD} mt-[var(--sp-1)]`}
              >
                <option value="fixed_obo">Price / OBO</option>
                <option value="free_pickup">Free Pickup</option>
                <option value="open_to_trade">Open to Trade</option>
              </select>
            </div>
            {newPricingMode === "fixed_obo" && (
              <div className="min-w-0">
                <label htmlFor={ids.price} className={LABEL}>
                  Price in dollars
                </label>
                <input
                  id={ids.price}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  required
                  value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)}
                  className={`${FIELD} mt-[var(--sp-1)]`}
                />
              </div>
            )}
            {newPricingMode === "open_to_trade" && (
              <div className="min-w-0">
                <label htmlFor={ids.trade} className={LABEL}>
                  What would you trade for?
                </label>
                <input
                  id={ids.trade}
                  type="text"
                  value={tradeNote}
                  onChange={(e) => setTradeNote(e.target.value)}
                  className={`${FIELD} mt-[var(--sp-1)]`}
                />
              </div>
            )}
          </div>
          <div>
            <label htmlFor={ids.description} className={LABEL}>
              Description
            </label>
            <textarea
              id={ids.description}
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition, course code, preferred KSU Meetup Spot…"
              className={`${FIELD} mt-[var(--sp-1)] py-[var(--sp-2)]`}
            />
          </div>

          {mediaItems.length > 0 && (
            <ul aria-label="Photos added" className="flex flex-wrap gap-[var(--sp-2)]">
              {mediaItems.map((m, idx) => (
                <li key={String(m.mediaAssetId)} className="flex items-center gap-[var(--sp-1)]">
                  <img src={m.url} alt={`Photo ${idx + 1}`} className="h-14 w-14 rounded-[var(--r-sm)] object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${idx + 1}`}
                    onClick={() => setMediaItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="min-target inline-flex items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-2)]"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p id={ids.error} role="alert" className="rounded-[var(--r-sm)] bg-[var(--bad-bg)] px-[var(--sp-3)] py-[var(--sp-2)] text-sm font-bold text-[var(--bad-fg)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-[var(--sp-2)]">
            <label
              htmlFor={ids.photo}
              className={`${BTN_SECONDARY} cursor-pointer focus-within:outline focus-within:outline-[length:var(--focus-w)] focus-within:outline-[var(--focus)]`}
            >
              <ImagePlus aria-hidden="true" className="h-4 w-4" />
              Add photo ({mediaItems.length} of 4)
              <input
                id={ids.photo}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={mediaItems.length >= 4}
                onChange={handlePhotoUpload}
                className="sr-only"
              />
            </label>
            <button type="submit" data-testid="publish-listing-btn" className={BTN_PRIMARY}>
              Publish Listing
            </button>
          </div>
        </form>
      </Dialog>

      <section aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="sr-only">
          Listings
        </h2>
        {listings === undefined ? (
          <p role="status" className="text-sm text-[var(--muted)]">
            Loading Listings…
          </p>
        ) : listings.length === 0 ? (
          <p data-testid="marketplace-empty" className="rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] p-[var(--sp-4)] text-body">
            No Listings match these filters yet.
          </p>
        ) : (
          <ul data-testid="marketplace-listings" className="lt-grid-1 grid grid-cols-1 gap-[var(--sp-3)] md:grid-cols-2">
            {listings.map((item) => (
              <li
                key={String(item._id)}
                data-testid="marketplace-listing-card"
                className="flex min-w-0 flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)]"
              >
                {item.mediaUrls[0] ? (
                  <img src={item.mediaUrls[0]} alt={`Photo of ${item.title}`} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div aria-hidden="true" className="flex aspect-[4/3] w-full items-center justify-center bg-[var(--surface-2)] text-[var(--muted)]">
                    <ShoppingBag className="h-10 w-10" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-[var(--sp-2)] p-[var(--sp-4)]">
                  <div className="flex min-w-0 items-start justify-between gap-[var(--sp-2)]">
                    <h3 className="min-w-0 font-display text-lg font-bold">{item.title}</h3>
                    <button
                      type="button"
                      aria-pressed={Boolean(item.bookmarkedByViewer)}
                      aria-label={`Save ${item.title}`}
                      onClick={() => void toggleBookmark({ listingId: item._id })}
                      className="min-target -mr-[var(--sp-2)] -mt-[var(--sp-2)] inline-flex shrink-0 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--surface-2)]"
                    >
                      <Bookmark aria-hidden="true" className="h-5 w-5" fill={item.bookmarkedByViewer ? "currentColor" : "none"} />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
                    <span className="font-display text-lg font-bold">{priceLabel(item)}</span>
                    <CampusBadge campus={item.campus} />
                    {item.status !== "available" && (
                      <span className="inline-flex items-center gap-[var(--sp-1)] rounded-full bg-[var(--warn-bg)] px-[var(--sp-2)] text-sm font-bold text-[var(--warn-fg)]">
                        <span aria-hidden="true">◐</span>
                        {item.status === "sold" ? "Sold" : item.status === "pending" ? "Pending" : item.status === "expired" ? "Expired" : item.status}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-3 text-sm text-[var(--ink)] [overflow-wrap:anywhere]">{item.description}</p>
                  {item.tradeNote && (
                    <p className="text-sm text-[var(--muted)] [overflow-wrap:anywhere]">Trade for: {item.tradeNote}</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-[var(--sp-2)] border-t border-[var(--line)] pt-[var(--sp-2)]">
                    <Link
                      href={`/profile?handle=${item.seller.handle}`}
                      className="inline-flex min-h-[var(--target)] min-w-0 items-center gap-[var(--sp-1)] text-sm font-bold underline-offset-2 hover:underline"
                    >
                      @{item.seller.handle}
                      <span className="inline-flex items-center gap-[var(--sp-1)] text-[var(--muted)]">
                        <Award aria-hidden="true" className="h-4 w-4" />
                        {item.seller.completedDealCount} completed {item.seller.completedDealCount === 1 ? "deal" : "deals"}
                      </span>
                    </Link>
                    {item.isOwnListing ? (
                      <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
                        {item.status === "expired" && (
                          <button type="button" onClick={() => void renewListing({ listingId: item._id })} className={BTN_ACCENT}>
                            <RotateCcw aria-hidden="true" className="h-4 w-4" />
                            Renew for 30 days
                          </button>
                        )}
                        <Link href="/chats" className={BTN_SECONDARY}>
                          Buyer Deal Chats
                        </Link>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
                        <ReportTrigger
                          targetType="listing"
                          targetId={String(item._id)}
                          targetLabel={item.title}
                          onSubmitReport={async (p) => {
                            await submitReport(p);
                          }}
                        />
                        <button
                          type="button"
                          data-testid="message-seller-btn"
                          onClick={async () => {
                            const res = await openDealChat({ listingId: item._id });
                            router.push(`/chats/${res.chatId}`);
                          }}
                          className={BTN_PRIMARY}
                        >
                          <MessageSquare aria-hidden="true" className="h-4 w-4" />
                          {item.myDealChatId ? "Open Deal Chat" : "Message Seller"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
