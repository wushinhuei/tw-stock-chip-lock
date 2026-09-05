import test from 'node:test';
import assert from 'node:assert/strict';
import { finite, mean, round } from '../src/core/math.js';

test('缺值不可被JavaScript轉成假0', () => {
  assert.equal(finite(null), null);
  assert.equal(finite(undefined), null);
  assert.equal(finite(''), null);
  assert.equal(round(null), null);
  assert.equal(mean([null, '', 2]), 2);
  assert.equal(finite('0'), 0);
});
