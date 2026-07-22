// Core data model.
//
// Ingredient and interaction data are intentionally kept separate from
// product data: a Product only *references* ingredients by id. Nothing in
// this schema lets a score or verdict attach to a branded product directly —
// evidence and interactions are properties of ingredients, not of products.

export type ProductKind = "supplement" | "otc";

export interface IngredientRef {
  /** Canonical ingredient id, foreign key into ingredients.json */
  ingredientId: string;
  /** Amount as it appears on this product's label, e.g. "475 mg" */
  amount: string;
  /** Whether this is a labeled active ingredient (vs. an inactive/other ingredient) */
  active: boolean;
}

export interface Product {
  id: string;
  brand: string;
  name: string;
  /** Short descriptor line shown under the product name, e.g. "60 softgels · with black pepper extract" */
  sub: string;
  /** Two-letter thumbnail initials */
  initials: string;
  kind: ProductKind;
  ingredients: IngredientRef[];
  /** Provenance of the label data itself */
  source: {
    /** "dsld" | "openfda" | "seed" */
    provider: "dsld" | "openfda" | "seed";
    /** DSLD product id, or openFDA set_id, when known */
    sourceId?: string;
    /** ISO date this record was last pulled/verified */
    lastVerified: string;
  };
}

/**
 * A canonical ingredient (dietary ingredient or drug active-ingredient).
 * RxNorm's RXCUI is used to normalize names so that e.g. "Acetaminophen"
 * (an OTC product's active ingredient) and "Tylenol" (a brand name a user
 * might search) and "acetaminophen" (an interaction record) all resolve to
 * the same concept.
 */
export interface Ingredient {
  id: string;
  name: string;
  /** RxNorm RXCUI concept id, when this ingredient/drug exists in RxNorm. Most dietary ingredients (herbs, minerals as such) do not. */
  rxcui: string | null;
  category: "supplement" | "otc-active";
  /** Alternate/brand names that should resolve to this ingredient via RxNorm normalization */
  synonyms?: string[];
}

/** A systematic review / Cochrane-style verdict, only present when one was actually found. */
export interface ReviewVerdict {
  text: string;
  caveat: string;
  source: string;
}

export interface Evidence {
  ingredientId: string;
  /** PubMed E-utilities esearch count for this ingredient's primary studied use */
  studyCount: number;
  /** 0-5 tally fill, a coarse visual proxy for strength of evidence volume */
  filled: number;
  /** One-line plain-language summary of what the studies mostly looked at */
  sub: string;
  /** Human-readable dose range studied */
  studiedAmount: string;
  /** Small factual record chips, e.g. "3 larger studies" */
  chips: string[];
  src: string;
  /** Only present when a named systematic review/Cochrane review with a stated conclusion was found */
  reviewVerdict?: ReviewVerdict;
}

export type Severity = "Minor" | "Minor to moderate" | "Moderate" | "Moderate to major" | "Major";

/** Interaction between one canonical ingredient and one specific individual drug (not a drug class). */
export interface Interaction {
  id: string;
  ingredientId: string;
  /** Drug id, matches Drug.id in drugs.json (a specific individual drug, e.g. "warfarin") */
  drugId: string;
  severity: Severity;
  text: string;
  src: string;
}

/** A specific individual drug a user can select as "currently taking." */
export interface Drug {
  id: string;
  label: string;
  rxcui: string | null;
  brandNames?: string[];
}

export interface SyncMeta {
  status: "seed" | "live";
  lastSynced: {
    dsld: string | null;
    openfda: string | null;
    rxnorm: string | null;
    pubmed: string | null;
  };
}

// ---- View-model shapes returned by the API / used by the frontend ----

export interface ProductListItem {
  id: string;
  brand: string;
  name: string;
  sub: string;
  initials: string;
  /** count of interactions on file that involve the given selected drug ids (computed server-side per request) */
  matchingInteractionCount: number;
}

export interface ProductIngredientView {
  name: string;
  amt: string;
  active: boolean;
}

export interface IngredientEvidenceView extends Evidence {
  ingredientName: string;
}

export interface ProductInteractionView {
  ingredientId: string;
  ingredientName: string;
  drugId: string;
  drugLabel: string;
  severity: Severity;
  text: string;
  src: string;
  /** true if this interaction involves a drug the user has selected as "currently taking" */
  relevant: boolean;
}

export interface ProductDetailView {
  id: string;
  brand: string;
  name: string;
  sub: string;
  initials: string;
  ingredients: ProductIngredientView[];
  /** Evidence for each *active* ingredient in the product */
  evidence: IngredientEvidenceView[];
  interactions: ProductInteractionView[];
  verifiedDate: string;
}
