import { fetchJson } from './http.js';

export function normalizeMopsDate(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 7) {
    const year = Number(digits.slice(0, 3)) + 1911;
    return `${year}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
  }
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return null;
}

export async function fetchDailyDisclosures(fetchImpl = fetch) {
  const rows = await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap04_L', { fetchImpl });
  return rows.map(row => ({
    symbol: String(row['公司代號'] ?? row.Code ?? '').trim(),
    name: String(row['公司簡稱'] ?? row.Name ?? '').trim(),
    date: normalizeMopsDate(row['發言日期'] ?? row.Date),
    time: String(row['發言時間'] ?? row.Time ?? '').trim(),
    subject: String(row['主旨'] ?? row.Subject ?? '').trim(),
    source: 'MOPS_T187AP04_L'
  })).filter(row => /^\d{4}$/.test(row.symbol));
}

export async function fetchShareholderMeetings(fetchImpl = fetch) {
  const rows = await fetchJson('https://openapi.twse.com.tw/v1/opendata/t187ap41_L', { fetchImpl });
  return rows.map(row => ({
    symbol: String(row['公司代號'] ?? '').trim(), name: String(row['公司名稱'] ?? '').trim(),
    date: normalizeMopsDate(row['開會日期']), publishedDate: normalizeMopsDate(row['出表日期']),
    eventType: 'SHAREHOLDER_MEETING', meetingType: String(row['股東常(臨時)會'] ?? '').trim(),
    electronicVoting: String(row['是否採電子投票'] ?? '').trim(), source: 'MOPS_T187AP41_L'
  })).filter(row => /^\d{4}$/.test(row.symbol) && row.date);
}

export async function fetchExRightsCalendar(fetchImpl = fetch) {
  const rows = await fetchJson('https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL', { fetchImpl });
  return rows.map(row => ({
    symbol: String(row.Code ?? '').trim(), name: String(row.Name ?? '').trim(), date: normalizeMopsDate(row.Date),
    eventType: 'EX_RIGHT_DIVIDEND', category: String(row.Exdividend ?? '').trim(),
    cashDividend: row.CashDividend === '' ? null : Number(row.CashDividend), source: 'TWSE_TWT48U_ALL'
  })).filter(row => /^\d{4}$/.test(row.symbol) && row.date);
}
