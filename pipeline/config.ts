export interface SupplementBrand {
  /** Canonical display name — used for product.brand, product ids, and the med/search UI. */
  name: string;
  /**
   * Additional raw `brandName` strings this manufacturer's individual DSLD
   * label submissions are registered under, besides `name` itself — each is
   * searched separately and every hit's brand gets normalized to `name`.
   * Real example: Sports Research's own labels are filed under
   * "SR SportsResearch" in DSLD, not "Sports Research" — an exact-match
   * filter against only "Sports Research" silently misses every one of
   * their products (11 found, including a fish oil a user scanned and got
   * a real "not found" for).
   */
  aliases?: string[];
}

// `name` (and each alias) must match DSLD's stored `brandName` exactly
// (searchProductsByBrand filters on an exact case-insensitive match) — DSLD
// registers "NOW Foods" products under the shorter brand "NOW", not the
// company's full name. "NOW" is also a common English word, so DSLD's
// relevance-ranked search needs a much larger page size before real
// NOW-brand hits surface in the results (verified live: 0 exact matches at
// size=50, 45 at size=100) — see PER_BRAND_SEARCH_SIZE in build.ts.
export const SUPPLEMENT_BRANDS: SupplementBrand[] = [
  { name: "Nature Made" },
  { name: "NOW" },
  { name: "Nature's Bounty" },
  { name: "Garden of Life" },
  { name: "Sports Research", aliases: ["SR SportsResearch"] },
  { name: "Solgar" },
  { name: "Life Extension" },
  { name: "Thorne" },
  { name: "Nordic Naturals" },
  { name: "Puritan's Pride" },
  { name: "Kirkland Signature" },
  { name: "Centrum" },
  { name: "Jarrow Formulas" },
  { name: "Doctor's Best" },
  { name: "MegaFood" },
  { name: "New Chapter" },
  { name: "Optimum Nutrition" },
  { name: "Nature's Way" },
];

export const OTC_BRANDS = ["Tylenol", "Advil", "Motrin", "Aleve", "Excedrin"];
