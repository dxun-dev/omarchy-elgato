import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function atomicJSON(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(tmp, path);
}
