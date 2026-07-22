# Does It Work?

A plain-language supplement and OTC interaction checker. Search a product, tap
the prescription drugs you're currently taking, and see factual counts —
study counts, interactions on file — instead of a 1-5 score. Design, tone,
and interaction pattern follow the provided prototype exactly.

## Stack

Next.js 14 (App Router) + TypeScript, no external database — `data/*.json` is
the datastore, read by `src/lib/data.ts` and served through three API routes.
That's the whole surface area: a data pipeline that populates JSON, and a UI
that reads it.

```
npm install
npm run dev      # http://localhost:3000
npm run build && npm run start   # production build
```

## How it's organized

- `src/lib/types.ts` — the data model. Ingredients and interactions are
  modeled independently of products: a `Product` only holds
  `{ingredientId, amount, active}` references, never a score of its own. See
  the file's header comment for why.
- `src/lib/data.ts` — joins products + ingredients + evidence + interactions
  into the view models the UI/API need, computing per-request things like
  "which interactions match what you're currently taking."
- `src/app/api/*` — three routes: `GET /api/products` (search + med-filtered
  list), `GET /api/products/[id]` (full detail), `GET /api/meds` (the
  drug picker list).
- `src/components/*` — the UI, a straight port of the prototype's markup/CSS
  into React, wired to the API instead of a hardcoded array. `src/app/globals.css`
  is the prototype's stylesheet with one addition (`.ingredient-evidence-block`)
  for products with more than one active ingredient — see below.
- `pipeline/*` — the live data pipeline (DSLD, openFDA, RxNorm, PubMed
  E-utilities). See `pipeline/README.md`.
- `data/*.json` + `data/README.md` — the datastore and its provenance.

## One deliberate departure from the prototype

The prototype's `interactions` were a flat array per product. Since the spec
requires ingredient and interaction data to stay independent of product data,
interactions and evidence here are joined **per active ingredient**, then
unioned (deduped) across a product's active ingredients. For single-active-
ingredient products (most of them) this renders identically to the prototype.
For multi-ingredient products — Nature Made Turmeric Curcumin (curcumin +
black pepper extract), Sports Research D3+K2, Excedrin (acetaminophen +
aspirin + caffeine) — the UI labels each block with the ingredient it came
from, so it's clear which claim is about which ingredient.

## Data pipeline status — read this first

**The data currently in `data/*.json` is seed data, not a live API pull.**
This development sandbox's outbound network policy blocks the four hosts the
pipeline needs (`api.ods.od.nih.gov`, `api.fda.gov`, `rxnav.nlm.nih.gov`,
`eutils.ncbi.nlm.nih.gov` — confirmed via 403 policy denials, not a bug).

So: the pipeline is fully written and real — `pipeline/sources/{dsld,openfda,rxnorm,pubmed}.ts`
are working clients against the actual documented endpoints, and
`pipeline/build.ts` orchestrates them into `data/*.json` — but it hasn't been
executed against the live APIs yet. `data/*.json` was instead hand-curated to
the exact same schema, covering the 8 supplement brands (Nature Made, NOW
Foods, Nature's Bounty, Garden of Life, Sports Research, Solgar, Life
Extension, Thorne) and OTC brands (Tylenol, Advil, Aleve, Excedrin) named in
the spec, with 20 products, 20 active ingredients, and 38 interactions across
the 11 specified drugs — all medically reviewed for accuracy rather than
invented. Full provenance notes are in `data/README.md`.

**To get live data:** run `npm run sync` from any environment with normal
outbound network access (your own machine, a CI job, or this environment
after widening its egress policy to include the four hosts above). It
overwrites `data/*.json` in place using the same schema — no code changes
needed — and preserves hand-curated evidence fields (`sub`, `studiedAmount`,
`chips`, `reviewVerdict`) rather than clobbering them with automated content.
See `pipeline/README.md` for what's automated vs. what stays editorially
curated (interaction severity/text and review-verdict conclusions,
deliberately — see that file for why).
