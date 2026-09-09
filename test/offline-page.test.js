import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');

test('雙擊本機頁面不依賴module或JSON fetch才能取得資料', async () => {
  const html = await readFile(resolve(root, 'web/index.html'), 'utf8');
  assert.ok(!html.includes('type="module"'));
  assert.ok(html.indexOf('data/latest.js') < html.indexOf('app.js'));
  const context = vm.createContext({});
  vm.runInContext(await readFile(resolve(root, 'web/data/latest.js'), 'utf8'), context);
  vm.runInContext(await readFile(resolve(root, 'web/data/outcomes.js'), 'utf8'), context);
  assert.ok(['COMPLETE', 'PARTIAL', 'BLOCKED', 'STALE'].includes(context.__CHIP_LOCK_SNAPSHOT__.dataStatus));
  assert.ok(context.__CHIP_LOCK_SNAPSHOT__.manifest.sources.prices.coverage.dates >= 120);
  assert.ok(context.__CHIP_LOCK_OUTCOMES__.summary);
});
