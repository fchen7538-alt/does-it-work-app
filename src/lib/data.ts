import productsJson from "@data/products.json";
import ingredientsJson from "@data/ingredients.json";
import drugsJson from "@data/drugs.json";
import evidenceJson from "@data/evidence.json";
import interactionsJson from "@data/interactions.json";
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

export function listDrugs(): Drug[] {
  return drugs;
}

export function listProducts(query: string, selectedDrugIds: string[]): ProductListItem[] {
  const q = query.trim().toLowerCase();
  const selected = new Set(selectedDrugIds);

  return products
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q))
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
