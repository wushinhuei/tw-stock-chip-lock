import { compactDate, fetchJson, parseNumber } from './http.js';

const TWSE = 'https://wwwc.twse.com.tw/rwd/zh';

function findTable(json, requiredTerms) {
  const tables = [...(json?.tables || [])];
  if (Array.isArray(json?.fields) && Array.isArray(json?.data)) tables.push({ fields: json.fields, data: json.data, title: json.title });
  return tables.find(table => requiredTerms.every(term => (table.fields || []).some(field => String(field).includes(term))));
}

function fieldIndex(fields, pattern) {
  return fields.findIndex(field => pattern.test(String(field)));
}

export async function fetchListedCompanies(fetchImpl = fetch) {
  const rows = await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', { fetchImpl });
  return rows.map(row => ({
    symbol: String(row['公司代號'] ?? row.Code ?? '').trim(),
    name: String(row['公司簡稱'] ?? row.Name ?? '').trim(),
    industry: String(row['產業別'] ?? row.Industry ?? '').trim(),
    address: String(row['住址'] ?? row.Address ?? '').trim(),
    market: 'TWSE'
  })).filter(row => /^\d{4}$/.test(row.symbol));
}

export async function fetchMarketDay(date, fetchImpl = fetch) {
  const url = `${TWSE}/afterTrading/MI_INDEX?response=json&date=${compactDate(date)}&type=ALLBUT0999`;
  const json = await fetchJson(url, { fetchImpl });
  const table = findTable(json, ['證券代號', '成交股數', '收盤價']);
  if (!table) return [];
  const fields = table.fields;
  const index = {
    symbol: fieldIndex(fields, /證券代號/), name: fieldIndex(fields, /證券名稱/),
    volume: fieldIndex(fields, /成交股數/), value: fieldIndex(fields, /成交金額/),
    open: fieldIndex(fields, /開盤價/), high: fieldIndex(fields, /最高價/), low: fieldIndex(fields, /最低價/), close: fieldIndex(fields, /收盤價/)
  };
  return table.data.map(row => {
    const volumeShares = parseNumber(row[index.volume]);
    return {
      date, symbol: String(row[index.symbol] ?? '').trim(), name: String(row[index.name] ?? '').trim(),
      open: parseNumber(row[index.open]), high: parseNumber(row[index.high]), low: parseNumber(row[index.low]), close: parseNumber(row[index.close]),
      volumeShares, volumeLots: volumeShares === null ? null : volumeShares / 1000,
      tradeValue: parseNumber(row[index.value])
    };
  }).filter(row => /^\d{4}$/.test(row.symbol) && row.close !== null);
}

export async function fetchInstitutionalDay(date, fetchImpl = fetch) {
  const url = `${TWSE}/fund/T86?response=json&date=${compactDate(date)}&selectType=ALLBUT0999`;
  const json = await fetchJson(url, { fetchImpl });
  const table = findTable(json, ['證券代號', '投信']);
  if (!table) return [];
  const fields = table.fields;
  const symbolIndex = fieldIndex(fields, /證券代號/);
  const foreignIndex = fieldIndex(fields, /外陸資.*買賣超股數(?!.*自營商)/);
  const trustIndex = fieldIndex(fields, /投信.*買賣超股數/);
  return table.data.map(row => ({
    date, symbol: String(row[symbolIndex] ?? '').trim(),
    foreignNet: parseNumber(row[foreignIndex]) ?? 0,
    trustNet: parseNumber(row[trustIndex]) ?? 0
  })).filter(row => /^\d{4}$/.test(row.symbol));
}

export async function fetchMarginDay(date, fetchImpl = fetch) {
  const url = `${TWSE}/marginTrading/MI_MARGN?response=json&date=${compactDate(date)}&selectType=ALL`;
  const json = await fetchJson(url, { fetchImpl });
  const table = (json?.tables || []).find(item => String(item.title || '').includes('融資融券彙總'))
    || findTable(json, ['股票代號', '融資', '融券']) || findTable(json, ['證券代號', '融資', '融券']);
  if (!table) return [];
  const fields = table.fields;
  const symbolIndex = fieldIndex(fields, /^(股票|證券)?代號$/);
  const marginIndexes = fields.map((field, index) => ({ field: String(field), index })).filter(item => item.field.includes('今日餘額'));
  const marginIndex = marginIndexes[0]?.index ?? -1;
  const shortIndex = marginIndexes[1]?.index ?? -1;
  return table.data.map(row => ({
    date, symbol: String(row[symbolIndex] ?? '').trim(),
    marginBalance: parseNumber(row[marginIndex]), shortBalance: parseNumber(row[shortIndex])
  })).filter(row => /^\d{4}$/.test(row.symbol));
}
