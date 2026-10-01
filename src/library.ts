import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { root } from './config.js';

// Omarchy forbids symlinks inside plugins. npm dependencies therefore live
// outside the installed plugin; development uses this repository's modules.
const runtime = process.env.OMARCHY_ELGATO_RUNTIME || (existsSync(join(root, 'node_modules'))
  ? root : join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'omarchy-elgato', 'runtime'));
export const streamDeck = createRequire(join(runtime, 'package.json'))('@elgato-stream-deck/node') as typeof import('@elgato-stream-deck/node');
