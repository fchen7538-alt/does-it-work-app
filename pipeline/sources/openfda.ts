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
 * {name, amount} pairs. This is human-authored prose, usually one array
 * entry holding every ingredient for the whole label, e.g. "Active
 * ingredients (in each caplet) Acetaminophen 250 mg Aspirin 250 mg (NSAID*)
 * Caffeine 65 mg *nonsteroidal anti-inflammatory drug" — so we scan for
 * every "Name<space>dose<unit>" run anywhere in the string rather than
 * expecting one ingredient per array entry. Boilerplate like "Active
 * ingredients (in each caplet)" is skipped naturally: the name group can't
 * contain digits/parens/punctuation, so a match only starts where a clean
 * ingredient name immediately precedes a dose.
 */
// Boilerplate phrases the regex can't distinguish from a real ingredient
// name by shape alone (all-letters run immediately before a dose number).
// A match containing any of these words is discarded rather than kept
// mangled — cleaner to have a shorter ingredient list than a wrong one.
const NOISE_WORDS =
  /\b(purpose|purposes|active ingredient|active ingredients|solubilized|equal to|equal|each|in|nighttime|daytime|sleep-aid|pain reliever|fever reducer|cough suppressant|nasal decongestant|decongestant|expectorant|antihistamine)\b/i;

function parseActiveIngredientLines(lines: string[] | undefined): Array<{ name: string; amount: string }> {
  if (!lines) return [];
  const parsed: Array<{ name: string; amount: string }> = [];
  const seen = new Set<string>();
  // Ingredient names on real labels are 1-3 words; capping the run keeps a
  // false match (e.g. a four-word descriptive phrase before a dose) short
  // enough that the noise-word filter below can catch it.
  const pattern = /([A-Za-z][A-Za-z\-]*(?:\s+[A-Za-z][A-Za-z\-]*){0,2})\s+([\d.]+\s?(?:mg|mcg|g|IU))\b/g;
  for (const line of lines) {
    for (const match of line.matchAll(pattern)) {
      const name = match[1]?.trim();
      const amount = match[2]?.trim();
      if (!name || !amount || NOISE_WORDS.test(name)) continue;
      const key = `${name.toLowerCase()}|${amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parsed.push({ name, amount });
    }
  }
  return parsed;
}

/**
 * `canonicalBrand` is the brand name we searched for (e.g. "Tylenol"), kept
 * distinct from `hit.brandName`, which is openFDA's per-label brand facet
 * and often bakes the specific product line into it verbatim — e.g.
 * "TYLENOL 8 HR ARTHRITIS PAIN" or "JUNIOR STRENGTH ADVIL". Using the raw
 * per-label value as `product.brand` would fragment one real-world brand
 * into a dozen inconsistent, differently-capitalized brand facets in the
 * UI. We display the canonical brand and fold the label's specific variant
 * into the product name instead.
 */
// Recognized purpose categories. openFDA's "purpose" field is one raw string
// per label with one phrase per active ingredient concatenated together, no
// separators — e.g. "Purposes Pain reliever Pain reliever Pain reliever aid
// *nonsteroidal anti-inflammatory drug" for a 3-ingredient combo product.
// Rather than guess where one phrase ends and the next begins, we scan for
// known category phrases and report each one found, once.
const PURPOSE_CATEGORIES = [
  "pain reliever/fever reducer",
  "pain reliever",
  "fever reducer",
  "nighttime sleep aid",
  "sleep aid",
  "antihistamine",
  "nasal decongestant",
  "decongestant",
  "expectorant",
  "cough suppressant",
  "stimulant",
];

function cleanPurpose(lines: string[] | undefined): string {
  const text = (lines ?? []).join(" ").toLowerCase();
  const found: string[] = [];
  for (const category of PURPOSE_CATEGORIES) {
    if (text.includes(category) && !found.some((f) => f.includes(category))) {
      found.push(category);
    }
  }
  return found.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ");
}

export function mapOpenFdaLabelToProduct(
  hit: OpenFdaLabelHit,
  canonicalBrand: string,
  resolveIngredientId: (rawName: string) => string,
): { product: Product; ingredientNames: string[] } | null {
  const activeIngredients = parseActiveIngredientLines(hit.activeIngredient);
  if (activeIngredients.length === 0) return null;

  const ingredients: IngredientRef[] = activeIngredients.map((a) => ({
    ingredientId: resolveIngredientId(a.name),
    amount: a.amount,
    active: true,
  }));

  const initials = canonicalBrand.slice(0, 2).toUpperCase();

  // Strip the canonical brand (in any casing) off the front of the FDA
  // label's specific brand facet to get just the variant qualifier, e.g.
  // "TYLENOL 8 HR ARTHRITIS PAIN" -> "8 HR Arthritis Pain".
  const variant = hit.brandName
    .replace(new RegExp(`^${canonicalBrand}\\b`, "i"), "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const ingredientLabel = `${activeIngredients.map((a) => a.name).join("/")} ${activeIngredients[0]?.amount ?? ""}`.trim();
  const name = variant ? `${variant} (${ingredientLabel})` : ingredientLabel;

  const sub = cleanPurpose(hit.purpose);

  const product: Product = {
    id: `${slugify(canonicalBrand)}-${slugify(name)}`,
    brand: canonicalBrand,
    name,
    sub,
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
