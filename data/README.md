# data/

These files are what `src/lib/data.ts` reads at request time. They're written to
the schema the pipeline in `/pipeline` produces (see `pipeline/README.md`), so
`npm run sync` overwrites them in place, in any environment with network
access to the source APIs.

**Current status: live** (`meta.json` → `"status": "live"`, with per-source
`lastSynced` timestamps). 171 products and 472 ingredients, pulled from the
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
- `drugs.json` — 19 individual drugs (not classes) a user can select as
  "currently taking": the original 11, plus metformin, simvastatin,
  losartan, metoprolol, omeprazole, hydrochlorothiazide, furosemide, and
  prednisone — chosen to broaden coverage across diabetes, an additional
  statin, additional blood-pressure drug types (ARB, beta-blocker, two
  diuretic mechanisms), a PPI, and a corticosteroid. RxCUIs verified live
  against RxNorm, not guessed.
- `interactions.json` — 58 rows, a maintained clinical dataset by design,
  not something the pipeline generates — see `pipeline/README.md`. Every
  interaction is either well-documented (vitamin K vs. warfarin, mineral
  chelation of fluoroquinolones/tetracyclines/PPI-affected absorption, NSAID
  + anticoagulant bleeding risk, ARB/thiazide + potassium or calcium) or
  explicitly hedged where the evidence is thinner (CoQ10 + statins: framed
  as "not a safety risk, evidence for the claimed benefit is mixed," not a
  danger warning). Several rows describe a medication *depleting* a
  nutrient (metformin/B12, PPIs/magnesium, loop diuretics/potassium) rather
  than a supplement causing harm — worth knowing either way, so they're
  included with informational rather than alarmist framing.

Re-run `npm run sync` (or a `sync:<source>` stage) any time to refresh live
data; curated `evidence.json` fields (`sub`, `studiedAmount`, `chips`,
`reviewVerdict`) and all of `interactions.json` are preserved rather than
overwritten — see the merge logic in `pipeline/build.ts`.
