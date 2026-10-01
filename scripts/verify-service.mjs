import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as sleep } from 'node:timers/promises';
const exec = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'elgato-service-check-'));
const env = { ...process.env, XDG_RUNTIME_DIR: join(directory, 'runtime'), QT_QPA_PLATFORM: 'offscreen' };
let child;
try {
  await mkdir(env.XDG_RUNTIME_DIR, { mode: 0o700 });
  const helper = join(directory, 'helper');
  const attemptsPath = join(directory, 'attempts');
  await writeFile(helper, '#!/bin/sh\nprintf x >> "' + attemptsPath + '"\nexit 78\n');
  await chmod(helper, 0o755);
  const service = (await readFile(new URL('../Service.qml', import.meta.url), 'utf8'))
    .replace(/readonly property string helper: .*/, 'readonly property string helper: ' + JSON.stringify(helper));
  await writeFile(join(directory, 'Service.qml'), service);
  const shell = join(directory, 'shell.qml');
  await writeFile(shell, 'import Quickshell\nShellRoot { Service {} }\n');
  child = spawn('qs', ['-p', shell, '--no-color'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '', spawnError;
  child.stdout.on('data', data => { logs += data; });
  child.stderr.on('data', data => { logs += data; });
  child.on('error', error => { spawnError = error; });
  const attempts = async () => { try { return (await readFile(attemptsPath, 'utf8')).length; } catch { return 0; } };
  const waitForAttempts = async count => {
    for (let i = 0; i < 50; i++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(logs);
      if (await attempts() === count) return;
      await sleep(100);
    }
    throw new Error('Service did not reach attempt ' + count + '\n' + logs);
  };
  await waitForAttempts(1);
  await sleep(2300);
  assert.equal(await attempts(), 1, 'failed setup must not automatically restart');
  const { stdout } = await exec('qs', ['ipc', '-p', shell, 'call', '--', 'dxun-dev.omarchy-elgato.runtime', 'retry'], { env, timeout: 3000 });
  assert.doesNotMatch(stdout, /not found|not ready/i);
  await waitForAttempts(2);
  console.log('Service checks passed: setup failure stops restarts; shell IPC retries it.');
} finally {
  if (child && child.exitCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM'); await stopped;
  }
  await rm(directory, { recursive: true, force: true });
}
