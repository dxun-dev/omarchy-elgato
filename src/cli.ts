import { savedActionStates, statefulKey } from './action-state.js';
import { actionPacks } from './extensions.js';
import { pageCommand, pageCatalog, createFolder, navigatePage } from './pages.js';
import { keyPreview, dialDisplayKey } from './artwork.js';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { iconCatalog, setIcon, setStateIcon } from './icons.js';
import { readFile } from 'node:fs/promises';
import { loadProfile, profilePath, statusPath, stateDir, deckModels, deviceMapping } from './config.js';
import { catalog, setDialDisplay, setControlColor, setControl, setButtonText, setButtonDisplay } from './actions.js';
import { availableLights, controlLights, lightStates } from './lights.js';

const help = `omarchy-elgato — Elgato controls for Omarchy
Usage: bin/elgato-control <command>
  init                         Create this plugin's independent profile
  profile                      Print profile JSON
  catalog                      Print available actions as JSON
  action-packs                 List action packs and dependency/manifest errors
  status [--json]               Print daemon status
  icons                        List preset and custom icons
  set-dial-display MODEL INDEX mode|text|background|foreground|icon VALUE
  dial-previews MODEL         Render configured dial LCD previews
  button-previews MODEL        Render button previews using hardware artwork
  set-device-display MODEL INDEX text|icon-text|icon|color|color-text
  set-device-color MODEL INDEX button|text|dial #RRGGBB
  set-device-text MODEL INDEX automatic|hidden|custom [TEXT]
  set-state-icon MODEL INDEX button|dial STATE ICON
  set-device-icon MODEL INDEX ICON
                               ICON: automatic, preset:FILENAME, or image path
  page MODEL add NAME | select ID | rename ID NAME | duplicate ID NAME | delete ID
  folder-create MODEL PARENT_ID INDEX NAME
                               Create a folder assigned to this button
  folder-back MODEL            Return to previous page or folder
  page-catalog MODEL           List page and folder actions
  Mapping and preview commands accept --page ID; default is active page
  models                       List all supported model layouts (no USB access)
  set-device-key MODEL INDEX ACTION
  set-device-dial MODEL INDEX SLOT ACTION
                               Set independent mappings, including offline models
  devices                      List supported USB devices (does not open them)
  set-key INDEX ACTION         Set a Plus key (1–8)
  set-classic-key INDEX ACTION  Set a Classic key (1–15)
  set-dial INDEX SLOT ACTION    Set a Plus dial (1–4; left/press/right)
  lights ACTION [--target all|INDEX] [--value VALUE]
                               on/off/toggle/brightness/temperature/refresh
  daemon [--no-hardware]        Run service; no-hardware skips USB access
`;
const output = (value: unknown) => console.log(JSON.stringify(value, null, 2));
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h') { console.log(help); return; }
  if (command === 'models') { output(deckModels); return; }
  if (command === 'daemon') {
    if (args.some(a => a !== '--no-hardware')) throw new Error('Unknown daemon option');
    const { Daemon } = await import('./daemon.js'); await new Daemon(args.includes('--no-hardware')).start(); return;
  }
  if (command === 'devices') {
    const { streamDeck } = await import('./library.js');
    const { deviceKind } = await import('./daemon.js');
    output((await streamDeck.listStreamDecks()).filter(d => deviceKind(d.model))); return;
  }
  if (command === 'status') {
    let status: Record<string, unknown>;
    try { status = JSON.parse(await readFile(statusPath, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      status = { running: false, plus: null, classic: null, pedal: null, wave: null, lights: [], devices: [], profile: 'Elgato Controls' };
    }
    if (!Number.isFinite(status.updatedAt) || Number(status.updatedAt) < Date.now() / 1000 - 10) status.running = false;
    try { status.runtime = JSON.parse(await readFile(join(stateDir, 'runtime-status.json'), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (['preparing', 'failed'].includes((status.runtime as { phase?: string } | undefined)?.phase || '')) status.running = false;
    if (!status.running) { status.plus = null; status.classic = null; status.pedal = null; status.devices = []; status.lights = []; }
    output(status); return;
  }
  let pageId: string | undefined;
  const pageOption = args.indexOf('--page');
  if (pageOption >= 0) { pageId = args[pageOption + 1]; if (!pageId) throw new Error('Missing page ID'); args.splice(pageOption, 2); }
  const profile = await loadProfile();
  switch (command) {
    case 'folder-create': {
      if (args.length !== 4) throw new Error('Expected model, parent ID, button index and name');
      await createFolder(args[0], args[1], Number(args[2]) - 1, args[3]); output((await loadProfile()).pages?.[args[0]]); break;
    }
    case 'folder-back': { if (args.length !== 1) throw new Error('Expected model'); await navigatePage(args[0], 'folder_back'); break; }
    case 'page': {
      const [model, operation, ...rest] = args;
      if (operation === 'add') { if (rest.length !== 1) throw new Error('Expected page name'); await pageCommand(model, operation, undefined, rest[0]); }
      else if (operation === 'rename' || operation === 'duplicate') { if (rest.length !== 2) throw new Error('Expected page ID and name'); await pageCommand(model, operation, rest[0], rest[1]); }
      else if (operation === 'select' || operation === 'delete') { if (rest.length !== 1) throw new Error('Expected page ID'); await pageCommand(model, operation, rest[0]); }
      else throw new Error('Unknown page operation');
      output((await loadProfile()).pages?.[model]); break;
    }
    case 'page-catalog': { if (args.length !== 1) throw new Error('Expected model'); output(pageCatalog(profile, args[0])); break; }
    case 'init': console.log(profilePath); break;
    case 'profile': output(profile); break;
    case 'button-previews': {
      if (args.length !== 1 || !deckModels.some(d => d.id === args[0])) throw new Error('Invalid preview model');
      const states = await savedActionStates();
      output(await Promise.all(deviceMapping(profile, args[0], pageId).keys.map(async key => pathToFileURL(await keyPreview(await statefulKey(key,states[key.action]))).href))); break;
    }
    case 'set-dial-display': {
      if (args.length !== 4) throw new Error('Expected MODEL INDEX FIELD VALUE');
      await setDialDisplay(args[0], Number(args[1]) - 1, args[2], args[3], pageId); console.log(profilePath); break;
    }
    case 'dial-previews': {
      const mapping = deviceMapping(profile, args[0], pageId), states = await savedActionStates();
      output(await Promise.all(mapping.dials.map(async d => d.display?.displayMode ? pathToFileURL(await keyPreview(await statefulKey(dialDisplayKey(d),states[d.press]), 200, 100, true)).href : ''))); break;
    }
    case 'set-device-color': {
      if (args.length !== 4) throw new Error('Expected MODEL INDEX TARGET #RRGGBB');
      await setControlColor(args[0], Number(args[1]) - 1, args[2], args[3], pageId); console.log(profilePath); break;
    }
    case 'set-device-display': {
      if (args.length !== 3) throw new Error('Expected MODEL INDEX MODE');
      await setButtonDisplay(args[0], Number(args[1]) - 1, args[2], pageId); console.log(profilePath); break;
    }
    case 'set-device-text': {
      if (args.length !== (args[2] === 'custom' ? 4 : 3)) throw new Error('Invalid text arguments');
      await setButtonText(args[0], Number(args[1]) - 1, args[2], args[3], pageId); console.log(profilePath); break;
    }
    case 'icons': output(await iconCatalog()); break;
    case 'set-state-icon': {
      if (args.length !== 5) throw new Error('Expected MODEL INDEX button|dial STATE ICON');
      await setStateIcon(args[0],Number(args[1])-1,args[2],args[3],args[4],pageId); console.log(profilePath); break;
    }
    case 'set-device-icon': {
      if (args.length !== 3) throw new Error('Expected MODEL INDEX ICON');
      await setIcon(args[0], Number(args[1]) - 1, args[2], pageId); console.log(profilePath); break;
    }
    case 'action-packs': output({ directory: (await import('./extensions.js')).actionsDir, packs: (await actionPacks(true)).packs }); break;
    case 'catalog': output(await catalog()); break;
    case 'set-device-key': case 'set-device-dial': {
      const dial = command === 'set-device-dial', model = args.shift();
      if (!deckModels.some(m => m.id === model) || args.length !== (dial ? 3 : 2)) throw new Error('Invalid device mapping arguments');
      await setControl(dial ? 'dials' : 'keys', Number(args[0]) - 1, dial ? args[1] : 'action', dial ? args[2] : args[1], model, pageId);
      console.log(profilePath); break;
    }
    case 'set-key': case 'set-classic-key': case 'set-dial': {
      const dial = command === 'set-dial';
      if (args.length !== (dial ? 3 : 2)) throw new Error('Incorrect mapping arguments');
      const kind = dial ? 'dials' : command === 'set-key' ? 'keys' : 'classicKeys';
      await setControl(kind, Number(args[0]) - 1, dial ? args[1] : 'action', dial ? args[2] : args[1]);
      console.log(profilePath); break;
    }
    case 'lights': {
      const action = args.shift();
      if (!action || !['on', 'off', 'toggle', 'brightness', 'temperature', 'refresh'].includes(action)) throw new Error('Unsupported light action');
      let target = 'all', value: number | undefined;
      while (args.length) {
        const option = args.shift(), argument = args.shift();
        if (argument === undefined) throw new Error('Missing option value');
        if (option === '--target') target = argument;
        else if (option === '--value') value = Number(argument);
        else throw new Error('Unknown light option: ' + option);
      }
      output(action === 'refresh' ? await lightStates(await availableLights()) : await controlLights(target, action, value)); break;
    }
    default: throw new Error('Unknown command: ' + command);
  }
}
main().catch(error => { console.error(`omarchy-elgato: ${error.message || error}`); process.exitCode = 1; });
