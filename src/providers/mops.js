import { createHash } from 'node:crypto';
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

function cleanHtml(value) {
  return String(value || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

export function parseMonthlyRevenueHtml(html, { year, month, downloadedAt, sourceUrl }) {
  const rows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(cell => cleanHtml(cell[1]))
  ).filter(row => row.length);
  const result = new Map();
  for (const cells of rows) {
    const symbol = String(cells[0] || '').trim();
    if (!/^\d{4}$/.test(symbol)) continue;
    const revenue = Number(String(cells[2] || '').replaceAll(',', ''));
    if (!Number.isFinite(revenue)) continue;
    const rawHash = createHash('sha256').update(JSON.stringify(cells)).digest('hex');
    result.set(symbol, {
      symbol, name: cells[1] || symbol, yearMonth: `${year}-${String(month).padStart(2, '0')}`,
      revenue, previousMonthRevenue: Number(String(cells[3] || '').replaceAll(',', '')) || null,
      previousYearRevenue: Number(String(cells[4] || '').replaceAll(',', '')) || null,
      downloadedAt, availableAt: downloadedAt, rawHash, sourceUrl, source: 'MOPS_T21_ARCHIVE'
    });
  }
  return [...result.values()];
}

export async function fetchMonthlyRevenueMonth(year, month, fetchImpl = fetch, options = {}) {
  const rocYear = Number(year) - 1911;
  const downloadedAt = options.downloadedAt || new Date().toISOString();
  const categories = rocYear > 98 ? ['0', '1'] : [null];
  const rows = new Map();
  for (const category of categories) {
    const suffix = category === null ? `${rocYear}_${Number(month)}` : `${rocYear}_${Number(month)}_${category}`;
    const sourceUrl = `https://mopsov.twse.com.tw/nas/t21/sii/t21sc03_${suffix}.html`;
    const response = await fetchImpl(sourceUrl, {
      headers: { accept: 'text/html', 'user-agent': 'tw-stock-chip-lock/0.2' }, signal: AbortSignal.timeout(options.timeoutMs || 30000)
    });
    if (!response.ok) throw new Error(`MOPS monthly revenue HTTP ${response.status}`);
    const html = new TextDecoder(options.encoding || 'big5').decode(await response.arrayBuffer());
    if (/FOR SECURITY REASONS|安全性考量.*無法呈現/i.test(html)) throw new Error('MOPS monthly revenue security block');
    for (const row of parseMonthlyRevenueHtml(html, { year: Number(year), month: Number(month), downloadedAt, sourceUrl })) rows.set(row.symbol, row);
  }
  return [...rows.values()];
}
