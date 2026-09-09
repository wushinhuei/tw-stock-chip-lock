import { finite, mean, pctChange, round, sma, strictlyDecreasing, strictlyIncreasing, sum } from './math.js';
import { revenueSignals } from './revenue.js';

export const LIMITS = Object.freeze({ minimumBars: 120, minimumAverageVolumeLots: 1000, maxCandidates: 20, minimumScore: 50 });

const ascending = rows => [...(rows || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function consecutivePositive(rows, field) {
  let count = 0;
  for (const row of [...rows].reverse()) {
    if ((finite(row[field]) ?? 0) <= 0) break;
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
  const ma20 = sma(closes, 20);
  const ma60 = sma(closes, 60);
  const ma20Past = sma(closes, 20, 5);
  const ma60Past = sma(closes, 60, 5);
  const averageVolume20 = mean(volumes.slice(-20));
  const averageTradeValue20 = mean(values.slice(-20));
  const prior60 = ordered.slice(-61, -1);
  const prior60High = prior60.length === 60 ? Math.max(...prior60.map(row => finite(row.high) ?? -Infinity)) : null;
  const prior60Low = prior60.length === 60 ? Math.min(...prior60.map(row => finite(row.low) ?? Infinity)) : null;
  const priorMaxVolume119 = ordered.length >= 120 ? Math.max(...volumes.slice(-120, -1).map(value => finite(value) ?? 0)) : null;
  const necklineDistance = close !== null && prior60High > 0 ? close / prior60High - 1 : null;
  const return20d = ordered.length >= 21 ? pctChange(close, closes.at(-21)) : null;
  const platformRange60 = prior60Low > 0 ? prior60High / prior60Low - 1 : null;
  const latestVolumeRatio20 = averageVolume20 > 0 ? (finite(volumes.at(-1)) ?? 0) / averageVolume20 : null;
  const baseGatePass = ordered.length >= LIMITS.minimumBars
    && averageVolume20 > LIMITS.minimumAverageVolumeLots
    && close > ma20 && ma20 > ma60
    && ma20 > ma20Past && ma60 > ma60Past
    && necklineDistance >= -0.10 && necklineDistance <= 0.02
    && return20d !== null && return20d <= 0.30;
  return {
    barCount: ordered.length, latestDate: ordered.at(-1)?.date || null, close: round(close),
    ma20: round(ma20), ma60: round(ma60), averageVolume20: round(averageVolume20),
    averageTradeValue20: round(averageTradeValue20, 0), prior60High: round(prior60High),
    necklineDistance: round(necklineDistance), return20d: round(return20d), platformRange60: round(platformRange60),
    latestVolumeRatio20: round(latestVolumeRatio20), latestVolume120High: priorMaxVolume119 !== null && (finite(volumes.at(-1)) ?? 0) > priorMaxVolume119,
    baseGatePass
  };
}

export function holderSignals(tdccWeeks) {
  const weeks = ascending(tdccWeeks).slice(-3);
  const ratios = weeks.map(row => row.largeHolderRatio);
  const holders = weeks.map(row => row.totalHolders);
  const twoWeekChange = weeks.length === 3 ? (finite(ratios.at(-1)) ?? 0) - (finite(ratios[0]) ?? 0) : null;
  return {
    weeks: weeks.length, largeHolderRatios: ratios, totalHolders: holders,
    ratioIncreasing: weeks.length === 3 && strictlyIncreasing(ratios),
    holderCountDecreasing: weeks.length === 3 && strictlyDecreasing(holders),
    twoWeekLargeHolderChange: round(twoWeekChange)
  };
}

export function institutionalSignals(rows, bars) {
  const latest = ascending(rows).slice(-5);
  const trustBuyStreak = consecutivePositive(latest, 'trustNet');
  const foreignBuyStreak = consecutivePositive(latest, 'foreignNet');
  const recentBars = ascending(bars).slice(-5);
  const volumeByDate = new Map(recentBars.map(row => [row.date, finite(row.volumeShares) ?? (finite(row.volumeLots) ?? 0) * 1000]));
  const aligned = latest.filter(row => volumeByDate.has(row.date));
  const net = sum(aligned.map(row => (finite(row.foreignNet) ?? 0) + (finite(row.trustNet) ?? 0)));
  const volume = sum(aligned.map(row => volumeByDate.get(row.date)));
  const last = latest.at(-1) || {};
  return {
    trustBuyStreak, foreignBuyStreak,
    concentration5d: aligned.length === 5 && volume > 0 ? round(net / volume) : null,
    sameDayForeignTrustBuy: (finite(last.foreignNet) ?? 0) > 0 && (finite(last.trustNet) ?? 0) > 0,
    simultaneousBuy3d: trustBuyStreak >= 3 && foreignBuyStreak >= 3
  };
}

export function creditSignals(rows) {
  const ordered = ascending(rows);
  const latest = ordered.at(-1) || {};
  const marginBalance = finite(latest.marginBalance);
  const shortBalance = finite(latest.shortBalance);
  const six = ordered.slice(-6);
  return {
    marginBalance, shortBalance,
    shortToMarginRatio: marginBalance > 0 && shortBalance !== null ? round(shortBalance / marginBalance) : null,
    margin5dChange: six.length === 6 ? round(pctChange(six.at(-1).marginBalance, six[0].marginBalance)) : null
  };
}

function holderScore(holders) {
  if (holders.weeks !== 3) return 0;
  const change = holders.twoWeekLargeHolderChange ?? 0;
  return (holders.ratioIncreasing ? 10 : 0) + (holders.holderCountDecreasing ? 8 : 0)
    + (change >= 0.02 ? 7 : change >= 0.01 ? 5 : change > 0 ? 3 : 0);
}

function institutionalScore(institutional) {
  const concentration = Math.max(0, institutional.concentration5d ?? 0);
  return round(clamp(concentration / 0.10 * 12, 0, 12) + clamp(institutional.trustBuyStreak / 3 * 7, 0, 7)
    + (institutional.sameDayForeignTrustBuy ? 3 : 0) + (institutional.simultaneousBuy3d ? 3 : 0));
}

function technicalScore(technical) {
  const distance = technical.necklineDistance;
  const proximity = distance === null ? 0 : distance <= 0 ? clamp((distance + 0.10) / 0.10 * 10, 0, 10) : clamp(10 - distance / 0.02 * 2, 8, 10);
  const range = technical.platformRange60;
  const platform = range === null ? 0 : clamp((0.25 - range) / 0.15 * 5, 0, 5);
  const volumeRatio = technical.latestVolumeRatio20;
  const volume = volumeRatio === null ? 0 : volumeRatio <= 0.8 ? 5 : volumeRatio <= 1 ? 3 : volumeRatio <= 1.2 ? 1 : 0;
  return round(proximity + 5 + platform + volume);
}

function liquidityScore(value) {
  return value >= 1_000_000_000 ? 5 : value >= 500_000_000 ? 4 : value >= 200_000_000 ? 3 : value >= 100_000_000 ? 2 : 1;
}

function creditScore(credit) {
  const margin = credit.margin5dChange;
  const ratio = credit.shortToMarginRatio;
  return (margin !== null && margin >= 0 && margin <= 0.10 ? 3 : 0) + (ratio !== null && ratio >= 0.20 && ratio <= 0.50 ? 2 : 0);
}

function upcomingRisk(events, asOfDate) {
  if (!asOfDate) return [];
  const start = new Date(`${asOfDate}T00:00:00Z`).getTime();
  return (events || []).filter(event => {
    const days = (new Date(`${event.date}T00:00:00Z`).getTime() - start) / 86400000;
    return days >= 0 && days <= 10;
  });
}

export function evaluateStock(stock) {
  const technical = technicalSignals(stock.bars);
  const holders = holderSignals(stock.tdccWeeks);
  const institutional = institutionalSignals(stock.institutional, stock.bars);
  const credit = creditSignals(stock.margin);
  const revenue = revenueSignals(stock.monthlyRevenue, { asOf: stock.asOf });
  const expectedDate = stock.expectedDate || null;
  const sourceAlignmentPass = !expectedDate || (technical.latestDate === expectedDate
    && ascending(stock.institutional).at(-1)?.date === expectedDate && ascending(stock.margin).at(-1)?.date === expectedDate);
  const scoreBreakdown = {
    holders: holderScore(holders), institutional: institutionalScore(institutional), technical: technicalScore(technical),
    revenue: (revenue.revenue36mHigh ? 12 : 0) + ((revenue.revenueYoY ?? 0) > 0 ? 3 : 0),
    credit: creditScore(credit), liquidity: liquidityScore(technical.averageTradeValue20 || 0), penalties: 0
  };
  const riskReasons = [];
  if ((credit.margin5dChange ?? 0) > 0.10) { scoreBreakdown.penalties -= 10; riskReasons.push('融資五日增加超過10%'); }
  if (technical.latestVolume120High && technical.close <= technical.prior60High) { scoreBreakdown.penalties -= 10; riskReasons.push('120日爆量但尚未有效突破'); }
  const upcoming = upcomingRisk(stock.riskEvents, technical.latestDate);
  if (upcoming.length) { scoreBreakdown.penalties -= 5; riskReasons.push(`十日內公司事件：${upcoming.map(row => row.date).join('、')}`); }
  const scoreDenominator = 100 - (holders.weeks === 3 ? 0 : 25) - (revenue.revenueDataStatus === 'COMPLETE' ? 0 : 15);
  const rawPositiveScore = Object.entries(scoreBreakdown).filter(([key]) => key !== 'penalties').reduce((total, [, value]) => total + value, 0);
  const rawScore = round(clamp(rawPositiveScore + scoreBreakdown.penalties, 0, 100), 1);
  const score = round(clamp(rawPositiveScore / scoreDenominator * 100 + scoreBreakdown.penalties, 0, 100), 1);
  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : null;
  const candidateStatus = holders.weeks === 3 && revenue.revenueDataStatus === 'COMPLETE' ? 'VERIFIED' : 'PROVISIONAL';
  const positiveReasons = [];
  if (holders.ratioIncreasing && holders.holderCountDecreasing) positiveReasons.push('大戶增持且股東人數下降');
  if (institutional.sameDayForeignTrustBuy) positiveReasons.push('外資與投信同日買超');
  if (institutional.trustBuyStreak >= 3) positiveReasons.push('投信連買至少3日');
  if (revenue.revenue36mHigh) positiveReasons.push('最新月營收創36個月新高');
  if (technical.necklineDistance !== null) positiveReasons.push(`距60日頸線${round(technical.necklineDistance * 100, 1)}%`);
  return {
    symbol: stock.symbol, name: stock.name || stock.symbol, market: stock.market || 'TWSE',
    eligible: sourceAlignmentPass && technical.baseGatePass && grade !== null,
    candidateStatus, score, rawScore, scoreDenominator, grade, scoreBreakdown, positiveReasons, riskReasons,
    technical, holders, institutional, revenue, credit,
    mopsDisclosures: stock.mopsDisclosures || [], riskEvents: stock.riskEvents || []
  };
}

export function rankCandidates(stocks, options = {}) {
  const excluded = new Set(options.excludedSymbols || []);
  return stocks.map(evaluateStock).filter(row => row.eligible && !excluded.has(row.symbol)).sort((a, b) =>
    b.score - a.score || Number(b.revenue.revenue36mHigh) - Number(a.revenue.revenue36mHigh)
    || (b.institutional.concentration5d ?? -Infinity) - (a.institutional.concentration5d ?? -Infinity)
    || (b.holders.twoWeekLargeHolderChange ?? -Infinity) - (a.holders.twoWeekLargeHolderChange ?? -Infinity)
    || Math.abs(a.technical.necklineDistance ?? Infinity) - Math.abs(b.technical.necklineDistance ?? Infinity)
    || (b.technical.averageTradeValue20 ?? 0) - (a.technical.averageTradeValue20 ?? 0)
  ).slice(0, LIMITS.maxCandidates);
}
