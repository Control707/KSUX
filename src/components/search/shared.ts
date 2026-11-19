/** Links a Listing result: Marketplace has no item route, so pre-fill its search and anchor the card. */
export function listingHref(listing: { listingId: string; title: string }): string {
  return `/marketplace?q=${encodeURIComponent(listing.title)}#listing-${listing.listingId}`;
}

export const PILL_ACTION =
  "inline-flex min-h-[var(--target)] items-center rounded-[var(--r-pill)] border border-[var(--line-strong)] px-[var(--sp-3)] text-sm font-bold hover:border-[var(--ink)]";
