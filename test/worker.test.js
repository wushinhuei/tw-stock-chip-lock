import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../worker/index.js';

test('MCP拒絕未授權並只列出三個研究工具', async () => {
  const env = { MCP_READ_TOKEN: 'secret' };
  const unauthorized = await handleRequest(new Request('https://worker.example/mcp', { method: 'POST', body: '{}' }), env);
  assert.equal(unauthorized.status, 401);
  const response = await handleRequest(new Request('https://worker.example/mcp', {
    method: 'POST', headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  }), env);
  const body = await response.json();
  assert.deepEqual(body.result.tools.map(tool => tool.name), ['get_potential_stocks', 'get_candidate_snapshot', 'get_data_completeness']);
});

test('Worker不提供盤中報價端點', async () => {
  const response = await handleRequest(new Request('https://worker.example/api/v1/quotes?symbols=2330'), {});
  assert.equal(response.status, 404);
});
