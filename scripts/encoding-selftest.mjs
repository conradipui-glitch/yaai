import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const targets = ['public/app.js', 'scripts/batch.mjs'];
const corrupted = /Р |РІР|РЎ|РЋР|вЂ|Р†Р|Р‚|Сџ|Сњ/;
for (const path of targets) {
  const source = await fs.readFile(path, 'utf8');
  assert.doesNotMatch(source, corrupted, `${path}: corrupted Cyrillic text`);
}
const ui = await fs.readFile('public/app.js', 'utf8');
assert.match(ui, /landing: 'Делать landing'/);
assert.match(ui, /later: 'Позже'/);
assert.match(ui, /Готово:.*уникальных фраз/);
assert.match(ui, /function visibleCount\(value\)/);
assert.match(ui, /value == null \|\| value === '' \? 'нет данных'/);
assert.match(ui, /\$\{visibleCount\(row\.count\)\}/);
assert.match(ui, /\$\{visibleCount\(item\.maxCount\)\}/);
assert.doesNotMatch(ui, /Number\(row\.count(?: \|\| 0)?\)\.toLocaleString/);
assert.doesNotMatch(ui, /Number\(item\.maxCount\)\.toLocaleString/);
const report = await fs.readFile('scripts/batch.mjs', 'utf8');
assert.match(report, /Собрано:/);
assert.match(report, /Маршрутизация:/);
assert.match(report, /Частотность/);
console.log('encoding + unknown count UI selftest: ok');
