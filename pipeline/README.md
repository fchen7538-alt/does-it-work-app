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

The `data/*.json` files currently checked in are **seed data** (see
`data/meta.json`, `status: "seed"`) — hand-curated to the exact schema the
live pipeline produces, covering the 8 supplement brands and OTC drugs named
in the app spec. This sandbox's network policy blocks the four hosts above,
so the live pipeline has been written and is ready to run, but hasn't been
executed against the real APIs yet. Running `npm run sync` from an
environment with network access will overwrite the seed data with live
results (existing curated `sub`, `studiedAmount`, `chips`, and
`reviewVerdict` fields in `data/evidence.json` are preserved rather than
clobbered — see the merge logic in `pipeline/build.ts`).
