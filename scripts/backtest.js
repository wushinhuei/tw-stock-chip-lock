import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runMechanicalProxy } from '../src/core/backtest.js';

const root = resolve(import.meta.dirname, '..');
const inputPath = process.env.BACKTEST_INPUT || resolve(root, 'data/backtest-input.json');
const outputPath = resolve(root, 'web/data/backtest.json');
let input;
try { input = JSON.parse(await readFile(inputPath, 'utf8')); }
catch { input = { dataStatus: 'BLOCKED', trades: [], benchmarkBars: [] }; }
const result = runMechanicalProxy(input);
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...result }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(result));
if (result.status !== 'COMPLETE') process.exitCode = 2;
