import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { analyzeRows } from '../lib/analyze.mjs';

const preset = JSON.parse(await fs.readFile(new URL('../presets/silalesa.json', import.meta.url), 'utf8'));
const rows = [
  { phrase: 'баня под ключ в омске', regionId: '66', regionName: 'Омск', count: 469, types: ['top'], seeds: ['баня под ключ'] },
  { phrase: 'фундамент под баню', regionId: '66', regionName: 'Омск', count: 116, types: ['top'], seeds: ['фундамент под баню'] },
  { phrase: 'борщевая заправка на зиму в банках', regionId: '66', regionName: 'Омск', count: 407, types: ['association'], seeds: ['баня зимой'] },
  { phrase: 'зимние ботинки', regionId: '66', regionName: 'Омск', count: 1143, types: ['association'], seeds: ['баня зимой'] }
];

const topOnly = analyzeRows(rows, preset, { includeTop: true, includeAssociations: false });
assert.equal(topOnly.meta.eligibleRows, 2);
assert.equal(topOnly.meta.assignedRows, 2);
assert.equal(topOnly.meta.filteredByType, 2);
assert.ok(topOnly.assignedRows.some((row) => row.intentId === 'B14' && row.phrase === 'фундамент под баню'));
assert.ok(topOnly.assignedRows.some((row) => row.phrase === 'баня под ключ в омске'));

const withAssociations = analyzeRows(rows, preset, { includeTop: true, includeAssociations: true });
assert.equal(withAssociations.meta.negativeRows, 2);
assert.equal(withAssociations.meta.assignedRows, 2);
assert.ok(withAssociations.summary.some((item) => item.intentId === 'B14' && item.maxCount === 116));

console.log('selftest: ok');
