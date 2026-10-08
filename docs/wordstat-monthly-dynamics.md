# Wordstat monthly dynamics — verified seasonal research

The reusable `scripts/wordstat-dynamics.mjs` collector calls the official Yandex AI Studio Search API `POST /v2/wordstat/dynamics` endpoint. Unlike `topRequests` (recent queries), this method returns a monthly history.

The case configuration stays **in the client's own repository or private workspace**, not in `yaai`. For the "Сила Леса" pilot, the manifest is in:
`https://github.com/conradipui-glitch/silalesa/blob/main/research/yaai-omsk-wordstat-pilot.json`.

## What is collected

- Exact **region name resolved from Yandex region tree**, not guessed numeric region code.
- Device scope `DEVICE_ALL`, monthly frequency, **two complete calendar years**.
- One *preliminary* manually listed phrase per service.
- For each record: month, service code, query count, region name, phrase.
- 24 values per service are required. Missing months are a hard error rather than implicit zero.
- Summary has annual ranking and two-year average monthly top/second place, with an exploratory 20% margin.

No results are published until an explicit research workflow executes and returns valid data. Wordstat phrase-containing counts overlap and should not be interpreted as total market size or as independently measured enquiries. Sample phrases need human review of commercial intent and biases.

## Running via GitHub Actions with secret isolation

Repository secrets `YAIS_API`, `YAIS_ID` and `YAIS_FOLDER_ID` are reused; fallback `YANDEX_API_KEY`, `YANDEX_FOLDER_ID`. Jev does not determine numeric demand.

`Actions → Wordstat monthly dynamics → Run workflow` accepts a raw GitHub JSON manifest URL and **confirm_live=true**. A one-time integration run is configured on merge of the workflow file to `main`, which calls 14 service phrases and therefore consumes up to 14 metered GetDynamics requests plus region-tree discovery. There are no live calls in PR checks. No tokens or folder IDs are printed.

Artifacts `monthly.csv` and `summary.json` expire after three days. Review or move them to the client's workspace; do not commit raw client research to the generic `yaai` engine. Before activating dynamic hero messages, compare against confirmed leads and business capacity.

## Local CLI

```bash
npm run wordstat:dynamics -- \
  --input /private/research-case.json \
  --out /private/monthly.csv \
  --summary /private/monthly-summary.json \
  --execute
```

Without `--execute`, the script validates input and reports expected call count without contacting Yandex.

API method: https://aistudio.yandex.ru/ru/docs/search-api/api-ref/Wordstat/getDynamics
