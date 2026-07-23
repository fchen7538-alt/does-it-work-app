# data/

These files are what `src/lib/data.ts` reads at request time. They're written to
the schema the pipeline in `/pipeline` produces (see `pipeline/README.md`), so
`npm run sync` overwrites them in place, in any environment with network
access to the source APIs.

**Current status: live** (`meta.json` → `"status": "live"`, with per-source
`lastSynced` timestamps). 171 products and 471 ingredients, pulled from the
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
  `lastSynced.pubmed` timestamp in `meta.json`. `reviewVerdict` is only
  present for the original curated set of ~20 ingredients — the pipeline
  finds review candidates for every ingredient (surfaced in `npm run sync`'s
  console output as "review candidate found... needs editorial write-up")
  but deliberately does not auto-generate verdict text (see
  `pipeline/sources/pubmed.ts`), so uncurated ingredients get an honest
  `sub: "Summary pending editorial review."` placeholder instead of a
  fabricated summary.
- `drugs.json` — 72 individual drugs (not classes) a user can select as
  "currently taking," built up over three rounds: the original 11; a batch
  covering diabetes, a second statin, additional blood-pressure drug types,
  a PPI, and a corticosteroid; a batch adding an antiplatelet, more
  psych meds, an antibiotic, digoxin, an opioid, and gabapentin; and a large
  batch spanning more statins/blood-pressure drugs (including
  spironolactone, a potassium-sparing diuretic), diabetes drugs, psych meds,
  more PPIs/H2 blockers, more antibiotics, opioids, both remaining major
  DOACs (rivaroxaban, dabigatran), a seizure drug, an antihistamine,
  methotrexate, and a bisphosphonate. RxCUIs verified live against RxNorm
  for every single one, not guessed. **Not every drug here has curated
  interaction rows yet** — some (e.g. bupropion, buspirone, azithromycin,
  cephalexin, sitagliptin, cetirizine) were added to the selectable list
  without a matching interaction row because a solid, checkable
  supplement/OTC interaction against this app's current ingredient catalog
  wasn't there to write honestly. This is deliberate: the "currently taking"
  list and the interaction dataset are allowed to grow at different rates,
  and the UI already handles "nothing on file" as a normal, honest state
  rather than an error.
- `interactions.json` — 195 rows across 31 distinct ingredients, a
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
  St. John's Wort's broad CYP3A4/P-gp induction and serotonin syndrome risk,
  valerian's additive sedation) or explicitly hedged where the evidence is
  thinner (CoQ10 + statins: framed as "not a safety risk, evidence for the
  claimed benefit is mixed," not a danger warning). Several rows describe a
  medication *depleting* a nutrient (metformin/B12, PPIs/magnesium and
  iron, loop diuretics/potassium) or an *intentional* clinical combination
  worth flagging rather than avoiding (aspirin + clopidogrel dual
  antiplatelet therapy; probiotics alongside amoxicillin/clindamycin; folic
  acid alongside low-dose methotrexate) rather than a supplement simply
  causing harm — included with informational, not alarmist, framing since
  that's the honest shape of the interaction. St. John's Wort's rows
  deliberately exclude lorazepam (glucuronidated, not a CYP3A4 substrate,
  unlike the other benzodiazepines here) and metoprolol (a CYP2D6
  substrate, not the CYP3A4/P-gp pathway St. John's Wort mainly induces) —
  the mechanism doesn't apply to those two, so nothing is asserted there.
  Ingredient-side coverage is still the bigger gap: 283 distinct active
  ingredients exist across the live-pulled product catalog, and only 31 of
  them have any interaction row yet.

Re-run `npm run sync` (or a `sync:<source>` stage) any time to refresh live
data; curated `evidence.json` fields (`sub`, `studiedAmount`, `chips`,
`reviewVerdict`) and all of `interactions.json` are preserved rather than
overwritten — see the merge logic in `pipeline/build.ts`.

## UI note: the med list is now large

`src/components/MedBar.tsx` collapses the "currently taking" chip list to
12 by default with a "+N more" toggle (any already-selected drug stays
visible even when collapsed) — with 72 drugs, rendering every chip
unconditionally pushed the med bar to over 1200px tall, well past the
product list below it. This is UI-only; `listDrugs()` and the API still
return the full set.
