import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { root } from './paths.js';
// Omarchy forbids symlinks inside plugins. npm dependencies therefore live
// outside the installed plugin; development uses this repository's modules.
const runtime = process.env.OMARCHY_ELGATO_RUNTIME ||
    (existsSync(join(root, 'node_modules'))
        ? root
        : join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'omarchy-elgato', 'runtime'));
export const streamDeck = createRequire(join(runtime, 'package.json'))('@elgato-stream-deck/node');
//# sourceMappingURL=library.js.map