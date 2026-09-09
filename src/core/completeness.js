import { createHash } from 'node:crypto';

export const DATA_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL',
  BLOCKED: 'BLOCKED',
  STALE: 'STALE'
});

const REQUIRED = Object.freeze(['prices', 'institutional', 'margin']);

export function coverage(rows, minimumDates) {
  const dates = new Set((rows || []).map(row => row.date).filter(Boolean));
  return { dates: dates.size, minimumDates, sufficient: dates.size >= minimumDates };
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function evaluateCompleteness(sources, options = {}) {
  const expectedDate = options.expectedDate || null;
  const now = options.now || new Date().toISOString();
  const missing = [];
  const warnings = [];
  const sourceDates = {};

  for (const name of REQUIRED) {
    const source = sources?.[name];
    sourceDates[name] = source?.date || null;
    if (!source || source.ok === false || !source.date || Number(source.rows || 0) <= 0) missing.push(name);
  }

  for (const [name, source] of Object.entries(sources || {})) {
    sourceDates[name] = source?.date || null;
    if (source?.warning) warnings.push(`${name}: ${source.warning}`);
  }

  if (missing.length) {
    return { status: DATA_STATUS.BLOCKED, canPublishRanking: false, expectedDate, sourceDates, missingFields: missing, warnings, evaluatedAt: now };
  }

  const marketDates = ['prices', 'institutional', 'margin'].map(name => sourceDates[name]);
  if (new Set(marketDates).size !== 1 || (expectedDate && marketDates[0] !== expectedDate)) {
    warnings.push(`市場資料日期未對齊: ${marketDates.join(', ')}`);
    return { status: DATA_STATUS.BLOCKED, canPublishRanking: false, expectedDate, sourceDates, missingFields: [], warnings, evaluatedAt: now };
  }

  if (Object.values(sources).some(source => source?.stale)) {
    return { status: DATA_STATUS.STALE, canPublishRanking: false, expectedDate, sourceDates, missingFields: [], warnings, evaluatedAt: now };
  }

  const optionalMissing = Object.entries(sources || {})
    .filter(([name, source]) => !REQUIRED.includes(name) && (!source || source.ok === false))
    .map(([name]) => name);
  if (optionalMissing.length) {
    warnings.push(`非必要資料缺漏: ${optionalMissing.join(', ')}`);
    return { status: DATA_STATUS.PARTIAL, canPublishRanking: true, expectedDate, sourceDates, missingFields: optionalMissing, warnings, evaluatedAt: now };
  }

  return { status: DATA_STATUS.COMPLETE, canPublishRanking: true, expectedDate, sourceDates, missingFields: [], warnings, evaluatedAt: now };
}

export function buildManifest({ sources, completeness, payload, generatedAt = new Date().toISOString() }) {
  return {
    generatedAt,
    status: completeness.status,
    canPublishRanking: completeness.canPublishRanking,
    sourceDates: completeness.sourceDates,
    missingFields: completeness.missingFields,
    warnings: completeness.warnings,
    sources,
    payloadSha256: sha256(payload)
  };
}
