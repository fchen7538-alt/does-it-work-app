// These must match DSLD's stored `brandName` exactly (searchProductsByBrand
// filters on an exact case-insensitive match) — DSLD registers "NOW Foods"
// products under the shorter brand "NOW", not the company's full name.
export const SUPPLEMENT_BRANDS = [
  "Nature Made",
  "NOW",
  "Nature's Bounty",
  "Garden of Life",
  "Sports Research",
  "Solgar",
  "Life Extension",
  "Thorne",
];

export const OTC_BRANDS = ["Tylenol", "Advil", "Motrin", "Aleve", "Excedrin"];
