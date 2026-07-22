# data/

These files are what `src/lib/data.ts` reads at request time. They're written to
the schema the pipeline in `/pipeline` produces (see `pipeline/README.md`), so
`npm run sync` overwrites them in place, in any environment with network
access to the source APIs.

**Current status: live** (`meta.json` → `"status": "live"`, with per-source
`lastSynced` timestamps). 171 products and 476 ingredients, pulled from the
real DSLD, openFDA, RxNorm, and PubMed E-utilities APIs:

- `products.json` — supplement products live-pulled from DSLD across 7 of
  the 8 requested brands (Nature Made, Nature's Bounty, Garden of Life,
  Sports Research, Solgar, Life Extension, Thorne), plus OTC products
  live-pulled from openFDA (Tylenol, Advil, Motrin, Aleve, Excedrin). **NOW
  Foods is a known gap**: DSLD registers their products under the brand
  `"NOW"`, not `"NOW Foods"` — a single common English word, which DSLD's
  relevance-ranked search doesn't reliably surface in the first page of
  results even with an exact-phrase query. The 2 NOW Foods products present
  are the original hand-curated seed entries, left in place rather than
  dropped. A future fix: page through DSLD with a much larger `size` and
  post-filter, or search by an ID/UPC range instead of brand text.
- `ingredients.json` — canonical ingredient list, including every "other
  ingredient" (fillers, capsule shells, etc.) DSLD/openFDA returned, not
  just active ones. RxCUI is filled in live via RxNorm where a concept
  exists; most dietary ingredients (herbs, minerals-as-such) legitimately
  have none (`rxcui: null`) since RxNorm covers drugs, not foods/botanicals.
- `evidence.json` — `studyCount` is a live PubMed esearch count as of the
  `lastSynced.pubmed` timestamp in `meta.json`. `reviewVerdict` is only
  present for the original curated set of ~20 ingredients — the pipeline
  finds review candidates for every ingredient (surfaced in `npm run sync`'s
  console output as "review candidate found... needs editorial write-up")
  but deliberately does not auto-generate verdict text (see
  `pipeline/sources/pubmed.ts`), so uncurated ingredients get an honest
  `sub: "Summary pending editorial review."` placeholder instead of a
  fabricated summary.
- `interactions.json` — unchanged from the original curated set (38 rows
  across the 11 specified drugs). This is a maintained clinical dataset by
  design, not something the pipeline generates — see `pipeline/README.md`.

Re-run `npm run sync` (or a `sync:<source>` stage) any time to refresh live
data; curated `evidence.json` fields (`sub`, `studiedAmount`, `chips`,
`reviewVerdict`) and all of `interactions.json` are preserved rather than
overwritten — see the merge logic in `pipeline/build.ts`.
