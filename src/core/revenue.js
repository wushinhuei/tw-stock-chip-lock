import { finite, pctChange, round } from './math.js';

function monthIndex(yearMonth) {
  const match = String(yearMonth || '').match(/^(\d{4})-(\d{2})$/);
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

function latestRevision(rows) {
  const byMonth = new Map();
  for (const row of rows || []) {
    if (monthIndex(row.yearMonth) === null || finite(row.revenue) === null) continue;
    const current = byMonth.get(row.yearMonth);
    if (!current || String(row.downloadedAt || '') >= String(current.downloadedAt || '')) byMonth.set(row.yearMonth, row);
  }
  return [...byMonth.values()].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

export function mergeRevenueRows(existing, added) {
  const byKey = new Map();
  for (const row of [...(existing || []), ...(added || [])]) {
    const key = `${row.symbol}|${row.yearMonth}`;
    const current = byKey.get(key);
    const revisions = [...(current?.revisions || []), ...(row.revisions || []), {
      downloadedAt: row.downloadedAt || null, rawHash: row.rawHash || null, revenue: finite(row.revenue)
    }].filter((revision, index, all) => revision.rawHash && all.findIndex(item => item.rawHash === revision.rawHash) === index);
    if (!current || String(row.downloadedAt || '') >= String(current.downloadedAt || '')) byKey.set(key, { ...row, revisions });
    else byKey.set(key, { ...current, revisions });
  }
  return [...byKey.values()].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || a.symbol.localeCompare(b.symbol));
}

export function revenueSignals(rows, options = {}) {
  const asOf = options.asOf || null;
  const ordered = latestRevision((rows || []).filter(row => !asOf || !row.availableAt || row.availableAt <= asOf)).slice(-36);
  const indexes = ordered.map(row => monthIndex(row.yearMonth));
  const continuous = ordered.length === 36 && indexes.slice(1).every((value, index) => value === indexes[index] + 1);
  const latest = ordered.at(-1) || null;
  const revenues = ordered.map(row => finite(row.revenue));
  const revenue36mHigh = continuous && revenues.at(-1) > Math.max(...revenues.slice(0, -1));
  const revenueYoY = continuous ? pctChange(revenues.at(-1), revenues.at(-13)) : null;
  return {
    monthlyRevenue: latest ? finite(latest.revenue) : null,
    latestRevenueMonth: latest?.yearMonth || null,
    revenueYoY: round(revenueYoY),
    revenue36mHigh,
    revenueDataStatus: continuous ? 'COMPLETE' : 'REVENUE_INCOMPLETE',
    validMonths: ordered.length
  };
}
