import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSnapshot } from '../src/pipeline.js';
import { coverage } from '../src/core/completeness.js';
import { fetchDailyDisclosures, fetchExRightsCalendar, fetchShareholderMeetings } from '../src/providers/mops.js';
import { fetchHoldingDistribution } from '../src/providers/tdcc.js';
import { fetchInstitutionalDay, fetchListedCompanies, fetchMarginDay, fetchMarketDay } from '../src/providers/twse.js';
import { tradingWeekdays } from '../src/providers/http.js';

const ROOT = resolve(import.meta.dirname, '..');
const CACHE_PATH = resolve(ROOT, 'data/cache.json');
const OUTPUT_PATH = resolve(ROOT, 'web/data/latest.json');
const TDCC_DIR = resolve(ROOT, 'data/tdcc');

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function mergeRows(existing, added) {
  const map = new Map();
  for (const row of [...(existing || []), ...(added || [])]) map.set(`${row.date}|${row.symbol}`, row);
  return [...map.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.symbol.localeCompare(b.symbol));
}

async function fetchDays(dates, task, label) {
  const rows = [];
  const errors = [];
  for (const date of dates) {
    try {
      const dayRows = await task(date);
      if (dayRows.length) rows.push(...dayRows);
    } catch (error) {
      errors.push(`${date}: ${error.message}`);
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1100));
  }
  return { rows, errors, label };
}

function latestDate(rows) {
  return [...new Set((rows || []).map(row => row.date).filter(Boolean))].sort().at(-1) || null;
}

function missingDates(dates, cachedRows) {
  const present = new Set((cachedRows || []).map(row => row.date));
  return dates.filter(date => !present.has(date));
}

async function archiveTdcc(rows) {
  const date = rows[0]?.date;
  if (!date) return;
  await saveJson(resolve(TDCC_DIR, `${date}.json`), rows);
}

async function loadTdccHistory() {
  await mkdir(TDCC_DIR, { recursive: true });
  const names = (await readdir(TDCC_DIR)).filter(name => name.endsWith('.json')).sort().slice(-3);
  const groups = await Promise.all(names.map(name => readJson(resolve(TDCC_DIR, name), [])));
  return { rows: groups.flat(), snapshotCount: groups.length };
}

export async function collect({ fullHistory }) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const cache = await readJson(CACHE_PATH, { prices: [], institutional: [], margin: [] });
  const dates = tradingWeekdays(today, fullHistory ? 190 : 14);
  const market = await fetchDays(missingDates(dates, cache.prices), fetchMarketDay, 'prices');
  const recentDates = dates.slice(-10);
  const institutional = await fetchDays(missingDates(recentDates, cache.institutional), fetchInstitutionalDay, 'institutional');
  const margin = await fetchDays(missingDates(recentDates, cache.margin), fetchMarginDay, 'margin');
  const [companiesResult, disclosuresResult, meetingsResult, exRightsResult, tdccResult] = await Promise.allSettled([
    fetchListedCompanies(), fetchDailyDisclosures(), fetchShareholderMeetings(), fetchExRightsCalendar(), fetchHoldingDistribution()
  ]);

  if (tdccResult.status === 'fulfilled' && tdccResult.value.length) await archiveTdcc(tdccResult.value);
  const tdccHistory = await loadTdccHistory();
  const nextCache = {
    companies: companiesResult.status === 'fulfilled' ? companiesResult.value : cache.companies || [],
    prices: mergeRows(cache.prices, market.rows),
    institutional: mergeRows(cache.institutional, institutional.rows),
    margin: mergeRows(cache.margin, margin.rows),
    disclosures: disclosuresResult.status === 'fulfilled' ? disclosuresResult.value : cache.disclosures || [],
    shareholderMeetings: meetingsResult.status === 'fulfilled' ? meetingsResult.value : cache.shareholderMeetings || [],
    exRights: exRightsResult.status === 'fulfilled' ? exRightsResult.value : cache.exRights || []
  };
  const date = latestDate(nextCache.prices);
  const priceCoverage = coverage(nextCache.prices, 120);
  const institutionalCoverage = coverage(nextCache.institutional, 5);
  const marginCoverage = coverage(nextCache.margin, 6);
  const sources = {
    prices: { provider: 'TWSE_MI_INDEX', date, rows: nextCache.prices.length, coverage: priceCoverage, ok: Boolean(date) && priceCoverage.sufficient, warning: market.errors.slice(-3).join('; ') || (!priceCoverage.sufficient ? `只有 ${priceCoverage.dates}/120 個交易日` : null) },
    institutional: { provider: 'TWSE_T86', date: latestDate(nextCache.institutional), rows: nextCache.institutional.length, coverage: institutionalCoverage, ok: Boolean(latestDate(nextCache.institutional)) && institutionalCoverage.sufficient, warning: institutional.errors.slice(-3).join('; ') || (!institutionalCoverage.sufficient ? `只有 ${institutionalCoverage.dates}/5 個交易日` : null) },
    margin: { provider: 'TWSE_MI_MARGN', date: latestDate(nextCache.margin), rows: nextCache.margin.length, coverage: marginCoverage, ok: Boolean(latestDate(nextCache.margin)) && marginCoverage.sufficient, warning: margin.errors.slice(-3).join('; ') || (!marginCoverage.sufficient ? `只有 ${marginCoverage.dates}/6 個交易日` : null) },
    tdcc: { provider: 'TDCC_1_5', date: latestDate(tdccHistory.rows), rows: tdccHistory.rows.length, snapshots: tdccHistory.snapshotCount, ok: tdccHistory.snapshotCount >= 3, warning: tdccHistory.snapshotCount < 3 ? `只累積 ${tdccHistory.snapshotCount}/3 個週快照` : null },
    mops: { provider: 'MOPS_T187AP04_L', date: latestDate(nextCache.disclosures), rows: nextCache.disclosures.length, ok: disclosuresResult.status === 'fulfilled', warning: disclosuresResult.status === 'rejected' ? disclosuresResult.reason.message : null },
    shareholderMeetings: { provider: 'MOPS_T187AP41_L', date: latestDate(nextCache.shareholderMeetings), rows: nextCache.shareholderMeetings.length, ok: meetingsResult.status === 'fulfilled', warning: meetingsResult.status === 'rejected' ? meetingsResult.reason.message : null },
    exRights: { provider: 'TWSE_TWT48U_ALL', date: latestDate(nextCache.exRights), rows: nextCache.exRights.length, ok: exRightsResult.status === 'fulfilled', warning: exRightsResult.status === 'rejected' ? exRightsResult.reason.message : null }
  };
  const payload = buildSnapshot({ ...nextCache, tdcc: tdccHistory.rows, sources }, { expectedDate: date, now: now.toISOString() });
  await saveJson(CACHE_PATH, nextCache);
  await saveJson(OUTPUT_PATH, payload);
  return payload;
}
