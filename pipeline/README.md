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
  relevance, and "now" is common enough in ordinary label text that the top
  N results rarely include actual NOW-brand products. Fix would be paging
  through with a much larger `size` and filtering, which trades a lot more
  API load for a marginal-brand's coverage — not done by default.
- **openFDA's `active_ingredient` and `purpose` fields are free-text prose,
  not structured data**, and combo products (e.g. Excedrin's 3-ingredient
  formula) concatenate multiple ingredients/purposes into one string with no
  reliable separator. `parseActiveIngredientLines` and `cleanPurpose` in
  `pipeline/sources/openfda.ts` handle the common cases (a name immediately
  followed by a dose; a fixed vocabulary of purpose categories) and discard
  anything that doesn't parse cleanly rather than guess — so some real
  combo-product variants (e.g. certain liquigel or PM formulations) end up
  with 0 usable active ingredients and are skipped, not shown with wrong data.

## What's automated vs. curated

- **Product data** (brand, name, ingredient list, amounts): pulled live from
  DSLD (`pipeline/sources/dsld.ts`) and openFDA (`pipeline/sources/openfda.ts`).
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
E-utilities: 171 products (147 supplement, 24 OTC) and 471 ingredients. See
`data/README.md` for the full breakdown, including the NOW Foods gap noted
above. Re-run `npm run sync` any time to refresh — curated `sub`,
`studiedAmount`, `chips`, and `reviewVerdict` fields in `data/evidence.json`,
and all of `data/interactions.json`, are preserved rather than clobbered
(see the merge logic in `pipeline/build.ts`).
