"use client";

import React, { useEffect, useState } from "react";
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

const CATEGORIES = [
  { value: "", label: "All Categories" },
  { value: "textbooks_gear", label: "Textbooks & Course Gear" },
  { value: "electronics", label: "Electronics" },
  { value: "dorm_furniture", label: "Dorm & Furniture" },
  { value: "subleases_housing", label: "Subleases & Housing" },
  { value: "services_tutoring", label: "Campus Services & Tutoring" },
] as const;

export function MarketplaceView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    uploadImage,
    pendingDraftCard,
    setPendingDraftCard,
    quickComposerKind,
    setQuickComposerKind,
  } = useViewerClient();

  const [category, setCategory] = useState<string>("");
  const [pricingModeFilter, setPricingModeFilter] = useState<string>("");
  const [queryText, setQueryText] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);

  const [createOpen, setCreateOpen] = useState(
    searchParams.get("create") === "1"
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [campus, setCampus] = useState<"Kennesaw" | "Marietta">("Kennesaw");
  const [newCategory, setNewCategory] = useState<any>("textbooks_gear");
  const [newPricingMode, setNewPricingMode] = useState<
    "fixed_obo" | "free_pickup" | "open_to_trade"
  >("fixed_obo");
  const [priceDollars, setPriceDollars] = useState("45");
  const [tradeNote, setTradeNote] = useState("");
  const [mediaItems, setMediaItems] = useState<
    Array<{ mediaAssetId: Id<"mediaAssets">; url: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

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
    category: (category || undefined) as any,
    pricingMode: (pricingModeFilter || undefined) as any,
    queryText: queryText || undefined,
    onlyMine,
  });

  const createListing = useViewerMutation(api.marketplace.createListing);
  const renewListing = useViewerMutation(api.marketplace.renewListing);
  const toggleBookmark = useViewerMutation(
    api.marketplace.toggleListingBookmark
  );
  const openDealChat = useViewerMutation(api.marketplace.openOrResumeDealChat);
  const submitReport = useViewerMutation(api.moderation.submitReport);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || mediaItems.length >= 4) return;
    setError(null);
    try {
      const uploaded = await uploadImage(file, "listing");
      setMediaItems((prev) => [
        ...prev,
        { mediaAssetId: uploaded.mediaAssetId, url: uploaded.url },
      ]);
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
        campus,
        category: newCategory,
        pricingMode: newPricingMode,
        priceCents:
          newPricingMode === "fixed_obo"
            ? Math.round(Number(priceDollars) * 100)
            : undefined,
        tradeNote: newPricingMode === "open_to_trade" ? tradeNote : undefined,
        mediaAssetIds: mediaItems.map((m) => m.mediaAssetId),
      });
      setTitle("");
      setDescription("");
      setMediaItems([]);
      setCreateOpen(false);
    } catch (err: any) {
      setError(
        err?.data?.message || err?.message || "Could not publish Listing."
      );
    }
  };

  return (
    <div data-testid="marketplace-view" className="space-y-4 p-4">
      <div className="rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-black text-[#111317]">
              KSU Student Marketplace
            </h1>
            <p className="text-xs text-[#5E6675]">
              Verified .edu peer-to-peer Listings · Isolated per-buyer Deal
              Chats · 14 vetted KSU Meetup Spots (zero in-app escrow).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOnlyMine((v) => !v)}
              className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                onlyMine
                  ? "border-[#111317] bg-[#111317] text-[#FDBB30]"
                  : "border-[#E4E7EE] bg-[#F4F6FA] text-[#111317]"
              }`}
            >
              {onlyMine ? "Showing My Listings" : "My Listings"}
            </button>
            <button
              type="button"
              data-testid="open-create-listing-btn"
              onClick={() => setCreateOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-3 py-2 text-xs font-extrabold text-[#111317]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ Post Listing</span>
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="flex min-w-52 flex-1 items-center gap-2 rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2">
            <Search className="h-4 w-4 text-[#5E6675]" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search textbooks, calculators, dorm gear, tutoring..."
              className="w-full bg-transparent text-xs font-semibold text-[#111317] focus:outline-none"
            />
          </div>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2 text-xs font-bold text-[#111317]"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={pricingModeFilter}
            onChange={(e) => setPricingModeFilter(e.target.value)}
            className="rounded-xl border border-[#E4E7EE] bg-[#F9FAFC] px-3 py-2 text-xs font-bold text-[#111317]"
          >
            <option value="">All Pricing</option>
            <option value="fixed_obo">$ Price / OBO</option>
            <option value="free_pickup">Free Pickup</option>
            <option value="open_to_trade">Open to Trade</option>
          </select>
        </div>

        {createOpen && (
          <form
            onSubmit={handleCreateListing}
            className="mt-3 space-y-2.5 rounded-2xl border border-[#D99B00] bg-[#FFFDF7] p-4"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Listing Title (e.g. CLRS 4th Ed Textbook)"
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-semibold"
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                {CATEGORIES.slice(1).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <select
                value={campus}
                onChange={(e) => setCampus(e.target.value as any)}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="Kennesaw">Kennesaw Campus</option>
                <option value="Marietta">Marietta Campus</option>
              </select>

              <select
                value={newPricingMode}
                onChange={(e) => setNewPricingMode(e.target.value as any)}
                className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
              >
                <option value="fixed_obo">$ Price / OBO</option>
                <option value="free_pickup">Free Pickup</option>
                <option value="open_to_trade">Open to Trade</option>
              </select>

              {newPricingMode === "fixed_obo" && (
                <input
                  type="number"
                  min={1}
                  required
                  value={priceDollars}
                  onChange={(e) => setPriceDollars(e.target.value)}
                  placeholder="Price ($)"
                  className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs font-bold"
                />
              )}
              {newPricingMode === "open_to_trade" && (
                <input
                  type="text"
                  value={tradeNote}
                  onChange={(e) => setTradeNote(e.target.value)}
                  placeholder="What are you looking to trade for?"
                  className="rounded-xl border border-[#E4E7EE] bg-white px-3 py-2 text-xs"
                />
              )}
            </div>

            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Condition, course code, and preferred KSU Meetup Spot..."
              className="w-full rounded-xl border border-[#E4E7EE] bg-white p-2.5 text-xs"
            />

            {mediaItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {mediaItems.map((m, idx) => (
                  <div key={String(m.mediaAssetId)} className="relative">
                    <img
                      src={m.url}
                      alt="Preview"
                      className="h-14 w-14 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMediaItems((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="absolute -right-1 -top-1 rounded-full bg-[#111317] p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-xs font-semibold text-[#B91C1C]">{error}</p>
            )}

            <div className="flex items-center justify-between">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-[#E4E7EE] bg-white px-3 py-1.5 text-xs font-bold text-[#111317]">
                <ImagePlus className="h-3.5 w-3.5" />
                <span>WebP Photos ({mediaItems.length}/4)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>

              <button
                type="submit"
                className="rounded-xl bg-[#111317] px-4 py-2 text-xs font-extrabold text-[#FDBB30]"
              >
                Publish Listing
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Listings Grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(listings ?? []).map((item) => {
          const priceLabel =
            item.pricingMode === "free_pickup"
              ? "Free Pickup"
              : item.pricingMode === "open_to_trade"
                ? "Open to Trade"
                : `$${((item.priceCents ?? 0) / 100).toFixed(0)} OBO`;

          return (
            <div
              key={String(item._id)}
              data-testid="marketplace-listing-card"
              className="flex flex-col justify-between gap-3 rounded-2xl border border-[#E4E7EE] bg-white p-4 shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[#111317] px-2.5 py-0.5 text-xs font-black text-[#FDBB30]">
                      {priceLabel}
                    </span>
                    <span className="rounded-full bg-[#FFF6DC] px-2 py-0.5 text-[10.5px] font-extrabold text-[#855A00]">
                      {item.campus}
                    </span>
                    {item.status !== "available" && (
                      <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10.5px] font-extrabold uppercase text-[#B45309]">
                        {item.status}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      void toggleBookmark({ listingId: item._id })
                    }
                    className={`rounded-lg p-1 ${
                      item.bookmarkedByViewer
                        ? "text-[#D99B00]"
                        : "text-[#5E6675]"
                    }`}
                  >
                    <Bookmark className="h-4 w-4" />
                  </button>
                </div>

                <h2 className="mt-2 flex items-center gap-1.5 text-sm font-black text-[#111317]">
                  <ShoppingBag className="h-4 w-4 shrink-0 text-[#D99B00]" />
                  <span>{item.title}</span>
                </h2>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-[#374151]">
                  {item.description}
                </p>
                {item.tradeNote && (
                  <p className="mt-1 text-[11px] font-semibold text-[#1E3A8A]">
                    Trade note: {item.tradeNote}
                  </p>
                )}

                {item.mediaUrls[0] && (
                  <img
                    src={item.mediaUrls[0]}
                    alt={item.title}
                    className="mt-2.5 h-36 w-full rounded-xl object-cover"
                  />
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E7EE] pt-2.5 text-xs">
                <Link
                  href={`/profile?handle=${item.seller.handle}`}
                  className="inline-flex items-center gap-1 font-bold text-[#5E6675] hover:underline"
                >
                  <span>@{item.seller.handle}</span>
                  <span className="inline-flex items-center gap-0.5 text-[#111317]">
                    · <Award className="h-3 w-3 text-[#D99B00]" />
                    {item.seller.completedDealCount}
                  </span>
                </Link>

                {item.isOwnListing ? (
                  <div className="flex items-center gap-2">
                    {item.status === "expired" && (
                      <button
                        type="button"
                        onClick={() =>
                          void renewListing({ listingId: item._id })
                        }
                        className="inline-flex items-center gap-1 rounded-xl bg-[#FDBB30] px-2.5 py-1 font-extrabold text-[#111317]"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Renew 30d</span>
                      </button>
                    )}
                    <Link
                      href="/chats"
                      className="font-extrabold text-[#1E3A8A] underline"
                    >
                      View Buyer Deal Chats →
                    </Link>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <ReportTrigger
                      targetType="listing"
                      targetId={String(item._id)}
                      onSubmitReport={async (p) => {
                        await submitReport(p);
                      }}
                    />
                    <button
                      type="button"
                      data-testid="message-seller-btn"
                      onClick={async () => {
                        const res = await openDealChat({
                          listingId: item._id,
                        });
                        router.push(`/chats/${res.chatId}`);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#111317] px-3 py-1.5 font-extrabold text-[#FDBB30]"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>
                        {item.myDealChatId ? "Open Deal Chat" : "Message Seller"}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
