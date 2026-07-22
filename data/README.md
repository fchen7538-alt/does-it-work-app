# data/

These files are what `src/lib/data.ts` reads at request time. They're written to
the exact schema the pipeline in `/pipeline` produces (see `pipeline/README.md`),
so `npm run sync` can overwrite them in place once run from an environment with
network access to the source APIs.

**Current status: seed data**, not a live pull (`meta.json` → `"status": "seed"`).
This sandbox's network policy blocks the DSLD, openFDA, RxNorm, and PubMed hosts,
so these files were hand-curated to realistic, medically-reviewed content instead:

- `products.json` — 20 real product lines across the 8 requested supplement
  brands (Nature Made, NOW Foods, Nature's Bounty, Garden of Life, Sports
  Research, Solgar, Life Extension, Thorne) plus 4 OTC brands (Tylenol, Advil,
  Aleve, Excedrin). Doses reflect each brand's actual typical product line but
  should be treated as representative, not scraped from a live label.
- `ingredients.json` — canonical ingredient list. RxCUI values are included
  only where they're well-established, stable identifiers (e.g. acetaminophen
  161, ibuprofen 5640, aspirin 1191); everything else is `null` rather than a
  guessed value. A live `npm run sync:rxnorm` run will fill these in properly.
- `evidence.json` — study counts are representative approximations, not live
  PubMed esearch counts. `reviewVerdict` is only present where the underlying
  systematic review/Cochrane review is one we're genuinely confident exists
  and concludes what's described (e.g. the Cochrane reviews on melatonin for
  jet lag, omega-3s for cardiovascular disease, vitamin C for the common
  cold) — consistent with "only show a verdict when one exists."
- `interactions.json` — every interaction here is a real, defensible
  pharmacological interaction (either well-documented — e.g. vitamin K vs.
  warfarin, mineral chelation of fluoroquinolones/tetracyclines, NSAID +
  anticoagulant bleeding risk — or explicitly hedged with "limited evidence" /
  "case reports only" language where that's the honest state of the
  evidence). Several ingredients (probiotics, B12, B-complex, vitamin C)
  intentionally have zero interactions against this drug list, exercising the
  "nothing on file" UI state honestly rather than padding every ingredient
  with a manufactured interaction.

Run `npm run sync` from an environment that can reach the source APIs to
replace this seed data with a live pull.
