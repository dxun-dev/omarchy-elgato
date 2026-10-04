import { deviceMapping, pageSet } from '../profile/mapping.js';
import { updateProfile } from '../profile/store.js';
import { extensionAction } from '../extensions.js';
import { validAction, actionLabel } from './metadata.js';

export async function setControl(
  kind: 'keys' | 'classicKeys' | 'dials',
  index: number,
  slot: string,
  action: string,
  model?: string,
  pageId?: string,
) {
  if (!(await validAction(action))) {
    throw new Error('Unsupported action: ' + action);
  }
  if (action.startsWith('ext:')) {
    const extension = await extensionAction(action);
    const control = kind === 'dials' ? (slot === 'press' ? 'dialPress' : 'dialTurn') : 'button';
    if (!extension?.controls.includes(control)) {
      throw new Error('Action pack does not support this control');
    }
  }
  await updateProfile(async (p) => {
    const target = model || (kind === 'classicKeys' ? 'classic' : 'plus');
    if (
      (action.startsWith('page:') || action.startsWith('page_global:')) &&
      !pageSet(p, target).items.some(
        (page) => page.id === action.slice(action.indexOf(':') + 1) && !page.kind,
      )
    ) {
      throw new Error('Unknown target page');
    }
    const set = pageSet(p, target);
    const current = set.items.find((page) => page.id === (pageId || set.active));
    if (
      action.startsWith('folder:') &&
      !set.items.some((page) => page.id === action.slice(7) && page.kind === 'folder')
    ) {
      throw new Error('Unknown target folder');
    }
    if (kind !== 'dials' && current?.kind === 'folder' && index === 0 && action !== 'folder_back') {
      throw new Error('First folder button is reserved for Back');
    }
    const mappings = deviceMapping(p, target, pageId);
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= (kind === 'dials' ? mappings.dials : mappings.keys).length
    ) {
      throw new Error('Control index is out of range');
    }
    if (kind === 'dials') {
      if (!['left', 'right', 'press'].includes(slot)) {
        throw new Error('Invalid dial slot');
      }
      mappings.dials[index][slot as 'left' | 'right' | 'press'] = action;
    } else {
      if (slot !== 'action') {
        throw new Error('Invalid key slot');
      }
      mappings.keys[index].action = action;
      mappings.keys[index].label =
        action.startsWith('page:') || action.startsWith('page_global:')
          ? 'Go to ' +
            pageSet(p, target).items.find(
              (page) => page.id === action.slice(action.indexOf(':') + 1),
            )!.name
          : action.startsWith('folder:')
            ? set.items.find((page) => page.id === action.slice(7))!.name
            : await actionLabel(action);
    }
  });
}
