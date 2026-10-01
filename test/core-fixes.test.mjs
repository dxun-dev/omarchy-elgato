import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = await mkdtemp(join(tmpdir(), 'elgato-core-fixes-'));
process.env.XDG_CONFIG_HOME = join(dir, 'config');
process.env.XDG_STATE_HOME = join(dir, 'state');
process.env.XDG_CACHE_HOME = join(dir, 'cache');
const { mergeLightInventory, steppedLightPayload, lightStates, knownLights } = await import('../dist/lights.js');
const { lcdSVG, neoInfoSVG, lcdArtwork } = await import('../dist/artwork.js');
const { stateDir } = await import('../dist/config.js');
after(async () => rm(dir, { recursive: true, force: true }));
test('discovery keeps temporarily absent lights and updates existing names', () => {
  const a = { host: '192.168.1.2', port: 9123, name: 'A' }, b = { host: '192.168.1.3', port: 9123, name: 'B' };
  assert.deepEqual(mergeLightInventory([a,b],[{...a,name:'Renamed'}]),[{...a,name:'Renamed'},b]);
  assert.deepEqual(mergeLightInventory([a,b],[]),[a,b]);
});
test('group adjustments use each light level and refuse unknown levels', () => {
  const a = { brightness: 25, temperature: 150 }, b = { brightness: 95, temperature: 340 };
  assert.equal(steppedLightPayload('lights_brightness_up',a).brightness,30);
  assert.equal(steppedLightPayload('lights_brightness_up',b).brightness,100);
  assert.equal(steppedLightPayload('lights_cooler',a).temperature,143);
  assert.equal(steppedLightPayload('lights_warmer',b).temperature,344);
  assert.deepEqual(steppedLightPayload('lights_toggle',a,true),{on:0});
  assert.throws(() => steppedLightPayload('lights_brightness_up',{}));
});
test('unreachable lights retain the last readings without claiming they are reachable', async () => {
  const light = { host: '8.8.8.8', port: 9123, name: 'Offline' };
  const [state] = await lightStates([light],[{...light,reachable:true,on:1,brightness:55,temperature:200}]);
  assert.equal(state.reachable,false); assert.equal(state.brightness,55); assert.equal(state.on,1); assert.ok(state.error);
});
test('known light inventory survives daemon restarts and does not rediscover on every request', async () => {
  await mkdir(stateDir,{recursive:true});
  const light = {host:'192.168.1.8',port:9123,name:'Saved'};
  await writeFile(join(stateDir,'light-inventory.json'),JSON.stringify({discoveredAt:Date.now(),lights:[light]}));
  assert.deepEqual(await knownLights(),[light]);
  assert.deepEqual(await knownLights(),[light]);
});
test('long LCD labels are clipped to their cell; Neo info includes escaped page and status', async () => {
  const profile = {name:'Page <one>',dials:[{label:'A very long dial label that must not overflow',left:'none',right:'none',press:'none'}]};
  const svg = lcdSVG(profile,[]); assert.ok(svg.includes('clip-path="url(#dial-label-0)"')); assert.ok(svg.includes('…'));
  const info = neoInfoSVG({...profile,dials:[]},[{reachable:true,on:1}],new Date('2026-10-01T12:30:00'),true);
  assert.ok(info.includes('Page &lt;one&gt;')); assert.ok(info.includes('Mic muted · Lights 1'));
  assert.equal((await lcdArtwork({...profile,dials:[]},[],248,58,true)).length,248*58*3);
});
