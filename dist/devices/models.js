import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../paths.js';
export const deckModels = JSON.parse(readFileSync(join(root, 'defaults/models.json'), 'utf8'));
export function modelKind(model) {
    return deckModels.find((d) => d.models.includes(model))?.id || null;
}
//# sourceMappingURL=models.js.map