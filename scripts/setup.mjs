import { cp, mkdir, realpath, stat, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeRuntimeState } from './runtime-state.mjs';

const source = fileURLToPath(new URL('../', import.meta.url));
const runtime = process.env.OMARCHY_ELGATO_RUNTIME || join(process.env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'omarchy-elgato/runtime');
async function prepareRuntime() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--offline', '--if-needed'].includes(arg))) throw new Error('Usage: node scripts/setup.mjs [--offline] [--if-needed]');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 18)) throw new Error('Node.js 22.18 or newer is required');
  function ensureExternal(directory, plugin) {
    const path = relative(plugin, directory);
    if (!path || (!path.startsWith('..' + '/') && path !== '..' && !isAbsolute(path))) throw new Error('Runtime must be outside the plugin directory');
  }
  ensureExternal(resolve(runtime), resolve(source));
  await stat(join(source,'dist/cli.js'));
  await mkdir(runtime, { recursive: true });
  ensureExternal(await realpath(runtime), await realpath(source));
  const marker = join(runtime, '.runtime-ready');
  const signature = createHash('sha256')
    .update(await readFile(join(source, 'package.json')))
    .update(await readFile(join(source, 'package-lock.json')))
    .update(`${process.versions.node}:${process.platform}:${process.arch}`)
    .digest('hex');
  function checkModules() {
    execFileSync(process.execPath, ['--input-type=module', '-e',
      'import {createRequire} from "node:module";const require=createRequire(process.argv[1]);require("@elgato-stream-deck/node");require("node-hid").getHidapiVersion();require("@julusian/jpeg-turbo");', join(runtime, 'package.json')], { stdio: 'pipe' });
  }
  let ready = false;
  if (args.includes('--if-needed')) {
    try {
      if ((await readFile(marker, 'utf8')) === signature) { checkModules(); ready = true; }
    } catch {
      // Missing, outdated, or broken native modules need preparation again.
    }
  }
  if (!ready) {
    // A failed install must not leave a marker claiming the runtime is current.
    await writeFile(marker, '');
    await writeRuntimeState('preparing');
    console.log('Preparing Omarchy Elgato runtime…');
    await cp(join(source,'package.json'),join(runtime,'package.json'));
    await cp(join(source,'package-lock.json'),join(runtime,'package-lock.json'));
    if (args.includes('--offline')) {
      await stat(join(source,'node_modules/@elgato-stream-deck/node'));
      await cp(join(source,'node_modules'),join(runtime,'node_modules'),{recursive:true,verbatimSymlinks:true});
    } else {
      execFileSync('npm',['ci','--omit=dev'],{cwd:runtime,stdio:['inherit','inherit','pipe']});
    }
    // A broken/missing native binary fails before the daemon opens hardware.
    checkModules();
    await writeFile(marker, signature);
  }
  const packs = join(process.env.XDG_CONFIG_HOME || join(homedir(),'.config'),'omarchy-elgato/actions');
  await mkdir(packs,{recursive:true});
  try { await stat(join(packs,'voxtype')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await cp(join(source,'examples/actions/voxtype'),join(packs,'voxtype'),{recursive:true,force:false});
  }
  if (!ready) console.log('Runtime dependencies ready: '+runtime);

  await writeRuntimeState('ready');
}
try { await prepareRuntime(); }
catch (error) {
  const detail = [error.message, error.stderr?.toString()].filter(Boolean).join('\n').slice(-2000);
  await writeRuntimeState('failed', detail).catch(() => {});
  console.error('Runtime preparation failed: ' + detail);
  process.exitCode = 1;
}
