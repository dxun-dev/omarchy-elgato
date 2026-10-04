import { distributionFiles } from './distribution-files.mjs';
import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const source = fileURLToPath(new URL('../', import.meta.url));
const plugins = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'omarchy/plugins');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json')));
const destination = join(plugins, manifest.id);
const backups = join(
  process.env.XDG_DATA_HOME || join(homedir(), '.local/share'),
  'omarchy-plugin-backups',
);
const stage = join(plugins, '.omarchy-elgato-stage-' + randomUUID());
const args = process.argv.slice(2);
let requestedSection;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--section') {
    requestedSection = args[++i];
    if (!['left', 'center', 'right'].includes(requestedSection)) {
      throw new Error('--section must be left, center, or right');
    }
  } else if (!['--offline', '--enable'].includes(args[i])) {
    throw new Error('Unknown install option: ' + args[i]);
  }
}
let alreadyInstalled = false;
try {
  await stat(destination);
  alreadyInstalled = true;
} catch (error) {
  if (error.code !== 'ENOENT') {
    throw error;
  }
}
await stat(join(source, 'dist/cli.js'));
execFileSync(
  process.execPath,
  [join(source, 'scripts/setup.mjs'), ...(args.includes('--offline') ? ['--offline'] : [])],
  { stdio: 'inherit' },
);
await mkdir(stage, { recursive: true });
try {
  for (const name of distributionFiles) {
    await cp(join(source, name), join(stage, name), { recursive: true });
  }
  execFileSync('omarchy', ['plugin', 'validate', stage], { stdio: 'inherit' });
  await mkdir(backups, { recursive: true });
  try {
    await stat(destination);
    await rename(destination, join(backups, manifest.id + '.backup-' + Date.now()));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  await rename(stage, destination);
  console.log(`Installed ${manifest.name}: ${destination}`);
  let section = requestedSection;
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  // Match Omarchy's add --enable placement picker on a first interactive install.
  // Ordinary development reinstalls preserve both placement and enabled state.
  if (!section && interactive && (!alreadyInstalled || args.includes('--enable'))) {
    try {
      section = execFileSync(
        'gum',
        [
          'choose',
          '--header',
          `Place ${manifest.id} in which bar section?`,
          '--selected',
          manifest.barWidget.defaultSection || 'center',
          'left',
          'center',
          'right',
        ],
        { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] },
      ).trim();
    } catch (error) {
      if (error.status === 130 || error.status === 1) {
        console.log(
          `Placement cancelled. Enable later with: omarchy plugin enable ${manifest.id} --section left|center|right`,
        );
        section = null;
      } else {
        throw error;
      }
    }
  }
  if (section || (args.includes('--enable') && !interactive && section !== null)) {
    if (section && !['left', 'center', 'right'].includes(section)) {
      throw new Error('Invalid bar section');
    }
    execFileSync('omarchy-shell', ['shell', 'rescanPlugins'], { stdio: 'inherit' });
    execFileSync(
      'omarchy',
      ['plugin', 'enable', manifest.id, ...(section ? ['--section', section] : [])],
      { stdio: 'inherit' },
    );
  } else if (alreadyInstalled) {
    console.log('Existing bar placement and enabled state preserved.');
  } else {
    console.log(`Enable with: omarchy plugin enable ${manifest.id} --section left|center|right`);
  }
} finally {
  await rm(stage, { recursive: true, force: true });
}
