import { readFile } from 'node:fs/promises';

import { actionStateOptions, readActionState, statefulKey } from './action-state.js';
import { performCommand } from './actions/execution.js';
import { keyArtwork, lcdArtwork } from './artwork.js';
import { atomicJSON } from './atomic-json.js';
import { loadProfile } from './profile/store.js';
import { profilePath, statusPath } from './paths.js';
import { clamp } from './utils.js';
import { type Profile, type LightState } from './profile/types.js';
import { modelKind } from './devices/models.js';
import { deviceMapping, pageSet } from './profile/mapping.js';
import {
  actionPacks,
  extensionAction,
  executeExtension,
  type ExtensionAction,
} from './extensions.js';
import { iconSignature } from './icons.js';
import { streamDeck } from './library.js';
import { knownLights, lightRequest, lightStates, steppedLightPayload } from './lights.js';
import { isPageAction, navigatePage } from './pages.js';
import { run } from './process.js';
import type { StreamDeck, StreamDeckDeviceInfo } from '@elgato-stream-deck/node';

export const deviceKind = modelKind;
export interface Connected {
  info: StreamDeckDeviceInfo;
  deck: StreamDeck;
  kind: string;
  generation: number;
  pressed: Map<string, string>;
  extensionHolds: Map<string, Promise<ExtensionAction | undefined>>;
}

