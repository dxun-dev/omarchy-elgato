import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { statusPath, stateDir } from './paths.js';

// Treat stale daemon state and unfinished runtime setup as offline.
export async function loadStatus() {
  let status: Record<string, unknown>;
  try {
    status = JSON.parse(await readFile(statusPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    status = {
      running: false,
      plus: null,
      classic: null,
      pedal: null,
      wave: null,
      lights: [],
      devices: [],
      profile: 'Omarchy Elgato',
    };
  }
  if (!Number.isFinite(status.updatedAt) || Number(status.updatedAt) < Date.now() / 1000 - 10) {
    status.running = false;
  }
  try {
    status.runtime = JSON.parse(await readFile(join(stateDir, 'runtime-status.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  if (
    ['preparing', 'failed'].includes(
      (status.runtime as { phase?: string } | undefined)?.phase || '',
    )
  ) {
    status.running = false;
  }
  if (!status.running) {
    status.plus = null;
    status.classic = null;
    status.pedal = null;
    status.devices = [];
    status.lights = [];
  }
  return status;
}
