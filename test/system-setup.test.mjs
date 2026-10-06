import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  cp,
  chmod,
  symlink,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = await mkdtemp(join(tmpdir(), 'elgato-system-setup-'));
after(() => rm(root, { recursive: true, force: true }));
async function fixture(name) {
  const directory = join(root, name);
  const bin = join(directory, 'bin');
  await mkdir(bin, { recursive: true });
  await mkdir(join(directory, 'scripts'));
  await mkdir(join(directory, 'assets/udev'), { recursive: true });
  await mkdir(join(directory, 'rules'));
  await writeFile(join(directory, 'font.ttf'), 'font');
  await cp(
    'assets/udev/70-omarchy-elgato.rules',
    join(directory, 'assets/udev/70-omarchy-elgato.rules'),
  );
  const source = (await readFile('scripts/system-setup.sh', 'utf8'))
    .replace(
      '/etc/udev/rules.d/70-omarchy-elgato.rules',
      join(directory, 'rules/70-omarchy-elgato.rules'),
    )
    .replaceAll('/usr/bin/node', join(bin, 'system-node'));
  const script = join(directory, 'scripts/system-setup.sh');
  await writeFile(script, source);
  for (const command of [
    'dirname',
    'mkdir',
    'cmp',
    'mktemp',
    'jq',
    'mv',
    'flock',
    'install',
    'cat',
    'chmod',
    'bash',
  ]) {
    await symlink('/usr/bin/' + command, join(bin, command));
  }
  async function executable(command, body = 'exit 0') {
    await writeFile(join(bin, command), '#!/bin/bash\n' + body + '\n');
    await chmod(join(bin, command), 0o755);
  }
  await executable('gum', 'exit "${DECLINE:-0}"');
  await executable(
    'sudo',
    'echo "$*" >> "$TEST_DIR/admin-commands"\nexec "$@"',
  );
  await executable(
    'systemctl',
    'if [[ $1 == is-active ]]; then [[ -f $TEST_DIR/avahi-active ]]; else touch="$TEST_DIR/avahi-active"; printf active > "$touch"; fi',
  );
  await executable('udevadm', 'exit 0');
  await executable('omarchy-shell', 'echo "$*" >> "$TEST_DIR/ipc"');
  await executable('system-node', 'exit 1');
  await executable(
    'omarchy',
    `
if [[ $1 == launch ]]; then echo "$*" > "$TEST_DIR/launch"; exit 0; fi
[[ $1 == pkg && $2 == add ]] || exit 1
shift 2
echo "$*" > "$TEST_DIR/packages"
for package in "$@"; do
 case $package in
 nodejs) commands=node;; npm) commands=npm;; imagemagick) commands=magick;; fontconfig) commands=fc-match;;
 avahi) commands=avahi-browse;; wireplumber) commands=wpctl;; wtype) commands=wtype;; uwsm) commands=uwsm-app;;
 gtk3) commands=gtk-launch;; xdg-utils) commands=xdg-open;; ttf-dejavu) continue;; *) exit 1;;
 esac
 for command in $commands; do
   printf '#!/bin/bash\\nexit 0\\n' > "$TEST_DIR/bin/$command"
   chmod +x "$TEST_DIR/bin/$command"
 done
done
`,
  );
  // Fontconfig is installed in this fixture; it resolves an existing test font.
  await executable('fc-match', 'printf "%s" "$TEST_DIR/font.ttf"');
  const env = {
    ...process.env,
    HOME: directory,
    XDG_STATE_HOME: join(directory, 'state'),
    PATH: bin,
    TEST_DIR: directory,
  };
  const run = (mode, extra = {}) =>
    spawnSync('/usr/bin/bash', [script, mode], {
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
  const state = async () =>
    JSON.parse(
      await readFile(
        join(env.XDG_STATE_HOME, 'omarchy-elgato/runtime-status.json'),
        'utf8',
      ),
    );
  return { directory, executable, run, state };
}
test('first enable requests a terminal prompt without installing anything', async () => {
  const f = await fixture('request');
  assert.equal(f.run('--check').status, 1);
  assert.equal(f.run('--request').status, 0);
  assert.match(
    await readFile(join(f.directory, 'launch'), 'utf8'),
    /launch terminal bash .*--install/,
  );
  assert.equal((await f.state()).phase, 'preparing');
  await assert.rejects(readFile(join(f.directory, 'admin-commands')), {
    code: 'ENOENT',
  });
});
test('confirmation installs missing packages, narrow USB rules, and Avahi, then resumes service', async () => {
  const f = await fixture('install');
  const result = f.run('--install');
  assert.equal(result.status, 0, result.stderr);
  const packages = await readFile(join(f.directory, 'packages'), 'utf8');
  for (const packageName of [
    'nodejs',
    'npm',
    'imagemagick',
    'avahi',
    'wireplumber',
    'wtype',
    'uwsm',
    'gtk3',
    'xdg-utils',
  ]) {
    assert.ok(packages.split(/\s+/).includes(packageName));
  }
  const rule = await readFile(
    join(f.directory, 'rules/70-omarchy-elgato.rules'),
    'utf8',
  );
  assert.match(rule, /TAG\+="uaccess"/);
  assert.doesNotMatch(rule, /SUBSYSTEM=="input"|0666/);
  assert.equal((await f.state()).phase, 'ready');
  assert.match(
    await readFile(join(f.directory, 'ipc'), 'utf8'),
    /dxun-dev.omarchy-elgato.runtime retry/,
  );
  assert.equal(f.run('--check').status, 0);
});
test('declining setup leaves packages and USB permissions unchanged and exposes retry status', async () => {
  const f = await fixture('decline');
  assert.notEqual(f.run('--install', { DECLINE: '1' }).status, 0);
  assert.equal((await f.state()).phase, 'failed');
  await assert.rejects(readFile(join(f.directory, 'admin-commands')), {
    code: 'ENOENT',
  });
  await assert.rejects(readFile(join(f.directory, 'packages')), {
    code: 'ENOENT',
  });
});

test('daemon first enable requests setup even when Node.js is unavailable', async () => {
  const f = await fixture('daemon-bootstrap');
  const helper = join(f.directory, 'bin/omarchy-elgato');
  const source = (await readFile('bin/omarchy-elgato', 'utf8'))
    .replaceAll('/usr/bin/node', join(f.directory, 'bin/system-node'))
    .replace(
      'export PATH=/usr/bin:$PATH',
      'export PATH=' + join(f.directory, 'bin') + ':$PATH',
    );
  await writeFile(helper, source);
  await mkdir(join(f.directory, 'dist'));
  await writeFile(
    join(f.directory, 'dist/cli.js'),
    'throw new Error("Backend must not start before setup");',
  );
  const result = spawnSync('/usr/bin/bash', [helper, 'daemon'], {
    env: {
      ...process.env,
      HOME: f.directory,
      XDG_STATE_HOME: join(f.directory, 'state'),
      PATH: join(f.directory, 'bin'),
      TEST_DIR: f.directory,
    },
    encoding: 'utf8',
  });
  assert.equal(result.status, 78, result.stderr);
  assert.match(
    await readFile(join(f.directory, 'launch'), 'utf8'),
    /launch terminal bash .*--install/,
  );
  assert.equal((await f.state()).phase, 'preparing');
  await assert.rejects(readFile(join(f.directory, 'admin-commands')), {
    code: 'ENOENT',
  });
});
