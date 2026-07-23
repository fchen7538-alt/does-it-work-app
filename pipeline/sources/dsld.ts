// NIH Dietary Supplement Label Database (DSLD) API client.
//
// Docs: https://dsld.od.nih.gov/api-guide
// Base URL: https://api.ods.od.nih.gov/dsld/v9
//
// DSLD is an Elasticsearch-backed index over scanned supplement labels. We
// use two calls:
//   1. GET /search-filter  — full-text search, returns a paginated list of
//      ES-style hits ({_id, _source: {brandName, fullName, ...}}). There's
//      no dedicated brand-filter parameter; the reliable way to restrict to
//      one brand is a quoted exact phrase in `q` (`q="Nature Made"`) — an
//      unquoted `q=Nature Made` does a loose relevance search across all
//      fields and returns unrelated brands.
//   2. GET /label/{id}     — full label record for one product. Active
//      ingredients live in `ingredientRows[]`; inactive/"other" ingredients
//      are a separate `otheringredients.ingredients[]` array — they are NOT
//      one combined list with a category flag. Each ingredientRows entry's
//      amount is nested under `quantity[]` (one entry per serving size the
//      label defines); we use the first serving size.
//
// Verified against the live API. If DSLD changes its response shape again,
// `mapDsldLabelToProduct` and the two response interfaces below are the
// only things that need to change — nothing else in the pipeline needs to
// know about DSLD's wire format.

import { createRateLimiter, fetchJson } from "../lib/http";
import type { IngredientRef, Product } from "../../src/lib/types";
import { slugify } from "../lib/slug";

const DSLD_BASE = "https://api.ods.od.nih.gov/dsld/v9";

// DSLD does not require an API key for search/label reads as of the v9 guide.
// Be a polite client regardless. Verified live: a sustained run at 2 req/sec
// (500ms) starts drawing 429s a few hundred requests in — looks like a
// rolling-window rate limit, not a per-request one, so build.ts's retry
// backoff alone doesn't recover from it. 1 req/sec has run clean.
const throttle = createRateLimiter(1000);

export interface DsldSearchHit {
  id: string; // DSLD product id (dsld_id)
  fullName: string;
  brandName: string;
  upcSku?: string;
}

export interface DsldLabelIngredient {
  name: string;
  quantity: string; // e.g. "475" or "1000"
  unit: string; // e.g. "mg", "IU"
  partOf: "supplement_facts" | "other_ingredients";
}

export interface DsldLabel {
  id: string;
  fullName: string;
  brandName: string;
  netContentsDisplay?: string;
  servingSizeDisplay?: string;
  ingredientRows: DsldLabelIngredient[];
}

/** Raw shape returned by GET /search-filter (Elasticsearch hit envelope) — subset of fields we use. */
interface DsldSearchResponse {
  hits?: Array<{
    _id?: string;
    _source?: {
      fullName?: string;
      brandName?: string;
      upcSku?: string;
    };
  }>;
}

/** Raw shape returned by GET /label/{id} — subset of fields we use. */
interface DsldLabelResponse {
  id?: number | string;
  fullName?: string;
  brandName?: string;
  netContents?: Array<{ quantity?: number; unit?: string; display?: string }>;
  servingSizes?: Array<{ minQuantity?: number; maxQuantity?: number; unit?: string }>;
  ingredientRows?: Array<{
    name?: string;
    quantity?: Array<{ quantity?: number; unit?: string }>;
  }>;
  otheringredients?: {
    ingredients?: Array<{ name?: string }>;
  };
}

