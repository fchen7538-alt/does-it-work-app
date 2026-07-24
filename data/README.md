# data/

These files are what `src/lib/data.ts` reads at request time. They're written to
the schema the pipeline in `/pipeline` produces (see `pipeline/README.md`), so
`npm run sync` overwrites them in place, in any environment with network
access to the source APIs.

**Current status: live** (`meta.json` → `"status": "live"`, with per-source
`lastSynced` timestamps). 870 products and 1415 ingredients (795 of them
active in at least one product), pulled from the real DSLD, openFDA,
RxNorm, and PubMed E-utilities APIs:

- `products.json` — supplement products live-pulled from DSLD across 16 of
  the 18 configured brands (the original 8 — Nature Made, NOW, Nature's
  Bounty, Garden of Life, Sports Research, Solgar, Life Extension, Thorne —
  plus Nordic Naturals, Puritan's Pride, Kirkland Signature, Centrum, Jarrow
  Formulas, MegaFood, Optimum Nutrition, Nature's Way), plus OTC products
  live-pulled from openFDA (Tylenol, Advil, Motrin, Aleve, Excedrin). **The
  original NOW Foods gap is fixed**: DSLD registers their products under
  the brand `"NOW"`, not `"NOW Foods"`, and a small page size wasn't
  enough to surface real matches in DSLD's relevance-ranked search — bumping
  the per-brand search size from 30 to 100 fixed it (0 matches at size 50,
  45 at size 100), and now benefits every brand with deeper coverage, not
  just NOW.
  **Doctor's Best and New Chapter are a known gap**: both hit DSLD's rate
  limit hard enough across two separate sync runs (~30 min apart) that even
  their initial search call came back 429, while brands searched earlier in
  the same run succeeded. The pattern across both runs — slowing the
  per-request throttle from 500ms to 1000ms pushed the wall further out but
  didn't eliminate it — points to a rolling/cumulative quota rather than a
  simple per-request limit, so per-hit retry/backoff alone doesn't recover
  from it. A later `npm run sync:dsld` run, after more cooldown time, should
  be able to pick these two up — the pipeline is idempotent and designed for
  exactly this kind of incremental resumption.
  **UPC coverage is partial**: `upc` (used by the barcode scanner, see
  `README.md`'s "Scanning" section) was added to the DSLD pipeline after
  most of the catalog was already synced. Re-syncing a brand backfills it —
  currently done for 397 products across 7 brands (Nature's Bounty, Nature's
  Way, Jarrow Formulas, Sports Research, Kirkland Signature, Nature Made,
  Life Extension); the remaining 9 supplement brands haven't been re-synced
  yet. `npm run sync:dsld -- --brand="Brand Name"` backfills any brand.
  openFDA (OTC) label data doesn't expose a UPC field at all, so OTC
  products won't get one from this pipeline.
- `ingredients.json` — canonical ingredient list, including every "other
  ingredient" (fillers, capsule shells, etc.) DSLD/openFDA returned, not
  just active ones. RxCUI is filled in live via RxNorm where a concept
  exists; most dietary ingredients (herbs, minerals-as-such) legitimately
  have none (`rxcui: null`) since RxNorm covers drugs, not foods/botanicals.
  **Known gap**: live label text creates near-duplicate ingredients when
  wording differs (e.g. "Coenzyme Q10" vs "Coenzyme Q-10" vs a branded
  formulation name) — `resolveIngredient` in `pipeline/build.ts` only
  merges on an exact case-insensitive name/synonym match, so it doesn't
  catch these automatically. CoQ10 (4 variants) and ginkgo biloba (2
  variants) have been manually merged into one canonical id each so their
  interaction records apply everywhere they should; other ingredient
  families (probiotics blends in particular, ~10 near-duplicate ids) have
  not been merged yet — some of them are genuinely distinct proprietary
  formulations, so a global fuzzy-merge isn't safe without review.
- `evidence.json` — `studyCount` is a live PubMed esearch count as of the
  `lastSynced.pubmed` timestamp in `meta.json`. **Excludes macronutrient
  bookkeeping** (Calories, Total Fat, Cholesterol, Total Carbohydrates,
  Protein, etc.) — DSLD's Supplement Facts panel marks these `active` the
  same as real active ingredients, which pulled in meaningless PubMed
  counts (a plain "protein" search returns ~9 million hits) that inflated
  "Research found" on any product with a nutrition panel; see
  `pipeline/README.md`'s known-limitations list for the fix. `reviewVerdict` is only
  present for the original curated set of ~20 ingredients — the pipeline
  finds review candidates for every ingredient (surfaced in `npm run sync`'s
  console output as "review candidate found... needs editorial write-up")
  but deliberately does not auto-generate verdict text (see
  `pipeline/sources/pubmed.ts`), so uncurated ingredients get an honest
  `sub: "Summary pending editorial review."` placeholder instead of a
  fabricated summary.
- `drugs.json` — 83 individual drugs (not classes) a user can select as
  "currently taking," built up over four rounds: the original 11; a batch
  covering diabetes, a second statin, additional blood-pressure drug types,
  a PPI, and a corticosteroid; a batch adding an antiplatelet, more
  psych meds, an antibiotic, digoxin, an opioid, and gabapentin; a large
  batch spanning more statins/blood-pressure drugs (including
  spironolactone, a potassium-sparing diuretic), diabetes drugs, psych meds,
  more PPIs/H2 blockers, more antibiotics, opioids, both remaining major
  DOACs (rivaroxaban, dabigatran), a seizure drug, an antihistamine,
  methotrexate, and a bisphosphonate; and a round adding two more NSAIDs,
  lithium, isotretinoin, tamoxifen, two transplant immunosuppressants
  (cyclosporine, tacrolimus), an antipsychotic, two ADHD stimulants, and
  another beta-blocker. RxCUIs verified live against RxNorm for every
  single one, not guessed. **Not every drug here has curated interaction
  rows yet** — some (e.g. bupropion, azithromycin, cephalexin, sitagliptin,
  cetirizine) were added to the selectable list without a matching
  interaction row because a solid, checkable supplement/OTC interaction
  against this app's current ingredient catalog wasn't there to write
  honestly. This is deliberate: the "currently taking" list and the
  interaction dataset are allowed to grow at different rates, and the UI
  already handles "nothing on file" as a normal, honest state rather than
  an error.
- `interactions.json` — 215 rows across 32 distinct ingredients, a
  maintained clinical dataset by design, not something the pipeline
  generates or an external interactions API produces (there isn't a
  reliable free one anymore — NLM retired their old Interaction API, and a
  licensed clinical tool like Lexicomp is contractually restricted to
  interactive point-of-care use, not automated extraction into another
  product) — see `pipeline/README.md`. Every interaction is either
  well-documented (vitamin K vs. warfarin, mineral chelation of
  fluoroquinolones/tetracyclines/bisphosphonates/PPI-affected absorption,
  NSAID + anticoagulant bleeding risk, ARB/ACE-inhibitor/potassium-sparing
  diuretic + potassium, ginkgo/vitamin E/curcumin + antiplatelets,
  digoxin's narrow safety margin, phenytoin's effect on folate/vitamin D,
  St. John's Wort's broad CYP3A4/P-gp induction and serotonin syndrome risk
  (including its dramatic, transplant-rejection-documented effect on
  cyclosporine/tacrolimus), isotretinoin + vitamin A (both are retinoids,
  additive toxicity), NSAIDs raising lithium levels, valerian's additive
  sedation) or explicitly hedged where the evidence is thinner (CoQ10 +
  statins: framed as "not a safety risk, evidence for the claimed benefit
  is mixed," not a danger warning). Several rows describe a medication
  *depleting* a nutrient (metformin/B12, PPIs/magnesium and iron, loop
  diuretics/potassium) or an *intentional* clinical combination worth
  flagging rather than avoiding (aspirin + clopidogrel dual antiplatelet
  therapy; probiotics alongside amoxicillin/clindamycin; folic acid
  alongside low-dose methotrexate) rather than a supplement simply causing
  harm — included with informational, not alarmist, framing since that's
  the honest shape of the interaction. St. John's Wort's rows deliberately
  exclude lorazepam (glucuronidated, not a CYP3A4 substrate, unlike the
  other benzodiazepines here) and metoprolol (a CYP2D6 substrate, not the
  CYP3A4/P-gp pathway St. John's Wort mainly induces) — the mechanism
  doesn't apply to those two, so nothing is asserted there. Ingredient-side
  coverage is still the much bigger gap now that the catalog has grown:
  795 distinct active ingredients exist across the live-pulled product
  catalog, and only 32 of them have any interaction row yet.

Re-run `npm run sync` (or a `sync:<source>` stage) any time to refresh live
data; curated `evidence.json` fields (`sub`, `studiedAmount`, `chips`,
`reviewVerdict`) and all of `interactions.json` are preserved rather than
overwritten — see the merge logic in `pipeline/build.ts`.

## UI note: "currently taking" is search, not a tap-all list

`src/components/MedSearch.tsx` replaced the old tap-all-that-apply chip grid
(`MedBar.tsx`, removed) with a typeahead: type a few letters, pick from a
dropdown, selected drugs show as removable chips below. This was a direct
response to the med list growing past 80 drugs — rendering every one as a
tappable chip either got very tall or needed an awkward collapse/expand
toggle, where search scales to any list size without either problem. This is
UI-only; `listDrugs()` and the API still return the full set.
