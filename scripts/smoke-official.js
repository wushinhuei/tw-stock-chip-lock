import { fetchDailyDisclosures, fetchExRightsCalendar, fetchShareholderMeetings } from '../src/providers/mops.js';
import { fetchHoldingDistribution } from '../src/providers/tdcc.js';
import { fetchInstitutionalDay, fetchListedCompanies, fetchMarginDay, fetchMarketDay, fetchQuotes } from '../src/providers/twse.js';

const requestedDate = process.env.SMOKE_DATE || new Date().toISOString().slice(0, 10);
const compactDate = requestedDate.replaceAll('-', '');
const checks = [
  ['TWSE listed', () => fetchListedCompanies()],
  ['TWSE prices', () => fetchMarketDay(requestedDate)],
  ['TWSE institutions', () => fetchInstitutionalDay(requestedDate)],
  ['TWSE margin', () => fetchMarginDay(requestedDate)],
  ['MOPS disclosures', () => fetchDailyDisclosures()],
  ['MOPS shareholder meetings', () => fetchShareholderMeetings()],
  ['TWSE ex-right calendar', () => fetchExRightsCalendar()],
  ['TDCC holdings', () => fetchHoldingDistribution()],
  ['TWSE MIS quote', () => fetchQuotes(['2330'])]
];

let failed = false;
for (const [name, task] of checks) {
  try {
    const rows = await task();
    const ok = Array.isArray(rows) && rows.length > 0;
    console.log(JSON.stringify({ name, ok, rows: rows.length, sampleDate: rows[0]?.date || rows[0]?.timestamp || null }));
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ name, ok: false, error: error.message }));
  }
}
if (failed) process.exitCode = 1;

if (process.env.SMOKE_DEBUG === '1') {
  for (const [name, url] of [
    ['T86 metadata', `https://www.twse.com.tw/rwd/zh/fund/T86?response=json&date=${compactDate}&selectType=ALLBUT0999`],
    ['MI_MARGN metadata', `https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?response=json&date=${compactDate}&selectType=ALL`],
    ['TDCC metadata', 'https://openapi.tdcc.com.tw/v1/opendata/1-5'],
    ['Shareholder meeting metadata', 'https://openapi.twse.com.tw/v1/opendata/t187ap41_L'],
    ['Ex-right metadata', 'https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL']
  ]) {
    const response = await fetch(url);
    const body = await response.json();
    console.log(JSON.stringify({
      name, status: body.stat, keys: Object.keys(Array.isArray(body) ? (body[0] || {}) : body), firstRow: Array.isArray(body) ? body[0] : undefined,
      legacy: Array.isArray(body) ? [] : Object.keys(body).filter(key => /^(fields|data)/.test(key)).map(key => ({ key, size: body[key]?.length || 0, sample: key.startsWith('fields') ? body[key] : undefined })),
      tables: (body.tables || []).map(table => ({ title: table.title, fields: table.fields, rows: table.data?.length || 0 }))
    }));
  }
}
