import { buildManifest, evaluateCompleteness } from './core/completeness.js';
import { rankCandidates } from './core/strategy.js';

function group(rows) {
  const out = new Map();
  for (const row of rows || []) {
    if (!out.has(row.symbol)) out.set(row.symbol, []);
    out.get(row.symbol).push(row);
  }
  return out;
}

export function buildSnapshot(input, options = {}) {
  const priceMap = group(input.prices);
  const institutionalMap = group(input.institutional);
  const marginMap = group(input.margin);
  const tdccMap = group(input.tdcc);
  const disclosureMap = group(input.disclosures);
  const meetingMap = group(input.shareholderMeetings);
  const exRightsMap = group(input.exRights);
  const revenueMap = group(input.monthlyRevenue);
  const stocks = (input.companies || []).map(company => ({
    ...company,
    expectedDate: options.expectedDate || null,
    bars: priceMap.get(company.symbol) || [],
    institutional: institutionalMap.get(company.symbol) || [],
    margin: marginMap.get(company.symbol) || [],
    tdccWeeks: tdccMap.get(company.symbol) || [],
    mopsDisclosures: disclosureMap.get(company.symbol) || [],
    riskEvents: [...(meetingMap.get(company.symbol) || []), ...(exRightsMap.get(company.symbol) || [])],
    monthlyRevenue: revenueMap.get(company.symbol) || [],
    asOf: options.now || null
  }));
  const completeness = evaluateCompleteness(input.sources, { expectedDate: options.expectedDate, now: options.now });
  const unavailable = completeness.status === 'BLOCKED' || completeness.status === 'STALE';
  const potentialStocks = unavailable ? [] : rankCandidates(stocks);
  const candidateStatus = unavailable ? 'UNAVAILABLE'
    : completeness.status === 'COMPLETE' && potentialStocks.every(row => row.candidateStatus === 'VERIFIED') ? 'VERIFIED' : 'PROVISIONAL';
  const payload = {
    schemaVersion: 2,
    generatedAt: options.now || new Date().toISOString(),
    dataStatus: completeness.status,
    candidateStatus,
    potentialStocks,
    disclosures: input.disclosures || [],
    corporateEvents: [...(input.shareholderMeetings || []), ...(input.exRights || [])]
  };
  payload.manifest = buildManifest({ sources: input.sources, completeness, payload, generatedAt: payload.generatedAt });
  return payload;
}