export class Daemon {
  devices = new Map<string, Connected>();
  profile!: Profile;
  lights: LightState[] = [];
  status = {
    running: true,
    profile: '',
    brightness: 55,
    plus: null as unknown,
    classic: null as unknown,
    pedal: null as unknown,
    wave: null,
    actionStates: {} as Record<string, string>,
    actionStateErrors: {} as Record<string, string>,
    microphoneMuted: undefined as boolean | undefined,
    lights: [] as LightState[],
    devices: [] as unknown[],
    lastAction: '',
    lastEvent: '',
    error: '',
    updatedAt: 0,
  };
  stopping = false;
  private queue = Promise.resolve();
  private lightQueue = Promise.resolve();
  private extensionQueue = Promise.resolve();
  private extensionsSignature = '';
  private neoClock = '';
  private signature = '';
  private iconsSignature = '';
  private generation = 0;
  private artworkQueues = new Map<string, Promise<void>>();
  constructor(
    private readonly noHardware = false,
    private readonly perform = performCommand,
  ) {}
  report(error: unknown) {
    this.status.error = String(error);
    console.error(error);
  }
  // Serialize actions within their domain; slow Wi-Fi lights do not delay audio or key actions.
  enqueue(
    action: string,
    release = false,
    model?: string,
    snapshot?: Promise<ExtensionAction | undefined>,
  ) {
    if (this.stopping) {
      return;
    }
    const execute = async () => {
      if (action.startsWith('ext:')) {
        const extension = await (snapshot || extensionAction(action));
        if (!extension) {
          throw new Error('Action pack unavailable: ' + action);
        }
        await executeExtension(extension, release);
      } else if (isPageAction(action)) {
        if (!release && model) {
          await navigatePage(
            model,
            action,
            [...this.devices.values()].map((d) => d.kind),
          );
          await this.reload();
          this.updateDevices();
        }
      } else if (action.startsWith('lights_') && !release) {
        await this.actLights(action);
      } else {
        await this.perform(action, release);
      }
      this.status.lastAction = action + (release ? ' release' : '');
      this.status.lastEvent = new Date().toLocaleTimeString();
    };
    if (action.startsWith('ext:')) {
      this.extensionQueue = this.extensionQueue.then(execute).catch((e) => this.report(e));
    } else if (action.startsWith('lights_')) {
      this.lightQueue = this.lightQueue.then(execute).catch((e) => this.report(e));
    } else {
      this.queue = this.queue.then(execute).catch((e) => this.report(e));
    }
  }
  private controlAction(d: Connected, type: 'button' | 'encoder', index: number) {
    return type === 'encoder'
      ? deviceMapping(this.profile, d.kind).dials[index]?.press
      : deviceMapping(this.profile, d.kind).keys[index]?.action;
  }
  async connect() {
    if (this.noHardware) {
      return;
    }
    const found = (await streamDeck.listStreamDecks()).filter((i) => deviceKind(i.model));
    const live = new Set(found.map((i) => i.path));
    for (const [path, d] of this.devices)
      if (!live.has(path)) {
        await this.disconnect(path, d);
      }
    for (const info of found) {
      if (this.devices.has(info.path)) {
        continue;
      }
      try {
        const deck = await streamDeck.openStreamDeck(info.path);
        const kind = deviceKind(info.model)!;
        const d: Connected = {
          info,
          deck,
          kind,
          generation: this.generation,
          pressed: new Map(),
          extensionHolds: new Map(),
        };
        this.devices.set(info.path, d);
        deck.on('error', (error) => {
          this.report(error);
          void this.disconnect(info.path, d).catch((e) => this.report(e));
        });
        deck.on('down', (control) => {
          const action = this.controlAction(d, control.type, control.index);
          const key = `${control.type}:${control.index}`;
          if (action && !d.pressed.has(key)) {
            d.pressed.set(key, action);
            const snapshot = action.startsWith('ext:') ? extensionAction(action) : undefined;
            if (snapshot) {
              d.extensionHolds.set(key, snapshot);
            }
            this.enqueue(action, false, d.kind, snapshot);
          }
        });
        deck.on('up', (control) => {
          const key = `${control.type}:${control.index}`;
          const action = d.pressed.get(key);
          if (action) {
            this.enqueue(action, true, d.kind, d.extensionHolds.get(key));
            d.pressed.delete(key);
            d.extensionHolds.delete(key);
          }
        });
        deck.on('rotate', (control, ticks) => {
          const action = deviceMapping(this.profile, d.kind).dials[control.index]?.[
            ticks > 0 ? 'right' : 'left'
          ];
          if (action) {
            for (let i = 0; i < Math.min(Math.abs(ticks), 5); i++) {
              this.enqueue(action, false, d.kind);
            }
          }
        });
        this.render(d, true);
      } catch (error) {
        this.report(`Could not open ${info.model}: ${error}`);
      }
    }
    this.updateDevices();
  }
  async disconnect(path: string, d: Connected) {
    if (this.devices.get(path) !== d) {
      return;
    }
    this.devices.delete(path);
    for (const [key, action] of d.pressed)
      if (action === 'voxtype_push_to_talk' || action.startsWith('ext:')) {
        this.enqueue(action, true, d.kind, d.extensionHolds.get(key));
      }
    await this.artworkQueues.get(path)?.catch(() => {});
    await d.deck.close().catch(() => {});
    this.updateDevices();
  }
  updateDevices() {
    const records = [...this.devices.values()].map((d) => ({
      product: d.deck.PRODUCT_NAME,
      path: d.info.path,
      serial: d.info.serialNumber || '',
      kind: d.kind,
      page: pageSet(this.profile, d.kind).active,
      pageName: pageSet(this.profile, d.kind).items.find(
        (p) => p.id === pageSet(this.profile, d.kind).active,
      )?.name,
      model: d.info.model,
      connected: true,
      capabilities: [
        'keys',
        'pages',
        ...(d.kind !== 'pedal' ? ['brightness'] : []),
        ...(d.deck.CONTROLS.some((c) => c.type === 'encoder') ? ['dials', 'dialPress'] : []),
        ...(d.deck.CONTROLS.some((c) => c.type === 'lcd-segment') ? ['lcd'] : []),
      ],
    }));
    this.status.plus = records.find((d) => d.kind === 'plus') || null;
    this.status.classic = records.find((d) => d.kind === 'classic') || null;
    this.status.pedal = records.find((d) => d.kind === 'pedal') || null;
    this.status.devices = records;
  }
  render(d: Connected, keys = false) {
    const generation = this.generation;
    const job = (this.artworkQueues.get(d.info.path) || Promise.resolve())
      .then(async () => {
        if (
          this.stopping ||
          this.devices.get(d.info.path) !== d ||
          generation !== this.generation
        ) {
          return;
        }
        if (keys) {
          if (d.kind !== 'pedal') {
            await d.deck.setBrightness(this.profile.brightness);
          }
          for (const control of d.deck.CONTROLS) {
            if (control.type === 'encoder') {
              const c = deviceMapping(this.profile, d.kind).dials[control.index]?.color;
              if (c && control.hasLed) {
                await d.deck.setEncoderColor(control.index, c[0], c[1], c[2]);
              }
              if (c && control.ledRingSteps) {
                await d.deck.setEncoderRingSingleColor(control.index, c[0], c[1], c[2]);
              }
              continue;
            }
            if (control.type !== 'button' || control.feedbackType === 'none') {
              continue;
            }
            const assigned = deviceMapping(this.profile, d.kind).keys[control.index];
            if (!assigned) {
              continue;
            }
            const key = await statefulKey(assigned, this.status.actionStates[assigned.action]);
            if (control.feedbackType === 'rgb') {
              const c = key.color || [40, 90, 130];
              await d.deck.fillKeyColor(control.index, c[0], c[1], c[2]);
              continue;
            }
            try {
              await d.deck.fillKeyBuffer(
                control.index,
                await keyArtwork(key, control.pixelSize.width, control.pixelSize.height),
                { format: 'rgb' },
              );
            } catch (error) {
              this.report(`Artwork: ${error}`);
              const c = key.color || [40, 90, 130];
              await d.deck.fillKeyColor(control.index, c[0], c[1], c[2]);
            }
          }
        }
        const lcd = d.deck.CONTROLS.find((c) => c.type === 'lcd-segment');
        if (lcd?.type === 'lcd-segment') {
          try {
            await d.deck.fillLcd(
              lcd.id,
              await lcdArtwork(
                {
                  ...this.profile,
                  name:
                    pageSet(this.profile, d.kind).items.find(
                      (p) => p.id === pageSet(this.profile, d.kind).active,
                    )?.name || this.profile.name,
                  dials: await Promise.all(
                    deviceMapping(this.profile, d.kind).dials.map(async (dial) =>
                      dial.display
                        ? {
                            ...dial,
                            display: await statefulKey(
                              { ...dial.display, action: dial.press, label: dial.label },
                              this.status.actionStates[dial.press],
                            ),
                          }
                        : dial,
                    ),
                  ),
                },
                this.lights,
                lcd.pixelSize.width,
                lcd.pixelSize.height,
                this.status.microphoneMuted,
              ),
              { format: 'rgb' },
            );
          } catch (error) {
            this.report(`LCD: ${error}`);
          }
        }
      })
      .catch((e) => this.report(e));
    this.artworkQueues.set(d.info.path, job);
  }
  async refreshLights() {
    const next = await lightStates(
      this.profile.lights.length ? this.profile.lights : await knownLights(),
      this.lights,
    );
    const changed = JSON.stringify(next) !== JSON.stringify(this.lights);
    this.lights = next;
    this.status.lights = next;
    if (changed) {
      for (const d of this.devices.values())
        if (d.deck.CONTROLS.some((c) => c.type === 'lcd-segment')) {
          this.render(d);
        }
    }
  }
  async refreshActionStates() {
    const assigned = [
      ...new Set(
        [...this.devices.values()].flatMap((d) => {
          const mapping = deviceMapping(this.profile, d.kind);
          return [...mapping.keys.map((k) => k.action), ...mapping.dials.map((dial) => dial.press)];
        }),
      ),
    ];
    const states: Record<string, string> = {};
    const errors: Record<string, string> = {};
    let next = 0;
    const worker = async () => {
      while (next < assigned.length) {
        const action = assigned[next++];
        if (!(await actionStateOptions(action)).length) {
          continue;
        }
        try {
          states[action] = await readActionState(action, this.lights);
        } catch (error) {
          states[action] = 'unknown';
          errors[action] = String(error).slice(0, 1000);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, assigned.length) }, worker));
    const changed = JSON.stringify(states) !== JSON.stringify(this.status.actionStates);
    this.status.actionStates = states;
    this.status.actionStateErrors = errors;
    if (changed && !this.stopping) {
      for (const device of this.devices.values()) {
        this.render(device, true);
      }
      await this.writeStatus();
    }
  }
  async refreshNeoInfo() {
    const devices = [...this.devices.values()].filter((d) => d.kind === 'neo');
    if (!devices.length) {
      return;
    }
    let muted: boolean | undefined;
    try {
      const volume = await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SOURCE@'], 1000);
      muted = volume.includes('[MUTED]');
    } catch {}
    const clock = new Date().toLocaleDateString() + ':' + Math.floor(Date.now() / 60000);
    if (clock === this.neoClock && muted === this.status.microphoneMuted) {
      return;
    }
    this.neoClock = clock;
    this.status.microphoneMuted = muted;
    for (const device of devices) {
      this.render(device);
    }
    await this.writeStatus();
  }
  async actLights(action: string) {
    const reachable = this.lights.filter((l) => l.reachable);
    if (!reachable.length) {
      throw new Error('No Key Lights are reachable');
    }
    const groupOn = reachable.some((l) => l.on);
    await Promise.all(
      reachable.map((l) => lightRequest(l, steppedLightPayload(action, l, groupOn))),
    );
    await this.refreshLights();
  }
  async reload() {
    const raw = await readFile(profilePath, 'utf8');
    const icons = this.profile
      ? await iconSignature(
          [...this.devices.values()].flatMap((d) => [
            ...deviceMapping(this.profile, d.kind).keys,
            ...deviceMapping(this.profile, d.kind).dials.flatMap((dial) =>
              dial.display ? [dial.display] : [],
            ),
          ]),
        )
      : '';
    const extensions = await actionPacks();
    if (
      raw === this.signature &&
      icons === this.iconsSignature &&
      extensions.signature === this.extensionsSignature
    ) {
      return;
    }
    this.extensionsSignature = extensions.signature;
    this.iconsSignature = icons;
    this.profile = await loadProfile();
    this.signature = raw;
    this.generation++;
    this.updateDevices();
    for (const d of this.devices.values()) {
      this.render(d, true);
    }
  }
  async writeStatus() {
    Object.assign(this.status, {
      running: !this.stopping,
      brightness: this.profile.brightness,
      profile: this.profile.name,
      updatedAt: Math.floor(Date.now() / 1000),
    });
    await atomicJSON(statusPath, this.status);
  }
  async start() {
    this.profile = await loadProfile();
    const jobs: Promise<void>[] = [];
    const timers: NodeJS.Timeout[] = [];
    const recurring = (fn: () => Promise<void>, ms: number) => {
      let busy = false;
      const tick = () => {
        if (busy || this.stopping) {
          return;
        }
        busy = true;
        const job = fn()
          .catch((e) => this.report(e))
          .finally(() => {
            busy = false;
          });
        jobs.push(job);
        void job.finally(() => {
          const i = jobs.indexOf(job);
          if (i >= 0) {
            jobs.splice(i, 1);
          }
        });
      };
      timers.push(setInterval(tick, ms));
      tick();
    };
    recurring(() => this.reload(), 1000);
    recurring(() => this.connect(), 5000);
    recurring(() => this.refreshLights(), 5000);
    recurring(() => this.refreshNeoInfo(), 2000);
    recurring(() => this.refreshActionStates(), 1000);
    recurring(() => this.writeStatus(), 500);
    await new Promise<void>((resolve) => {
      const stop = () => {
        this.stopping = true;
        resolve();
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    timers.forEach(clearInterval);
    await Promise.allSettled(jobs);
    await Promise.allSettled([
      this.queue,
      this.lightQueue,
      this.extensionQueue,
      ...this.artworkQueues.values(),
    ]);
    // Release held push-to-talk actions even if a profile was edited while held.
    for (const d of this.devices.values()) {
      for (const [key, action] of d.pressed) {
        if (action === 'voxtype_push_to_talk') {
          await this.perform(action, true).catch((e) => this.report(e));
        } else if (action.startsWith('ext:')) {
          const extension = await d.extensionHolds.get(key);
          if (extension) {
            await executeExtension(extension, true).catch((e) => this.report(e));
          }
        }
      }
      await d.deck.close().catch((e) => this.report(e));
    }
    this.devices.clear();
    this.updateDevices();
    await this.writeStatus();
  }
}
