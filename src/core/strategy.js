import { finite, mean, pctChange, round, sma, strictlyDecreasing, strictlyIncreasing, sum } from './math.js';

export const LIMITS = Object.freeze({
  minimumBars: 120,
  minimumAverageVolumeLots: 1000,
  institutionalConcentration: 0.10,
  maxCandidates: 20,
  maxApproved: 3
});

function ascending(rows) {
  return [...(rows || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function consecutivePositive(rows, field, maxDays = Number.POSITIVE_INFINITY) {
  let count = 0;
  for (const row of [...rows].reverse()) {
    if ((finite(row[field]) ?? 0) <= 0 || count >= maxDays) break;
    count += 1;
  }
  return count;
}

export function technicalSignals(bars) {
  const ordered = ascending(bars);
  const closes = ordered.map(row => row.close);
  const volumes = ordered.map(row => row.volumeLots);
  const values = ordered.map(row => row.tradeValue);
  const close = finite(closes.at(-1));
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma20Past = sma(closes, 20, 5);
  const ma60Past = sma(closes, 60, 5);
  const averageVolume20 = mean(volumes.slice(-20));
  const averageTradeValue20 = mean(values.slice(-20));
  const prior60High = ordered.length >= 61 ? Math.max(...ordered.slice(-61, -1).map(row => finite(row.high) ?? -Infinity)) : null;
  const maxVolume120 = ordered.length >= 120 ? Math.max(...volumes.slice(-120).map(value => finite(value) ?? 0)) : null;
  const ma5History = [2, 1, 0].map(offset => sma(closes, 5, offset));

  return {
    barCount: ordered.length,
    latestDate: ordered.at(-1)?.date || null,
    close,
    ma5: round(ma5), ma10: round(ma10), ma20: round(ma20), ma60: round(ma60),
    averageVolume20: round(averageVolume20),
    averageTradeValue20: round(averageTradeValue20, 0),
    prior60High: Number.isFinite(prior60High) ? prior60High : null,
    maxVolume120,
    ma5Rising3: strictlyIncreasing(ma5History),
    trendPass: ordered.length >= LIMITS.minimumBars
      && averageVolume20 > LIMITS.minimumAverageVolumeLots
      && close > ma20 && close > ma60
      && ma20 > ma20Past && ma60 > ma60Past,
    bullishAlignment: close !== null && ma5 !== null && ma20 !== null && ma60 !== null && ma5 > ma20 && ma20 > ma60,
    suffocationVolume: ordered.length >= 20 && (finite(volumes.at(-1)) ?? Infinity) <= averageVolume20 / 3,
    closeAboveMa5: close !== null && ma5 !== null && close > ma5,
    ma20Deviation: close !== null && ma20 ? close / ma20 - 1 : null,
    latestVolume120High: maxVolume120 !== null && finite(volumes.at(-1)) === maxVolume120
  };
}

export function holderSignals(tdccWeeks) {
  const weeks = ascending(tdccWeeks).slice(-3);
  const largeHolderRatios = weeks.map(row => row.largeHolderRatio);
  const holderCounts = weeks.map(row => row.totalHolders);
  return {
    weeks: weeks.length,
    largeHolderRatios,
    totalHolders: holderCounts,
    accumulationPass: weeks.length === 3 && strictlyIncreasing(largeHolderRatios) && strictlyDecreasing(holderCounts),
    distributionTwoWeeks: weeks.length === 3 && strictlyDecreasing(largeHolderRatios),
    latestHolderCountChange: weeks.length >= 2 ? pctChange(holderCounts.at(-1), holderCounts.at(-2)) : null,
    latestLargeHolderChange: weeks.length >= 2 ? (finite(largeHolderRatios.at(-1)) ?? 0) - (finite(largeHolderRatios.at(-2)) ?? 0) : null,
    twoWeekLargeHolderChange: weeks.length === 3 ? (finite(largeHolderRatios.at(-1)) ?? 0) - (finite(largeHolderRatios[0]) ?? 0) : null
  };
}

export function institutionalSignals(rows, bars) {
  const latest = ascending(rows).slice(-5);
  const trustBuyStreak = consecutivePositive(latest, 'trustNet');
  const foreignBuyStreak = consecutivePositive(latest, 'foreignNet');
  const trustSellStreak = consecutivePositive(latest.map(row => ({ ...row, trustSell: -(finite(row.trustNet) ?? 0) })), 'trustSell');
  const recentBars = ascending(bars).slice(-5);
  const volumeByDate = new Map(recentBars.map(row => [row.date, finite(row.volumeShares) ?? (finite(row.volumeLots) ?? 0) * 1000]));
  const aligned = latest.filter(row => volumeByDate.has(row.date));
  const net = sum(aligned.map(row => (finite(row.foreignNet) ?? 0) + (finite(row.trustNet) ?? 0)));
  const volume = sum(aligned.map(row => volumeByDate.get(row.date)));
  const concentration5d = aligned.length === 5 && volume > 0 ? net / volume : null;
  const last = latest.at(-1) || {};
  return {
    trustBuyStreak, foreignBuyStreak, trustSellStreak,
    sameDayForeignTrustBuy: (finite(last.foreignNet) ?? 0) > 0 && (finite(last.trustNet) ?? 0) > 0,
    simultaneousBuy3d: trustBuyStreak >= 3 && foreignBuyStreak >= 3,
    concentration5d: round(concentration5d),
    selectionPass: (trustBuyStreak >= 3 || ((finite(last.foreignNet) ?? 0) > 0 && (finite(last.trustNet) ?? 0) > 0))
      && concentration5d !== null && concentration5d > LIMITS.institutionalConcentration,
    latestInstitutionalPositive: (finite(last.foreignNet) ?? 0) > 0 || (finite(last.trustNet) ?? 0) > 0
  };
}

export function creditSignals(marginRows, bars) {
  const margins = ascending(marginRows);
  const orderedBars = ascending(bars);
  const barByDate = new Map(orderedBars.map(row => [row.date, row]));
  const latest = margins.at(-1) || {};
  const previous = margins.at(-2) || {};
  const marginBalance = finite(latest.marginBalance);
  const shortBalance = finite(latest.shortBalance);
  const shortToMarginRatio = marginBalance && marginBalance > 0 && shortBalance !== null ? shortBalance / marginBalance : null;
  const marginDailyChange = marginBalance !== null && finite(previous.marginBalance) !== null ? marginBalance - finite(previous.marginBalance) : null;
  const five = margins.slice(-6);
  const margin5dChange = five.length >= 6 ? pctChange(five.at(-1).marginBalance, five[0].marginBalance) : null;
  const short5dChange = five.length >= 6 ? (finite(five.at(-1).shortBalance) ?? 0) - (finite(five[0].shortBalance) ?? 0) : null;
  let weightedCostNumerator = 0;
  let weightedIncrease = 0;
  const costWindow = margins.slice(-21);
  for (let index = 1; index < costWindow.length; index += 1) {
    const increase = (finite(costWindow[index].marginBalance) ?? 0) - (finite(costWindow[index - 1].marginBalance) ?? 0);
    const close = finite(barByDate.get(costWindow[index].date)?.close);
    if (increase > 0 && close !== null) {
      weightedCostNumerator += increase * close;
      weightedIncrease += increase;
    }
  }
  const estimatedMarginCost = weightedIncrease ? weightedCostNumerator / weightedIncrease : null;
  const close = finite(orderedBars.at(-1)?.close);
  return {
    marginBalance, shortBalance,
    shortToMarginRatio: round(shortToMarginRatio),
    squeezeLevel: shortToMarginRatio === null ? 'UNKNOWN' : shortToMarginRatio >= 0.5 ? 'EXTREME' : shortToMarginRatio >= 0.3 ? 'WATCH' : shortToMarginRatio >= 0.2 ? 'ELEVATED' : 'NORMAL',
    marginDailyChange,
    marginIncreased: marginDailyChange !== null && marginDailyChange > 0,
    margin5dChange: round(margin5dChange),
    short5dNotFalling: short5dChange !== null && short5dChange >= 0,
    estimatedMarginCost: round(estimatedMarginCost),
    estimatedStress: estimatedMarginCost !== null && close !== null ? close <= estimatedMarginCost * 0.78 : false,
    estimateLabel: 'estimated'
  };
}

export function evaluateStock(stock) {
  const technical = technicalSignals(stock.bars || []);
  const holders = holderSignals(stock.tdccWeeks || []);
  const institutional = institutionalSignals(stock.institutional || [], stock.bars || []);
  const credit = creditSignals(stock.margin || [], stock.bars || []);
  const expectedDate = stock.expectedDate || null;
  const sourceAlignmentPass = !expectedDate || (
    technical.latestDate === expectedDate
    && ascending(stock.institutional || []).at(-1)?.date === expectedDate
    && ascending(stock.margin || []).at(-1)?.date === expectedDate
    && holders.weeks === 3
  );
  const selected = sourceAlignmentPass && technical.trendPass && holders.accumulationPass && institutional.selectionPass;
  const accumulationWatch = technical.suffocationVolume && holders.accumulationPass
    && technical.close !== null && technical.prior60High !== null && technical.close < technical.prior60High;
  return {
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    market: stock.market || 'TWSE',
    selected,
    sourceAlignmentPass,
    accumulationWatch,
    technical,
    holders,
    institutional,
    credit,
    mopsDisclosures: stock.mopsDisclosures || [],
    riskEvents: stock.riskEvents || []
  };
}

export function rankCandidates(stocks) {
  return stocks.map(evaluateStock).filter(row => row.selected).sort((a, b) =>
    (b.institutional.concentration5d ?? -Infinity) - (a.institutional.concentration5d ?? -Infinity)
    || (b.holders.twoWeekLargeHolderChange ?? -Infinity) - (a.holders.twoWeekLargeHolderChange ?? -Infinity)
    || b.institutional.trustBuyStreak - a.institutional.trustBuyStreak
    || (b.technical.averageTradeValue20 ?? -Infinity) - (a.technical.averageTradeValue20 ?? -Infinity)
  ).slice(0, LIMITS.maxCandidates);
}

export function projectedDayVolume(cumulativeVolumeLots, timeText) {
  const [hours, minutes] = String(timeText).split(':').map(Number);
  const elapsed = hours * 60 + minutes - (9 * 60);
  if (!Number.isFinite(elapsed) || elapsed < 30 || elapsed > 270) return null;
  return (finite(cumulativeVolumeLots) ?? 0) / (elapsed / 270);
}

export function breakoutSignal({ candidate, review, quote, time, dataStatus, now = Date.now() }) {
  const projectedVolume = projectedDayVolume(quote?.cumulativeVolumeLots, time);
  const neckline = finite(review?.neckline) ?? candidate?.technical?.prior60High;
  const reasons = [];
  if (dataStatus !== 'COMPLETE') reasons.push('資料狀態不是 COMPLETE');
  if (!review?.approved) reasons.push('尚未通過人工複核');
  if (!candidate?.institutional?.simultaneousBuy3d) reasons.push('外資與投信未同步連買三日');
  if (!candidate?.credit?.marginIncreased) reasons.push('前一日融資未增加');
  if (!neckline || (finite(quote?.price) ?? 0) <= neckline) reasons.push('尚未突破頸線');
  if (!projectedVolume || projectedVolume < (finite(candidate?.technical?.averageVolume20) ?? Infinity) * 2) reasons.push('預估量未達二倍');
  if (!quote?.timestamp || !Number.isFinite(new Date(quote.timestamp).getTime()) || Math.abs(new Date(now).getTime() - new Date(quote.timestamp).getTime()) > 120000) reasons.push('報價過期');
  return { triggered: reasons.length === 0, reasons, neckline, projectedVolume: round(projectedVolume) };
}
