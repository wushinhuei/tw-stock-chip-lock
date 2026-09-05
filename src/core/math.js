export function finite(value) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sum(values) {
  return values.reduce((total, value) => total + (finite(value) ?? 0), 0);
}

export function mean(values) {
  const clean = values.map(finite).filter(value => value !== null);
  return clean.length ? sum(clean) / clean.length : null;
}

export function sma(values, period, offset = 0) {
  const end = values.length - offset;
  const start = end - period;
  if (period <= 0 || start < 0) return null;
  const clean = values.slice(start, end).map(finite);
  return clean.every(value => value !== null) ? sum(clean) / period : null;
}

export function pctChange(current, previous) {
  const now = finite(current);
  const before = finite(previous);
  return now === null || before === null || before === 0 ? null : now / before - 1;
}

export function strictlyIncreasing(values) {
  const clean = values.map(finite);
  return clean.length > 1 && clean.every(value => value !== null)
    && clean.slice(1).every((value, index) => value > clean[index]);
}

export function strictlyDecreasing(values) {
  const clean = values.map(finite);
  return clean.length > 1 && clean.every(value => value !== null)
    && clean.slice(1).every((value, index) => value < clean[index]);
}

export function round(value, digits = 4) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}
