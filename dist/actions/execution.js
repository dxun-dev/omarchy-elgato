import { homedir } from 'node:os';
import { validID } from '../applications.js';
import { extensionAction, executeExtension } from '../extensions.js';
import { launch } from '../process.js';
import { keyActions } from './definitions.js';
import { validAction } from './metadata.js';
export function commandFor(action) {
    if (Object.hasOwn(keyActions, action)) {
        return ['wtype', '-k', keyActions[action]];
    }
    if (action.startsWith('app:') && validID(action.slice(4))) {
        return ['uwsm-app', '--', 'gtk-launch', action.slice(4)];
    }
    const mic = '@DEFAULT_AUDIO_SOURCE@';
    const sink = '@DEFAULT_AUDIO_SINK@';
    return ({
        terminal: ['omarchy', 'launch', 'terminal'],
        browser: ['omarchy', 'launch', 'browser'],
        files: ['uwsm-app', '--', 'xdg-open', homedir()],
        mic_mute: ['wpctl', 'set-mute', mic, 'toggle'],
        mic_up: ['wpctl', 'set-volume', mic, '5%+'],
        mic_down: ['wpctl', 'set-volume', mic, '5%-'],
        volume_mute: ['wpctl', 'set-mute', sink, 'toggle'],
        volume_up: ['wpctl', 'set-volume', '-l', '1.5', sink, '5%+'],
        volume_down: ['wpctl', 'set-volume', sink, '5%-'],
        media_play_pause: ['omarchy-shell', 'media', 'playPause'],
        screenshot: ['omarchy', 'capture', 'screenshot'],
        lock: ['omarchy', 'system', 'lock'],
        workspace_next: ['hyprctl', 'dispatch', 'workspace', '+1'],
        workspace_prev: ['hyprctl', 'dispatch', 'workspace', '-1'],
        overview: ['hyprctl', 'dispatch', 'hyprexpo:expo', 'toggle'],
        voxtype_push_to_talk: ['voxtype', 'record', 'start'],
    }[action] || null);
}
export async function performCommand(action, release = false) {
    if (action === 'none' || !action) {
        return;
    }
    if (action.startsWith('ext:')) {
        const extension = await extensionAction(action);
        if (!extension) {
            throw new Error('Action pack unavailable: ' + action);
        }
        await executeExtension(extension, release);
        return;
    }
    if (!(await validAction(action))) {
        throw new Error('Unsupported action: ' + action);
    }
    const command = release
        ? action === 'voxtype_push_to_talk'
            ? ['voxtype', 'record', 'stop']
            : null
        : commandFor(action);
    if (command) {
        await launch(command);
    }
}
//# sourceMappingURL=execution.js.map