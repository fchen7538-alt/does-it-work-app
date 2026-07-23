// These must match DSLD's stored `brandName` exactly (searchProductsByBrand
// filters on an exact case-insensitive match) — DSLD registers "NOW Foods"
// products under the shorter brand "NOW", not the company's full name.
// "NOW" is also a common English word, so DSLD's relevance-ranked search
// needs a much larger page size before real NOW-brand hits surface in the
// results (verified live: 0 exact matches at size=50, 45 at size=100) —
// see PER_BRAND_SEARCH_SIZE in build.ts.
export const SUPPLEMENT_BRANDS = [
  "Nature Made",
  "NOW",
  "Nature's Bounty",
  "Garden of Life",
  "Sports Research",
  "Solgar",
  "Life Extension",
  "Thorne",
  "Nordic Naturals",
  "Puritan's Pride",
  "Kirkland Signature",
  "Centrum",
  "Jarrow Formulas",
  "Doctor's Best",
  "MegaFood",
  "New Chapter",
  "Optimum Nutrition",
  "Nature's Way",
];

export const OTC_BRANDS = ["Tylenol", "Advil", "Motrin", "Aleve", "Excedrin"];
