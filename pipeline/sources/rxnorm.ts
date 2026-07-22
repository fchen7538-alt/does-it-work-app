// RxNorm (RxNav) REST API client — used to normalize drug/ingredient names
// so that brand names, generic names, and label spellings all resolve to
// the same canonical concept (RXCUI).
//
// Docs: https://lhncbc.nlm.nih.gov/RxNav/APIs/RxNormAPIs.html
// Base URL: https://rxnav.nlm.nih.gov/REST
//
// Two calls matter for this pipeline:
//   1. /rxcui.json?name=<name>            — exact-name lookup
//   2. /approximateTerm.json?term=<name>  — fuzzy fallback for label text
//      that doesn't match RxNorm's preferred term exactly (misspellings,
//      brand names, "Extra Strength" qualifiers, etc.)
//   3. /rxcui/{rxcui}/related.json?tty=IN — brand -> generic ingredient,
//      used to resolve OTC brand names (e.g. RXCUI for "Tylenol") down to
//      their active ingredient concept (e.g. "acetaminophen").

import { createRateLimiter, fetchJson } from "../lib/http";

const RXNAV_BASE = "https://rxnav.nlm.nih.gov/REST";

// No API key required; NLM asks for a reasonable request rate.
const throttle = createRateLimiter(200);

interface RxcuiResponse {
  idGroup?: { rxnormId?: string[] };
}

interface ApproxResponse {
  approximateGroup?: { candidate?: Array<{ rxcui?: string; score?: string }> };
}

interface RelatedResponse {
  relatedGroup?: {
    conceptGroup?: Array<{
      tty?: string;
      conceptProperties?: Array<{ rxcui?: string; name?: string }>;
    }>;
  };
}

export async function getRxcuiByName(name: string): Promise<string | null> {
  await throttle();
  const url = `${RXNAV_BASE}/rxcui.json?${new URLSearchParams({ name, search: "2" })}`;
  const data = await fetchJson<RxcuiResponse>(url);
  return data.idGroup?.rxnormId?.[0] ?? null;
}

export async function getApproximateRxcui(term: string): Promise<{ rxcui: string; score: number } | null> {
  await throttle();
  const url = `${RXNAV_BASE}/approximateTerm.json?${new URLSearchParams({ term, maxEntries: "1" })}`;
  const data = await fetchJson<ApproxResponse>(url);
  const top = data.approximateGroup?.candidate?.[0];
  if (!top?.rxcui) return null;
  return { rxcui: top.rxcui, score: Number(top.score ?? 0) };
}

/** Resolves an ingredient (generic drug) name concept for a given RXCUI, e.g. a brand -> its IN (ingredient) concept. */
export async function getIngredientConcept(rxcui: string): Promise<{ rxcui: string; name: string } | null> {
  await throttle();
  const url = `${RXNAV_BASE}/rxcui/${encodeURIComponent(rxcui)}/related.json?${new URLSearchParams({ tty: "IN" })}`;
  const data = await fetchJson<RelatedResponse>(url);
  const group = data.relatedGroup?.conceptGroup?.find((g) => g.tty === "IN");
  const concept = group?.conceptProperties?.[0];
  if (!concept?.rxcui || !concept.name) return null;
  return { rxcui: concept.rxcui, name: concept.name };
}

/**
 * Best-effort normalization: try an exact name match first, then fall back
 * to fuzzy matching. Returns null (rather than throwing) when RxNorm has no
 * concept for the term at all — expected for many dietary ingredients
 * (herbs, "curcumin extract", etc.) since RxNorm covers drugs, not foods or
 * botanicals.
 */
export async function normalizeName(rawName: string): Promise<{ rxcui: string; matchedName: string } | null> {
  const exact = await getRxcuiByName(rawName);
  if (exact) return { rxcui: exact, matchedName: rawName };

  const approx = await getApproximateRxcui(rawName);
  if (!approx || approx.score < 50) return null;

  const concept = await getIngredientConcept(approx.rxcui);
  if (concept) return { rxcui: concept.rxcui, matchedName: concept.name };

  return { rxcui: approx.rxcui, matchedName: rawName };
}
