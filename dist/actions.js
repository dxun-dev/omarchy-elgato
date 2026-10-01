import { actionStateOptions } from './action-state.js';
import { actionPacks, extensionAction, executeExtension } from './extensions.js';
import { iconPath } from './icons.js';
import { deviceMapping } from './config.js';
import { readdir, readFile, stat, access } from 'node:fs/promises';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { plainText, root, deckModels, updateProfile, pageSet } from './config.js';
import { launch } from './process.js';
import { constants } from 'node:fs';
export const keyActions = {
    key_home: 'Home', key_end: 'End', key_page_up: 'Page_Up', key_page_down: 'Page_Down',
    key_left: 'Left', key_right: 'Right', key_up: 'Up', key_down: 'Down', key_enter: 'Return',
    key_escape: 'Escape', key_space: 'space', key_tab: 'Tab',
};
export const builtin = {
    folder_back: 'Back', page_next: 'Next Page', page_previous: 'Previous Page', page_first: 'First Page', page_last: 'Last Page', page_global_next: 'Next Page', page_global_previous: 'Previous Page', page_global_first: 'First Page', page_global_last: 'Last Page', none: 'Unassigned', terminal: 'Open Terminal', browser: 'Open Default Browser', files: 'Open Files',
    mic_mute: 'Mute Microphone', media_play_pause: 'Play / Pause', screenshot: 'Screenshot', lock: 'Lock Screen',
    workspace_prev: 'Previous Workspace', workspace_next: 'Next Workspace', overview: 'Workspace Overview',
    volume_down: 'Volume Down', volume_up: 'Volume Up', volume_mute: 'Mute Output', mic_down: 'Microphone Down', mic_up: 'Microphone Up',
    lights_toggle: 'Toggle Key Lights', lights_brightness_down: 'Key Lights Dimmer', lights_brightness_up: 'Key Lights Brighter',
    lights_warmer: 'Key Lights Warmer', lights_cooler: 'Key Lights Cooler', voxtype_push_to_talk: 'VOXtype Push-to-talk',
};
const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local/share');
const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(delimiter).filter(Boolean);
const appRoots = [...new Set([join(dataHome, 'applications'), join(dataHome, 'flatpak/exports/share/applications'), '/var/lib/flatpak/exports/share/applications', ...dataDirs.map(dir => join(dir, 'applications'))])];
const validID = (id) => /^[A-Za-z0-9_.+-]+$/.test(id);
export async function desktopEntry(id) {
    if (!validID(id))
        return null;
    for (const dir of appRoots) {
        try {
            const raw = await readFile(join(dir, id + '.desktop'), 'utf8');
            const section = raw.split('[Desktop Entry]')[1]?.split(/\n\[/)[0] || '';
            const values = {};
            for (const line of section.split('\n')) {
                const m = line.match(/^([A-Za-z]+)=(.*)$/);
                if (m)
                    values[m[1]] = m[2];
            }
            if (values.Hidden === 'true' || values.NoDisplay === 'true' || (values.Type && values.Type !== 'Application'))
                return null;
            return values;
        }
        catch { /* Check the next desktop directory. */ }
    }
    return null;
}
export async function applications() {
    const ids = new Set();
    for (const dir of appRoots) {
        try {
            for (const f of await readdir(dir))
                if (f.endsWith('.desktop'))
                    ids.add(f.slice(0, -8));
        }
        catch { }
    }
    const entries = await Promise.all([...ids].map(async (id) => ({ id, entry: await desktopEntry(id) })));
    return entries.filter(x => x.entry?.Name).sort((a, b) => a.entry.Name.localeCompare(b.entry.Name));
}
export async function validAction(action) {
    if (action.startsWith('ext:'))
        return !!await extensionAction(action);
    return /^(page|page_global|folder):[a-zA-Z0-9_-]+$/.test(action) || Object.hasOwn(builtin, action) || Object.hasOwn(keyActions, action) || (action.startsWith('app:') && !!await desktopEntry(action.slice(4)));
}
export async function actionLabel(action) {
    if (action.startsWith('ext:'))
        return (await extensionAction(action))?.label || action;
    return builtin[action] || keyActions[action]?.replaceAll('_', ' ') || (action.startsWith('app:') ? (await desktopEntry(action.slice(4)))?.Name : '') || action;
}
export async function actionIcon(action) {
    if (action.startsWith('ext:'))
        return (await extensionAction(action))?.icon || '';
    if (/^page_(?:global_)?(?:next|previous|first|last)$/.test(action) || action.startsWith('page:') || action.startsWith('page_global:'))
        return join(root, 'assets/keys/page.svg');
    if (action.startsWith('folder:'))
        return join(root, 'assets/keys/folder.svg');
    const path = join(root, 'assets/keys', action + '.svg');
    if (/^[a-z_]+$/.test(action)) {
        try {
            await stat(path);
            return path;
        }
        catch { }
    }
    if (!action.startsWith('app:'))
        return '';
    const icon = (await desktopEntry(action.slice(4)))?.Icon;
    if (!icon || icon.includes('..'))
        return '';
    if (icon.startsWith('/')) {
        try {
            if ((await stat(icon)).isFile())
                return icon;
        }
        catch { }
        return '';
    }
    if (!/^[A-Za-z0-9_.+-]+$/.test(icon))
        return '';
    for (const size of ['256x256', '128x128', 'scalable', '64x64', '48x48']) {
        for (const dir of [dataHome, ...dataDirs].map(dir => join(dir, 'icons/hicolor'))) {
            for (const ext of ['png', 'svg', 'xpm']) {
                const path = join(dir, size, 'apps', `${icon}.${ext}`);
                try {
                    await stat(path);
                    return path;
                }
                catch { }
            }
        }
    }
    return '';
}
// Encoder turns repeat on each detent; offer adjustments and navigation steps.
const dialTurnActions = new Set([
    'none', 'volume_down', 'volume_up', 'mic_down', 'mic_up',
    'lights_brightness_down', 'lights_brightness_up', 'lights_warmer', 'lights_cooler',
    'workspace_prev', 'workspace_next', 'page_next', 'page_previous',
    'page_global_next', 'page_global_previous',
    'key_left', 'key_right', 'key_up', 'key_down', 'key_page_up', 'key_page_down',
    'key_home', 'key_end', 'key_tab',
]);
export function actionControls(action) {
    return ['button', 'dialPress', ...(dialTurnActions.has(action) ? ['dialTurn'] : [])];
}
export async function catalog() {
    const actions = [...Object.entries(builtin), ...Object.entries(keyActions)].map(([value, label]) => ({ value, label: `${value.startsWith('key_') ? 'Key' : 'Function'} · ${label}` }));
    for (const { id, entry } of await applications())
        actions.push({ value: 'app:' + id, label: 'Application · ' + plainText(entry.Name) });
    const available = await Promise.all(actions.map(async (action) => {
        const executable = commandFor(action.value)?.[0];
        if (!executable)
            return action;
        for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
            try {
                await access(join(directory, executable), constants.X_OK);
                return action;
            }
            catch { }
        }
        return undefined;
    }));
    const base = await Promise.all(available.filter((action) => !!action).map(async (a) => ({ ...a, controls: actionControls(a.value), states: await actionStateOptions(a.value), icon: await actionIcon(a.value) })));
    return [...base, ...await Promise.all((await actionPacks()).actions.map(async (a) => ({ value: a.value, label: `${plainText(a.pack)} · ${plainText(a.label)}`, controls: a.controls, states: await actionStateOptions(a.value), icon: a.icon })))];
}
export async function setControl(kind, index, slot, action, model, pageId) {
    if (!await validAction(action))
        throw new Error('Unsupported action: ' + action);
    if (action.startsWith('ext:')) {
        const extension = await extensionAction(action);
        const control = kind === 'dials' ? slot === 'press' ? 'dialPress' : 'dialTurn' : 'button';
        if (!extension?.controls.includes(control))
            throw new Error('Action pack does not support this control');
    }
    await updateProfile(async (p) => {
        const target = model || (kind === 'classicKeys' ? 'classic' : 'plus');
        if ((action.startsWith('page:') || action.startsWith('page_global:')) && !pageSet(p, target).items.some(page => page.id === action.slice(action.indexOf(':') + 1) && !page.kind))
            throw new Error('Unknown target page');
        const set = pageSet(p, target), current = set.items.find(page => page.id === (pageId || set.active));
        if (action.startsWith('folder:') && !set.items.some(page => page.id === action.slice(7) && page.kind === 'folder'))
            throw new Error('Unknown target folder');
        if (kind !== 'dials' && current?.kind === 'folder' && index === 0 && action !== 'folder_back')
            throw new Error('First folder button is reserved for Back');
        const mappings = deviceMapping(p, target, pageId);
        if (!Number.isInteger(index) || index < 0 || index >= (kind === 'dials' ? mappings.dials : mappings.keys).length)
            throw new Error('Control index is out of range');
        if (kind === 'dials') {
            if (!['left', 'right', 'press'].includes(slot))
                throw new Error('Invalid dial slot');
            mappings.dials[index][slot] = action;
        }
        else {
            if (slot !== 'action')
                throw new Error('Invalid key slot');
            mappings.keys[index].action = action;
            mappings.keys[index].label = (action.startsWith('page:') || action.startsWith('page_global:')) ? 'Go to ' + pageSet(p, target).items.find(page => page.id === action.slice(action.indexOf(':') + 1)).name : action.startsWith('folder:') ? set.items.find(page => page.id === action.slice(7)).name : await actionLabel(action);
        }
    });
}
export function commandFor(action) {
    if (Object.hasOwn(keyActions, action))
        return ['wtype', '-k', keyActions[action]];
    if (action.startsWith('app:') && validID(action.slice(4)))
        return ['uwsm-app', '--', 'gtk-launch', action.slice(4)];
    const mic = '@DEFAULT_AUDIO_SOURCE@', sink = '@DEFAULT_AUDIO_SINK@';
    return {
        terminal: ['omarchy', 'launch', 'terminal'], browser: ['omarchy', 'launch', 'browser'], files: ['uwsm-app', '--', 'xdg-open', homedir()],
        mic_mute: ['wpctl', 'set-mute', mic, 'toggle'], mic_up: ['wpctl', 'set-volume', mic, '5%+'], mic_down: ['wpctl', 'set-volume', mic, '5%-'],
        volume_mute: ['wpctl', 'set-mute', sink, 'toggle'], volume_up: ['wpctl', 'set-volume', '-l', '1.5', sink, '5%+'], volume_down: ['wpctl', 'set-volume', sink, '5%-'],
        media_play_pause: ['omarchy-shell', 'media', 'playPause'], screenshot: ['omarchy', 'capture', 'screenshot'], lock: ['omarchy', 'system', 'lock'],
        workspace_next: ['hyprctl', 'dispatch', 'workspace', '+1'], workspace_prev: ['hyprctl', 'dispatch', 'workspace', '-1'],
        overview: ['hyprctl', 'dispatch', 'hyprexpo:expo', 'toggle'], voxtype_push_to_talk: ['voxtype', 'record', 'start'],
    }[action] || null;
}
export async function performCommand(action, release = false) {
    if (action === 'none' || !action)
        return;
    if (action.startsWith('ext:')) {
        const extension = await extensionAction(action);
        if (!extension)
            throw new Error('Action pack unavailable: ' + action);
        await executeExtension(extension, release);
        return;
    }
    if (!await validAction(action))
        throw new Error('Unsupported action: ' + action);
    const command = release ? (action === 'voxtype_push_to_talk' ? ['voxtype', 'record', 'stop'] : null) : commandFor(action);
    if (command)
        await launch(command);
}
export async function setButtonText(model, index, mode, text = '', pageId) {
    const control = deckModels.find(d => d.id === model)?.controls.find(c => c.type === 'button' && c.index === index);
    if (!control || control.type !== 'button' || control.feedbackType !== 'lcd')
        throw new Error('This button does not have an image display');
    if (!['automatic', 'hidden', 'custom'].includes(mode))
        throw new Error('Invalid text mode');
    if (text.length > 80 || /[\r\n\x00-\x1f]/.test(text))
        throw new Error('Text must be a single line of at most 80 characters');
    await updateProfile(async (profile) => {
        const key = deviceMapping(profile, model, pageId).keys[index];
        if (mode === 'hidden')
            key.displayMode = 'icon';
        else if (key.displayMode === 'icon')
            key.displayMode = 'icon-text';
        if (mode === 'automatic')
            delete key.displayText;
        else
            key.displayText = mode === 'hidden' ? '' : text;
    });
}
export async function setButtonDisplay(model, index, mode, pageId) {
    const control = deckModels.find(d => d.id === model)?.controls.find(c => c.type === 'button' && c.index === index);
    if (!control || control.type !== 'button' || control.feedbackType !== 'lcd')
        throw new Error('This button does not have an image display');
    if (!['text', 'icon-text', 'icon', 'color', 'color-text'].includes(mode))
        throw new Error('Invalid display mode');
    await updateProfile(async (profile) => {
        const key = deviceMapping(profile, model, pageId).keys[index];
        key.displayMode = mode;
        if (mode !== 'icon' && key.displayText === '')
            delete key.displayText;
    });
}
export async function setControlColor(model, index, target, hex, pageId) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex))
        throw new Error('Expected color #RRGGBB');
    if (!['button', 'text', 'dial'].includes(target))
        throw new Error('Invalid color target');
    const control = deckModels.find(d => d.id === model)?.controls.find(c => c.type === (target === 'dial' ? 'encoder' : 'button') && c.index === index);
    if (!control || (control.type === 'button' && (control.feedbackType === 'none' || (target === 'text' && control.feedbackType !== 'lcd'))) || (control.type === 'encoder' && !control.hasLed && !control.ledRingSteps))
        throw new Error('This control does not support that color');
    const color = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
    await updateProfile(async (p) => {
        const mapping = deviceMapping(p, model, pageId);
        if (target === 'dial')
            mapping.dials[index].color = color;
        else if (target === 'text')
            mapping.keys[index].textColor = color;
        else
            mapping.keys[index].color = color;
    });
}
export async function setDialDisplay(model, index, field, value, pageId) {
    const definition = deckModels.find(m => m.id === model);
    if (!Number.isInteger(index) || !definition?.controls.some(c => c.type === 'encoder' && c.index === index) || !definition.controls.some(c => c.type === 'lcd-segment'))
        throw new Error('This dial does not have an LCD display');
    if (!['mode', 'text', 'background', 'foreground', 'icon'].includes(field))
        throw new Error('Invalid display field');
    if (field === 'mode' && !['default', 'text', 'icon', 'icon-text', 'color', 'color-text'].includes(value))
        throw new Error('Invalid display mode');
    if (field === 'text' && (value.length > 80 || /[\r\n\x00-\x1f]/.test(value)))
        throw new Error('Invalid display text');
    if (['background', 'foreground'].includes(field) && !/^#[0-9a-fA-F]{6}$/.test(value))
        throw new Error('Expected #RRGGBB');
    const icon = field === 'icon' && value !== 'automatic' ? await iconPath(value) : '';
    await updateProfile(async (p) => {
        const dial = deviceMapping(p, model, pageId).dials[index];
        dial.display ||= { action: dial.press, label: dial.label };
        const display = dial.display;
        if (field === 'mode')
            display.displayMode = value === 'default' ? undefined : value;
        if (field === 'text')
            display.displayText = value;
        if (field === 'icon')
            display.icon = value === 'automatic' ? undefined : value.startsWith('preset:') ? value : icon;
        if (field === 'background' || field === 'foreground')
            display[field === 'background' ? 'color' : 'textColor'] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
    });
}
//# sourceMappingURL=actions.js.map