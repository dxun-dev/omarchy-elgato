import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { configDir } from './paths.js';

const exec = promisify(execFile);
export const actionsDir = join(configDir, 'actions');
const identifier = /^[a-z][a-z0-9_.-]{0,63}$/;
const controlTypes = ['button', 'dialPress', 'dialTurn'];
export interface ExtensionAction {
  value: string;
  label: string;
  pack: string;
  controls: string[];
  icon: string;
  press: string[];
  release?: string[];
  directory: string;
  timeoutMs: number;
  status?: {
    command: string[];
    timeoutMs: number;
    states: { value: string; label: string; icon?: string }[];
  };
}
export interface ActionPacks {
  actions: ExtensionAction[];
  packs: { id: string; name: string; available: boolean; error?: string }[];
  signature: string;
}
let cached: ActionPacks | undefined;
let scannedAt = 0;

function text(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    !/[\x00-\x1f]/.test(value)
  );
}

function command(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 64 &&
    value.every((v) => typeof v === 'string' && v.length <= 4096 && !v.includes('\0')) &&
    value[0].length > 0
  );
}

async function executable(file: string, directory: string) {
  const candidates = file.startsWith('./')
    ? [resolve(directory, file)]
    : isAbsolute(file)
      ? [file]
      : file.includes('/')
        ? []
        : (process.env.PATH || '')
            .split(delimiter)
            .filter(Boolean)
            .map((p) => resolve(p, file));
  for (const path of candidates) {
    try {
      await access(path, constants.X_OK);
      if ((await stat(path)).isFile()) {
        return path;
      }
    } catch {}
  }
  throw new Error('Missing executable: ' + file);
}

