import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventEmitter } from 'node:events';
import { validateHost, isLocalAddress, parseAvahi, lightPayload } from '../dist/lights.js';
import { validateProfile, deckModels, deviceMapping } from '../dist/config.js';
import { commandFor, validAction, actionControls } from '../dist/actions.js';
import { deviceKind, Daemon } from '../dist/daemon.js';
import { streamDeck } from '../dist/library.js';
import { lcdSVG, keyArtwork, lcdArtwork } from '../dist/artwork.js';

const defaults = JSON.parse(await readFile(new URL('../defaults/profile.json', import.meta.url)));
test('dial turns offer repeatable adjustments while presses retain launch and toggle actions', () => {
  for (const action of [
    'none',
    'volume_up',
    'volume_down',
    'mic_up',
    'lights_warmer',
    'workspace_next',
    'page_previous',
    'key_left',
  ]) {
    assert.ok(actionControls(action).includes('dialTurn'), action);
    assert.ok(actionControls(action).includes('button'), action);
  }
  for (const action of [
    'app:firefox',
    'terminal',
    'browser',
    'volume_mute',
    'media_play_pause',
    'screenshot',
    'voxtype_push_to_talk',
    'folder:media',
    'page:work',
    'key_enter',
  ]) {
    assert.ok(!actionControls(action).includes('dialTurn'), action);
    assert.ok(actionControls(action).includes('dialPress'), action);
    assert.ok(actionControls(action).includes('button'), action);
  }
});
test('private light hosts and IPv6 are accepted; public, loopback and URL injection are rejected', () => {
  for (const h of [
    '192.168.1.5',
    '10.1.0.1',
    '172.16.1.2',
    '169.254.1.1',
    'fd12::1',
    'fe80::1',
    'elgato-key-light.local',
  ]) {
    assert.equal(validateHost(h), h);
  }
  for (const h of [
    '127.0.0.1',
    '::1',
    '8.8.8.8',
    '0.0.0.0',
    'localhost',
    'https://key.local',
    'key.local/path',
    'key.local@evil.com',
  ]) {
    assert.throws(() => validateHost(h));
  }
  assert.equal(isLocalAddress('::ffff:192.168.1.5'), true);
  assert.equal(isLocalAddress('172.32.1.1'), false);
});
test('Avahi discovery deduplicates and ignores malformed records', () => {
  const lines =
    '=;eth0;IPv4;Left\\032Light;_elg._tcp;local;host.local;elgato-left.local;9123\n=;eth0;IPv4;Left\\032Light;_elg._tcp;local;host.local;elgato-left.local;9123\n=;eth0;IPv4;Bad;_elg._tcp;local;host.local;bad.local;999999';
  assert.deepEqual(parseAvahi(lines), [
    { name: 'Left Light', host: 'elgato-left.local', port: 9123 },
  ]);
});
test('light payloads clamp brightness and convert Kelvin; missing values fail', () => {
  assert.deepEqual(lightPayload('brightness', {}, 500), { brightness: 100, on: 1 });
  assert.deepEqual(lightPayload('temperature', {}, 7000), { temperature: 143, on: 1 });
  assert.deepEqual(lightPayload('temperature', {}, 2900), { temperature: 344, on: 1 });
  assert.deepEqual(lightPayload('toggle', { on: 1 }), { on: 0 });
  assert.throws(() => lightPayload('brightness', {}));
  assert.throws(() => lightPayload('shell', {}));
});
test('Classic and Plus have separate valid profiles, malformed profiles fail', () => {
  assert.equal(validateProfile(defaults).classicKeys.length, 15);
  for (const patch of [
    { brightness: -1 },
    { keys: [] },
    { classicKeys: [] },
    { dials: [] },
    { lights: [{ host: 'x', name: 'x', port: 0 }] },
  ]) {
    assert.throws(() => validateProfile({ ...defaults, ...patch }));
  }
});
test('action commands use argument arrays, unknown and malicious actions fail', async () => {
  assert.deepEqual(commandFor('key_enter'), ['wtype', '-k', 'Return']);
  assert.equal(commandFor('app:../../evil'), null);
  assert.equal(await validAction('$(touch /tmp/elgato-test)'), false);
  assert.equal(commandFor('unknown'), null);
});
test('Classic generations and Plus are selected; unsupported models ignored', () => {
  for (const model of ['original', 'originalv2', 'original-mk2']) {
    assert.equal(deviceKind(model), 'classic');
  }
  assert.equal(deviceKind('plus'), 'plus');
  assert.equal(deviceKind('xl'), 'xl');
  assert.equal(deviceKind('network-dock'), null);
  assert.equal(deviceKind('galleon-k100'), null);
});
test('LCD labels escape markup', () => {
  const p = structuredClone(defaults);
  p.dials[0].label = '<tag>&';
  assert.ok(lcdSVG(p, []).includes('&lt;tag&gt;&amp;'));
});
test('artwork renders at Classic and Plus dimensions without sending USB reports', async () => {
  for (const size of [72, 120]) {
    assert.equal((await keyArtwork(defaults.keys[0], size, size)).length, size * size * 3);
  }
  assert.equal((await lcdArtwork(defaults, [], 800, 100)).length, 800 * 100 * 3);
});
test('device events route Classic/Plus keys and dials; release keeps original held action', async () => {
  const originalList = streamDeck.listStreamDecks;
  const originalOpen = streamDeck.openStreamDeck;
  const plus = Object.assign(new EventEmitter(), {
    PRODUCT_NAME: 'Plus',
    CONTROLS: [],
    close: async () => {},
  });
  const classic = Object.assign(new EventEmitter(), {
    PRODUCT_NAME: 'Classic',
    CONTROLS: [],
    close: async () => {},
  });
  streamDeck.listStreamDecks = async () => [
    { model: 'plus', path: 'plus' },
    { model: 'original', path: 'classic' },
  ];
  streamDeck.openStreamDeck = async (path) => (path === 'plus' ? plus : classic);
  const actions = [];
  try {
    const d = new Daemon(false, async (action, release) => {
      actions.push([action, release]);
    });
    d.profile = structuredClone(defaults);
    d.render = () => {};
    d.profile.keys[0].action = 'voxtype_push_to_talk';
    d.profile.classicKeys[14].action = 'lock';
    await d.connect();
    plus.emit('down', { type: 'button', index: 0 });
    d.profile.keys[0].action = 'terminal';
    plus.emit('up', { type: 'button', index: 0 });
    classic.emit('down', { type: 'button', index: 14 });
    plus.emit('rotate', { type: 'encoder', index: 0 }, -2);
    await sleep(0);
    assert.deepEqual(actions, [
      ['voxtype_push_to_talk', false],
      ['voxtype_push_to_talk', true],
      ['lock', false],
      ['volume_down', false],
      ['volume_down', false],
    ]);
    assert.equal(d.status.devices.length, 2);
    streamDeck.listStreamDecks = async () => [];
    await d.connect();
    assert.equal(d.devices.size, 0);
    assert.equal(d.status.classic, null);
  } finally {
    streamDeck.listStreamDecks = originalList;
    streamDeck.openStreamDeck = originalOpen;
  }
});
test('CLI isolates profile edits, rejects bad mapping, and daemon shuts down cleanly', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-test-'));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(tmp, 'config'),
    XDG_STATE_HOME: join(tmp, 'state'),
    XDG_CACHE_HOME: join(tmp, 'cache'),
    PATH: '',
  };
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const command = (...args) =>
    execFileSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
  try {
    command('init');
    command('set-classic-key', '15', 'key_enter');
    command('set-key', '1', 'key_tab');
    command('set-device-key', 'neo', '10', 'key_escape');
    command('set-device-dial', 'plus-xl', '6', 'press', 'lock');
    assert.throws(() => command('set-device-key', 'neo', '11', 'lock'));
    assert.throws(() => command('set-device-key', 'unknown', '1', 'lock'));
    const profile = JSON.parse(command('profile'));
    assert.equal(profile.devices.neo.keys[9].action, 'key_escape');
    assert.equal(profile.devices['plus-xl'].dials[5].press, 'lock');
    assert.equal(profile.classicKeys[14].action, 'key_enter');
    assert.equal(profile.keys[0].action, 'key_tab');
    assert.throws(() => command('set-classic-key', '16', 'lock'));
    assert.throws(() => command('set-dial', '1', 'bad', 'lock'));
    const daemon = spawn(process.execPath, [cli, 'daemon', '--no-hardware'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    daemon.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const exited = new Promise((resolve) => daemon.once('exit', (code) => resolve(code)));
    try {
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try {
          ready = JSON.parse(await readFile(join(tmp, 'state/omarchy-elgato/status.json'))).running;
        } catch {}
        if (ready) {
          break;
        }
        await sleep(50);
      }
      assert.ok(ready, stderr);
      daemon.kill('SIGTERM');
      assert.equal(await exited, 0, stderr);
      const status = JSON.parse(command('status', '--json'));
      assert.equal(status.running, false);
      assert.equal(status.plus, null);
      await writeFile(
        join(tmp, 'state/omarchy-elgato/status.json'),
        JSON.stringify({
          running: true,
          updatedAt: 1,
          classic: { connected: true },
          lights: [{ reachable: true }],
        }),
      );
      const stale = JSON.parse(command('status', '--json'));
      assert.equal(stale.running, false);
      assert.equal(stale.classic, null);
      assert.deepEqual(stale.lights, []);
    } finally {
      if (daemon.exitCode === null) {
        daemon.kill('SIGKILL');
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('model layouts match installed library factories without physical USB devices', async () => {
  const { DEVICE_MODELS } = await import('@elgato-stream-deck/core');
  for (const model of deckModels) {
    for (const id of model.models) {
      const spec = DEVICE_MODELS.find((m) => m.id === id);
      assert.ok(spec, id);
      const hid = Object.assign(new EventEmitter(), {
        getDeviceInfo: async () => ({ vendorId: spec.vendorId, productId: spec.productIds[0] }),
        getFeatureReport: async () => new Uint8Array(64),
        sendFeatureReport: async () => {},
        sendReports: async () => {},
        close: async () => {},
      });
      const deck = await spec.factory(hid, { encodeJPEG: async () => new Uint8Array() });
      const layout = (controls) =>
        controls.map((c) => ({
          type: c.type,
          index: c.index,
          row: c.row,
          column: c.column,
          feedbackType: c.feedbackType,
          pixelSize: c.pixelSize,
        }));
      assert.deepEqual(layout(deck.CONTROLS), layout(model.controls), id);
      await deck.close();
    }
  }
});
test('all model keys, encoder turns and presses route independent mappings; Pedal is action-only', async () => {
  const originalList = streamDeck.listStreamDecks;
  const originalOpen = streamDeck.openStreamDeck;
  const ledWrites = [];
  const mocks = new Map(
    deckModels.map((m) => [
      m.id,
      Object.assign(new EventEmitter(), {
        PRODUCT_NAME: m.name,
        CONTROLS: m.controls,
        close: async () => {},
        setBrightness: async () => {
          assert.notEqual(m.id, 'pedal');
        },
        fillKeyBuffer: async (index, buffer) => {
          const c = m.controls.find((c) => c.type === 'button' && c.index === index);
          assert.equal(c.feedbackType, 'lcd');
          assert.equal(buffer.length, c.pixelSize.width * c.pixelSize.height * 3);
        },
        fillKeyColor: async (index) => {
          assert.equal(
            m.controls.find((c) => c.type === 'button' && c.index === index).feedbackType,
            'rgb',
          );
        },
        setEncoderColor: async (index, ...color) => {
          assert.ok(m.controls.find((c) => c.type === 'encoder' && c.index === index).hasLed);
          ledWrites.push([m.id, index, 'center', color]);
        },
        setEncoderRingSingleColor: async (index, ...color) => {
          assert.ok(m.controls.find((c) => c.type === 'encoder' && c.index === index).ledRingSteps);
          ledWrites.push([m.id, index, 'ring', color]);
        },
        fillLcd: async (id, buffer) => {
          const c = m.controls.find((c) => c.type === 'lcd-segment' && c.id === id);
          assert.equal(buffer.length, c.pixelSize.width * c.pixelSize.height * 3);
        },
      }),
    ]),
  );
  streamDeck.listStreamDecks = async () =>
    deckModels.map((m) => ({ model: m.models[0], path: m.id }));
  streamDeck.openStreamDeck = async (path) => mocks.get(path);
  const actions = [];
  try {
    const daemon = new Daemon(false, async (action, release) => actions.push([action, release]));
    daemon.profile = validateProfile(structuredClone(defaults));
    const expected = [];
    for (const m of deckModels) {
      const mapping = deviceMapping(daemon.profile, m.id);
      if (m.id === 'pedal') {
        assert.ok(mapping.keys.every((k) => k.action === 'none'));
      }
      mapping.keys.at(-1).action = 'key_enter';
      for (const c of m.controls)
        if (c.type === 'encoder' && (c.hasLed || c.ledRingSteps)) {
          mapping.dials[c.index].color = [12, 34, 56];
        }
      if (mapping.dials.length) {
        mapping.dials.at(-1).left = 'key_left';
        mapping.dials.at(-1).press = 'key_tab';
      }
    }
    await daemon.connect();
    await Promise.all([...daemon.artworkQueues.values()]);
    assert.equal(daemon.status.error, '');
    const expectedLEDs = deckModels.flatMap((m) =>
      m.controls.flatMap((c) =>
        c.type !== 'encoder'
          ? []
          : [
              ...(c.hasLed ? [[m.id, c.index, 'center', [12, 34, 56]]] : []),
              ...(c.ledRingSteps ? [[m.id, c.index, 'ring', [12, 34, 56]]] : []),
            ],
      ),
    );
    assert.deepEqual(ledWrites, expectedLEDs);
    for (const m of deckModels) {
      const mock = mocks.get(m.id);
      const mapping = deviceMapping(daemon.profile, m.id);
      const button = { type: 'button', index: mapping.keys.length - 1 };
      mock.emit('down', button);
      mock.emit('up', button);
      expected.push(['key_enter', false], ['key_enter', true]);
      if (mapping.dials.length) {
        const encoder = { type: 'encoder', index: mapping.dials.length - 1 };
        mock.emit('rotate', encoder, -1);
        mock.emit('down', encoder);
        mock.emit('up', encoder);
        expected.push(['key_left', false], ['key_tab', false], ['key_tab', true]);
      }
    }
    await sleep(0);
    assert.deepEqual(actions, expected);
    assert.equal(daemon.status.devices.length, deckModels.length);
    streamDeck.listStreamDecks = async () => [];
    await daemon.connect();
    assert.equal(daemon.status.pedal, null);
  } finally {
    streamDeck.listStreamDecks = originalList;
    streamDeck.openStreamDeck = originalOpen;
  }
});

test('icon catalog and CLI keep icon selection independent from actions and external to plugins', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-icons-'));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(tmp, 'config'),
    XDG_STATE_HOME: join(tmp, 'state'),
    PATH: '',
  };
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const command = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    const initial = JSON.parse(command('icons'));
    assert.equal(initial.directory, join(tmp, 'config/omarchy-elgato/icons'));
    assert.equal(initial.icons.filter((i) => i.group === 'Preset').length, 11);
    const custom = join(initial.directory, 'My icon #1.svg');
    await writeFile(
      custom,
      await readFile(new URL('../assets/keys/terminal.svg', import.meta.url)),
    );
    await writeFile(join(initial.directory, 'ignored.txt'), 'not an image');
    const catalog = JSON.parse(command('icons'));
    assert.ok(catalog.icons.some((i) => i.value === custom && i.url.includes('%23')));
    assert.equal(catalog.icons.length, initial.icons.length + 1);
    command('set-device-icon', 'plus', '1', custom);
    command('set-device-key', 'plus', '1', 'key_enter');
    let p = JSON.parse(command('profile'));
    assert.equal(p.keys[0].icon, custom);
    assert.equal(p.keys[0].action, 'key_enter');
    command('set-device-icon', 'classic', '15', 'preset:browser.jpg'); // Old preset selections remain compatible.
    p = JSON.parse(command('profile'));
    assert.equal(p.classicKeys[14].icon, 'preset:browser.svg');
    assert.throws(() => command('set-device-icon', 'neo', '10', custom));
    assert.throws(() => command('set-device-icon', 'pedal', '1', custom));
    assert.throws(() => command('set-device-icon', 'plus', '9', custom));
    assert.throws(() => command('set-device-icon', 'plus', '1', 'preset:../browser.jpg'));
    assert.throws(() =>
      command('set-device-icon', 'plus', '1', join(initial.directory, 'missing.png')),
    );
    assert.throws(() =>
      validateProfile({ ...p, keys: p.keys.map((k, i) => (i ? k : { ...k, icon: 123 })) }),
    );
    command('set-device-icon', 'plus', '1', 'automatic');
    assert.equal(JSON.parse(command('profile')).keys[0].icon, undefined);
    const pack = join(initial.directory, 'Minimal/Audio');
    await mkdir(pack, { recursive: true });
    const packedIcon = join(pack, 'My icon #1.svg');
    await writeFile(packedIcon, await readFile(custom));
    await symlink(initial.directory, join(pack, 'cycle'));
    const packedCatalog = JSON.parse(command('icons'));
    assert.equal(packedCatalog.icons.length, initial.icons.length + 2);
    assert.equal(packedCatalog.icons.find((i) => i.value === packedIcon).group, 'Minimal/Audio');
    assert.equal(packedCatalog.icons.filter((i) => i.label === 'My icon #1.svg').length, 2);
    command('set-device-icon', 'plus', '1', packedIcon);
    assert.equal(JSON.parse(command('profile')).keys[0].icon, packedIcon);
    await rm(join(initial.directory, 'Minimal'), { recursive: true });
    assert.equal(JSON.parse(command('icons')).icons.length, initial.icons.length + 1);
    await rm(custom);
    assert.equal(JSON.parse(command('icons')).icons.length, initial.icons.length);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
test('custom artwork fits aspect ratio, preserves black padding and refreshes after replacement', async () => {
  const { keyIcon, iconSignature } = await import('../dist/icons.js');
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-image-'));
  const path = join(tmp, 'custom image.png');
  const key = { action: 'terminal', label: 'Terminal', icon: path };
  try {
    execFileSync('magick', ['-size', '40x20', 'xc:red', path]);
    const signature = await iconSignature([key]);
    const red = await keyArtwork(key, 20, 20);
    assert.deepEqual([...red.subarray(0, 3)], [0, 0, 0]);
    assert.deepEqual([...red.subarray(20 * 10 * 3, 20 * 10 * 3 + 3)], [255, 0, 0]);
    await sleep(20);
    execFileSync('magick', ['-size', '40x20', 'xc:blue', path]);
    assert.notEqual(await iconSignature([key]), signature);
    const blue = await keyArtwork(key, 20, 20);
    assert.deepEqual([...blue.subarray(20 * 10 * 3, 20 * 10 * 3 + 3)], [0, 0, 255]);
    await rm(path);
    assert.ok((await keyIcon(key)).endsWith('terminal.svg'));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('button text overrides survive action changes and support hidden and automatic modes', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-text-'));
  const env = { ...process.env, XDG_CONFIG_HOME: join(tmp, 'config'), PATH: '' };
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const command = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    command('set-device-text', 'classic', '1', 'custom', 'My terminal');
    command('set-device-key', 'classic', '1', 'browser');
    let p = JSON.parse(command('profile'));
    assert.equal(p.classicKeys[0].displayText, 'My terminal');
    assert.equal(p.classicKeys[0].action, 'browser');
    command('set-device-text', 'classic', '1', 'hidden');
    assert.equal(JSON.parse(command('profile')).classicKeys[0].displayText, '');
    command('set-device-text', 'classic', '1', 'automatic');
    assert.equal(JSON.parse(command('profile')).classicKeys[0].displayText, undefined);
    assert.throws(() => command('set-device-text', 'neo', '10', 'hidden'));
    assert.throws(() => command('set-device-text', 'classic', '1', 'custom', 'x'.repeat(81)));
    assert.throws(() => command('set-device-text', 'classic', '1', 'custom', 'two\nlines'));
    p.classicKeys[0].displayText = 123;
    assert.throws(() => validateProfile(p));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
test('rendered previews match button artwork; hidden text blanks caption-only keys', async () => {
  const { keyPreview } = await import('../dist/artwork.js');
  const hidden = { action: 'key_enter', label: 'Return', displayText: '' };
  const pixels = await keyArtwork(hidden, 120, 120);
  assert.ok(pixels.every((byte) => byte === 0));
  const custom = { ...hidden, displayText: '@My terminal' };
  assert.ok((await keyArtwork(custom, 120, 120)).some((byte) => byte !== 0));
  const path = await keyPreview(custom);
  const preview = execFileSync('magick', [path, '-depth', '8', 'rgb:-']);
  assert.deepEqual(preview, await keyArtwork(custom, 120, 120));
  const preset = { action: 'terminal', label: 'Open Terminal' };
  assert.notDeepEqual(
    await keyArtwork(preset, 120, 120),
    await keyArtwork({ ...preset, displayText: '' }, 120, 120),
  );
  assert.notDeepEqual(
    await keyArtwork({ ...preset, displayText: '' }, 120, 120),
    await keyArtwork({ ...preset, displayText: 'Shell' }, 120, 120),
  );
});

test('custom preset caption is readable at its normal output size', async () => {
  const image = await keyArtwork(
    { action: 'terminal', label: 'Terminal', displayText: 'Shell' },
    120,
    120,
  );
  let whitePixels = 0;
  for (let y = 100; y < 116; y++) {
    for (let x = 0; x < 120; x++) {
      const offset = (y * 120 + x) * 3;
      if (image[offset] > 100 && image[offset + 1] > 100 && image[offset + 2] > 100) {
        whitePixels++;
      }
    }
  }
  assert.ok(whitePixels > 40, `Caption has only ${whitePixels} visible pixels`);
});

test('bundled presets render as grayscale white SVG artwork without glow or baked captions', async () => {
  for (const action of [
    'terminal',
    'browser',
    'files',
    'mic_mute',
    'media_play_pause',
    'screenshot',
    'lock',
    'lights_toggle',
  ]) {
    const svg = await readFile(
      new URL('../assets/keys/' + action + '.svg', import.meta.url),
      'utf8',
    );
    assert.ok(!/<(?:filter|text|image|linearGradient|radialGradient)\b/.test(svg));
    const image = await keyArtwork({ action, label: action, displayText: '' }, 120, 120);
    assert.ok(image.some((byte) => byte === 255));
    const corner = (8 * 120 + 8) * 3;
    assert.deepEqual(
      [...image.subarray(corner, corner + 3)],
      [0, 0, 0],
      action + ' background must stay black',
    );
    for (let offset = 0; offset < image.length; offset += 3) {
      assert.equal(image[offset], image[offset + 1]);
      assert.equal(image[offset], image[offset + 2]);
    }
  }
});

test('pages migrate existing mappings, isolate all controls, manage names and clean up links', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-pages-'));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(tmp, 'config'),
    XDG_STATE_HOME: join(tmp, 'state'),
    PATH: '',
  };
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const command = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    command('init');
    let profile = JSON.parse(command('profile'));
    assert.equal(profile.pages.plus.items[0].name, 'Page 1');
    assert.deepEqual(profile.pages.plus.items[0].keys, profile.keys);
    command('set-device-icon', 'plus', '1', 'preset:browser.svg');
    command('set-device-text', 'plus', '1', 'custom', 'My browser');
    const original = JSON.parse(command('profile')).keys;
    const second = JSON.parse(command('page', 'plus', 'duplicate', 'page-1', 'Work')).active;
    command('set-device-key', 'plus', '1', 'lock', '--page', second);
    command('set-device-icon', 'plus', '1', 'preset:lock.svg', '--page', second);
    command('set-device-text', 'plus', '1', 'custom', 'Work lock', '--page', second);
    command('set-device-dial', 'plus', '1', 'right', 'key_tab', '--page', second);
    profile = JSON.parse(command('profile'));
    assert.deepEqual(profile.keys, original);
    assert.equal(profile.pages.plus.items[1].keys[0].action, 'lock');
    assert.equal(profile.pages.plus.items[1].keys[0].displayText, 'Work lock');
    assert.equal(profile.pages.plus.items[1].keys[0].icon, 'preset:lock.svg');
    assert.equal(profile.pages.plus.items[1].dials[0].right, 'key_tab');
    assert.equal(profile.pages.classic.active, 'page-1');
    command('set-device-key', 'plus', '8', 'page:' + second, '--page', 'page-1');
    command('page', 'plus', 'rename', second, 'Office');
    assert.equal(JSON.parse(command('profile')).keys[7].label, 'Go to Office');
    const empty = JSON.parse(command('page', 'plus', 'add', 'Empty')).active;
    profile = JSON.parse(command('profile'));
    assert.ok(profile.pages.plus.items[2].keys.every((k) => k.action === 'none'));
    assert.ok(
      profile.pages.plus.items[2].dials.every(
        (d) => d.left === 'none' && d.press === 'none' && d.right === 'none',
      ),
    );
    assert.throws(() => command('page', 'plus', 'select', 'missing'));
    assert.throws(() => command('set-device-key', 'plus', '1', 'page:missing'));
    command('page', 'plus', 'delete', second);
    profile = JSON.parse(command('profile'));
    assert.equal(profile.keys[7].action, 'none');
    command('page', 'plus', 'select', 'page-1');
    command('page', 'plus', 'delete', 'page-1');
    profile = JSON.parse(command('profile'));
    assert.equal(profile.pages.plus.active, empty);
    assert.ok(profile.keys.every((k) => k.action === 'none'));
    assert.equal(profile.pages.plus.items.length, 1);
    assert.throws(() => command('page', 'plus', 'delete', empty));
    assert.throws(() => command('page', 'plus', 'rename', empty, ''));
    profile.pages.plus.active = 'invalid';
    assert.throws(() => validateProfile(profile));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
test('simulated page buttons change pages, redraw, wrap and preserve held releases', async () => {
  // Run in a separate process so persistence uses an isolated config directory.
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-page-events-'));
  const script = `
    import assert from 'node:assert/strict';
    import { EventEmitter } from 'node:events';
    import { loadProfile, deviceMapping, updateProfile } from './dist/config.js';
    import { pageCommand, navigatePage } from './dist/pages.js';
    import { setControl } from './dist/actions.js';
    import { Daemon } from './dist/daemon.js';
    import { streamDeck } from './dist/library.js';
    await pageCommand('plus', 'duplicate', 'page-1', 'Second');
    let p = await loadProfile(), second = p.pages.plus.active;
    await updateProfile(async p => {
      p.pages.plus.active = 'page-1';
      p.keys[0].action = 'voxtype_push_to_talk'; p.keys[1].action = 'page_next';
      p.pages.plus.items[1].keys[0].action = 'lock';
      p.pages.plus.items[1].keys[1].action = 'page_previous';
      p.pages.plus.items[1].dials[0].right = 'page:page-1';
    });
    await Promise.all([navigatePage('plus', 'page_next'), setControl('keys', 2, 'action', 'key_tab', 'plus', 'page-1')]);
    p = await loadProfile(); assert.equal(p.keys[2].action, 'key_tab'); assert.equal(p.pages.plus.active, second);
    await pageCommand('plus', 'select', 'page-1');
    const plus = Object.assign(new EventEmitter(), { PRODUCT_NAME:'Plus', CONTROLS:[], close:async()=>{} });
    streamDeck.listStreamDecks = async()=>[{model:'plus',path:'plus'}]; streamDeck.openStreamDeck=async()=>plus;
    const actions=[], redraw=[];
    const daemon=new Daemon(false,async(action,release)=>actions.push([action,release]));
    daemon.profile=await loadProfile(); daemon.render=()=>redraw.push(daemon.profile.pages.plus.active);
    await daemon.connect();
    const button=i=>({type:'button',index:i});
    plus.emit('down',button(0)); plus.emit('down',button(1));
    await daemon.queue;
    assert.equal(daemon.profile.pages.plus.active,second);
    assert.equal(daemon.status.plus.page,second);
    plus.emit('up',button(0)); plus.emit('up',button(1)); await daemon.queue;
    assert.deepEqual(actions,[['voxtype_push_to_talk',false],['voxtype_push_to_talk',true]]);
    plus.emit('down',button(0)); plus.emit('up',button(0)); await daemon.queue;
    assert.deepEqual(actions.slice(-2),[['lock',false],['lock',true]]);
    plus.emit('rotate',{type:'encoder',index:0},1); await daemon.queue;
    assert.equal(daemon.profile.pages.plus.active,'page-1');
    plus.emit('down',button(1)); plus.emit('up',button(1)); await daemon.queue;
    plus.emit('down',button(1)); plus.emit('up',button(1)); await daemon.queue;
    assert.equal(daemon.profile.pages.plus.active,'page-1');
    assert.ok(redraw.includes(second));
    assert.equal((await loadProfile()).pages.plus.active,'page-1');
  `;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(tmp, 'config'),
        XDG_STATE_HOME: join(tmp, 'state'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('display modes keep saved text/icons and render text-only, combined, and icon-only', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-display-'));
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const command = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      env: { ...process.env, XDG_CONFIG_HOME: join(tmp, 'config'), PATH: '' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    command('set-device-text', 'plus', '1', 'custom', 'Shell');
    command('set-device-icon', 'plus', '1', 'preset:terminal.svg');
    for (const mode of ['text', 'icon-text', 'icon']) {
      command('set-device-display', 'plus', '1', mode);
      const key = JSON.parse(command('profile')).keys[0];
      assert.equal(key.displayMode, mode);
      assert.equal(key.displayText, 'Shell');
      assert.equal(key.icon, 'preset:terminal.svg');
    }
    assert.throws(() => command('set-device-display', 'plus', '1', 'invalid'));
    assert.throws(() => command('set-device-display', 'pedal', '1', 'text'));
    const base = {
      action: 'terminal',
      label: 'Terminal',
      displayText: 'Shell',
      icon: 'preset:terminal.svg',
    };
    const text = await keyArtwork({ ...base, displayMode: 'text' }, 120, 120);
    assert.deepEqual(
      text,
      await keyArtwork({ ...base, icon: 'preset:browser.svg', displayMode: 'text' }, 120, 120),
    );
    const icon = await keyArtwork({ ...base, displayMode: 'icon' }, 120, 120);
    assert.deepEqual(
      icon,
      await keyArtwork(
        { ...base, displayText: 'A completely different caption', displayMode: 'icon' },
        120,
        120,
      ),
    );
    const combined = await keyArtwork({ ...base, displayMode: 'icon-text' }, 120, 120);
    assert.notDeepEqual(text, icon);
    assert.notDeepEqual(combined, icon);
    assert.notDeepEqual(text, combined);
    command('set-device-text', 'plus', '1', 'hidden');
    command('set-device-display', 'plus', '1', 'icon-text');
    assert.equal(JSON.parse(command('profile')).keys[0].displayText, undefined);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('folders nest, preserve return paths, isolate assignments and clean up deleted links', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-folders-'));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: join(tmp, 'config'),
    XDG_STATE_HOME: join(tmp, 'state'),
    PATH: '',
  };
  const cli = new URL('../dist/cli.js', import.meta.url).pathname;
  const command = (...args) =>
    execFileSync(process.execPath, [cli, ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const profile = () => JSON.parse(command('profile'));
  try {
    command('init');
    const original = profile().keys;
    const folder = JSON.parse(command('folder-create', 'plus', 'page-1', '2', 'Media')).active;
    let p = profile();
    assert.equal(p.keys[1].action, 'folder:' + folder);
    assert.equal(p.pages.plus.items[1].keys[0].action, 'folder_back');
    assert.equal(p.pages.classic.active, 'page-1');
    assert.deepEqual(p.pages.plus.history, ['page-1']);
    assert.throws(() => command('set-device-key', 'plus', '1', 'terminal'));
    assert.throws(() => command('folder-create', 'plus', folder, '1', 'Bad'));
    assert.throws(() => command('set-device-key', 'plus', '3', 'page:' + folder));
    assert.throws(() => command('set-device-key', 'plus', '3', 'folder:missing'));
    command('set-device-key', 'plus', '2', 'media_play_pause');
    command('set-device-dial', 'plus', '1', 'right', 'key_tab');
    assert.deepEqual(profile().keys[0], original[0]);
    const nested = JSON.parse(command('folder-create', 'plus', folder, '3', 'Apps')).active;
    assert.deepEqual(profile().pages.plus.history, ['page-1', folder]);
    assert.throws(() => command('page', 'plus', 'select', folder));
    command('folder-back', 'plus');
    assert.equal(profile().pages.plus.active, folder);
    command('folder-back', 'plus');
    assert.equal(profile().pages.plus.active, 'page-1');
    const work = JSON.parse(command('page', 'plus', 'add', 'Work')).active;
    command('set-device-key', 'plus', '2', 'folder:' + folder);
    command('page', 'plus', 'select', folder);
    command('folder-back', 'plus');
    assert.equal(profile().pages.plus.active, work);
    command('page', 'plus', 'rename', folder, 'Audio');
    assert.equal(profile().keys[1].label, 'Audio');
    assert.equal(profile().pages.plus.items.find((p) => p.id === work).keys[1].label, 'Audio');
    command('page', 'plus', 'select', folder);
    command('page', 'plus', 'select', nested);
    command('page', 'plus', 'delete', folder);
    p = profile();
    assert.equal(p.pages.plus.active, 'page-1');
    assert.deepEqual(p.pages.plus.history, []);
    assert.equal(p.keys[1].action, 'none');
    command('page', 'plus', 'delete', 'page-1');
    p = profile();
    assert.equal(p.pages.plus.items[0].id, work);
    assert.equal(p.pages.plus.items[0].kind, undefined);
    assert.throws(() => command('page', 'plus', 'delete', work));
    p.pages.plus.history = ['missing'];
    assert.throws(() => validateProfile(p));
    p = profile();
    p.pages.plus.items.find((p) => p.id === nested).keys[0].action = 'none';
    assert.throws(() => validateProfile(p));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('physical folder buttons navigate, redraw, skip folders in page cycling and keep held releases', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-folder-events-'));
  const script = `
    import assert from 'node:assert/strict';
    import { EventEmitter } from 'node:events';
    import { loadProfile, updateProfile } from './dist/config.js';
    import { createFolder, navigatePage, pageCommand } from './dist/pages.js';
    import { Daemon } from './dist/daemon.js';
    import { streamDeck } from './dist/library.js';
    await createFolder('plus','page-1',1,'Media');
    let p=await loadProfile(), folder=p.pages.plus.active;
    await pageCommand('plus','add',undefined,'Work');
    p=await loadProfile(); const work=p.pages.plus.active;
    await pageCommand('plus','select','page-1');
    await updateProfile(async p=>{p.keys[0].action='voxtype_push_to_talk'});
    const deck=Object.assign(new EventEmitter(),{PRODUCT_NAME:'Plus',CONTROLS:[],close:async()=>{}});
    streamDeck.listStreamDecks=async()=>[{model:'plus',path:'plus'}];streamDeck.openStreamDeck=async()=>deck;
    const actions=[],redraw=[];
    const daemon=new Daemon(false,async(a,r)=>actions.push([a,r]));
    daemon.profile=await loadProfile();daemon.render=()=>redraw.push(daemon.profile.pages.plus.active);
    await daemon.connect();
    const button=i=>({type:'button',index:i});
    deck.emit('down',button(0));deck.emit('down',button(1));await daemon.queue;
    assert.equal(daemon.profile.pages.plus.active,folder);
    deck.emit('up',button(0));deck.emit('up',button(1));await daemon.queue;
    assert.deepEqual(actions,[['voxtype_push_to_talk',false],['voxtype_push_to_talk',true]]);
    deck.emit('down',button(0));deck.emit('up',button(0));await daemon.queue;
    assert.equal(daemon.profile.pages.plus.active,'page-1');
    assert.ok(redraw.includes(folder));
    await navigatePage('plus','folder:'+folder);await navigatePage('plus','page_next');
    assert.equal((await loadProfile()).pages.plus.active,work);
    await navigatePage('plus','page_next');assert.equal((await loadProfile()).pages.plus.active,'page-1');
    const {keyArtwork}=await import('./dist/artwork.js');
    for (const action of ['folder:'+folder,'folder_back']) assert.ok((await keyArtwork({action,label:'',displayMode:'icon'},120,120)).some(byte=>byte===255));
  `;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(tmp, 'config'),
        XDG_STATE_HOME: join(tmp, 'state'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('global page buttons switch connected models by case-sensitive names, skip missing matches and preserve local navigation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-global-pages-'));
  const script = `
    import assert from 'node:assert/strict';
    import { EventEmitter } from 'node:events';
    import { loadProfile } from './dist/config.js';
    import { pageCommand, createFolder } from './dist/pages.js';
    import { setControl } from './dist/actions.js';
    import { Daemon } from './dist/daemon.js';
    import { streamDeck } from './dist/library.js';
    await pageCommand('plus','add',undefined,'Work');
    let p=await loadProfile();const plusWork=p.pages.plus.active;
    await pageCommand('classic','add',undefined,'Work');
    p=await loadProfile();const classicWork=p.pages.classic.active;
    await pageCommand('mini','add',undefined,'work');
    p=await loadProfile();const miniWork=p.pages.mini.active;
    await pageCommand('xl','add',undefined,'Work');
    p=await loadProfile();const xlWork=p.pages.xl.active;
    for (const kind of ['plus','classic','mini','xl']) await pageCommand(kind,'select','page-1');
    await setControl('keys',1,'action','page_global:'+plusWork,'plus','page-1');
    await setControl('keys',2,'action','page:page-1','plus',plusWork);
    await assert.rejects(()=>setControl('keys',0,'action','page_global:missing','plus'));
    await createFolder('classic','page-1',1,'Folder');
    const decks=new Map();
    for(const kind of ['plus','originalv2','mini']) decks.set(kind,Object.assign(new EventEmitter(),{PRODUCT_NAME:kind,CONTROLS:[],close:async()=>{}}));
    streamDeck.listStreamDecks=async()=>[...decks.keys()].map(model=>({model,path:model}));
    streamDeck.openStreamDeck=async path=>decks.get(path);
    const actions=[],daemon=new Daemon(false,async(a,r)=>actions.push([a,r]));
    daemon.profile=await loadProfile();daemon.render=()=>{};await daemon.connect();
    const button=i=>({type:'button',index:i}), plus=decks.get('plus');
    plus.emit('down',button(1));plus.emit('up',button(1));await daemon.queue;
    p=await loadProfile();
    assert.equal(p.pages.plus.active,plusWork);assert.equal(p.pages.classic.active,classicWork);
    assert.deepEqual(p.pages.classic.history,[]);
    assert.equal(p.pages.mini.active,'page-1'); // Lowercase is a different name.
    assert.equal(p.pages.xl.active,'page-1'); // Matching name, but disconnected.
    assert.deepEqual(actions,[]); // Neither press nor release launches an app.
    plus.emit('down',button(2));plus.emit('up',button(2));await daemon.queue;
    p=await loadProfile();assert.equal(p.pages.plus.active,'page-1');assert.equal(p.pages.classic.active,classicWork);
    await pageCommand('mini','rename',miniWork,'Work');
    plus.emit('down',button(1));plus.emit('up',button(1));await daemon.queue;
    assert.equal((await loadProfile()).pages.mini.active,miniWork);
    await pageCommand('plus','rename',plusWork,'Office');
    p=await loadProfile();assert.equal(p.keys[1].label,'Go to Office');
    plus.emit('down',button(2));plus.emit('up',button(2));await daemon.queue;
    plus.emit('down',button(1));plus.emit('up',button(1));await daemon.queue;
    p=await loadProfile();assert.equal(p.pages.plus.active,plusWork);assert.equal(p.pages.classic.active,classicWork);
    await pageCommand('plus','delete',plusWork);
    p=await loadProfile();assert.equal(p.keys[1].action,'none');
  `;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(tmp, 'config'),
        XDG_STATE_HOME: join(tmp, 'state'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('relative global page actions use each connected model order and skip folders', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'omarchy-elgato-page-order-'));
  const script = `
    import assert from 'node:assert/strict';
    import {loadProfile} from './dist/config.js';
    import {pageCommand,navigatePage,createFolder,isPageAction} from './dist/pages.js';
    import {setControl} from './dist/actions.js';
    await pageCommand('plus','add',undefined,'Alpha');
    let p=await loadProfile();const alpha=p.pages.plus.active;
    await createFolder('plus',alpha,1,'Folder');
    await pageCommand('plus','add',undefined,'Beta');
    p=await loadProfile();const beta=p.pages.plus.active;
    await pageCommand('classic','add',undefined,'Completely different');
    p=await loadProfile();const classicLast=p.pages.classic.active;
    await pageCommand('xl','add',undefined,'Disconnected');
    const live=['plus','classic','mini'];
    for(const kind of ['plus','classic','mini','xl'])await pageCommand(kind,'select','page-1');
    for(const mode of ['next','previous','first','last'])for(const global of [false,true]){
      const action='page_'+(global?'global_':'')+mode;
      assert.ok(isPageAction(action));await setControl('keys',3,'action',action,'plus','page-1');
    }
    await navigatePage('plus','page_global_next',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,alpha);assert.equal(p.pages.classic.active,classicLast);assert.equal(p.pages.mini.active,'page-1');assert.equal(p.pages.xl.active,'page-1');
    await navigatePage('plus','page_global_next',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,beta);assert.equal(p.pages.classic.active,'page-1');
    await navigatePage('plus','page_global_previous',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,alpha);assert.equal(p.pages.classic.active,classicLast);
    await navigatePage('plus','page_global_first',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,'page-1');assert.equal(p.pages.classic.active,'page-1');
    await navigatePage('plus','page_global_previous',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,beta);assert.equal(p.pages.classic.active,classicLast);
    await navigatePage('plus','page_first',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,'page-1');assert.equal(p.pages.classic.active,classicLast);
    await navigatePage('plus','page_last',live);assert.equal((await loadProfile()).pages.plus.active,beta);
    await navigatePage('plus','page_global_first',live);await navigatePage('plus','page_global_last',live);
    p=await loadProfile();assert.equal(p.pages.plus.active,beta);assert.equal(p.pages.classic.active,classicLast);assert.equal(p.pages.mini.active,'page-1');
    await pageCommand('plus','select',alpha);
    p=await loadProfile();const folder=p.pages.plus.items.find(p=>p.kind==='folder').id;
    await navigatePage('plus','folder:'+folder);
    await navigatePage('plus','page_next');p=await loadProfile();assert.equal(p.pages.plus.active,beta);assert.deepEqual(p.pages.plus.history,[]);
  `;
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        XDG_CONFIG_HOME: join(tmp, 'config'),
        XDG_STATE_HOME: join(tmp, 'state'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test('solid colors render exactly and colored captions use their own foreground', async () => {
  const key = {
    action: 'terminal',
    label: 'Terminal',
    displayMode: 'color',
    color: [12, 34, 56],
    textColor: [240, 20, 30],
  };
  const solid = await keyArtwork(key, 120, 120);
  for (let i = 0; i < solid.length; i += 3) {
    assert.deepEqual([...solid.subarray(i, i + 3)], key.color);
  }
  const caption = await keyArtwork(
    { ...key, displayMode: 'color-text', displayText: 'Hello' },
    120,
    120,
  );
  assert.deepEqual([...caption.subarray(0, 3)], key.color);
  assert.ok(
    caption.some((v, i) => i % 3 === 0 && v > 200),
    'red text is drawn',
  );
  const green = await keyArtwork(
    { ...key, displayMode: 'color-text', displayText: 'Hello', textColor: [20, 240, 30] },
    120,
    120,
  );
  assert.notDeepEqual(caption, green, 'text color participates in artwork cache');
});
test('color CLI validates capabilities, saves page colors, and rejects invalid colors', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elgato-colors-'));
  const env = { ...process.env, XDG_CONFIG_HOME: dir, XDG_STATE_HOME: dir, XDG_CACHE_HOME: dir };
  const command = (...args) =>
    execFileSync(process.execPath, ['dist/cli.js', ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    command('set-device-display', 'classic', '1', 'color-text');
    command('set-device-color', 'classic', '1', 'button', '#123456');
    command('set-device-color', 'classic', '1', 'text', '#abcdef');
    command('set-device-color', 'neo', '9', 'button', '#ff0000');
    const profile = JSON.parse(command('profile'));
    assert.deepEqual(profile.classicKeys[0].color, [18, 52, 86]);
    assert.deepEqual(profile.classicKeys[0].textColor, [171, 205, 239]);
    assert.equal(profile.classicKeys[0].displayMode, 'color-text');
    assert.deepEqual(profile.devices.neo.keys[8].color, [255, 0, 0]);
    assert.throws(() => command('set-device-color', 'neo', '9', 'text', '#ffffff'));
    assert.throws(() => command('set-device-color', 'pedal', '1', 'button', '#ffffff'));
    assert.throws(() => command('set-device-color', 'plus', '1', 'dial', '#ffffff'));
    assert.throws(() => command('set-device-color', 'classic', '1', 'button', '#zzzzzz'));
    const ledModel = deckModels.find((m) =>
      m.controls.some((c) => c.type === 'encoder' && (c.hasLed || c.ledRingSteps)),
    );
    if (ledModel) {
      command('set-device-color', ledModel.id, '1', 'dial', '#010203');
      assert.deepEqual(
        JSON.parse(command('profile')).devices[ledModel.id].dials[0].color,
        [1, 2, 3],
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('dial LCD displays render separate segments and save independent page settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'elgato-dial-display-'));
  const env = { ...process.env, XDG_CONFIG_HOME: dir, XDG_STATE_HOME: dir, XDG_CACHE_HOME: dir };
  const command = (...args) =>
    execFileSync(process.execPath, ['dist/cli.js', ...args], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    command('set-dial-display', 'plus', '1', 'mode', 'color');
    command('set-dial-display', 'plus', '1', 'background', '#123456');
    command('set-dial-display', 'plus', '2', 'mode', 'icon-text');
    command('set-dial-display', 'plus', '2', 'icon', 'preset:terminal.svg');
    command('set-dial-display', 'plus', '2', 'text', 'Volume');
    command('set-dial-display', 'plus', '2', 'foreground', '#ff0000');
    const profile = JSON.parse(command('profile'));
    assert.deepEqual(profile.dials[0].display.color, [18, 52, 86]);
    assert.equal(profile.dials[1].display.displayText, 'Volume');
    const original = await lcdArtwork(
      { ...profile, dials: profile.dials.map((d) => ({ ...d, display: undefined })) },
      [],
      800,
      100,
    );
    const rendered = await lcdArtwork(profile, [], 800, 100);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 200; x++) {
        assert.deepEqual(
          [...rendered.subarray((y * 800 + x) * 3, (y * 800 + x) * 3 + 3)],
          [18, 52, 86],
        );
      }
      assert.deepEqual(
        rendered.subarray((y * 800 + 400) * 3, (y * 800 + 800) * 3),
        original.subarray((y * 800 + 400) * 3, (y * 800 + 800) * 3),
      );
    }
    assert.notDeepEqual(rendered.subarray(600, 1200), original.subarray(600, 1200));
    assert.equal(JSON.parse(command('dial-previews', 'plus')).length, 4);
    command('page', 'plus', 'add', 'Work');
    const withPage = JSON.parse(command('profile'));
    const page = withPage.pages.plus.items.at(-1).id;
    command('set-dial-display', 'plus', '1', 'mode', 'color-text', '--page', page);
    command('set-dial-display', 'plus', '1', 'text', 'Work', '--page', page);
    assert.equal(
      JSON.parse(command('profile')).pages.plus.items.at(-1).dials[0].display.displayText,
      'Work',
    );
    assert.equal(JSON.parse(command('profile')).dials[0].display.displayMode, 'color');
    assert.throws(() => command('set-dial-display', 'classic', '1', 'mode', 'color'));
    assert.throws(() => command('set-dial-display', 'plus', '5', 'mode', 'color'));
    assert.throws(() => command('set-dial-display', 'plus', '1', 'background', 'bad'));
    command('set-dial-display', 'plus', '1', 'mode', 'default');
    assert.equal(JSON.parse(command('dial-previews', 'plus'))[0], '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
