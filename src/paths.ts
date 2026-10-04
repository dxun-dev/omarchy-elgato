import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const configDir = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
  'omarchy-elgato',
);
export const profilePath = join(configDir, 'profile.json');
export const stateDir = join(
  process.env.XDG_STATE_HOME || join(homedir(), '.local/state'),
  'omarchy-elgato',
);
export const statusPath = join(stateDir, 'status.json');
export const cacheDir = join(
  process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'omarchy-elgato',
);
