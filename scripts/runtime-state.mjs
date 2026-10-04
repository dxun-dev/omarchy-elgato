import { mkdir, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function writeRuntimeState(phase, error = '') {
  const directory = join(
    process.env.XDG_STATE_HOME || join(homedir(), '.local/state'),
    'omarchy-elgato',
  );
  await mkdir(directory, { recursive: true });
  const path = join(directory, 'runtime-status.json');
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ phase, error, updatedAt: Math.floor(Date.now() / 1000) }),
    { mode: 0o600 },
  );
  await rename(temporary, path);
}
