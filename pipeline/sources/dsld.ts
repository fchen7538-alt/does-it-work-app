// NIH Dietary Supplement Label Database (DSLD) API client.
//
// Docs: https://dsld.od.nih.gov/api-guide
// Base URL: https://api.ods.od.nih.gov/dsld/v9
//
// DSLD is a search index over scanned supplement labels. We use two calls:
//   1. POST/GET /search-filter  — full-text + filtered search, returns a
//      paginated list of lightweight product hits (id, brand, fullName).
//   2. GET /label/{id}          — full label record for one product,
//      including the "ingredientRows" panel (name, quantity, unit, part of
//      Supplement Facts vs "other ingredients").
//
// This client only depends on fields documented in the API guide as of this
// writing. DSLD is a live, evolving index — if the response shape has
// changed, `mapDsldHitToProduct` / `mapDsldLabelToIngredients` are the two
// functions to update; nothing else in the pipeline needs to know about
// DSLD's wire format.

import { createRateLimiter, fetchJson } from "../lib/http";
import type { IngredientRef, Product } from "../../src/lib/types";
import { slugify } from "../lib/slug";

const DSLD_BASE = "https://api.ods.od.nih.gov/dsld/v9";

// DSLD does not require an API key for search/label reads as of the v9 guide.
// Be a polite client regardless: cap at ~2 req/sec.
const throttle = createRateLimiter(500);

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
  netContents?: string;
  servingsPerContainer?: string;
  ingredientRows: DsldLabelIngredient[];
}

/** Raw shape returned by GET /search-filter — subset of fields we use. */
interface DsldSearchResponse {
  hits?: Array<{
    id?: string;
    _id?: string;
    fullName?: string;
    brandName?: string;
    upcSku?: string;
  }>;
  total?: number;
}

/** Raw shape returned by GET /label/{id} — subset of fields we use. */
interface DsldLabelResponse {
  id?: string;
  _id?: string;
  fullName?: string;
  brandName?: string;
  netContents?: string;
  servingsPerContainer?: string;
  ingredientRows?: Array<{
    name?: string;
    quantity?: string | number;
    unit?: string;
    category?: string; // "Supplement Facts" | "Other Ingredients"
  }>;
}

export async function searchProductsByBrand(brand: string, size = 25): Promise<DsldSearchHit[]> {
  await throttle();
  const url = `${DSLD_BASE}/search-filter?${new URLSearchParams({
    q: brand,
    method: "filtered",
    "filter[brandName]": brand,
    size: String(size),
    from: "0",
  })}`;

  const data = await fetchJson<DsldSearchResponse>(url);
  return (data.hits ?? [])
    .map((h) => ({
      id: h.id ?? h._id ?? "",
      fullName: h.fullName ?? "",
      brandName: h.brandName ?? brand,
      upcSku: h.upcSku,
    }))
    .filter((h) => h.id && h.fullName);
}

export async function getProductLabel(dsldId: string): Promise<DsldLabel | null> {
  await throttle();
  const url = `${DSLD_BASE}/label/${encodeURIComponent(dsldId)}`;
  const data = await fetchJson<DsldLabelResponse>(url);
  if (!data || (!data.id && !data._id)) return null;

  return {
    id: data.id ?? data._id ?? dsldId,
    fullName: data.fullName ?? "",
    brandName: data.brandName ?? "",
    netContents: data.netContents,
    servingsPerContainer: data.servingsPerContainer,
    ingredientRows: (data.ingredientRows ?? []).map((row) => ({
      name: row.name ?? "",
      quantity: String(row.quantity ?? ""),
      unit: row.unit ?? "",
      partOf: row.category === "Other Ingredients" ? "other_ingredients" : "supplement_facts",
    })),
  };
}

/**
 * Converts a fetched DSLD label into our Product + IngredientRef[] shape.
 * `resolveIngredientId` is injected so the caller can run each raw
 * ingredient name through RxNorm-backed canonicalization (see rxnorm.ts)
 * before we decide whether it's a new ingredient or matches an existing one.
 */
export function mapDsldLabelToProduct(
  label: DsldLabel,
  resolveIngredientId: (rawName: string) => string,
): { product: Product; ingredientNames: string[] } {
  const ingredients: IngredientRef[] = label.ingredientRows.map((row) => ({
    ingredientId: resolveIngredientId(row.name),
    amount: [row.quantity, row.unit].filter(Boolean).join(" ") || "amount not listed",
    active: row.partOf === "supplement_facts",
  }));

  const initials = label.brandName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const product: Product = {
    id: `${slugify(label.brandName)}-${slugify(label.fullName)}`,
    brand: label.brandName,
    name: label.fullName,
    sub: label.servingsPerContainer ? `${label.servingsPerContainer} servings per container` : "",
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
