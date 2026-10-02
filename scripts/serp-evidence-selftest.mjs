import assert from 'node:assert/strict';

import {
  analyzeSerpEvidence,
  decodeYandexSearchResponse,
  parseYandexSearchXml,
} from '../lib/serp-evidence.mjs';

const xml = `<?xml version="1.0" encoding="utf-8"?>
<yandexsearch version="1.0">
  <request><query>купить баню</query></request>
  <response>
    <results>
      <grouping>
        <found priority="all">100</found>
        <group><doc><url>https://competitor-a.ru/bani/</url><domain>competitor-a.ru</domain><title>Купить <hlword>баню</hlword></title><passages><passage>Готовые бани</passage></passages></doc></group>
        <group><doc><url>https://silalesa.example/bani/</url><domain>silalesa.example</domain><title>Мобильные бани</title><passages><passage>Бани в Омске</passage></passages></doc></group>
        <group><doc><url>https://competitor-b.ru/catalog/</url><domain>www.competitor-b.ru</domain><title>Каталог бань</title></doc></group>
      </grouping>
    </results>
  </response>
</yandexsearch>`;

const parsed = parseYandexSearchXml(xml);
assert.equal(parsed.query, 'купить баню');
assert.equal(parsed.found, 100);
assert.equal(parsed.results.length, 3);
assert.equal(parsed.results[0].position, 1);
assert.equal(parsed.results[0].title, 'Купить баню');
assert.equal(parsed.results[1].domain, 'silalesa.example');
assert.equal(parsed.results[2].passage, '');

const decoded = decodeYandexSearchResponse({
  rawData: Buffer.from(xml, 'utf8').toString('base64'),
});
assert.equal(decoded.results[0].url, 'https://competitor-a.ru/bani/');

const dataset = {
  schemaVersion: 1,
  generatedAt: '2026-10-02T07:00:00.000Z',
  source: 'yandex-search-api-v2',
  region: '66',
  searchType: 'SEARCH_TYPE_RU',
  ownDomain: 'silalesa.example',
  queries: [
    {
      query: 'купить баню',
      results: parsed.results,
    },
    {
      query: 'баня омск',
      results: [
        { position: 1, url: 'https://competitor-a.ru/omsk/', domain: 'competitor-a.ru', title: 'Бани Омск' },
        { position: 2, url: 'https://competitor-c.ru/', domain: 'competitor-c.ru', title: 'Готовые бани' },
        { position: 3, url: 'https://competitor-b.ru/omsk/', domain: 'competitor-b.ru', title: 'Бани под ключ' },
      ],
    },
    {
      query: 'кедровая баня',
      results: [
        { position: 1, url: 'https://silalesa.example/kedr/', domain: 'silalesa.example', title: 'Кедровая баня' },
        { position: 2, url: 'https://competitor-a.ru/kedr/', domain: 'competitor-a.ru', title: 'Кедровые бани' },
      ],
    },
  ],
};

const analysis = analyzeSerpEvidence(dataset, { topN: 10 });
assert.equal(analysis.meta.queryCount, 3);
assert.equal(analysis.meta.ownDomain, 'silalesa.example');
assert.equal(analysis.own.presentQueries, 2);
assert.equal(analysis.own.absentQueries, 1);

const buy = analysis.queries.find((row) => row.query === 'купить баню');
assert.equal(buy.ownPresent, true);
assert.equal(buy.ownPosition, 2);
assert.deepEqual(buy.domainsAboveOwn.map((row) => row.domain), ['competitor-a.ru']);

const omsk = analysis.queries.find((row) => row.query === 'баня омск');
assert.equal(omsk.gapType, 'own-absent');
assert.equal(omsk.domainsAboveOwn.length, 3);

assert.equal(analysis.competitors[0].domain, 'competitor-a.ru');
assert.equal(analysis.competitors[0].queryCount, 3);
assert.equal(analysis.competitors[0].top3, 3);
assert.ok(analysis.competitors.every((row) => row.isOwnDomain === false));

assert.throws(
  () => parseYandexSearchXml('<yandexsearch><error>bad request</error></yandexsearch>'),
  /bad request/,
);
assert.throws(
  () => decodeYandexSearchResponse({}),
  /missing rawData/,
);

console.log('serp evidence selftest: ok');