export async function actionPacks(force = false): Promise<ActionPacks> {
  if (!force && cached && Date.now() - scannedAt < 1000) {
    return cached;
  }
  await mkdir(actionsDir, { recursive: true });
  const actions: ExtensionAction[] = [];
  const packs: ActionPacks['packs'] = [];
  const stamps: unknown[] = [];
  for (const entry of (await readdir(actionsDir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory() || !identifier.test(entry.name)) {
      continue;
    }
    const directory = join(actionsDir, entry.name);
    let name = entry.name;
    try {
      const path = join(directory, 'manifest.json');
      if ((await stat(path)).size > 65536) {
        throw new Error('Manifest exceeds 64 KB');
      }
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      if (
        manifest.schemaVersion !== 1 ||
        manifest.id !== entry.name ||
        !text(manifest.name) ||
        !Array.isArray(manifest.actions) ||
        !manifest.actions.length ||
        manifest.actions.length > 100
      ) {
        throw new Error('Invalid action pack manifest');
      }
      name = manifest.name;
      const requirements = manifest.requires || [];
      if (!Array.isArray(requirements) || requirements.length > 32 || !requirements.every(text)) {
        throw new Error('Invalid dependencies');
      }
      const found: ExtensionAction[] = [];
      const ids = new Set<string>();
      async function packIcon(value: unknown) {
        if (!text(value) || isAbsolute(value)) {
          throw new Error('Icon must be a path inside the pack');
        }
        const icon = await realpath(resolve(directory, value));
        const local = relative(await realpath(directory), icon);
        const info = await stat(icon);
        if (
          local.startsWith('..') ||
          isAbsolute(local) ||
          !info.isFile() ||
          info.size > 20 * 1024 * 1024 ||
          !/\.(png|jpe?g|webp|svg)$/i.test(icon)
        ) {
          throw new Error('Invalid pack icon');
        }
        stamps.push([icon, info.mtimeMs, info.size]);
        return icon;
      }
      for (const action of manifest.actions) {
        if (
          !action ||
          typeof action.id !== 'string' ||
          !identifier.test(action.id) ||
          ids.has(action.id) ||
          !text(action.label) ||
          !Array.isArray(action.controls) ||
          !action.controls.length ||
          !action.controls.every((c: string) => controlTypes.includes(c)) ||
          !command(action.press) ||
          (action.release !== undefined && !command(action.release))
        ) {
          throw new Error('Invalid action definition');
        }
        if (action.release && action.controls.includes('dialTurn')) {
          throw new Error('Held actions cannot be assigned to dial turns');
        }
        ids.add(action.id);
        const timeoutMs = action.timeoutMs ?? 3000;
        if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10000) {
          throw new Error('Timeout must be 100–10000 ms');
        }
        const icon = action.icon === undefined ? '' : await packIcon(action.icon);
        let status: ExtensionAction['status'];
        if (action.status !== undefined) {
          const spec = action.status;
          const stateIds = new Set<string>();
          if (
            !spec ||
            !command(spec.command) ||
            !Array.isArray(spec.states) ||
            !spec.states.length ||
            spec.states.length > 16
          ) {
            throw new Error('Invalid action status');
          }
          const statusTimeout = spec.timeoutMs ?? 1000;
          if (!Number.isInteger(statusTimeout) || statusTimeout < 100 || statusTimeout > 3000) {
            throw new Error('Status timeout must be 100–3000 ms');
          }
          const states = [];
          for (const state of spec.states) {
            if (
              !state ||
              typeof state.value !== 'string' ||
              !/^[a-z][a-z0-9_-]{0,31}$/.test(state.value) ||
              state.value === 'unknown' ||
              stateIds.has(state.value) ||
              !text(state.label)
            ) {
              throw new Error('Invalid action state');
            }
            stateIds.add(state.value);
            states.push({
              value: state.value,
              label: state.label,
              icon: state.icon === undefined ? undefined : await packIcon(state.icon),
            });
          }
          status = { command: [...spec.command], states, timeoutMs: statusTimeout };
        }
        found.push({
          value: `ext:${manifest.id}/${action.id}`,
          label: action.label,
          pack: name,
          controls: [...new Set<string>(action.controls)],
          icon,
          press: [...action.press],
          release: action.release ? [...action.release] : undefined,
          directory,
          timeoutMs,
          status,
        });
      }
      // Validate the complete pack before making any of its actions available.
      for (const file of requirements) {
        await executable(file, directory);
      }
      for (const action of found) {
        action.press[0] = await executable(action.press[0], directory);
        if (action.release) {
          action.release[0] = await executable(action.release[0], directory);
        }
        if (action.status) {
          action.status.command[0] = await executable(action.status.command[0], directory);
        }
      }
      actions.push(...found);
      packs.push({ id: entry.name, name, available: true });
    } catch (error) {
      packs.push({ id: entry.name, name, available: false, error: (error as Error).message });
    }
  }
  cached = {
    actions,
    packs,
    signature: createHash('sha256')
      .update(JSON.stringify([actions, packs, stamps]))
      .digest('hex'),
  };
  scannedAt = Date.now();
  return cached;
}

export async function extensionAction(value: string) {
  return (await actionPacks()).actions.find((a) => a.value === value);
}

export async function extensionState(action: ExtensionAction) {
  if (!action.status) {
    return 'unknown';
  }
  const args = action.status.command;
  const { stdout } = await exec(args[0], args.slice(1), {
    cwd: action.directory,
    timeout: action.status.timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: 4096,
    env: { ...process.env, ELGATO_ACTION_ID: action.value, ELGATO_EVENT: 'status' },
  });
  const value = stdout.trim();
  if (!action.status.states.some((s) => s.value === value)) {
    throw new Error('Status command returned an undeclared state');
  }
  return value;
}

export async function executeExtension(action: ExtensionAction, release = false) {
  const args = release ? action.release : action.press;
  if (!args) {
    return;
  }
  try {
    let cwd = action.directory;
    // An already-held action can still release an external command after its
    // pack directory has been removed. Removed bundled executables report an error.
    if (release) {
      try {
        await access(cwd);
      } catch {
        cwd = actionsDir;
      }
    }
    await exec(args[0], args.slice(1), {
      cwd,
      timeout: action.timeoutMs,
      killSignal: 'SIGKILL',
      maxBuffer: 65536,
      env: {
        ...process.env,
        ELGATO_ACTION_ID: action.value,
        ELGATO_EVENT: release ? 'release' : 'press',
      },
    });
  } catch (error) {
    throw new Error(`${action.value}: ${(error as Error).message.slice(0, 1000)}`);
  }
}
