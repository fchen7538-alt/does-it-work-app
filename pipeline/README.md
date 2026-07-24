# Data pipeline

Populates `data/*.json`, which the app reads at request time (see `src/lib/data.ts`).

```
DSLD (supplements) ─┐
openFDA (OTC drugs) ─┼─> RxNorm (name normalization) ─> PubMed E-utilities (study counts) ─> data/*.json
```

## Running it

```
npm run sync            # full pipeline: dsld -> openfda -> rxnorm -> pubmed
npm run sync:dsld       # just refresh supplement products
npm run sync:openfda    # just refresh OTC drug products
npm run sync:rxnorm     # just backfill missing RXCUIs
npm run sync:pubmed     # just refresh study counts + review candidates

npm run sync:dsld -- --brand="Nature Made"   # resync one brand only
npm run sync:openfda -- --brand="Advil"      # (also works for openfda)
```

Requires outbound HTTPS to `api.ods.od.nih.gov`, `api.fda.gov`, `rxnav.nlm.nih.gov`,
and `eutils.ncbi.nlm.nih.gov`. None of these require an API key for the request
volume this app needs, but you can raise rate limits with:

- `OPENFDA_API_KEY` — openFDA, get one at https://open.fda.gov/apis/authentication/
- `NCBI_API_KEY` — PubMed E-utilities, get one from an NCBI account (raises the
  limit from 3 req/sec to 10 req/sec)

**If you're behind an HTTP(S) proxy on Node ≥22.21**, Node's built-in `fetch`
doesn't read `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set — the `sync*`
npm scripts already set it, so this only matters if you invoke
`pipeline/build.ts` directly (e.g. via `tsx`) instead of through npm.

## Known limitations (found running this for real)

- **Very short/generic brand names don't reliably surface via DSLD's search.**
  DSLD's `/search-filter` has no dedicated brand-filter parameter — the
  working approach is a quoted exact phrase in `q` (`q="Life Extension"`),
  post-filtered client-side to an exact brand match. That works well for
  distinctive brand names, but DSLD registers "NOW Foods" products under the
  bare brand `"NOW"`; a quoted `q="NOW"` search still ranks by full-text
  relevance, and "now" is common enough in ordinary label text that a small
  page size returns zero real NOW-brand hits. **Fixed**: verified live that
  size 100 reliably surfaces real matches (0 at size 50, 45 at size 100) —
  `PER_BRAND_SEARCH_SIZE` in `build.ts` is set to 100 for every brand, which
  also gives everyone deeper coverage, not just NOW.
