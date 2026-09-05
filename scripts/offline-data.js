import { readFile, writeFile } from 'node:fs/promises';

export async function writeOfflineData(jsonPath, scriptPath, globalName) {
  const value = JSON.parse(await readFile(jsonPath, 'utf8'));
  await writeFile(scriptPath, `globalThis.${globalName} = ${JSON.stringify(value)};\n`, 'utf8');
}
