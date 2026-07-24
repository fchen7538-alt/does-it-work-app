# Does It Work?

A plain-language supplement and OTC interaction checker. Search a product (by
typing, scanning its barcode, or scanning its label), tap the prescription
drugs you're currently taking, and see factual counts — study counts,
interactions on file — instead of a 1-5 score. Design, tone, and interaction
pattern follow the provided prototype exactly.

## Stack

Next.js 14 (App Router) + TypeScript, no external database — `data/*.json` is
the datastore, read by `src/lib/data.ts` and served through four API routes.
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
- `src/app/api/*` — four routes: `GET /api/products` (search + med-filtered
  list), `GET /api/products/[id]` (full detail), `GET /api/products/by-upc/[upc]`
  (barcode lookup, used by the scanner), `GET /api/meds` (the drug picker list).
- `src/components/*` — the UI, a straight port of the prototype's markup/CSS
  into React, wired to the API instead of a hardcoded array. `src/app/globals.css`
  is the prototype's stylesheet with one addition (`.ingredient-evidence-block`)
  for products with more than one active ingredient — see below. `ScannerModal.tsx`
  is the one piece with no prototype equivalent — see "Scanning" below.
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

## Scanning

The search box has a scan button that opens one camera view handling both
barcode and label-text recognition at once — no mode picker:

- **Barcode** — decoded continuously in the background with
  `@zxing/browser` for as long as the scanner is open, resolved via
  `GET /api/products/by-upc/[upc]`, jumping straight to the product's
  detail view the moment a match is found. If the barcode isn't on file
  (see coverage note below), a note points the user at label-text capture
  or typing the name instead — it never fails silently.
- **Label text** — a "Capture label text" button is always available
  alongside the live barcode scanning, for products with no UPC on file or
  when the barcode itself isn't legible. Captures the current frame and
  runs it through a self-hosted `tesseract.js` (worker/core/lang files
  under `public/tesseract/` rather than tesseract.js's CDN default, so it
  works without third-party runtime fetches), takes the longest clean line
  of recognized text as a best-effort name guess, and drops it into the
  normal search box. This is also why `listProducts` matches per-word
  across brand+name instead of one contiguous substring — noisy OCR output
  ("NATURE MADE CALCIU") and differently-ordered typed queries both need to
  land on the right product.

This used to be two tabs the user had to switch between manually (each
restarting the camera on switch), which was also the source of a whole
class of race-condition bugs — a barcode decode loop from the tab you just
left could still be resolving/running when the other tab's effect started,
occasionally leaking a live decode loop that starved the OCR capture step
of CPU long enough to time out. Running one camera session for the whole
time the scanner is open, with barcode decoding always active and capture
always available, removes the restart (and the races that came with it)
entirely — see `ScannerModal.tsx`'s effect for the current single-session
setup.

**Barcode coverage**: `upc` is only populated for DSLD-sourced (supplement)
products whose brand has been re-synced since the field was added to the
pipeline — currently 397 products across 7 brands (Nature's Bounty, Nature's
Way, Jarrow Formulas, Sports Research, Kirkland Signature, Nature Made, Life
Extension). Re-sync a brand with `npm run sync:dsld -- --brand="Brand Name"`
to backfill its UPCs; the remaining 9 supplement brands and all 24 OTC
products predate this field and have no barcode to match against yet, which
is expected and handled by the fallback note above, not a bug.

**Barcode lookup is exact-match only, by design** — a real UPC ties to one
specific pack size/count SKU, not a product line. DSLD's own record for a
given product name isn't guaranteed to be the same SKU as the physical
bottle in front of a user (e.g. a 15-count travel size vs. the 180-count
DSLD has on file) — different real UPCs for what's otherwise the same
product. Barcode scanning can't paper over that with fuzzy matching without
risking a match to the wrong pack size's ingredient amounts; label-text
capture (which searches by name, not exact SKU) is the intended fallback
for exactly this case, not a lesser option.

**Temporary**: the scanner currently shows a small green diagnostic line
(status, video dimensions, track settings) at the bottom of the camera
view — added to debug real-device-only failures that don't reproduce with
a fake test camera (a genuine positioning bug once had the camera
rendering tens of thousands of pixels off-screen; see `ScannerModal.tsx`'s
`scanner-debug` element). Remove once scanning is confirmed reliable
end-to-end on a real device.

## Data pipeline status

**`data/*.json` is live data**, pulled for real from DSLD, openFDA, RxNorm,
and PubMed E-utilities: 870 products (846 supplement across 16 of 18
configured brands — the original 8 plus Nordic Naturals, Puritan's Pride,
Kirkland Signature, Centrum, Jarrow Formulas, MegaFood, Optimum Nutrition,
and Nature's Way — 24 OTC) and 1415 ingredients, with real PubMed study
counts as of `data/meta.json`'s `lastSynced` timestamps. 83 individual
drugs and 215 interaction records are hand-curated (see below). Curated
content (interaction records, and reviewer verdicts for the original ~30
core ingredients) is preserved rather than overwritten by the pipeline —
see `data/README.md` for the full breakdown and known gaps (e.g. two
brands still empty due to a DSLD rate-limit wall), and `pipeline/README.md`
for what's automated vs. editorially curated and why.

Re-run any time with `npm run sync` (or a `sync:<source>` stage for just one
API) once you have network access to `api.ods.od.nih.gov`, `api.fda.gov`,
`rxnav.nlm.nih.gov`, and `eutils.ncbi.nlm.nih.gov`.
