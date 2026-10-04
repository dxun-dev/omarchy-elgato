import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
const directory = await mkdtemp(join(tmpdir(), 'elgato-profile-lock-'));
process.env.XDG_CONFIG_HOME = directory;
after(() => rm(directory, { recursive: true, force: true }));
const { loadProfile, updateProfile, profilePath } = await import('../dist/config.js');

test('first-use readers initialize one complete profile without partial JSON', async () => {
  const profiles = await Promise.all(Array.from({ length: 12 }, () => loadProfile()));
  assert.ok(profiles.every((profile) => profile.pages.plus.items.length === 1));
  assert.deepEqual(JSON.parse(await readFile(profilePath, 'utf8')), profiles[0]);
});

test('a reader in another process waits for an edit and sees its committed value', async () => {
  let release;
  let entered;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const held = new Promise((resolve) => {
    entered = resolve;
  });
  const edit = updateProfile(async (profile) => {
    profile.keys[0].label = 'Committed label';
    entered();
    await gate;
  });
  await held;
  const child = spawn(process.execPath, ['dist/cli.js', 'profile'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let error = '';
  let finished = false;
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    error += data;
  });
  const done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      finished = true;
      code === 0 ? resolve() : reject(new Error(error));
    });
  });
  try {
    await sleep(150);
    assert.equal(finished, false, 'reader must wait for the profile lock');
  } finally {
    release();
  }
  await edit;
  await done;
  assert.equal(JSON.parse(output).keys[0].label, 'Committed label');
});

test('migration and concurrent edits preserve every update and the original backup', async () => {
  const original = JSON.parse(await readFile(new URL('../defaults/profile.json', import.meta.url)));
  await writeFile(profilePath, JSON.stringify(original));
  await Promise.all([
    ...Array.from({ length: 8 }, () => loadProfile()),
    ...Array.from({ length: 8 }, (_, index) =>
      updateProfile(async (profile) => {
        profile.keys[index].label = `Saved ${index}`;
      }),
    ),
  ]);
  const final = await loadProfile();
  assert.deepEqual(
    final.keys.map((key) => key.label),
    Array.from({ length: 8 }, (_, index) => `Saved ${index}`),
  );
  const backup = JSON.parse(
    await readFile(join(directory, 'omarchy-elgato/profile.before-pages.json'), 'utf8'),
  );
  assert.deepEqual(backup, original);
});

test('failed edits release the lock without committing partial changes', async () => {
  const previous = await loadProfile();
  await assert.rejects(
    updateProfile(async (profile) => {
      profile.name = 'Partial';
      throw new Error('Edit failed');
    }),
    /Edit failed/,
  );
  assert.deepEqual(await loadProfile(), previous);
});
