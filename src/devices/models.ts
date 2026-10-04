import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from '../paths.js';
import type { DeckModel } from '../profile/types.js';

export const deckModels: DeckModel[] = JSON.parse(
  readFileSync(join(root, 'defaults/models.json'), 'utf8'),
);

export function modelKind(model: string) {
  return deckModels.find((d) => d.models.includes(model))?.id || null;
}
