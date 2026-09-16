import assert from 'node:assert/strict';
import { analyzeWebmasterCsv } from '../lib/webmaster-overlap.mjs';

const input = [
  'Дата;Хост;URL;Запрос;Регион;Клики;Показы;Позиция',
  '2026-09-01;site.test;https://site.test/a/;купить баню;Омск;3;20;4',
  '2026-09-02;site.test;https://site.test/a/;купить баню;Омск;2;10;6',
  '2026-09-01;site.test;https://site.test/b/;купить баню;Омск;1;8;9',
  '2026-09-01;site.test;https://site.test/c/;купить печь;Омск;0;3;12',
].join('\n');
const report = analyzeWebmasterCsv(input);
assert.equal(report.inputRows, 4);
assert.equal(report.distinctQueryPages, 3);
assert.equal(report.candidateCount, 1);
assert.equal(report.overlaps[0].query, 'купить баню');
assert.equal(report.overlaps[0].totalImpressions, 38);
assert.equal(report.overlaps[0].pages[0].url, '/a/');
assert.equal(report.overlaps[0].pages[0].clicks, 5);
assert.equal(report.overlaps[0].pages[0].averagePosition, 4.67);
assert.equal(analyzeWebmasterCsv(input, { minImpressions: 9 }).candidateCount, 0);
assert.throws(() => analyzeWebmasterCsv('запрос;клики\nбаня;1'), /missing column: url/);
assert.equal(analyzeWebmasterCsv('query,url,impressions,clicks\nbath,/a/,2,1\nbath,/b/,3,0').candidateCount, 1);
console.log('Webmaster overlap self-test: passed (synthetic CSV only).');
