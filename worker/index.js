function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

async function latestSnapshot(env) {
  const response = await fetch(`${env.DATA_BASE_URL}/latest.json`, { cf: { cacheTtl: 30, cacheEverything: true } });
  if (!response.ok) throw new Error(`snapshot HTTP ${response.status}`);
  return response.json();
}

export const MCP_TOOLS = [
  {
    name: 'get_potential_stocks', description: '取得最新潛力股排行榜、評分與資料可信度；僅供研究。',
    inputSchema: { type: 'object', properties: { minimumScore: { type: 'number', minimum: 50, maximum: 100 }, grade: { type: 'string', enum: ['A', 'B', 'C'] }, candidateStatus: { type: 'string', enum: ['VERIFIED', 'PROVISIONAL'] } }, additionalProperties: false }
  },
  {
    name: 'get_candidate_snapshot', description: '取得單一潛力股的籌碼、技術、月營收、評分及風險快照。',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string', pattern: '^\\d{4}$' } }, required: ['symbol'], additionalProperties: false }
  },
  {
    name: 'get_data_completeness', description: '取得各官方來源日期、筆數、缺漏及候選榜可信度。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  }
];

async function callTool(name, args, env) {
  const snapshot = await latestSnapshot(env);
  if (name === 'get_potential_stocks') {
    const rows = (snapshot.potentialStocks || []).filter(row => (args.minimumScore === undefined || row.score >= args.minimumScore)
      && (!args.grade || row.grade === args.grade) && (!args.candidateStatus || row.candidateStatus === args.candidateStatus));
    return { generatedAt: snapshot.generatedAt, candidateStatus: snapshot.candidateStatus, count: rows.length, potentialStocks: rows };
  }
  if (name === 'get_candidate_snapshot') {
    const candidate = (snapshot.potentialStocks || []).find(row => row.symbol === args.symbol);
    if (!candidate) throw new Error('股票不在本期潛力股排行榜');
    return { ...candidate, generatedAt: snapshot.generatedAt, sourceDates: snapshot.manifest?.sourceDates || {} };
  }
  if (name === 'get_data_completeness') return {
    dataStatus: snapshot.dataStatus, candidateStatus: snapshot.candidateStatus, generatedAt: snapshot.generatedAt,
    sourceDates: snapshot.manifest?.sourceDates || {}, missingFields: snapshot.manifest?.missingFields || [],
    warnings: snapshot.manifest?.warnings || [], sources: snapshot.manifest?.sources || {}
  };
  throw new Error(`未知工具: ${name}`);
}

async function handleMcp(request, env) {
  if (!env.MCP_READ_TOKEN) return json({ error: 'MCP_READ_TOKEN 尚未設定' }, 503);
  if (request.headers.get('authorization') !== `Bearer ${env.MCP_READ_TOKEN}`) return json({ error: 'Unauthorized' }, 401);
  const body = await request.json();
  const base = { jsonrpc: '2.0', id: body.id ?? null };
  try {
    if (body.method === 'initialize') return json({ ...base, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'tw-stock-chip-lock', version: '0.2.0' } } });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') return json({ ...base, result: { tools: MCP_TOOLS } });
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
  if (url.pathname === '/mcp' && request.method === 'POST') return handleMcp(request, env);
  if (url.pathname === '/api/v1/health' && request.method === 'GET') {
    try {
      const snapshot = await latestSnapshot(env);
      return json({ ok: true, dataStatus: snapshot.dataStatus, candidateStatus: snapshot.candidateStatus, generatedAt: snapshot.generatedAt });
    } catch (error) { return json({ ok: false, error: error.message }, 503); }
  }
  return json({ error: 'Not found' }, 404);
}

export default { fetch: handleRequest };
