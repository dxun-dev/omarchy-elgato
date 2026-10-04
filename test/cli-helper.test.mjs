import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = await mkdtemp(join(tmpdir(), 'omarchy-elgato-helper-'));
after(() => rm(directory, { recursive: true, force: true }));
const helper = fileURLToPath(new URL('../bin/omarchy-elgato', import.meta.url));
const env = {
  ...process.env,
  XDG_CONFIG_HOME: join(directory, 'config'),
  XDG_STATE_HOME: join(directory, 'state'),
  XDG_DATA_HOME: join(directory, 'data'),
};
const run = (...args) => spawnSync(helper, args, { cwd: directory, env, encoding: 'utf8' });

test('plugin helper resolves its build outside the current directory and forwards arguments', () => {
  const help = run('--help');
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /Usage: bin\/omarchy-elgato <command>/);
  const models = run('models');
  assert.equal(models.status, 0, models.stderr);
  const catalog = JSON.parse(models.stdout);
  assert.ok(Array.isArray(catalog));
  assert.ok(catalog.some((model) => model.id === 'plus'));
});

test('renamed helper can report status before first setup without creating a profile', async () => {
  const result = run('status', '--json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).running, false);
  await assert.rejects(access(join(env.XDG_CONFIG_HOME, 'omarchy-elgato/profile.json')), {
    code: 'ENOENT',
  });
});
