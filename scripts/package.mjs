import { cp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { distributionFiles } from './distribution-files.mjs';
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') {
  throw new Error('Usage: npm run package:plugin -- --output DIRECTORY (must not exist)');
}
const source = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(args[1]);
await mkdir(output); // Do not overwrite or delete a previous artifact.
for (const name of distributionFiles) {
  await cp(join(source, name), join(output, name), { recursive: true });
}
execFileSync('omarchy', ['plugin', 'validate', output], { stdio: 'inherit' });
console.log('Validated distribution folder: ' + output);
