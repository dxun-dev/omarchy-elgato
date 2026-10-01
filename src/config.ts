import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, readFile, writeFile, rename, copyFile, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { StreamDeckControlDefinition } from '@elgato-stream-deck/node';

export interface Key { label: string; action: string; icon?: string; displayText?: string; displayMode?: 'text' | 'icon-text' | 'icon' | 'color' | 'color-text'; color?: number[]; textColor?: number[]; stateAction?: string; stateIcons?: Record<string, string> }
export interface Dial { label: string; left: string; right: string; press: string; color?: number[]; display?: Key }
export interface Light { name: string; host: string; port: number }
export interface LightState extends Light { reachable: boolean; on?: number; brightness?: number; temperature?: number; error?: string }
export interface Profile { name: string; brightness: number; keys: Key[]; classicKeys: Key[]; dials: Dial[]; lights: Light[]; devices?: Record<string, DeviceMapping>; pages?: Record<string, PageSet> }
export const root = fileURLToPath(new URL('../', import.meta.url));
export interface DeviceMapping { keys: Key[]; dials: Dial[] }
export interface Page extends DeviceMapping { id: string; name: string; kind?: 'folder' }
export interface PageSet { active: string; items: Page[]; history?: string[] }
export interface DeckModel { id: string; name: string; models: string[]; controls: StreamDeckControlDefinition[] }
export const deckModels: DeckModel[] = JSON.parse(readFileSync(join(root, 'defaults/models.json'), 'utf8'));
export function modelKind(model: string) { return deckModels.find(d => d.models.includes(model))?.id || null; }
export function legacyMapping(p: Profile, kind: string): DeviceMapping {
  if (kind === 'plus') return { keys: p.keys, dials: p.dials };
  if (kind === 'classic') return { keys: p.classicKeys, dials: [] };
  const model = deckModels.find(m => m.id === kind);
  if (!model) throw new Error('Unsupported device model: ' + kind);
  p.devices ||= {};
  if (!Object.hasOwn(p.devices, kind)) {
    const keys = model.controls.filter(c => c.type === 'button');
    const dials = model.controls.filter(c => c.type === 'encoder');
    p.devices[kind] = {
      keys: keys.map((_, i) => kind === 'pedal' ? { label: 'Unassigned', action: 'none' } : structuredClone(p.keys[i] || { label: 'Unassigned', action: 'none' })),
      dials: dials.map((_, i) => structuredClone(p.dials[i] || { label: 'Unassigned', left: 'none', right: 'none', press: 'none' }))
    };
  }
  return p.devices[kind];
}
export function pageSet(p: Profile, kind: string): PageSet {
  const base = legacyMapping(p, kind);
  p.pages ||= {};
  if (!Object.hasOwn(p.pages, kind)) p.pages[kind] = { active: 'page-1', items: [{ id: 'page-1', name: 'Page 1', ...base }] };
  return p.pages[kind];
}
export function deviceMapping(p: Profile, kind: string, pageId?: string): DeviceMapping {
  const set = p.pages?.[kind];
  if (!set) return legacyMapping(p, kind);
  const id = pageId || set.active;
  if (id === set.items[0]?.id) return legacyMapping(p, kind);
  const page = set.items.find(p => p.id === id);
  if (!page) throw new Error('Unknown page: ' + id);
  return page;
}
export const configDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'omarchy-elgato');
export const profilePath = join(configDir, 'profile.json');
export const stateDir = join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'omarchy-elgato');
export const statusPath = join(stateDir, 'status.json');
export const cacheDir = join(process.env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'omarchy-elgato');
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
export const plainText = (value: string) => value.replaceAll('<', '‹').replaceAll('>', '›');

