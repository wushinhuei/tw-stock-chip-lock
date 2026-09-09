import { finite, mean, round } from './math.js';

export function recordCandidates(existing, candidates, asOfDate) {
  const byKey = new Map((existing || []).map(row => [`${row.listedDate}|${row.symbol}`, row]));
  for (const candidate of candidates || []) {
    const key = `${asOfDate}|${candidate.symbol}`;
    if (!byKey.has(key)) byKey.set(key, {
      symbol: candidate.symbol, name: candidate.name, listedDate: asOfDate, listedPrice: candidate.technical.close,
      grade: candidate.grade, score: candidate.score, revenue36mHigh: candidate.revenue.revenue36mHigh,
      candidateStatus: candidate.candidateStatus
    });
  }
  return [...byKey.values()].sort((a, b) => a.listedDate.localeCompare(b.listedDate) || a.symbol.localeCompare(b.symbol));
}

export function evaluateCandidateOutcomes(observations, priceRows) {
  const bySymbol = new Map();
  for (const row of priceRows || []) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }
  for (const rows of bySymbol.values()) rows.sort((a, b) => a.date.localeCompare(b.date));
  const benchmark = bySymbol.get('0050') || [];
  const outcomes = (observations || []).map(observation => {
    const future = (bySymbol.get(observation.symbol) || []).filter(row => row.date > observation.listedDate).slice(0, 20);
    const benchmarkListed = benchmark.filter(row => row.date <= observation.listedDate).at(-1);
    const result = { ...observation, horizons: {}, status: future.length >= 20 ? 'COMPLETE' : 'PENDING' };
    for (const horizon of [5, 10, 20]) {
      const bar = future[horizon - 1];
      const benchmarkBar = benchmark.filter(row => row.date > observation.listedDate)[horizon - 1];
      const value = bar && observation.listedPrice > 0 ? bar.close / observation.listedPrice - 1 : null;
      const benchmarkReturn = benchmarkBar && benchmarkListed?.close > 0 ? benchmarkBar.close / benchmarkListed.close - 1 : null;
      result.horizons[horizon] = { return: round(value), benchmarkReturn: round(benchmarkReturn), excessReturn: value === null || benchmarkReturn === null ? null : round(value - benchmarkReturn) };
    }
    const returns = future.map(row => finite(row.close) / observation.listedPrice - 1).filter(Number.isFinite);
    result.maximumReturn20d = returns.length ? round(Math.max(...returns)) : null;
    result.maximumDrawdown20d = returns.length ? round(Math.min(...returns)) : null;
    return result;
  });
  const complete = outcomes.filter(row => row.status === 'COMPLETE');
  const groups = {};
  for (const key of ['A', 'B', 'C', 'REVENUE_HIGH', 'OTHER']) {
    const rows = complete.filter(row => key === 'REVENUE_HIGH' ? row.revenue36mHigh : key === 'OTHER' ? !row.revenue36mHigh : row.grade === key);
    groups[key] = { count: rows.length, average20dReturn: round(mean(rows.map(row => row.horizons[20].return))), hitRate20d: rows.length ? round(rows.filter(row => row.horizons[20].return > 0).length / rows.length) : null };
  }
  return { observations: outcomes, summary: { total: outcomes.length, completed: complete.length, groups } };
}
