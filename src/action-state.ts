import { readFile } from 'node:fs/promises';

import { statusPath } from './paths.js';
import { type Key, type LightState } from './profile/types.js';
import { extensionAction, extensionState } from './extensions.js';
import { iconPath } from './icons.js';
import { run } from './process.js';

export interface ActionStateOption {
  value: string;
  label: string;
  icon?: string;
}
export const builtinStates: Record<string, ActionStateOption[]> = {
  volume_mute: [
    { value: 'on', label: 'Muted' },
    { value: 'off', label: 'Unmuted' },
  ],
  mic_mute: [
    { value: 'on', label: 'Muted' },
    { value: 'off', label: 'Unmuted' },
  ],
  lights_toggle: [
    { value: 'on', label: 'All on' },
    { value: 'off', label: 'All off' },
    { value: 'mixed', label: 'Mixed' },
  ],
};

export async function actionStateOptions(action: string): Promise<ActionStateOption[]> {
  const states =
    builtinStates[action] ||
    (action.startsWith('ext:') ? (await extensionAction(action))?.status?.states : undefined);
  return states ? [...states, { value: 'unknown', label: 'Unavailable' }] : [];
}

export async function readActionState(action: string, lights: LightState[], command = run) {
  if (action === 'volume_mute' || action === 'mic_mute') {
    const output = await command(
      'wpctl',
      ['get-volume', action === 'mic_mute' ? '@DEFAULT_AUDIO_SOURCE@' : '@DEFAULT_AUDIO_SINK@'],
      1000,
    );
    if (!/^Volume:\s*[\d.]+(?:\s+\[MUTED\])?\s*$/.test(output.trim())) {
      throw new Error('Audio state is unavailable');
    }
    return output.includes('[MUTED]') ? 'on' : 'off';
  }
  if (action === 'lights_toggle') {
    if (!lights.length || lights.some((l) => !l.reachable || (l.on !== 0 && l.on !== 1))) {
      return 'unknown';
    }
    return lights.every((l) => l.on === 1)
      ? 'on'
      : lights.every((l) => l.on === 0)
        ? 'off'
        : 'mixed';
  }
  const extension = action.startsWith('ext:') ? await extensionAction(action) : undefined;
  return extension?.status ? extensionState(extension) : 'unknown';
}
// Apply state artwork transiently; the profile always retains the normal icon.

export async function statefulKey(key: Key, state = 'unknown'): Promise<Key> {
  const options = await actionStateOptions(key.action);
  if (!options.length) {
    return key;
  }
  const option =
    options.find((s) => s.value === state) || options.find((s) => s.value === 'unknown');
  const value = option?.value || 'unknown';
  const icon =
    (key.stateAction === key.action ? key.stateIcons?.[value] : undefined) || option?.icon;
  if (icon) {
    try {
      await iconPath(icon);
      return { ...key, icon };
    } catch {}
  }
  return key;
}

export async function savedActionStates(): Promise<Record<string, string>> {
  try {
    const status = JSON.parse(await readFile(statusPath, 'utf8'));
    if (
      !status.running ||
      !Number.isFinite(status.updatedAt) ||
      Date.now() / 1000 - status.updatedAt > 10 ||
      !status.actionStates ||
      typeof status.actionStates !== 'object' ||
      Array.isArray(status.actionStates)
    ) {
      return {};
    }
    return status.actionStates;
  } catch {
    return {};
  }
}
