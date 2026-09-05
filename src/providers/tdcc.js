import { fetchJson, parseNumber } from './http.js';

function value(row, names) {
  for (const [key, item] of Object.entries(row)) {
    const normalizedKey = key.replace(/^\uFEFF/, '');
    if (names.includes(normalizedKey)) return item;
  }
  return null;
}

function normalizeDate(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : null;
}

export async function fetchHoldingDistribution(fetchImpl = fetch) {
  const rows = await fetchJson('https://openapi.tdcc.com.tw/v1/opendata/1-5', { fetchImpl });
  const grouped = new Map();
  for (const row of rows) {
    const symbol = String(value(row, ['證券代號', 'SecurityCode', 'stock_id']) ?? '').trim();
    if (!/^\d{4}$/.test(symbol)) continue;
    const date = normalizeDate(value(row, ['資料日期', 'Date', 'date']));
    const level = Number(value(row, ['持股分級', 'HoldingSharesLevel', 'level']));
    const people = parseNumber(value(row, ['人數', 'people', 'NumberOfHolders'])) ?? 0;
    const percent = parseNumber(value(row, ['占集保庫存數比例%', '占集保庫存數比例', 'percent', 'Percentage'])) ?? 0;
    const current = grouped.get(symbol) || { symbol, date, largeHolderRatio: 0, totalHolders: 0 };
    current.totalHolders += people;
    if (level >= 15) current.largeHolderRatio += percent / 100;
    grouped.set(symbol, current);
  }
  return [...grouped.values()];
}