- **DSLD's rate limit is a rolling/cumulative quota, not a simple per-request
  one.** At `PER_BRAND_SEARCH_SIZE=100` across 18 brands, brands searched
  later in a run started getting 429s — even their initial search call, not
  just individual label fetches — while earlier brands in the same run
  succeeded cleanly. Slowing the throttle from 500ms to 1000ms between
  requests pushed the wall further out (more brands completed) but didn't
  eliminate it; two brands (Doctor's Best, New Chapter) still came back
  empty across two separate runs about 30 minutes apart. `getProductLabel`
  failures are now caught per-product rather than aborting the rest of the
  brand's products (see `build.ts`), so a mid-run 429 no longer costs more
  than the one product it hit — but there's currently no logic to detect
  "we're rate-limited, stop and wait" versus just retrying with backoff,
  which would be the real fix for finishing a brand-list this size in one
  run. Re-running `npm run sync:dsld` later (the pipeline is idempotent —
  `upsertBy` just fills in whatever was missing) is the practical workaround
  today.
- **DSLD label submissions aren't consistently capitalized.** The same real
  brand shows up with different casing across individual label entries —
  seen live: `"Garden Of Life"` and `"Now"` alongside the far more common
  `"Garden of Life"` and `"NOW"`. Using the raw per-label brand string as
  `product.brand` would fragment one real brand into multiple visually
  distinct facets in the search/med-bar UI. Fixed the same way as the
  openFDA per-label brand-name issue below: `mapDsldLabelToProduct` takes
  the canonical brand we searched for and uses that for `product.brand`
  and the product id, not whatever casing that specific label happened to
  use.
- **A brand can be registered in DSLD under a completely different
  `brandName` string, not just different casing.** Sports Research's own
  label submissions are filed under `"SR SportsResearch"`, not
  `"Sports Research"` — the exact-match brand filter silently missed all 11
  of their real products (including a fish oil a user scanned in and got a
  genuine "not found" for, since the product wasn't in our catalog at all).
  `SUPPLEMENT_BRANDS` in `pipeline/config.ts` is now `{name, aliases?}`
  instead of a flat string list — `searchProductsByBrand` runs once per
  alias term (deduped by hit id) and every hit still gets normalized to the
  canonical `name` in `mapDsldLabelToProduct`, so aliased submissions group
  under the same brand facet in the app rather than fragmenting. Only
  Sports Research has a known alias today; other brands likely have the
  same class of issue undiscovered, found opportunistically (as this one
  was) rather than through a systematic audit of every brand's raw label
  submissions.
- **openFDA's `active_ingredient` and `purpose` fields are free-text prose,
  not structured data**, and combo products (e.g. Excedrin's 3-ingredient
  formula) concatenate multiple ingredients/purposes into one string with no
  reliable separator. `parseActiveIngredientLines` and `cleanPurpose` in
  `pipeline/sources/openfda.ts` handle the common cases (a name immediately
  followed by a dose; a fixed vocabulary of purpose categories) and discard
  anything that doesn't parse cleanly rather than guess — so some real
  combo-product variants (e.g. certain liquigel or PM formulations) end up
  with 0 usable active ingredients and are skipped, not shown with wrong data.
- **`getProductLabel` only reads the top level of `ingredientRows`** — DSLD
  actually nests sub-nutrients several levels deep (`nestedRows`), and for
  fish oil/cod liver oil products this meant the top-level "Fish Oil" row's
  *gross oil weight* (e.g. 2400 mg) was used as the amount, when the real
  EPA and DHA content nested underneath was only 360 mg + 240 mg — most of
  that gross weight isn't omega-3 at all. Fixed with a targeted tree search
  (`omega3Amount` in `pipeline/sources/dsld.ts`) that finds EPA/DHA by their
  stable UNII codes anywhere in a row's subtree and reports the real
  `"EPA 360 mg, DHA 240 mg"` instead — this is also why fish oil products
  now show that split instead of one combined omega-3 number, since that's
  what's actually on the label. Some labels only report the combined
  omega-3 total without itemizing EPA vs. DHA; that shows as
  `"360 mg total omega-3 (EPA/DHA not split on this label)"` rather than
  guessing a split. DSLD represents "not broken out" as quantity `0`/unit
  `"NP"` rather than omitting the row — `realQuantity` treats that as
  absent, not a real zero, so products genuinely missing the split don't
  show a false "0 mg EPA." This fix is narrow (fish/cod-liver oil only);
  the general nested-row-ignored issue likely affects other multi-part
  nutrients too (e.g. Total Fat's Saturated/Polyunsaturated/Monounsaturated
  breakdown) but hasn't been audited beyond omega-3.
  **Known remaining gap**: some labels report EPA/DHA in "ethyl ester" form
  (a different UNII code than the plain/triglyceride form `omega3Amount`
  looks for), which this fix doesn't catch — those products still fall back
  to the gross "Fish Oil" weight (e.g. `kirkland-signature-fish-oil-1200-mg`).
  Worse, on at least one live label checked (DSLD id 207311), the ethyl-ester
  EPA row's own `name`/`ingredientId` fields are mislabeled as DHA in DSLD's
  source data, with only the free-text `notes` field distinguishing them —
  not safe to auto-extract without risking a wrong EPA/DHA swap, so it's left
  alone rather than guessed at.
- **DSLD marks every Supplement Facts row `active`, including macronutrient
  bookkeeping** (Calories, Total Fat, Cholesterol, Total Carbohydrates,
  Protein, etc.) alongside a product's real active ingredients — found while
  verifying the omega-3 fix above, when a fish oil product's "Research
  found" showed 9,949,141 studies because "Protein" was being treated as an
  active ingredient worth its own PubMed count (a plain "protein" query is
  about as generic as PubMed search gets). `NUTRITION_FACTS_PANEL_IDS` in
  `build.ts` now forces these to `active: false` on ingest — still shown in
  the ingredient list for label completeness, just excluded from research/
  interaction evidence. Applied retroactively to the existing 867 products
  (841 ingredient rows across 328 products) and removed the 10 now-orphaned
  evidence.json entries for these ids, since re-syncing every brand just for
  this would have meant re-pulling the whole catalog.

## What's automated vs. curated

- **Product data** (brand, name, ingredient list, amounts): pulled live from
  DSLD (`pipeline/sources/dsld.ts`) and openFDA (`pipeline/sources/openfda.ts`).
  DSLD also captures `upc` when the label response includes one — this powers
  the barcode scanner in the UI (see the main `README.md`'s "Scanning"
  section and `data/README.md` for current coverage). openFDA's label data
  has no UPC field, so OTC products never get one from this pipeline.
- **Name normalization**: RxNorm (`pipeline/sources/rxnorm.ts`) resolves raw
  label ingredient names to a canonical RXCUI-backed ingredient id, so
  "Acetaminophen" on a Tylenol label and "acetaminophen" in an interaction
  record match. Most dietary ingredients (herbs, "curcumin extract," etc.)
  have no RxNorm concept — that's expected, `rxcui` is `null` for those.
- **Study counts**: pulled live from PubMed E-utilities (`pipeline/sources/pubmed.ts`),
  shown directly as "X studies found."
- **Review verdicts** ("what reviewers concluded"): the pipeline finds and
  cites a candidate systematic review/Cochrane review (PMID, journal, year)
  but does not auto-generate the plain-language conclusion text — that's
  written up editorially from the actual abstract/full text and only then
  added to `data/evidence.json`. This is why some ingredients have a
  `reviewVerdict` and others don't: one exists only when a human has verified
  a review actually states a conclusion.
- **Interactions** (`data/interactions.json`): a maintained clinical dataset,
  not scraped. Severity language and interaction text are written from
  clinical references and kept deliberately narrow — individual drugs, not
  drug classes — so nothing is asserted that hasn't been checked.

## Current state in this repo

The `data/*.json` files currently checked in are **live** (`data/meta.json`,
`status: "live"`) — pulled for real from DSLD, openFDA, RxNorm, and PubMed
E-utilities: 870 products (846 supplement across 16 of 18 configured
brands, 24 OTC) and 1415 ingredients. See `data/README.md` for the full
breakdown, including the Doctor's Best/New Chapter rate-limit gap noted
above. Re-run `npm run sync` any time to refresh — curated `sub`,
`studiedAmount`, `chips`, and `reviewVerdict` fields in `data/evidence.json`,
and all of `data/interactions.json`, are preserved rather than clobbered
(see the merge logic in `pipeline/build.ts`).
