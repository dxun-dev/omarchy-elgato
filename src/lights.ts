import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:http';
import { clamp, loadProfile, plainText, atomicJSON, stateDir, type Light, type LightState } from './config.js';
import { run } from './process.js';

const privateRanges = new BlockList();
privateRanges.addSubnet('10.0.0.0', 8); privateRanges.addSubnet('172.16.0.0', 12);
privateRanges.addSubnet('192.168.0.0', 16); privateRanges.addSubnet('169.254.0.0', 16);
privateRanges.addSubnet('fc00::', 7, 'ipv6'); privateRanges.addSubnet('fe80::', 10, 'ipv6');
export function isLocalAddress(value: string) {
  if (value.toLowerCase().startsWith('::ffff:')) value = value.slice(7);
  const family = isIP(value);
  return family !== 0 && privateRanges.check(value, family === 6 ? 'ipv6' : 'ipv4');
}
export function validateHost(value: string) {
  const host = value.trim().replace(/\.$/, '');
  if (isIP(host)) { if (isLocalAddress(host)) return host; throw new Error('Key Light address must be on the local network'); }
  if (/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}\.)+local$/i.test(host)) return host;
  throw new Error('Key Light host must be a private address or .local hostname');
}
export function parseAvahi(text: string): Light[] {
  const found = new Map<string, Light>();
  for (const line of text.split('\n')) {
    const parts = line.split(';');
    if (parts[0] !== '=' || parts[2] !== 'IPv4' || parts.length < 9) continue;
    try {
      const host = validateHost(parts[7]);
      const port = Number(parts[8]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
      found.set(host, { name: plainText(parts[3].replace(/\\(\d{3})/g, (_, n) => String.fromCharCode(Number(n)))), host, port });
    } catch { /* Ignore malformed or unrelated advertisements. */ }
  }
  return [...found.values()].sort((a, b) => a.host.localeCompare(b.host));
}
export async function discoverLights() {
  try { return parseAvahi(await run('avahi-browse', ['-tpr', '_elg._tcp'], 3000)); }
  catch (error) { return parseAvahi(String((error as { stdout?: string }).stdout || '')); }
}
export function mergeLightInventory(previous: Light[], discovered: Light[]): Light[] {
  const found = new Map(previous.map(l => [l.host + ':' + l.port, l]));
  for (const light of discovered) found.set(light.host + ':' + light.port, light);
  return [...found.values()].sort((a,b) => (a.host + ':' + a.port).localeCompare(b.host + ':' + b.port));
}
export async function knownLights() {
  const path = join(stateDir, 'light-inventory.json');
  let lights: Light[] = [], discoveredAt = 0;
  try {
    const inventory = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(inventory.lights) || !Number.isFinite(inventory.discoveredAt)) throw new Error('Invalid light inventory');
    for (const l of inventory.lights) {
      if (!l || typeof l.host !== 'string' || typeof l.name !== 'string' || !Number.isInteger(l.port) || l.port < 1 || l.port > 65535) throw new Error('Invalid light inventory');
      validateHost(l.host);
    }
    lights = inventory.lights; discoveredAt = inventory.discoveredAt;
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Ignoring light inventory:', String(error)); }
  const now = Date.now();
  if (now - discoveredAt >= (lights.length ? 300000 : 60000) || discoveredAt > now) {
    lights = mergeLightInventory(lights, await discoverLights());
    await atomicJSON(path, { discoveredAt: now, lights });
  }
  return lights;
}
export async function availableLights() { const p = await loadProfile(); return p.lights.length ? p.lights : knownLights(); }
export async function lightRequest(light: Light, payload?: Record<string, number>): Promise<{ on: number; brightness: number; temperature: number }> {
  const host = validateHost(light.host);
  if (!Number.isInteger(light.port) || light.port < 1 || light.port > 65535) throw new Error('Invalid Key Light port');
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !isLocalAddress(a.address))) throw new Error('Key Light host resolved outside the local network');
  const body = payload ? JSON.stringify({ numberOfLights: 1, lights: [payload] }) : undefined;
  return new Promise((resolve, reject) => {
    // Connect directly to the checked address; a second DNS lookup cannot change the destination.
    const req = request({ hostname: addresses[0].address, family: addresses[0].family, port: light.port,
      path: '/elgato/lights', method: body ? 'PUT' : 'GET',
      headers: { Host: `${isIP(host) === 6 ? '[' + host + ']' : host}:${light.port}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
    }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Key Light HTTP status ' + response.statusCode)); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 65536) response.destroy(new Error('Key Light response is too large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString()).lights?.[0];
          if (!data || ![data.on, data.brightness, data.temperature].every(Number.isFinite)) throw new Error('Invalid Key Light response');
          resolve({ on: data.on, brightness: data.brightness, temperature: data.temperature });
        } catch (error) { reject(error); }
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Key Light request timed out')), 1200);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end(body);
  });
}
export async function lightStates(lights: Light[], previous: LightState[] = []): Promise<LightState[]> {
  return Promise.all(lights.map(async l => {
    try { return { ...l, name: plainText(l.name), ...await lightRequest(l), reachable: true }; }
    catch (error) { const old = previous.find(p => p.host === l.host && p.port === l.port); return { ...old, ...l, name: plainText(l.name), reachable: false, error: String(error) }; }
  }));
}
export function lightPayload(action: string, current: LightState, value?: number): Record<string, number> {
  switch (action) {
    case 'on': return { on: 1 }; case 'off': return { on: 0 }; case 'toggle': return { on: current.on ? 0 : 1 };
    case 'brightness':
      if (!Number.isFinite(value)) throw new Error('Brightness value is required');
      return { brightness: clamp(Math.round(value!), 1, 100), on: 1 };
    case 'temperature':
      if (!Number.isFinite(value)) throw new Error('Temperature value is required');
      return { temperature: clamp(Math.round(1000000 / clamp(value!, 2900, 7000)), 143, 344), on: 1 };
    default: throw new Error('Unsupported Key Light action');
  }
}
export async function controlLights(target: string, action: string, value?: number) {
  const lights = await availableLights(), states = await lightStates(lights);
  const indexes = target === 'all' ? lights.map((_, i) => i) : [Number(target)];
  if (indexes.some(i => !Number.isInteger(i) || i < 0 || i >= lights.length)) throw new Error('Key Light target is out of range');
  const reachable = indexes.filter(i => states[i].reachable);
  if (!reachable.length) throw new Error('No selected Key Lights are reachable');
  // Toggle a group as one unit, even if the lights initially have mixed states.
  const groupAction = action === 'toggle' && target === 'all' ? (reachable.some(i => states[i].on) ? 'off' : 'on') : action;
  await Promise.all(reachable.map(i => lightRequest(lights[i], lightPayload(groupAction, states[i], value))));
  return lightStates(lights);
}

export function steppedLightPayload(action: string, light: LightState, groupOn = false): Record<string, number> {
  switch (action) {
    case 'lights_toggle': return { on: groupOn ? 0 : 1 };
    case 'lights_brightness_up': case 'lights_brightness_down':
      if (!Number.isFinite(light.brightness)) throw new Error('Light brightness is unavailable');
      return { brightness: clamp(light.brightness! + (action.endsWith('_up') ? 5 : -5), 1, 100), on: 1 };
    case 'lights_warmer': case 'lights_cooler':
      if (!Number.isFinite(light.temperature)) throw new Error('Light temperature is unavailable');
      return { temperature: clamp(light.temperature! + (action === 'lights_warmer' ? 10 : -10), 143, 344), on: 1 };
    default: throw new Error('Unknown light action');
  }
}
