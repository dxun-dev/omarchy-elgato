import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
const dir = await mkdtemp(join(tmpdir(), 'elgato-state-icons-'));
process.env.XDG_CONFIG_HOME = join(dir, 'config');
process.env.XDG_STATE_HOME = join(dir, 'state');
process.env.XDG_CACHE_HOME = join(dir, 'cache');
const { actionStateOptions, readActionState, statefulKey, savedActionStates } =
  await import('../dist/action-state.js');
const { actionsDir, actionPacks, extensionAction, extensionState } =
  await import('../dist/extensions.js');
const { loadProfile, validateProfile, statusPath } = await import('../dist/config.js');
const { setStateIcon, iconSignature } = await import('../dist/icons.js');
const { catalog } = await import('../dist/actions.js');
const { keyPreview } = await import('../dist/artwork.js');
const { Daemon } = await import('../dist/daemon.js');
const { streamDeck } = await import('../dist/library.js');
after(async () => rm(dir, { recursive: true, force: true }));
const packDir = join(actionsDir, 'toggle');
const manifestPath = join(packDir, 'manifest.json');
const stateFile = join(dir, 'state.txt');
const queryLog = join(dir, 'queries.txt');
const icons = {};
async function makePack() {
  await mkdir(packDir, { recursive: true });
  for (const [name, color] of [
    ['on', '#ff0000'],
    ['off', '#00ff00'],
    ['unknown', '#0000ff'],
  ]) {
    icons[name] = join(packDir, name + '.svg');
    await writeFile(
      icons[name],
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="${color}"/></svg>`,
    );
  }
  await writeFile(stateFile, 'on');
  await writeFile(queryLog, '');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      id: 'toggle',
      name: 'Toggle',
      actions: [
        {
          id: 'switch',
          label: 'Switch',
          controls: ['button', 'dialPress'],
          press: [process.execPath, '-e', ''],
          status: {
            command: [
              process.execPath,
              '-e',
              'const fs=require("fs");fs.appendFileSync(process.argv[2],"q");console.log(fs.readFileSync(process.argv[1],"utf8"))',
              stateFile,
              queryLog,
            ],
            states: [
              { value: 'on', label: 'On', icon: 'on.svg' },
              { value: 'off', label: 'Off', icon: 'off.svg' },
            ],
          },
        },
      ],
    }),
  );
  await actionPacks(true);
}
test('launchers have no states; toggle actions expose states and unavailable fallback', async () => {
  assert.deepEqual(await actionStateOptions('terminal'), []);
  assert.deepEqual(await actionStateOptions('app:firefox'), []);
  assert.deepEqual(
    (await actionStateOptions('mic_mute')).map((s) => s.value),
    ['on', 'off', 'unknown'],
  );
  assert.deepEqual(
    (await actionStateOptions('lights_toggle')).map((s) => s.value),
    ['on', 'off', 'mixed', 'unknown'],
  );
});
test('mute state is read from the actual default audio endpoint', async () => {
  const calls = [];
  const muted = async (file, args) => {
    calls.push([file, args]);
    return 'Volume: 0.50 [MUTED]\n';
  };
  assert.equal(await readActionState('mic_mute', [], muted), 'on');
  assert.deepEqual(calls[0], ['wpctl', ['get-volume', '@DEFAULT_AUDIO_SOURCE@']]);
  assert.equal(await readActionState('volume_mute', [], async () => 'Volume: 0.70\n'), 'off');
  await assert.rejects(
    readActionState('mic_mute', [], async () => 'No source'),
    /unavailable/,
  );
});
test('grouped lights distinguish all-on, all-off, mixed and incomplete state', async () => {
  const light = (on) => ({ reachable: true, on });
  assert.equal(await readActionState('lights_toggle', [light(1), light(1)]), 'on');
  assert.equal(await readActionState('lights_toggle', [light(0), light(0)]), 'off');
  assert.equal(await readActionState('lights_toggle', [light(1), light(0)]), 'mixed');
  assert.equal(
    await readActionState('lights_toggle', [light(1), { reachable: false, on: 1 }]),
    'unknown',
  );
  assert.equal(await readActionState('lights_toggle', []), 'unknown');
});
test('packs declare status commands and default icons; malformed output becomes an error', async () => {
  await makePack();
  const action = await extensionAction('ext:toggle/switch');
  assert.equal(await extensionState(action), 'on');
  assert.equal((await catalog()).find((a) => a.value === action.value).states[0].icon, icons.on);
  await writeFile(stateFile, 'off');
  assert.equal(await extensionState(action), 'off');
  await writeFile(stateFile, 'unexpected');
  await assert.rejects(extensionState(action), /undeclared/);
});
test('state overrides are transient, action-specific, and resettable on buttons and dial displays', async () => {
  const key = {
    action: 'mic_mute',
    label: 'Mic',
    icon: icons.unknown,
    stateAction: 'mic_mute',
    stateIcons: { on: icons.on, off: icons.off },
  };
  assert.equal((await statefulKey(key, 'on')).icon, icons.on);
  assert.equal((await statefulKey(key, 'off')).icon, icons.off);
  assert.equal((await statefulKey(key, 'unknown')).icon, icons.unknown);
  assert.equal(key.icon, icons.unknown);
  assert.equal(
    (await statefulKey({ ...key, stateIcons: { on: join(dir, 'missing.svg') } }, 'on')).icon,
    icons.unknown,
  );
  assert.equal((await statefulKey({ ...key, action: 'volume_mute' }, 'on')).icon, icons.unknown);
  const profile = await loadProfile();
  profile.keys[0].action = 'mic_mute';
  profile.dials[0].press = 'mic_mute';
  const { atomicJSON, profilePath } = await import('../dist/config.js');
  await atomicJSON(profilePath, profile);
  await setStateIcon('plus', 0, 'button', 'on', icons.on);
  await setStateIcon('plus', 0, 'dial', 'off', icons.off);
  const saved = await loadProfile();
  assert.equal(saved.keys[0].stateIcons.on, icons.on);
  assert.equal(saved.dials[0].display.stateIcons.off, icons.off);
  await setStateIcon('plus', 0, 'button', 'on', 'automatic');
  assert.equal((await loadProfile()).keys[0].stateIcons.on, undefined);
  await assert.rejects(setStateIcon('plus', 1, 'button', 'on', icons.on), /does not declare/);
  const bad = structuredClone(saved);
  bad.keys[0].stateIcons = [];
  assert.throws(() => validateProfile(bad), /Invalid/);
  const before = await iconSignature([key]);
  await writeFile(
    icons.on,
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#ff0000"/><circle r="1"/></svg>',
  );
  assert.notEqual(await iconSignature([key]), before);
});
test('daemon observes external changes, deduplicates queries, and renders unavailable instead of stale state', async () => {
  await makePack();
  const originalList = streamDeck.listStreamDecks;
  const originalOpen = streamDeck.openStreamDeck;
  const buffers = [];
  const deck = Object.assign(new EventEmitter(), {
    PRODUCT_NAME: 'Mock Plus',
    CONTROLS: [
      { type: 'button', index: 0, feedbackType: 'lcd', pixelSize: { width: 2, height: 2 } },
    ],
    setBrightness: async () => {},
    fillKeyBuffer: async (index, data) => buffers.push(Buffer.from(data)),
    close: async () => {},
  });
  streamDeck.listStreamDecks = async () => [{ model: 'plus', path: 'mock' }];
  streamDeck.openStreamDeck = async () => deck;
  try {
    const daemon = new Daemon();
    daemon.profile = await loadProfile();
    for (const k of daemon.profile.keys) {
      k.action = 'none';
    }
    for (const d of daemon.profile.dials) {
      d.press = 'none';
    }
    for (const i of [0, 1]) {
      daemon.profile.keys[i] = {
        action: 'ext:toggle/switch',
        label: 'Toggle',
        displayMode: 'icon',
        stateAction: 'ext:toggle/switch',
        stateIcons: { on: icons.on, off: icons.off, unknown: icons.unknown },
      };
    }
    await daemon.connect();
    await Promise.all([...daemon.artworkQueues.values()]);
    await daemon.refreshActionStates();
    await Promise.all([...daemon.artworkQueues.values()]);
    assert.equal(daemon.status.actionStates['ext:toggle/switch'], 'on');
    assert.deepEqual([...buffers.at(-1).subarray(0, 3)], [255, 0, 0]);
    assert.equal((await readFile(queryLog, 'utf8')).length, 1, 'one query per distinct action');
    const previewOn = await keyPreview(
      await statefulKey(daemon.profile.keys[0], (await savedActionStates())['ext:toggle/switch']),
    );
    await writeFile(stateFile, 'off');
    await daemon.refreshActionStates();
    await Promise.all([...daemon.artworkQueues.values()]);
    assert.deepEqual([...buffers.at(-1).subarray(0, 3)], [0, 255, 0]);
    const previewOff = await keyPreview(
      await statefulKey(daemon.profile.keys[0], (await savedActionStates())['ext:toggle/switch']),
    );
    assert.notEqual(previewOn, previewOff);
    await writeFile(stateFile, 'invalid');
    await daemon.refreshActionStates();
    await Promise.all([...daemon.artworkQueues.values()]);
    assert.equal(daemon.status.actionStates['ext:toggle/switch'], 'unknown');
    assert.deepEqual([...buffers.at(-1).subarray(0, 3)], [0, 0, 255]);
    assert.ok(daemon.status.actionStateErrors['ext:toggle/switch']);
    await writeFile(
      statusPath,
      JSON.stringify({ running: true, updatedAt: 1, actionStates: { 'ext:toggle/switch': 'on' } }),
    );
    assert.deepEqual(await savedActionStates(), {});
  } finally {
    streamDeck.listStreamDecks = originalList;
    streamDeck.openStreamDeck = originalOpen;
  }
});
