# SEO Evidence Report — from saved Wordstat / Intent / Page Planner

This report is an **offline reproducibility step** for YA AI research.
It does **not** perform live provider requests or Jev evaluation.
Use the three JSON exports from the same workspace/result prefix and the
same completed Wordstat research run.

## Run

```bash
npm run report:seo -- \
  --wordstat /private/results/example-wordstat-latest.json \
  --intents /private/results/example-intents-latest.json \
  --plan /private/results/example-page-plan-latest.json \
  --html /private/reports/example-seo.html
```

Output: standalone `example-seo.html` and `example-seo.json`, created
exclusively (existing files are not overwritten). To specify JSON separately,
use `--json /private/reports/example-seo-source.json`.
The HTML requires no server, external font, JS library or internet connection.
It contains page recommendation cards, searchable/filterable query evidence and
CSV export of visible rows. The JSON excludes API keys and Yandex Folder ID.

## Evidence rules

- FACT: original Wordstat rows (Top and associations distinguished), seed set,
  regions and preserved study timestamp.
- INFERENCE: locally classified query intent and Page Planner CREATE/EXPAND/
  MERGE/HOLD recommendations.
- UNKNOWN: customer pain, lead volume, sales, conversion rates, verified
  construction prices, model accuracy and broader market size.
- Wordstat phrase counts **overlap**. Do not sum rows, regions, seed queries,
  or planner cards as a market-size estimate.
- The renderer checks the Wordstat row total and request matrix; intent source
  timestamp, seeds and regions; classified row IDs and unchanged counts/types;
  matching preset and planner row/page counts. This is a structural chain of
  custody, **not** proof that original provider data was true or complete.
- No report source is committed to the generic yaai engine: store client
  workspaces and HTML reports separately. Sources may be sensitive.
- Building another report from the same saved JSON costs no new Yandex/Jev
  tokens, but does not update the original observation date.

## Tests

```bash
npm run report:seo:selftest
npm run check
```

The selftest exercises a synthetic successful end-to-end output, mismatched
inputs, tampered counts, XSS escaping, browser script parsing, duplicate report
prevention and an API-key-free CLI. It is **not** a paid live integration test.
