import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
const dir = await mkdtemp(join(tmpdir(), 'elgato-action-packs-'));
process.env.XDG_CONFIG_HOME = join(dir, 'config');
process.env.XDG_STATE_HOME = join(dir, 'state');
process.env.XDG_CACHE_HOME = join(dir, 'cache');
const { actionsDir, actionPacks, extensionAction, executeExtension } = await import('../dist/extensions.js');
const { catalog, validAction, actionLabel, setControl } = await import('../dist/actions.js');
const { loadProfile, profilePath } = await import('../dist/config.js');
const { Daemon } = await import('../dist/daemon.js');
const { streamDeck } = await import('../dist/library.js');
after(async () => { await rm(dir, { recursive: true, force: true }); });
const pack = (id, actions, extra = {}) => ({ schemaVersion: 1, id, name: id, actions, ...extra });
const action = (id = 'run', extra = {}) => ({ id, label: 'Run', controls: ['button', 'dialPress'], press: [process.execPath, '-e', ''], ...extra });
async function save(manifest) {
  await mkdir(join(actionsDir, manifest.id), { recursive: true });
  await writeFile(join(actionsDir, manifest.id, 'manifest.json'), JSON.stringify(manifest));
  return actionPacks(true);
}
async function remove(id) { await rm(join(actionsDir, id), { recursive: true, force: true }); await actionPacks(true); }
const record = join(dir, 'events.jsonl');
const recordCommand = token => [process.execPath, '-e', 'require("fs").appendFileSync(process.argv[1], JSON.stringify([process.argv[2],process.env.ELGATO_EVENT,process.env.ELGATO_ACTION_ID])+"\\n")', record, token];

test('packs register namespaced actions, controls and labels without replacing builtins', async () => {
  await save(pack('example', [action('launch'), action('step', { controls: ['button', 'dialTurn'] })]));
  assert.equal(await validAction('ext:example/launch'), true);
  assert.equal(await validAction('ext:example/missing'), false);
  assert.equal(await actionLabel('ext:example/launch'), 'Run');
  const options = await catalog();
  assert.deepEqual(options.find(a => a.value === 'ext:example/step').controls, ['button', 'dialTurn']);
  assert.ok(options.some(a => a.value === 'terminal'));
  await setControl('keys', 0, 'action', 'ext:example/launch', 'plus');
  await assert.rejects(setControl('dials',0,'left','ext:example/launch','plus'), /does not support/);
  await setControl('dials',0,'press','ext:example/launch','plus');
  await remove('example');
  assert.equal((await loadProfile()).keys[0].action, 'ext:example/launch', 'missing packs do not erase assignments');
});
test('missing dependencies and malformed packs are isolated and diagnosed', async () => {
  await save(pack('good', [action()]));
  await save(pack('missing', [action()], { requires: ['elgato-does-not-exist-28391'] }));
  await save(pack('broken', [action('run', { press: 'echo unsafe' })]));
  await save(pack('held-turn', [action('run', { controls: ['dialTurn'], release: [process.execPath, '-e', ''] })]));
  await save(pack('bad-id', [action(undefined, { id: undefined })]));
  const result = await actionPacks(true);
  assert.ok(result.actions.some(a => a.value === 'ext:good/run'));
  for (const id of ['missing','broken','held-turn','bad-id']) {
    assert.equal(result.packs.find(p => p.id === id).available, false);
    assert.ok(result.packs.find(p => p.id === id).error);
  }
  for (const id of ['good','missing','broken','held-turn','bad-id']) await remove(id);
});
test('relative handlers get literal arguments, cwd and event context', async () => {
  const destination = join(dir, 'literal.txt');
  await mkdir(join(actionsDir, 'literal'), { recursive: true });
  const handler = join(actionsDir, 'literal', 'handler');
  await writeFile(handler, '#!/bin/sh\nprintf "%s" "$1" > "$2"\n'); await chmod(handler, 0o755);
  const literal = '$(touch /tmp/this-must-not-run); `echo nope`';
  await save(pack('literal', [action('run', { press: ['./handler', literal, destination] })]));
  await executeExtension(await extensionAction('ext:literal/run'));
  assert.equal(await readFile(destination, 'utf8'), literal);
  await remove('literal');
});
test('pack icons must stay inside the pack and edits change the registry signature', async () => {
  await mkdir(join(actionsDir, 'icons'), { recursive: true });
  const icon = join(actionsDir, 'icons', 'icon.svg');
  await writeFile(icon, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await save(pack('icons', [action('run', { icon: 'icon.svg' })]));
  const before = (await actionPacks(true)).signature;
  await writeFile(icon, '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  assert.notEqual((await actionPacks(true)).signature, before);
  const outside = join(dir, 'outside.svg'); await writeFile(outside, '<svg/>');
  await symlink(outside, join(actionsDir, 'icons', 'outside.svg'));
  await save(pack('icons', [action('run', { icon: 'outside.svg' })]));
  assert.equal((await actionPacks()).packs.find(p => p.id === 'icons').available, false);
  await remove('icons');
});
test('held actions release the captured handler after manifest edits or removal, including disconnect', async () => {
  await writeFile(record, '');
  await save(pack('held', [action('run', { press: recordCommand('press'), release: recordCommand('old-release') })]));
  const originalList = streamDeck.listStreamDecks, originalOpen = streamDeck.openStreamDeck;
  const deck = Object.assign(new EventEmitter(), { PRODUCT_NAME: 'Plus', CONTROLS: [], close: async () => {} });
  streamDeck.listStreamDecks = async () => [{ model: 'plus', path: 'mock' }];
  streamDeck.openStreamDeck = async () => deck;
  try {
    const daemon = new Daemon(); daemon.profile = await loadProfile(); daemon.render = () => {};
    daemon.profile.keys[0].action = 'ext:held/run';
    await daemon.connect();
    deck.emit('down', { type: 'button', index: 0 });
    deck.emit('down', { type: 'button', index: 0 }); // Duplicate down is suppressed.
    await daemon.extensionQueue;
    await save(pack('held', [action('run', { press: recordCommand('new-press'), release: recordCommand('new-release') })]));
    daemon.profile.keys[0].action = 'terminal';
    deck.emit('up', { type: 'button', index: 0 }); await daemon.extensionQueue;
    daemon.profile.keys[0].action = 'ext:held/run';
    deck.emit('down', { type: 'button', index: 0 }); await daemon.extensionQueue;
    await remove('held');
    streamDeck.listStreamDecks = async () => []; await daemon.connect(); await daemon.extensionQueue;
    const events = (await readFile(record, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.deepEqual(events.map(e => e.slice(0,2)), [['press','press'],['old-release','release'],['new-press','press'],['new-release','release']]);
    assert.ok(events.every(e => e[2] === 'ext:held/run'));
    assert.equal(daemon.status.error, '');
  } finally { streamDeck.listStreamDecks = originalList; streamDeck.openStreamDeck = originalOpen; }
});
test('nonzero exits and timed-out handlers are reported', async () => {
  await save(pack('fail', [action('exit', { press: [process.execPath, '-e', 'process.exit(7)'] }), action('timeout', { timeoutMs: 100, press: [process.execPath, '-e', 'setTimeout(()=>{},10000)'] })]));
  await assert.rejects(executeExtension(await extensionAction('ext:fail/exit')), /ext:fail\/exit/);
  await assert.rejects(executeExtension(await extensionAction('ext:fail/timeout')), /ext:fail\/timeout/);
  await remove('fail');
});
