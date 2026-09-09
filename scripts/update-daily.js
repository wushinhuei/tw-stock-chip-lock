import { collect } from './collect.js';

const payload = await collect({ fullHistory: false });
console.log(JSON.stringify({ status: payload.dataStatus, candidateStatus: payload.candidateStatus, candidates: payload.potentialStocks.length, generatedAt: payload.generatedAt }));
if (payload.dataStatus === 'BLOCKED') process.exitCode = 2;
