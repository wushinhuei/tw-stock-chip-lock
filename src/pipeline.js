import { buildManifest, evaluateCompleteness } from './core/completeness.js';
import { evaluateStock, rankCandidates } from './core/strategy.js';

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
  const stocks = (input.companies || []).map(company => ({
    ...company,
    expectedDate: options.expectedDate || null,
    bars: priceMap.get(company.symbol) || [],
    institutional: institutionalMap.get(company.symbol) || [],
    margin: marginMap.get(company.symbol) || [],
    tdccWeeks: tdccMap.get(company.symbol) || [],
    mopsDisclosures: disclosureMap.get(company.symbol) || [],
    riskEvents: [...(meetingMap.get(company.symbol) || []), ...(exRightsMap.get(company.symbol) || [])]
  }));
  const completeness = evaluateCompleteness(input.sources, { expectedDate: options.expectedDate, now: options.now });
  const candidates = completeness.status === 'COMPLETE' ? rankCandidates(stocks) : [];
  const accumulationWatch = stocks.map(evaluateStock).filter(row => row.accumulationWatch).slice(0, 50);
  const payload = {
    schemaVersion: 1,
    generatedAt: options.now || new Date().toISOString(),
    dataStatus: completeness.status,
    allowNewRisk: completeness.allowNewRisk,
    candidates,
    accumulationWatch,
    disclosures: input.disclosures || [],
    corporateEvents: [...(input.shareholderMeetings || []), ...(input.exRights || [])]
  };
  payload.manifest = buildManifest({ sources: input.sources, completeness, payload, generatedAt: payload.generatedAt });
  return payload;
}