export async function searchProductsByBrand(brand: string, size = 25): Promise<DsldSearchHit[]> {
  await throttle();
  const url = `${DSLD_BASE}/search-filter?${new URLSearchParams({
    q: `"${brand}"`,
    size: String(size),
    from: "0",
  })}`;

  const data = await fetchJson<DsldSearchResponse>(url);
  return (data.hits ?? [])
    .map((h) => ({
      id: h._id ?? "",
      fullName: h._source?.fullName ?? "",
      brandName: h._source?.brandName ?? brand,
      upcSku: h._source?.upcSku,
    }))
    // Quoted-phrase search still ranks by relevance, not an exact filter —
    // drop hits whose brand doesn't actually match (case-insensitive).
    .filter((h) => h.id && h.fullName && h.brandName.toLowerCase() === brand.toLowerCase());
}

export async function getProductLabel(dsldId: string): Promise<DsldLabel | null> {
  await throttle();
  const url = `${DSLD_BASE}/label/${encodeURIComponent(dsldId)}`;
  const data = await fetchJson<DsldLabelResponse>(url);
  if (!data || data.id === undefined) return null;

  const activeRows: DsldLabelIngredient[] = (data.ingredientRows ?? [])
    .filter((row) => row.name)
    .map((row) => {
      const firstQty = row.quantity?.[0];
      return {
        name: row.name!,
        quantity: firstQty?.quantity !== undefined ? String(firstQty.quantity) : "",
        unit: firstQty?.unit ?? "",
        partOf: "supplement_facts" as const,
      };
    });

  const otherRows: DsldLabelIngredient[] = (data.otheringredients?.ingredients ?? [])
    .filter((ing) => ing.name)
    .map((ing) => ({ name: ing.name!, quantity: "", unit: "", partOf: "other_ingredients" as const }));

  const netContents = data.netContents?.[0];
  const serving = data.servingSizes?.[0];

  return {
    id: String(data.id ?? dsldId),
    fullName: data.fullName ?? "",
    brandName: data.brandName ?? "",
    netContentsDisplay: netContents?.display,
    servingSizeDisplay:
      serving?.minQuantity !== undefined ? `${serving.minQuantity} ${serving.unit ?? ""}`.trim() : undefined,
    ingredientRows: [...activeRows, ...otherRows],
  };
}

/**
 * Converts a fetched DSLD label into our Product + IngredientRef[] shape.
 * `canonicalBrand` is the brand we searched for (e.g. "Garden of Life"),
 * kept distinct from `label.brandName` — individual DSLD label submissions
 * are user-entered and sometimes carry inconsistent capitalization (seen
 * live: "Garden Of Life" and "Now" alongside the far more common "Garden of
 * Life" and "NOW"). Using the raw per-label value as `product.brand` would
 * fragment one real brand into multiple visually-distinct facets in the UI
 * — same class of issue fixed for openFDA's per-label brand facets, see
 * `pipeline/sources/openfda.ts`.
 * `resolveIngredientId` is injected so the caller can run each raw
 * ingredient name through RxNorm-backed canonicalization (see rxnorm.ts)
 * before we decide whether it's a new ingredient or matches an existing one.
 */
export function mapDsldLabelToProduct(
  label: DsldLabel,
  canonicalBrand: string,
  resolveIngredientId: (rawName: string) => string,
): { product: Product; ingredientNames: string[] } {
  const ingredients: IngredientRef[] = label.ingredientRows.map((row) => ({
    ingredientId: resolveIngredientId(row.name),
    amount: [row.quantity, row.unit].filter(Boolean).join(" ") || "amount not listed",
    active: row.partOf === "supplement_facts",
  }));

  const initials = canonicalBrand
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sub = [label.servingSizeDisplay && `serving size: ${label.servingSizeDisplay}`, label.netContentsDisplay]
    .filter(Boolean)
    .join(" · ");

  const product: Product = {
    id: `${slugify(canonicalBrand)}-${slugify(label.fullName)}`,
    brand: canonicalBrand,
    name: label.fullName,
    sub,
    initials: initials || "SP",
    kind: "supplement",
    ingredients,
    source: {
      provider: "dsld",
      sourceId: label.id,
      lastVerified: new Date().toISOString().slice(0, 10),
    },
  };

  return { product, ingredientNames: label.ingredientRows.map((r) => r.name) };
}
