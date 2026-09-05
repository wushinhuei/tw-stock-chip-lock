import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchExRightsCalendar, fetchShareholderMeetings, normalizeMopsDate } from '../src/providers/mops.js';
import { fetchInstitutionalDay, fetchMarginDay, fetchMarketDay } from '../src/providers/twse.js';
import { fetchHoldingDistribution } from '../src/providers/tdcc.js';

function mockJson(value) {
  return async () => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}

test('MOPS民國與西元日期正規化', () => {
  assert.equal(normalizeMopsDate('1150904'), '2026-09-04');
  assert.equal(normalizeMopsDate('20260904'), '2026-09-04');
  assert.equal(normalizeMopsDate('bad'), null);
});

test('股東會與除權息風險事件正規化', async () => {
  const meetings = await fetchShareholderMeetings(mockJson([{ 公司代號: '2330', 公司名稱: '台積電', 開會日期: '1150601', 出表日期: '1150501', '股東常(臨時)會': '常會' }]));
  assert.equal(meetings[0].date, '2026-06-01');
  const exRights = await fetchExRightsCalendar(mockJson([{ Date: '1150701', Code: '2330', Name: '台積電', Exdividend: '息', CashDividend: '5' }]));
  assert.equal(exRights[0].cashDividend, 5);
});

test('TDCC可處理帶BOM日期欄並彙總千張以上比例', async () => {
  const rows = await fetchHoldingDistribution(mockJson([
    { '證券代號': '2330', '\uFEFF資料日期': '20260904', '持股分級': '1', '人數': '10', '占集保庫存數比例%': '1.5' },
    { '證券代號': '2330', '\uFEFF資料日期': '20260904', '持股分級': '15', '人數': '2', '占集保庫存數比例%': '40' }
  ]));
  assert.equal(rows[0].date, '2026-09-04');
  assert.equal(rows[0].totalHolders, 12);
  assert.equal(rows[0].largeHolderRatio, 0.4);
});

test('TWSE日K、法人及資券表格正規化', async () => {
  const price = await fetchMarketDay('2026-09-04', mockJson({ tables: [{ fields: ['證券代號', '證券名稱', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'], data: [['2330', '台積電', '1,500,000', '1,000,000,000', '1000', '1010', '995', '1005']] }] }));
  assert.deepEqual(price[0].volumeLots, 1500);
  const institution = await fetchInstitutionalDay('2026-09-04', mockJson({ fields: ['證券代號', '外陸資買賣超股數(不含外資自營商)', '投信買賣超股數'], data: [['2330', '100,000', '20,000']] }));
  assert.equal(institution[0].trustNet, 20_000);
  const credit = await fetchMarginDay('2026-09-04', mockJson({ tables: [{ title: '融資融券彙總 (全部)', fields: ['代號', '名稱', '買進', '賣出', '現金償還', '前日餘額', '今日餘額', '限額', '買進', '賣出', '現券償還', '前日餘額', '今日餘額'], data: [['2330', '台積電', 0, 0, 0, 0, '10,000', 0, 0, 0, 0, 0, '3,000']] }] }));
  assert.equal(credit[0].marginBalance, 10_000);
  assert.equal(credit[0].shortBalance, 3_000);
});