export async function atomicJSON(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(tmp, path);
}
export function validRGB(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 3 && value.every(v => Number.isInteger(v) && v >= 0 && v <= 255);
}
export function validStateIcons(key: Key) {
  if (key.stateAction !== undefined && (typeof key.stateAction !== 'string' || key.stateAction.length > 200)) return false;
  if (key.stateIcons === undefined) return true;
  return typeof key.stateAction === 'string' && !!key.stateIcons && typeof key.stateIcons === 'object' && !Array.isArray(key.stateIcons) && Object.keys(key.stateIcons).length <= 17 && Object.entries(key.stateIcons).every(([state,icon]) => /^[a-z][a-z0-9_-]{0,31}$/.test(state) && typeof icon === 'string' && icon.length <= 4096 && !icon.includes('\0'));
}
function validateDialDisplay(d: Dial) {
  const k = d.display;
  if (!k) return;
  if (typeof k !== 'object' || !validStateIcons(k) || typeof k.label !== 'string' || typeof k.action !== 'string' || !validStateIcons(k) || (k.displayMode !== undefined && !['text','icon','icon-text','color','color-text'].includes(k.displayMode)) || (k.icon !== undefined && typeof k.icon !== 'string') || (k.displayText !== undefined && (typeof k.displayText !== 'string' || k.displayText.length > 80 || /[\r\n\x00-\x1f]/.test(k.displayText))) || (k.color !== undefined && !validRGB(k.color)) || (k.textColor !== undefined && !validRGB(k.textColor))) throw new Error('Invalid dial display');
}
export function validateProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') throw new Error('Profile must be an object');
  const p = value as Profile;
  if (typeof p.name !== 'string' || !Number.isInteger(p.brightness) || p.brightness < 0 || p.brightness > 100) throw new Error('Invalid profile name or brightness');
  for (const [kind, count] of [['keys', 8], ['classicKeys', 15]] as const) {
    if (!Array.isArray(p[kind]) || p[kind].length !== count) throw new Error(`${kind} must contain ${count} keys`);
    for (const key of p[kind]) {
      if (!validStateIcons(key)) throw new Error('Invalid state icons');
      if (typeof key.label !== 'string' || typeof key.action !== 'string') throw new Error(`Invalid ${kind} mapping`);
      if (key.textColor !== undefined && !validRGB(key.textColor)) throw new Error('Invalid text color');
      if (key.color && (key.color.length !== 3 || key.color.some(v => !Number.isInteger(v) || v < 0 || v > 255))) throw new Error('Invalid RGB color');
    }
  }
  if (!Array.isArray(p.dials) || p.dials.length !== 4 || p.dials.some(d => ['label', 'left', 'press', 'right'].some(k => typeof d[k as keyof Dial] !== 'string'))) throw new Error('Four dial mappings are required');
  if (!Array.isArray(p.lights) || p.lights.some(l => typeof l.host !== 'string' || typeof l.name !== 'string' || !Number.isInteger(l.port) || l.port < 1 || l.port > 65535)) throw new Error('Invalid light configuration');
  if (p.devices !== undefined && (!p.devices || typeof p.devices !== 'object' || Array.isArray(p.devices))) throw new Error('Invalid device mappings');
  for (const model of deckModels) {
    const mapping = legacyMapping(p, model.id);
    const buttons = model.controls.filter(c => c.type === 'button').length;
    const encoders = model.controls.filter(c => c.type === 'encoder').length;
    if (!mapping || !Array.isArray(mapping.keys) || mapping.keys.length !== buttons || !Array.isArray(mapping.dials) || mapping.dials.length !== encoders) throw new Error('Invalid mappings for ' + model.id);
    if (mapping.keys.some(k => !k || typeof k.label !== 'string' || typeof k.action !== 'string' || !validStateIcons(k) || (k.textColor !== undefined && !validRGB(k.textColor)) || (k.displayMode !== undefined && !['text', 'icon-text', 'icon', 'color', 'color-text'].includes(k.displayMode)) || (k.icon !== undefined && typeof k.icon !== 'string') || (k.displayText !== undefined && (typeof k.displayText !== 'string' || k.displayText.length > 80 || /[\r\n\x00-\x1f]/.test(k.displayText))) || (k.color !== undefined && (!Array.isArray(k.color) || k.color.length !== 3 || k.color.some(v => !Number.isInteger(v) || v < 0 || v > 255))))) throw new Error('Invalid key mapping');
    if (mapping.dials.some(d => !d || (d.color !== undefined && !validRGB(d.color)) || ['label', 'left', 'press', 'right'].some(k => typeof d[k as keyof Dial] !== 'string'))) throw new Error('Invalid dial mapping');
    mapping.dials.forEach(validateDialDisplay);
    if (p.pages !== undefined && (!p.pages || typeof p.pages !== 'object' || Array.isArray(p.pages))) throw new Error('Invalid page configuration');
    const set = pageSet(p, model.id);
    if (!set || !Array.isArray(set.items) || !set.items.length || set.items.length > 50 || typeof set.active !== 'string') throw new Error('Invalid pages');
    const ids = new Set<string>();
    for (const page of set.items) {
      if (!page || typeof page.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(page.id) || ids.has(page.id) || typeof page.name !== 'string' || !page.name.trim() || page.name.length > 60 || /[\r\n\x00-\x1f]/.test(page.name)) throw new Error('Invalid page identity');
      ids.add(page.id);
      if (page === set.items[0]) { page.keys = mapping.keys; page.dials = mapping.dials; }
      if (!Array.isArray(page.keys) || page.keys.length !== buttons || !Array.isArray(page.dials) || page.dials.length !== encoders) throw new Error('Invalid page mapping counts');
      const pageMapping = page;
      if (pageMapping.keys.some(k => !k || typeof k.label !== 'string' || typeof k.action !== 'string' || !validStateIcons(k) || (k.textColor !== undefined && !validRGB(k.textColor)) || (k.displayMode !== undefined && !['text', 'icon-text', 'icon', 'color', 'color-text'].includes(k.displayMode)) || (k.icon !== undefined && typeof k.icon !== 'string') || (k.displayText !== undefined && (typeof k.displayText !== 'string' || k.displayText.length > 80 || /[\r\n\x00-\x1f]/.test(k.displayText))) || (k.color !== undefined && (!Array.isArray(k.color) || k.color.length !== 3 || k.color.some(v => !Number.isInteger(v) || v < 0 || v > 255))))) throw new Error('Invalid page key mapping');
      pageMapping.dials.forEach(validateDialDisplay);
      if (pageMapping.dials.some(d => !d || (d.color !== undefined && !validRGB(d.color)) || ['label', 'left', 'press', 'right'].some(k => typeof d[k as keyof Dial] !== 'string'))) throw new Error('Invalid page dial mapping');
    }
    if (set.items[0].kind === 'folder' || !set.items.some(p => !p.kind)) throw new Error('Keep a main page');
    for (const page of set.items) {
      if (page.kind !== undefined && page.kind !== 'folder') throw new Error('Invalid page kind');
      if (page.kind === 'folder' && page.keys[0]?.action !== 'folder_back') throw new Error('Folder first button must be Back');
    }
    if (set.history !== undefined && (!Array.isArray(set.history) || set.history.length > 32 || set.history.some(id => !ids.has(id)))) throw new Error('Invalid folder history');
    if (!ids.has(set.active)) throw new Error('Unknown active page');
  }

  return p;
}
async function ensureProfileUnlocked() {
  await mkdir(configDir, { recursive: true });
  try { await stat(profilePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await atomicJSON(profilePath, JSON.parse(await readFile(join(root, 'defaults/profile.json'), 'utf8')));
  }
}
async function loadProfileUnlocked() {
  await ensureProfileUnlocked();
  const raw = JSON.parse(await readFile(profilePath, 'utf8'));
  const before = JSON.stringify(raw);
  if (raw.pages === undefined) {
    try { await copyFile(profilePath, join(configDir, 'profile.before-pages.json'), 1); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const profile = validateProfile(raw);
  // Persist newly initialized model mappings once so later Plus edits stay independent.
  if (JSON.stringify(profile) !== before) await atomicJSON(profilePath, profile);
  return profile;
}

async function withProfileLock<T>(operation: () => Promise<T>): Promise<T> {
  await mkdir(configDir, { recursive: true });
  const lock = join(configDir, 'profile.lock');
  let acquired = false;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { await mkdir(lock); acquired = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try { if (Date.now() - (await stat(lock)).mtimeMs > 30000) await rm(lock, { recursive: true, force: true }); } catch {}
      await sleep(25);
    }
  }
  if (!acquired) throw new Error('Profile is busy; try again');
  try { return await operation(); }
  finally { await rm(lock, { recursive: true, force: true }); }
}

// Initialization, migrations, and user edits share one cross-process lock.
export async function ensureProfile() { return withProfileLock(ensureProfileUnlocked); }
export async function loadProfile() { return withProfileLock(loadProfileUnlocked); }
export async function updateProfile(edit: (profile: Profile) => Promise<void>) {
  return withProfileLock(async () => {
    const profile = await loadProfileUnlocked();
    await edit(profile);
    validateProfile(profile);
    await atomicJSON(profilePath, profile);
  });
}
