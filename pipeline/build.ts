#!/usr/bin/env -S tsx
// Orchestrates the live data pipeline:
//   DSLD (supplement products) + openFDA (OTC drug labels)
//     -> RxNorm (name normalization -> canonical ingredients)
//     -> PubMed E-utilities (study counts + review candidates)
//     -> data/*.json
//
// Run `npm run sync` (or `npm run sync:<source>` for just one stage).
// Requires outbound network access to:
//   api.ods.od.nih.gov, api.fda.gov, rxnav.nlm.nih.gov, eutils.ncbi.nlm.nih.gov
//
// Interaction records (data/interactions.json) and hand-written review
// verdicts are a maintained clinical dataset, not something this pipeline
// generates automatically — see data/README.md.

import { SUPPLEMENT_BRANDS, OTC_BRANDS } from "./config";
import * as dsld from "./sources/dsld";
import * as openfda from "./sources/openfda";
import * as rxnorm from "./sources/rxnorm";
import * as pubmed from "./sources/pubmed";
import { store, upsertBy } from "./lib/store";
import { slugify } from "./lib/slug";
import type { Ingredient, Product } from "../src/lib/types";

const args = new Set(process.argv.slice(2));
const only = [...args].find((a) => a.startsWith("--only="))?.split("=")[1];
const runStage = (stage: string) => !only || only === stage;
// Restrict dsld/openfda to a single brand, e.g. --brand="New Chapter" — for
// re-syncing just the brands a previous run left empty (rate-limited, etc.)
// without waiting through the full configured brand list again.
const onlyBrand = [...args].find((a) => a.startsWith("--brand="))?.split("=")[1];
const brandFilter = (brands: string[]) => (onlyBrand ? brands.filter((b) => b === onlyBrand) : brands);

// DSLD ranks by relevance, not an exact brand filter — some brand names
// (e.g. "NOW") are common enough in ordinary label text that a small page
// size returns zero real matches for that brand. 100 was verified live to
// surface real NOW-brand hits; smaller brands just return fewer than 100.
const PER_BRAND_SEARCH_SIZE = 100;

// DSLD's Supplement Facts panel always includes these macronutrient
// bookkeeping rows (calorie/fat/carb/protein totals) alongside the
// product's actual active ingredients, and marks them the same way
// (partOf: "supplement_facts") — but they aren't ingredients anyone is
// taking the product *for*, and treating them as active pulls in a
// meaningless PubMed count (a plain "protein" search returns ~9 million
// hits) that inflates "Research found" on any product with a nutrition
// panel. Still shown in the ingredient list (for label completeness), just
// not counted toward research/interaction evidence.
const NUTRITION_FACTS_PANEL_IDS = new Set([
  "calories",
  "total-calories",
  "total-fat",
  "saturated-fat",
  "trans-fat",
  "polyunsaturated-fat",
  "monounsaturated-fat",
  "cholesterol",
  "sodium",
  "total-carbohydrates",
  "dietary-fiber",
  "total-sugars",
  "added-sugars",
  "sugar-alcohol",
  "protein",
]);

