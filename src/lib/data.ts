import productsJson from "@data/products.json";
import ingredientsJson from "@data/ingredients.json";
import drugsJson from "@data/drugs.json";
import evidenceJson from "@data/evidence.json";
import interactionsJson from "@data/interactions.json";
import upcAliasesJson from "@data/upc-aliases.json";
import type {
  Product,
  Ingredient,
  Drug,
  Evidence,
  Interaction,
  ProductListItem,
  ProductDetailView,
  ProductInteractionView,
  IngredientEvidenceView,
} from "./types";

const products = productsJson as Product[];
const ingredients = ingredientsJson as Ingredient[];
const drugs = drugsJson as Drug[];
const evidence = evidenceJson as Evidence[];
const interactions = interactionsJson as Interaction[];

const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
const drugById = new Map(drugs.map((d) => [d.id, d]));
const evidenceByIngredientId = new Map(evidence.map((e) => [e.ingredientId, e]));
const interactionsByIngredientId = new Map<string, Interaction[]>();
for (const interaction of interactions) {
  const list = interactionsByIngredientId.get(interaction.ingredientId) ?? [];
  list.push(interaction);
  interactionsByIngredientId.set(interaction.ingredientId, list);
}

function activeIngredientIds(product: Product): string[] {
  return product.ingredients.filter((ref) => ref.active).map((ref) => ref.ingredientId);
}

function interactionsForProduct(product: Product): Interaction[] {
  const seen = new Set<string>();
  const result: Interaction[] = [];
  for (const ingId of activeIngredientIds(product)) {
    for (const interaction of interactionsByIngredientId.get(ingId) ?? []) {
      if (!seen.has(interaction.id)) {
        seen.add(interaction.id);
        result.push(interaction);
      }
    }
  }
  return result;
}

// A scanned barcode that isn't on file in DSLD's own data for the exact
// product we already have (e.g. DSLD only submitted a 30/60/120/180-count
// bottle's UPC, but a shopper's physical bottle is a 150-count) — see
// data/upc-aliases.json for how entries here were verified before adding.
const upcAliases = upcAliasesJson as Record<string, string>;
const productIdByUpc = new Map<string, string>([
  ...products.filter((p) => p.upc).map((p): [string, string] => [p.upc!, p.id]),
  ...Object.entries(upcAliases),
]);

export function listDrugs(): Drug[] {
  return drugs;
}

/** Resolves a scanned barcode (any formatting) to a product id, or null if no product has this UPC on file. */
export function findProductIdByUpc(rawUpc: string): string | null {
  const digits = rawUpc.replace(/\D/g, "");
  return productIdByUpc.get(digits) ?? null;
}

export function listProducts(query: string, selectedDrugIds: string[]): ProductListItem[] {
  // Match per-word across brand+name combined, not the query as one
  // contiguous substring against either field alone — a plain substring
  // check fails "nature made turmeric" against brand "Nature Made" and
  // name "Turmeric Curcumin 500mg" separately, even though it's an obvious
  // match. Also lets OCR'd label text (noisy, word-order can vary) still
  // land on the right product.
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const selected = new Set(selectedDrugIds);

  return products
    .filter((p) => {
      if (terms.length === 0) return true;
      const haystack = `${p.brand} ${p.name}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map((p) => {
      const matchingInteractionCount = interactionsForProduct(p).filter((i) => selected.has(i.drugId)).length;
      return {
        id: p.id,
        brand: p.brand,
        name: p.name,
        sub: p.sub,
        initials: p.initials,
        matchingInteractionCount,
      };
    });
}

export function getProductDetail(id: string, selectedDrugIds: string[]): ProductDetailView | null {
  const product = products.find((p) => p.id === id);
  if (!product) return null;

  const selected = new Set(selectedDrugIds);

  const evidenceViews: IngredientEvidenceView[] = activeIngredientIds(product)
    .map((ingId) => {
      const ev = evidenceByIngredientId.get(ingId);
      const ing = ingredientById.get(ingId);
      if (!ev || !ing) return null;
      return { ...ev, ingredientName: ing.name };
    })
    .filter((v): v is IngredientEvidenceView => v !== null);

  const interactionViews: ProductInteractionView[] = interactionsForProduct(product).map((interaction) => {
    const ing = ingredientById.get(interaction.ingredientId);
    const drug = drugById.get(interaction.drugId);
    return {
      ingredientId: interaction.ingredientId,
      ingredientName: ing?.name ?? interaction.ingredientId,
      drugId: interaction.drugId,
      drugLabel: drug?.label ?? interaction.drugId,
      severity: interaction.severity,
      text: interaction.text,
      src: interaction.src,
      relevant: selected.has(interaction.drugId),
    };
  });

  return {
    id: product.id,
    brand: product.brand,
    name: product.name,
    sub: product.sub,
    initials: product.initials,
    ingredients: product.ingredients.map((ref) => {
      const ing = ingredientById.get(ref.ingredientId);
      return { name: ing?.name ?? ref.ingredientId, amt: ref.amount, active: ref.active };
    }),
    evidence: evidenceViews,
    interactions: interactionViews,
    verifiedDate: product.source.lastVerified,
  };
}
