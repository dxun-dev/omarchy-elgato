import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'elgato-portability-'));
after(() => rm(dir, { recursive: true, force: true }));
process.env.XDG_DATA_HOME = join(dir, 'user');
process.env.XDG_DATA_DIRS = join(dir, 'system');
process.env.XDG_CONFIG_HOME = join(dir, 'config');
process.env.XDG_STATE_HOME = join(dir, 'state');
const { desktopEntry, applications, actionIcon } = await import('../dist/actions.js');
test('application entries and icons follow user and system XDG locations', async () => {
  for (const [root, id] of [[process.env.XDG_DATA_HOME, 'portable-user'], [process.env.XDG_DATA_DIRS, 'portable-system']]) {
    await mkdir(join(root, 'applications'), { recursive: true });
    await mkdir(join(root, 'icons/hicolor/scalable/apps'), { recursive: true });
    await writeFile(join(root, 'applications', id + '.desktop'), `[Desktop Entry]\nType=Application\nName=${id}\nExec=example\nIcon=${id}\n`);
    await writeFile(join(root, 'icons/hicolor/scalable/apps', id + '.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    assert.equal((await desktopEntry(id)).Name, id);
    assert.equal(await actionIcon('app:' + id), join(root, 'icons/hicolor/scalable/apps', id + '.svg'));
    assert.ok((await applications()).some(entry => entry.id === id));
  }
  await writeFile(join(process.env.XDG_DATA_HOME, 'applications/portable-system.desktop'), '[Desktop Entry]\nHidden=true\n');
  assert.equal(await desktopEntry('portable-system'), null);
});
test('setup rejects runtime storage within the plugin before changing files', () => {
  const result = spawnSync(process.execPath, ['scripts/setup.mjs'], { env: { ...process.env, OMARCHY_ELGATO_RUNTIME: process.cwd() }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Runtime must be outside the plugin directory/);
});

test('runtime preparation skips a ready runtime, repairs native modules, and preserves user packs', async () => {
  const runtime = join(dir, 'runtime');
  const env = { ...process.env, OMARCHY_ELGATO_RUNTIME: runtime };
  const setup = () => spawnSync(process.execPath, ['scripts/setup.mjs', '--offline', '--if-needed'], { env, encoding: 'utf8' });
  const first = setup();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Preparing Elgato Controls runtime/);
  const statePath = join(process.env.XDG_STATE_HOME, 'omarchy-elgato/runtime-status.json');
  assert.equal(JSON.parse(await readFile(statePath, 'utf8')).phase, 'ready');
  const marker = join(runtime, '.runtime-ready');
  assert.match(await readFile(marker, 'utf8'), /^[a-f0-9]{64}$/);
  const pack = join(process.env.XDG_CONFIG_HOME, 'omarchy-elgato/actions/voxtype/manifest.json');
  await writeFile(pack, 'user-owned pack');
  const second = setup();
  assert.equal(second.status, 0, second.stderr);
  assert.doesNotMatch(second.stdout, /Preparing/);
  assert.equal(await readFile(pack, 'utf8'), 'user-owned pack');
  await rm(join(runtime, 'node_modules/node-hid'), { recursive: true });
  const repaired = setup();
  assert.equal(repaired.status, 0, repaired.stderr);
  assert.match(repaired.stdout, /Preparing/);
  await writeFile(marker, 'outdated');
  const upgraded = setup();
  assert.equal(upgraded.status, 0, upgraded.stderr);
  assert.match(upgraded.stdout, /Preparing/);
  assert.equal(await readFile(pack, 'utf8'), 'user-owned pack');
});

test('failed setup publishes actionable status without creating a profile', async () => {
  const bin = join(dir, 'fake-bin');
  await mkdir(bin);
  await writeFile(join(bin, 'npm'), '#!/bin/sh\necho "Registry unavailable" >&2\nexit 1\n');
  await chmod(join(bin, 'npm'), 0o755);
  const env = { ...process.env, OMARCHY_ELGATO_RUNTIME: join(dir, 'failed-runtime'), XDG_CONFIG_HOME: join(dir, 'failed-config'), XDG_STATE_HOME: join(dir, 'failed-state'), PATH: bin + ':' + process.env.PATH };
  const result = spawnSync(process.execPath, ['scripts/setup.mjs', '--if-needed'], { env, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const state = JSON.parse(await readFile(join(env.XDG_STATE_HOME, 'omarchy-elgato/runtime-status.json'), 'utf8'));
  assert.equal(state.phase, 'failed');
  assert.match(state.error, /Registry unavailable/);
  assert.equal(await readFile(join(env.OMARCHY_ELGATO_RUNTIME, '.runtime-ready'), 'utf8'), '');
  const statusResult = spawnSync(process.execPath, ['dist/cli.js', 'status', '--json'], { env, encoding: 'utf8' });
  assert.equal(statusResult.status, 0, statusResult.stderr);
  const status = JSON.parse(statusResult.stdout);
  assert.equal(status.running, false);
  assert.deepEqual(status.runtime, state);
  await assert.rejects(readFile(join(env.XDG_CONFIG_HOME, 'omarchy-elgato/profile.json')), { code: 'ENOENT' });
  // The status route must also work with a corrupted user profile.
  await mkdir(join(env.XDG_CONFIG_HOME, 'omarchy-elgato'), { recursive: true });
  await writeFile(join(env.XDG_CONFIG_HOME, 'omarchy-elgato/profile.json'), 'invalid JSON');
  assert.equal(spawnSync(process.execPath, ['dist/cli.js', 'status', '--json'], { env }).status, 0);
});
