import assert from 'node:assert/strict';

import { analyzeRankTrackerCsv } from '../lib/rank-tracker.mjs';

const csv = [
  'Дата,Хост,URL,Запрос,Регион,Клики,Показы,Позиция',
  '2026-09-28,example.ru,/bani/,купить баню,Омск,5,50,12',
  '2026-09-29,example.ru,/bani/,купить баню,Омск,8,80,8',
  '2026-09-28,example.ru,/cena/,цена бани,Омск,2,20,6',
  '2026-09-29,example.ru,/cena/,цена бани,Омск,1,30,9',
  '2026-09-29,example.ru,/guide/,как выбрать баню,Омск,3,25,15',
  '2026-09-28,example.ru,/old/,старая баня,Омск,1,10,18',
  '2026-09-28,example.ru,/bani/,баня омск,Омск,3,30,10',
  '2026-09-29,example.ru,/bani/,баня омск,Омск,4,40,9',
  '2026-09-29,example.ru,/bani-alt/,баня омск,Омск,2,20,14',
].join('\n');

const result = analyzeRankTrackerCsv(csv, {
  minImpressions: 1,
  strikingStart: 5,
  strikingEnd: 20,
});

assert.equal(result.meta.previousDate, '2026-09-28');
assert.equal(result.meta.currentDate, '2026-09-29');
assert.equal(result.current.queryCount, 4);

const improved = result.comparison.improvements.find((row) => row.query === 'купить баню');
assert.ok(improved);
assert.equal(improved.previousPosition, 12);
assert.equal(improved.currentPosition, 8);
assert.equal(improved.positionDelta, 4);

const declined = result.comparison.declines.find((row) => row.query === 'цена бани');
assert.ok(declined);
assert.equal(declined.positionDelta, -3);

const newQuery = result.comparison.newQueries.find((row) => row.query === 'как выбрать баню');
assert.ok(newQuery);
assert.equal(newQuery.currentPosition, 15);

const lostQuery = result.comparison.lostQueries.find((row) => row.query === 'старая баня');
assert.ok(lostQuery);
assert.equal(lostQuery.previousPosition, 18);

const multiUrl = result.current.queries.find((row) => row.query === 'баня омск');
assert.equal(multiUrl.urlCount, 2);
assert.deepEqual(multiUrl.urls, ['/bani-alt/', '/bani/']);
assert.equal(multiUrl.averagePosition, 10.67);

assert.ok(result.comparison.strikingDistance.some((row) => row.query === 'купить баню'));
assert.ok(result.comparison.pageMovements.some((row) => row.query === 'купить баню' && row.url === '/bani/'));
assert.match(result.meta.note, /average positions/);

const firstDayOnly = analyzeRankTrackerCsv([
  'date,url,query,clicks,impressions,position',
  '2026-09-29,/a/,query one,1,10,7',
].join('\n'));
assert.equal(firstDayOnly.comparison.comparable, false);
assert.equal(firstDayOnly.comparison.reason, 'need_two_dates');

assert.throws(
  () => analyzeRankTrackerCsv('query,url,clicks,impressions,position\nq,/a,1,10,5'),
  /missing column: date/,
);

console.log('rank tracker selftest: ok');
