import { breakoutSignal } from '../src/core/strategy.js';
import { fetchQuotes } from '../src/providers/twse.js';

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGIN || '';
  return origin && origin === allowed ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'Origin'
  } : {};
}

async function latestSnapshot(env) {
  const response = await fetch(`${env.DATA_BASE_URL}/latest.json`, { cf: { cacheTtl: 30, cacheEverything: true } });
  if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
  return response.json();
}

function allowedSymbols(snapshot) {
  return new Set([...(snapshot.candidates || []), ...(snapshot.accumulationWatch || [])].map(row => row.symbol));
}

async function quotePayload(symbols, env) {
  const snapshot = await latestSnapshot(env);
  const allowed = allowedSymbols(snapshot);
  const rejected = symbols.filter(symbol => !allowed.has(symbol));
  if (rejected.length) return { error: `非本週候選: ${rejected.join(',')}`, status: 403 };
  const quotes = await fetchQuotes(symbols);
  return { dataStatus: snapshot.dataStatus, generatedAt: new Date().toISOString(), quotes, status: 200 };
}

const tools = [
  {
    name: 'get_weekly_candidates',
    description: '取得最新每週候選、資料完整性與來源日期；唯讀，不代表買進建議。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'get_candidate_snapshot',
    description: '取得一檔本週候選的技術、法人、大戶、信用與MOPS快照。',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string', pattern: '^\\d{4}$' } }, required: ['symbol'], additionalProperties: false }
  },
  {
    name: 'check_live_breakout',
    description: '以TWSE即時報價檢查候選是否突破頸線及達預估量；只回傳訊號，不下單。',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string', pattern: '^\\d{4}$' }, neckline: { type: 'number', exclusiveMinimum: 0 }, approved: { type: 'boolean' } },
      required: ['symbol', 'neckline', 'approved'], additionalProperties: false
    }
  }
];

async function callTool(name, args, env) {
  const snapshot = await latestSnapshot(env);
  if (name === 'get_weekly_candidates') return snapshot;
  const candidate = (snapshot.candidates || []).find(row => row.symbol === args.symbol)
    || (snapshot.accumulationWatch || []).find(row => row.symbol === args.symbol);
  if (!candidate) throw new Error('股票不在本週候選清單');
  if (name === 'get_candidate_snapshot') return { ...candidate, dataStatus: snapshot.dataStatus, sourceDates: snapshot.manifest?.sourceDates || {} };
  if (name === 'check_live_breakout') {
    const quote = (await fetchQuotes([args.symbol]))[0];
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    return { symbol: args.symbol, quote, ...breakoutSignal({ candidate, review: { approved: args.approved, neckline: args.neckline }, quote, time, dataStatus: snapshot.dataStatus }) };
  }
  throw new Error(`未知工具: ${name}`);
}

async function handleMcp(request, env) {
  if (!env.MCP_READ_TOKEN) return json({ error: 'MCP_READ_TOKEN 尚未設定' }, 503);
  if (request.headers.get('authorization') !== `Bearer ${env.MCP_READ_TOKEN}`) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  const base = { jsonrpc: '2.0', id: body.id ?? null };
  try {
    if (body.method === 'initialize') return json({ ...base, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'tw-stock-chip-lock', version: '0.1.0' } } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return json({ ...base, result: { tools } });
    if (body.method === 'tools/call') {
      const result = await callTool(body.params?.name, body.params?.arguments || {}, env);
      return json({ ...base, result: { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result } });
    }
    return json({ ...base, error: { code: -32601, message: 'Method not found' } }, 404);
  } catch (error) {
    return json({ ...base, error: { code: -32000, message: error.message } }, 400);
  }
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  const cors = corsHeaders(request, env);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname === '/mcp' && request.method === 'POST') return handleMcp(request, env);
  if (url.pathname === '/api/v1/health') {
    try {
      const snapshot = await latestSnapshot(env);
      return json({ ok: true, dataStatus: snapshot.dataStatus, generatedAt: snapshot.generatedAt, sourceDates: snapshot.manifest?.sourceDates || {} }, 200, cors);
    } catch (error) { return json({ ok: false, error: error.message }, 503, cors); }
  }
  if (url.pathname === '/api/v1/quotes') {
    const symbols = [...new Set((url.searchParams.get('symbols') || '').split(',').map(value => value.trim()).filter(value => /^\d{4}$/.test(value)))];
    if (!symbols.length || symbols.length > 3) return json({ error: 'symbols 必須為1至3個四碼代號' }, 400, cors);
    try {
      const payload = await quotePayload(symbols, env);
      return json(payload.status === 200 ? payload : { error: payload.error }, payload.status, cors);
    } catch (error) { return json({ error: error.message }, 502, cors); }
  }
  return json({ error: 'Not found' }, 404, cors);
}

export default { fetch: handleRequest };
