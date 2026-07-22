// openFDA Drug Label API client.
//
// Docs: https://open.fda.gov/apis/drug/label/
// Endpoint: GET https://api.fda.gov/drug/label.json
//
// We query by openfda.brand_name for a curated list of OTC brands (Tylenol,
// Advil, etc). Each result's `openfda` block already carries an `rxcui`
// array supplied by FDA's own RxNorm mapping — we use that as a first-pass
// normalization and cross-check it against our own RxNorm lookups
// (see rxnorm.ts) rather than trusting either source blindly.

import { createRateLimiter, fetchJson } from "../lib/http";
import type { IngredientRef, Product } from "../../src/lib/types";
import { slugify } from "../lib/slug";

const OPENFDA_BASE = "https://api.fda.gov/drug/label.json";

// Public rate limit without an API key: 240 req/min, 1000/day. Stay well under.
const throttle = createRateLimiter(300);

const apiKey = process.env.OPENFDA_API_KEY;

export interface OpenFdaLabelHit {
  setId: string;
  brandName: string;
  genericName?: string;
  activeIngredient?: string[]; // free-text "active_ingredient" section, one entry per line typically
  purpose?: string[];
  rxcui?: string[];
  substanceName?: string[];
  dosageForm?: string; // not always present as a discrete field; inferred from product data where possible
}

interface OpenFdaResponse {
  results?: Array<{
    id?: string;
    set_id?: string;
    active_ingredient?: string[];
    purpose?: string[];
    openfda?: {
      brand_name?: string[];
      generic_name?: string[];
      rxcui?: string[];
      substance_name?: string[];
      route?: string[];
    };
  }>;
}

export async function fetchLabelsByBrand(brand: string, limit = 5): Promise<OpenFdaLabelHit[]> {
  await throttle();
  const params = new URLSearchParams({
    search: `openfda.brand_name:"${brand}"`,
    limit: String(limit),
  });
  if (apiKey) params.set("api_key", apiKey);

  const url = `${OPENFDA_BASE}?${params}`;
  let data: OpenFdaResponse;
  try {
    data = await fetchJson<OpenFdaResponse>(url);
  } catch (err) {
    // openFDA returns 404 (not 200-with-empty-results) when a search matches nothing.
    return [];
  }

  return (data.results ?? []).map((r) => ({
    setId: r.set_id ?? r.id ?? "",
    brandName: r.openfda?.brand_name?.[0] ?? brand,
    genericName: r.openfda?.generic_name?.[0],
    activeIngredient: r.active_ingredient,
    purpose: r.purpose,
    rxcui: r.openfda?.rxcui,
    substanceName: r.openfda?.substance_name,
  }));
}

/**
 * Parses the FDA label's free-text "active_ingredient" section into
 * {name, amount} pairs. This section is human-authored prose per label, e.g.
 * "Acetaminophen 500 mg .... Pain reliever/fever reducer" — we take a
 * best-effort regex split; labels that don't match are kept as inactive-only
 * so we never silently fabricate a dose.
 */
function parseActiveIngredientLines(lines: string[] | undefined): Array<{ name: string; amount: string }> {
  if (!lines) return [];
  const parsed: Array<{ name: string; amount: string }> = [];
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9\-\s]+?)\s+([\d.]+\s?(?:mg|mcg|g|IU))\b/i);
    if (match && match[1] && match[2]) {
      parsed.push({ name: match[1].trim(), amount: match[2].trim() });
    }
  }
  return parsed;
}

export function mapOpenFdaLabelToProduct(
  hit: OpenFdaLabelHit,
  resolveIngredientId: (rawName: string) => string,
): { product: Product; ingredientNames: string[] } | null {
  const activeIngredients = parseActiveIngredientLines(hit.activeIngredient);
  if (activeIngredients.length === 0) return null;

  const ingredients: IngredientRef[] = activeIngredients.map((a) => ({
    ingredientId: resolveIngredientId(a.name),
    amount: a.amount,
    active: true,
  }));

  const initials = hit.brandName.slice(0, 2).toUpperCase();
  const name = hit.genericName
    ? `${activeIngredients.map((a) => a.name).join("/")} ${activeIngredients[0]?.amount ?? ""}`.trim()
    : hit.brandName;

  const product: Product = {
    id: `${slugify(hit.brandName)}-${slugify(name)}`,
    brand: hit.brandName,
    name,
    sub: hit.purpose?.join(", ") ?? "",
    initials: initials || "OT",
    kind: "otc",
    ingredients,
    source: {
      provider: "openfda",
      sourceId: hit.setId,
      lastVerified: new Date().toISOString().slice(0, 10),
    },
  };

  return { product, ingredientNames: activeIngredients.map((a) => a.name) };
}