async function main() {
  let ingredients = store.readIngredients();
  let products = store.readProducts();
  const meta = store.readMeta();

  const ingredientNameIndex = new Map<string, string>(); // lowercase raw/synonym name -> ingredient id
  for (const ing of ingredients) {
    ingredientNameIndex.set(ing.name.toLowerCase(), ing.id);
    for (const syn of ing.synonyms ?? []) ingredientNameIndex.set(syn.toLowerCase(), ing.id);
  }

  /** Resolve a raw label ingredient name to a canonical ingredient id, creating one if needed. */
  async function resolveIngredient(rawName: string, category: Ingredient["category"], useRxnorm: boolean): Promise<string> {
    const key = rawName.trim().toLowerCase();
    const existing = ingredientNameIndex.get(key);
    if (existing) return existing;

    let rxcui: string | null = null;
    let canonicalName = rawName.trim();

    if (useRxnorm) {
      try {
        const normalized = await rxnorm.normalizeName(rawName);
        if (normalized) {
          rxcui = normalized.rxcui;
          canonicalName = normalized.matchedName;
        }
      } catch (err) {
        console.warn(`  RxNorm lookup failed for "${rawName}": ${(err as Error).message}`);
      }
    }

    const id = slugify(canonicalName) || slugify(rawName) || `ingredient-${ingredients.length + 1}`;
    if (!ingredients.some((i) => i.id === id)) {
      ingredients = [...ingredients, { id, name: canonicalName, rxcui, category, synonyms: [rawName] }];
    }
    ingredientNameIndex.set(key, id);
    ingredientNameIndex.set(canonicalName.toLowerCase(), id);
    return id;
  }

  if (runStage("dsld")) {
    console.log(`\n[dsld] pulling supplement products for ${SUPPLEMENT_BRANDS.length} brands...`);
    for (const brand of brandFilter(SUPPLEMENT_BRANDS)) {
      let hits: Awaited<ReturnType<typeof dsld.searchProductsByBrand>> = [];
      try {
        hits = await dsld.searchProductsByBrand(brand, PER_BRAND_SEARCH_SIZE);
        console.log(`  ${brand}: ${hits.length} products found`);
      } catch (err) {
        console.error(`  [dsld] search failed for brand "${brand}": ${(err as Error).message}`);
        continue;
      }

      // Per-hit try/catch: one failed label fetch (e.g. a transient 429 that
      // outlasts fetchJson's built-in retries) should skip that product, not
      // abort every remaining product for the brand.
      for (const hit of hits) {
        try {
          const label = await dsld.getProductLabel(hit.id);
          if (!label) continue;
          const rawNames: string[] = [];
          const { product } = dsld.mapDsldLabelToProduct(label, brand, (name) => {
            rawNames.push(name);
            return name; // placeholder id, replaced below once we resolve async
          });
          const resolvedIngredients = await Promise.all(
            product.ingredients.map(async (ref, i) => {
              const ingredientId = await resolveIngredient(rawNames[i] ?? ref.ingredientId, "supplement", true);
              return {
                ...ref,
                ingredientId,
                active: ref.active && !NUTRITION_FACTS_PANEL_IDS.has(ingredientId),
              };
            }),
          );
          products = upsertBy<Product>(products, { ...product, ingredients: resolvedIngredients });
        } catch (err) {
          console.error(`  [dsld] failed for "${brand}" product ${hit.id}: ${(err as Error).message}`);
        }
      }
    }
    meta.lastSynced.dsld = new Date().toISOString();
  }

  if (runStage("openfda")) {
    console.log(`\n[openfda] pulling OTC drug labels for ${OTC_BRANDS.length} brands...`);
    for (const brand of brandFilter(OTC_BRANDS)) {
      try {
        const hits = await openfda.fetchLabelsByBrand(brand, 10);
        console.log(`  ${brand}: ${hits.length} labels found`);
        for (const hit of hits) {
          const rawNames: string[] = [];
          const mapped = openfda.mapOpenFdaLabelToProduct(hit, brand, (name) => {
            rawNames.push(name);
            return name;
          });
          if (!mapped) continue;
          const resolvedIngredients = await Promise.all(
            mapped.product.ingredients.map(async (ref, i) => ({
              ...ref,
              ingredientId: await resolveIngredient(rawNames[i] ?? ref.ingredientId, "otc-active", true),
            })),
          );
          products = upsertBy<Product>(products, { ...mapped.product, ingredients: resolvedIngredients });
        }
      } catch (err) {
        console.error(`  [openfda] failed for brand "${brand}": ${(err as Error).message}`);
      }
    }
    meta.lastSynced.openfda = new Date().toISOString();
  }

  if (runStage("rxnorm")) {
    console.log(`\n[rxnorm] backfilling RXCUI for ingredients missing one...`);
    const updated: Ingredient[] = [];
    for (const ing of ingredients) {
      if (ing.rxcui) {
        updated.push(ing);
        continue;
      }
      try {
        const normalized = await rxnorm.normalizeName(ing.name);
        if (normalized) {
          updated.push({ ...ing, rxcui: normalized.rxcui });
          console.log(`  ${ing.name} -> RXCUI ${normalized.rxcui}`);
        } else {
          updated.push(ing);
        }
      } catch (err) {
        console.warn(`  RxNorm lookup failed for "${ing.name}": ${(err as Error).message}`);
        updated.push(ing);
      }
    }
    ingredients = updated;
    meta.lastSynced.rxnorm = new Date().toISOString();
  }

  if (runStage("pubmed")) {
    console.log(`\n[pubmed] refreshing study counts + review candidates for ${ingredients.length} ingredients...`);
    const evidence = store.readEvidence();
    const evidenceByIngredientId = new Map(evidence.map((e) => [e.ingredientId, e]));

    for (const ing of ingredients) {
      try {
        const count = await pubmed.getStudyCount(ing.name);
        const existing = evidenceByIngredientId.get(ing.id);

        // Study count refreshes live; the plain-language summary, studied-dose
        // range, and any review verdict stay editorially curated (see
        // pipeline/sources/pubmed.ts) until explicitly written up.
        evidenceByIngredientId.set(ing.id, {
          ingredientId: ing.id,
          studyCount: count,
          sub: existing?.sub ?? "Summary pending editorial review.",
          studiedAmount: existing?.studiedAmount ?? "Not yet reviewed",
          chips: existing?.chips ?? [],
          src: "PubMed (NCBI E-utilities), live count",
          reviewVerdict: existing?.reviewVerdict,
        });

        if (!existing?.reviewVerdict) {
          const candidate = await pubmed.findReviewCandidate(ing.name);
          if (candidate) {
            console.log(
              `  ${ing.name}: review candidate found (PMID ${candidate.pmid}, ${candidate.journal} ${candidate.year}) — needs editorial write-up before it can appear as a verdict`,
            );
          }
        }
      } catch (err) {
        console.warn(`  PubMed lookup failed for "${ing.name}": ${(err as Error).message}`);
      }
    }
    store.writeEvidence([...evidenceByIngredientId.values()]);
    meta.lastSynced.pubmed = new Date().toISOString();
  }

  store.writeIngredients(ingredients);
  store.writeProducts(products);
  meta.status = "live";
  store.writeMeta(meta);

  console.log(`\nDone. ${products.length} products, ${ingredients.length} ingredients.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
