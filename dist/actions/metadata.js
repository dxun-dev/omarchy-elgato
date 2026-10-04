import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { desktopEntry, dataHome, dataDirs } from '../applications.js';
import { root } from '../paths.js';
import { extensionAction } from '../extensions.js';
import { builtin, keyActions } from './definitions.js';
export async function validAction(action) {
    if (action.startsWith('ext:')) {
        return !!(await extensionAction(action));
    }
    return (/^(page|page_global|folder):[a-zA-Z0-9_-]+$/.test(action) ||
        Object.hasOwn(builtin, action) ||
        Object.hasOwn(keyActions, action) ||
        (action.startsWith('app:') && !!(await desktopEntry(action.slice(4)))));
}
export async function actionLabel(action) {
    if (action.startsWith('ext:')) {
        return (await extensionAction(action))?.label || action;
    }
    return (builtin[action] ||
        keyActions[action]?.replaceAll('_', ' ') ||
        (action.startsWith('app:') ? (await desktopEntry(action.slice(4)))?.Name : '') ||
        action);
}
export async function actionIcon(action) {
    if (action.startsWith('ext:')) {
        return (await extensionAction(action))?.icon || '';
    }
    if (/^page_(?:global_)?(?:next|previous|first|last)$/.test(action) ||
        action.startsWith('page:') ||
        action.startsWith('page_global:')) {
        return join(root, 'assets/keys/page.svg');
    }
    if (action.startsWith('folder:')) {
        return join(root, 'assets/keys/folder.svg');
    }
    const path = join(root, 'assets/keys', action + '.svg');
    if (/^[a-z_]+$/.test(action)) {
        try {
            await stat(path);
            return path;
        }
        catch { }
    }
    if (!action.startsWith('app:')) {
        return '';
    }
    const icon = (await desktopEntry(action.slice(4)))?.Icon;
    if (!icon || icon.includes('..')) {
        return '';
    }
    if (icon.startsWith('/')) {
        try {
            if ((await stat(icon)).isFile()) {
                return icon;
            }
        }
        catch { }
        return '';
    }
    if (!/^[A-Za-z0-9_.+-]+$/.test(icon)) {
        return '';
    }
    for (const size of ['256x256', '128x128', 'scalable', '64x64', '48x48']) {
        for (const dir of [dataHome, ...dataDirs].map((dir) => join(dir, 'icons/hicolor'))) {
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
//# sourceMappingURL=metadata.js.map