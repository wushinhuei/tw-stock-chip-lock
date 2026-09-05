import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.js';

test('MCP拒絕未授權並可列出三個唯讀工具', async () => {
  const env = { MCP_READ_TOKEN: 'secret' };
  const unauthorized = await handleRequest(new Request('https://worker.example/mcp', { method: 'POST', body: '{}' }), env);
  assert.equal(unauthorized.status, 401);
  const response = await handleRequest(new Request('https://worker.example/mcp', {
    method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(body.result.tools.map(tool => tool.name), ['get_weekly_candidates', 'get_candidate_snapshot', 'check_live_breakout']);
});

test('報價API限制1至3檔', async () => {
  const response = await handleRequest(new Request('https://worker.example/api/v1/quotes?symbols=1101,1102,1103,1104'), {});
  assert.equal(response.status, 400);
});
