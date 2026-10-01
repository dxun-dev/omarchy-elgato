import { randomUUID } from 'node:crypto';
import { deviceMapping, pageSet, updateProfile, type Profile, type Page } from './config.js';

export const isPageAction = (action: string) => action === 'folder_back' || /^folder:[a-zA-Z0-9_-]+$/.test(action) || /^page_(?:global_)?(?:next|previous|first|last)$/.test(action) || /^page(?:_global)?:[a-zA-Z0-9_-]+$/.test(action);
export async function pageCommand(model: string, command: string, id?: string, name?: string) {
  await updateProfile(async profile => {
    const set = pageSet(profile, model);
    const current = set.items.find(p => p.id === (id || set.active));
    const title = name?.trim();
    if (['add', 'rename', 'duplicate'].includes(command) && (!title || title.length > 60 || /[\r\n\x00-\x1f]/.test(title))) throw new Error('Page name must be 1–60 characters on one line');
    if (command === 'add' || command === 'duplicate') {
      if (set.items.length >= 50) throw new Error('Maximum 50 pages per model');
      if (!current) throw new Error('Unknown page');
      const mapping = deviceMapping(profile, model, current.id);
      const page: Page = { id: randomUUID(), name: title!, keys: command === 'duplicate' ? structuredClone(mapping.keys) : mapping.keys.map(() => ({ label: 'Unassigned', action: 'none' })),
        dials: command === 'duplicate' ? structuredClone(mapping.dials) : mapping.dials.map(() => ({ label: 'Unassigned', left: 'none', right: 'none', press: 'none' })) };
      if (command === 'duplicate' && current.kind === 'folder') page.kind = 'folder';
      set.items.push(page); set.active = page.id; set.history = page.kind === 'folder' ? [...(set.history || []), current.id].slice(-32) : [];
    } else if (command === 'select') {
      if (!current || !id) throw new Error('Unknown page'); if (current.kind === 'folder') { enterFolder(profile, model, current.id); } else { set.active = current.id; set.history = []; }
    } else if (command === 'rename') {
      if (!current) throw new Error('Unknown page'); current.name = title!;
      for (const page of set.items) for (const key of deviceMapping(profile, model, page.id).keys) if (key.action === 'page_global:' + current.id || key.action === 'page:' + current.id || key.action === 'folder:' + current.id) key.label = current.kind === 'folder' ? current.name : 'Go to ' + current.name;
    } else if (command === 'delete') {
      if (!current) throw new Error('Unknown page');
      if (!current.kind && set.items.filter(p => !p.kind).length === 1) throw new Error('Keep at least one page');
      const index = set.items.indexOf(current);
      if (index === 0) {
        // Page 1 owns the legacy mappings: deleting it promotes the next page.
        const replacement = set.items.find(p => p !== current && !p.kind)!;
        set.items.splice(set.items.indexOf(replacement), 1); set.items.splice(1, 0, replacement);
        const base = deviceMapping(profile, model, current.id);
        base.keys.splice(0, base.keys.length, ...structuredClone(replacement.keys));
        base.dials.splice(0, base.dials.length, ...structuredClone(replacement.dials));
      }
      set.items.splice(index, 1);
      if (set.active === current.id || set.history?.includes(current.id)) { set.active = set.items.find(p => !p.kind)!.id; set.history = []; }
      for (const modelSet of Object.values(profile.pages || {})) for (const page of modelSet.items) {
        // Remove dead direct-page links only in the affected model.
        if (modelSet !== set) continue;
        for (const key of deviceMapping(profile, model, page.id).keys) if ((key.action === 'page_global:' + current.id || key.action === 'page:' + current.id || key.action === 'folder:' + current.id)) { key.action = 'none'; key.label = 'Unassigned'; }
        for (const dial of deviceMapping(profile, model, page.id).dials) for (const slot of ['left', 'right', 'press'] as const) if ((dial[slot] === 'page_global:' + current.id || dial[slot] === 'page:' + current.id || dial[slot] === 'folder:' + current.id)) dial[slot] = 'none';
      }
    } else throw new Error('Unknown page command');
  });
}
function enterFolder(profile: Profile, model: string, id: string) {
  const set = pageSet(profile, model);
  if (!set.items.some(p => p.id === id && p.kind === 'folder')) throw new Error('Unknown folder');
  if (set.active === id || set.history?.includes(id)) throw new Error('Folder is already open in this navigation path');
  if ((set.history?.length || 0) >= 32) throw new Error('Maximum folder depth reached');
  set.history = [...(set.history || []), set.active]; set.active = id;
}
export async function createFolder(model: string, parent: string, index: number, name: string) {
  await updateProfile(async profile => {
    const set = pageSet(profile, model), mapping = deviceMapping(profile, model, parent);
    if (!name.trim() || name.length > 60 || /[\r\n\x00-\x1f]/.test(name)) throw new Error('Folder name must be 1–60 characters on one line');
    if (set.items.length >= 50) throw new Error('Maximum 50 pages and folders per model');
    if (!Number.isInteger(index) || !mapping.keys[index] || (set.items.find(p => p.id === parent)?.kind && index === 0)) throw new Error('Choose an assignable button');
    const folder: Page = { id: randomUUID(), name: name.trim(), kind: 'folder', keys: mapping.keys.map(() => ({label:'Unassigned', action:'none'})), dials: mapping.dials.map(() => ({label:'Unassigned', left:'none', right:'none', press:'none'})) };
    folder.keys[0] = {label:'Back', action:'folder_back'};
    set.items.push(folder);
    mapping.keys[index] = {action: 'folder:' + folder.id, label: folder.name};
    set.active = parent; enterFolder(profile, model, folder.id);
  });
}
export async function navigatePage(model: string, action: string, connectedModels: string[] = []) {
  await updateProfile(async profile => {
    const set = pageSet(profile, model), pages = set.items.filter(p => !p.kind);
    const relative = /^page_(global_)?(next|previous|first|last)$/.exec(action);
    if (relative) {
      for (const kind of new Set(relative[1] ? [model, ...connectedModels] : [model])) {
        const other = pageSet(profile, kind), ordered = other.items.filter(p => !p.kind);
        const origin = other.history?.[0] || other.active;
        const index = Math.max(0, ordered.findIndex(p => p.id === origin));
        const target = relative[2] === 'next' ? (index + 1) % ordered.length : relative[2] === 'previous' ? (index + ordered.length - 1) % ordered.length : relative[2] === 'first' ? 0 : ordered.length - 1;
        other.active = ordered[target].id; other.history = [];
      }
      return;
    }
    if (action.startsWith('page_global:')) {
      const target = pages.find(p => p.id === action.slice(12));
      if (!target) throw new Error('Target page no longer exists');
      for (const kind of new Set([model, ...connectedModels])) {
        const other = pageSet(profile, kind);
        const match = kind === model ? target : other.items.find(p => !p.kind && p.name === target.name);
        if (match) { other.active = match.id; other.history = []; }
      }
      return;
    }
    if (action === 'folder_back') {
      set.active = set.history?.pop() || pages[0].id;
    } else if (action.startsWith('folder:')) enterFolder(profile, model, action.slice(7));
    else {
      if (action.startsWith('page:')) {
        const id = action.slice(5);
        if (!pages.some(p => p.id === id)) throw new Error('Target page no longer exists'); set.active = id;
      } else throw new Error('Unknown navigation action');
      set.history = [];
    }
  });
}
export function pageCatalog(profile: Profile, model: string) {
  return pageSet(profile, model).items.map(page => ({ value: (page.kind ? 'folder:' : 'page:') + page.id, label: page.kind ? 'Folder · ' + page.name : 'Page · Go to ' + page.name, icon: '' }));
}
