import { finite } from './math.js';

export const DEFAULT_COST_RATE = 0.00585;

export function compoundReturns(returns) {
  return returns.reduce((equity, value) => equity * (1 + (finite(value) ?? 0)), 1) - 1;
}

export function maximumDrawdown(equityCurve) {
  let peak = -Infinity;
  let worst = 0;
  for (const raw of equityCurve) {
    const value = finite(raw);
    if (value === null) continue;
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, value / peak - 1);
  }
  return worst;
}

export function runMechanicalProxy({ trades = [], benchmarkBars = [], costRate = DEFAULT_COST_RATE, dataStatus }) {
  if (dataStatus !== 'COMPLETE') {
    return { status: 'BLOCKED', reason: '資料狀態不是 COMPLETE，禁止產生回測績效', trades: 0 };
  }
  const completed = trades.filter(trade => finite(trade.entryPrice) > 0 && finite(trade.exitPrice) > 0 && trade.entryDate < trade.exitDate)
    .map(trade => ({ ...trade, netReturn: trade.exitPrice / trade.entryPrice - 1 - costRate }));
  if (!completed.length || benchmarkBars.length < 2) return { status: 'BLOCKED', reason: '有效交易或0050基準資料不足', trades: completed.length };
  const strategyReturn = compoundReturns(completed.map(trade => trade.netReturn));
  const benchmarkStart = finite(benchmarkBars[0].close);
  const benchmarkEnd = finite(benchmarkBars.at(-1).close);
  if (!(benchmarkStart > 0) || !(benchmarkEnd > 0)) return { status: 'BLOCKED', reason: '0050基準價格無效', trades: completed.length };
  const equity = completed.reduce((rows, trade) => [...rows, rows.at(-1) * (1 + trade.netReturn)], [1]);
  const benchmarkReturn = benchmarkEnd / benchmarkStart - 1 - costRate;
  return {
    status: 'COMPLETE', trades: completed.length, costRate, strategyReturn,
    benchmarkSymbol: '0050', benchmarkReturn, excessReturn: strategyReturn - benchmarkReturn,
    maximumDrawdown: maximumDrawdown(equity), beatBenchmark: strategyReturn > benchmarkReturn,
    caveat: '機械代理回測；人工分點與盤中事件僅能向前驗證'
  };
}
