import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sha256 } from '../src/core/completeness.js';

const root = resolve(import.meta.dirname, '..');
const snapshot = JSON.parse(await readFile(resolve(root, 'web/data/latest.json'), 'utf8'));
const backtest = JSON.parse(await readFile(resolve(root, 'web/data/backtest.json'), 'utf8'));
const errors = [];
if (!['COMPLETE', 'PARTIAL', 'BLOCKED', 'STALE'].includes(snapshot.dataStatus)) errors.push('無效 dataStatus');
if (snapshot.dataStatus !== 'COMPLETE' && (snapshot.allowNewRisk || snapshot.candidates?.length)) errors.push('非COMPLETE仍允許風險或產生候選');
if ((snapshot.candidates?.length || 0) > 20) errors.push('候選超過20檔');
const payload = structuredClone(snapshot);
delete payload.manifest;
if (snapshot.manifest?.payloadSha256 !== sha256(payload)) errors.push('snapshot雜湊不符');
if (backtest.status !== 'COMPLETE' && ['strategyReturn', 'benchmarkReturn', 'excessReturn'].some(key => key in backtest)) errors.push('封鎖回測仍含績效');
if (errors.length) throw new Error(errors.join('；'));
console.log(JSON.stringify({ valid: true, dataStatus: snapshot.dataStatus, candidates: snapshot.candidates?.length || 0, backtestStatus: backtest.status }));
