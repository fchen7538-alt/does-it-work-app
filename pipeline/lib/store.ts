import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Product, Ingredient, Evidence, Interaction, Drug, SyncMeta } from "../../src/lib/types";

const DATA_DIR = resolve(__dirname, "../../data");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(resolve(DATA_DIR, file), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  writeFileSync(resolve(DATA_DIR, file), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export const store = {
  readProducts: () => readJson<Product[]>("products.json", []),
  writeProducts: (v: Product[]) => writeJson("products.json", v),

  readIngredients: () => readJson<Ingredient[]>("ingredients.json", []),
  writeIngredients: (v: Ingredient[]) => writeJson("ingredients.json", v),

  readDrugs: () => readJson<Drug[]>("drugs.json", []),
  writeDrugs: (v: Drug[]) => writeJson("drugs.json", v),

  readEvidence: () => readJson<Evidence[]>("evidence.json", []),
  writeEvidence: (v: Evidence[]) => writeJson("evidence.json", v),

  readInteractions: () => readJson<Interaction[]>("interactions.json", []),
  writeInteractions: (v: Interaction[]) => writeJson("interactions.json", v),

  readMeta: () =>
    readJson<SyncMeta>("meta.json", {
      status: "seed",
      lastSynced: { dsld: null, openfda: null, rxnorm: null, pubmed: null },
    }),
  writeMeta: (v: SyncMeta) => writeJson("meta.json", v),
};

export function upsertBy<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = [...list];
  next[idx] = item;
  return next;
}
