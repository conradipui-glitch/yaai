export function optionalNonnegativeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function maxOptionalNumber(a, b) {
  const left = optionalNonnegativeNumber(a);
  const right = optionalNonnegativeNumber(b);
  if (left == null) return right;
  if (right == null) return left;
  return Math.max(left, right);
}

export function formatOptionalNumber(value, unknown = 'нет данных') {
  const n = optionalNonnegativeNumber(value);
  return n == null ? unknown : String(n);
}
