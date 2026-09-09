import { resolve } from 'node:path';
import { writeOfflineData } from './offline-data.js';

const root = resolve(import.meta.dirname, '..');
await Promise.all([
  writeOfflineData(resolve(root, 'web/data/latest.json'), resolve(root, 'web/data/latest.js'), '__CHIP_LOCK_SNAPSHOT__'),
  writeOfflineData(resolve(root, 'web/data/outcomes.json'), resolve(root, 'web/data/outcomes.js'), '__CHIP_LOCK_OUTCOMES__')
]);
console.log(JSON.stringify({ offlineData: true }));
