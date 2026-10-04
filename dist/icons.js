import { mkdir, readdir, stat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, extname, basename, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { actionStateOptions } from './action-state.js';
import { actionIcon } from './actions/metadata.js';
import { configDir, root } from './paths.js';
import { updateProfile } from './profile/store.js';
import { deviceMapping } from './profile/mapping.js';
import { deckModels } from './devices/models.js';
export const iconsDir = join(configDir, 'icons');
const bundledDir = join(root, 'assets/keys');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
export async function iconPath(value) {
    let path;
    if (value.startsWith('preset:')) {
        const name = value.slice(7);
        if (!name || basename(name) !== name || name.includes('..')) {
            throw new Error('Invalid preset icon');
        }
        // Preserve existing profiles that selected one of the original JPEG presets.
        path = join(bundledDir, name.replace(/\.jpg$/i, '.svg'));
    }
    else {
        path = value.startsWith('~/') ? join(homedir(), value.slice(2)) : value;
        if (!isAbsolute(path)) {
            throw new Error('Custom icon must be an absolute path or start with ~/');
        }
    }
    if (!imageExtensions.has(extname(path).toLowerCase())) {
        throw new Error('Use a PNG, JPG, JPEG, WebP, or SVG image');
    }
    const canonical = await realpath(path);
    const info = await stat(canonical);
    if (!info.isFile() || info.size > 20 * 1024 * 1024) {
        throw new Error('Icon must be an image file smaller than 20 MB');
    }
    return canonical;
}
export async function iconCatalog() {
    await mkdir(iconsDir, { recursive: true });
    const icons = [];
    async function scan(dir, preset) {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        }
        catch {
            return;
        } // A pack may be removed or unreadable while refreshing.
        for (const entry of entries) {
            const file = join(dir, entry.name);
            if (entry.isDirectory() && !preset) {
                await scan(file, false);
                continue;
            }
            // Do not follow directory symlinks: packs cannot introduce traversal cycles.
            if (!entry.isFile() || !imageExtensions.has(extname(entry.name).toLowerCase())) {
                continue;
            }
            const value = preset ? 'preset:' + entry.name : file;
            try {
                const path = await iconPath(value);
                const info = await stat(path);
                const pack = preset ? '' : relative(iconsDir, dirname(file));
                icons.push({
                    value,
                    label: entry.name,
                    group: preset ? 'Preset' : pack || 'Custom',
                    path,
                    url: pathToFileURL(path).href + '?v=' + info.mtimeMs,
                });
            }
            catch {
                /* Ignore removed or oversized files during directory refresh. */
            }
        }
    }
    await scan(bundledDir, true);
    await scan(iconsDir, false);
    return {
        directory: iconsDir,
        icons: icons.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label)),
    };
}
export async function keyIcon(key) {
    if (key.icon) {
        try {
            return await iconPath(key.icon);
        }
        catch { }
    }
    return actionIcon(key.action);
}
export async function iconSignature(keys) {
    return JSON.stringify(await Promise.all(keys
        .flatMap((k) => [k.icon, ...Object.values(k.stateIcons || {})].filter((icon) => !!icon))
        .map(async (icon) => {
        try {
            const path = await iconPath(icon);
            const info = await stat(path);
            return [path, info.mtimeMs, info.size];
        }
        catch {
            return [icon, 'missing'];
        }
    })));
}
export async function setIcon(model, index, value, pageId) {
    const definition = deckModels.find((d) => d.id === model);
    const control = definition?.controls.find((c) => c.type === 'button' && c.index === index);
    if (!control || control.type !== 'button' || control.feedbackType !== 'lcd') {
        throw new Error('This button does not have an image display');
    }
    await updateProfile(async (profile) => {
        const key = deviceMapping(profile, model, pageId).keys[index];
        if (!Number.isInteger(index) || !key) {
            throw new Error('Control index is out of range');
        }
        if (value === 'automatic') {
            delete key.icon;
        }
        else {
            const path = await iconPath(value);
            key.icon = value.startsWith('preset:') ? 'preset:' + basename(path) : path;
        }
    });
}
export async function setStateIcon(model, index, kind, state, value, pageId) {
    const definition = deckModels.find((m) => m.id === model);
    const control = definition?.controls.find((c) => c.type === (kind === 'dial' ? 'encoder' : 'button') && c.index === index);
    if (!Number.isInteger(index) ||
        !['button', 'dial'].includes(kind) ||
        !control ||
        (control.type === 'button' && control.feedbackType !== 'lcd') ||
        (control.type === 'encoder' && !definition?.controls.some((c) => c.type === 'lcd-segment'))) {
        throw new Error('This control does not have an image display');
    }
    const icon = value === 'automatic' ? undefined : await iconPath(value);
    await updateProfile(async (p) => {
        const mapping = deviceMapping(p, model, pageId);
        const action = kind === 'dial' ? mapping.dials[index].press : mapping.keys[index].action;
        if (!(await actionStateOptions(action)).some((s) => s.value === state)) {
            throw new Error('Action does not declare that state');
        }
        const key = kind === 'dial'
            ? (mapping.dials[index].display ||= { action, label: mapping.dials[index].label })
            : mapping.keys[index];
        if (key.stateAction !== action) {
            key.stateIcons = {};
        }
        key.stateAction = action;
        key.stateIcons ||= {};
        if (!icon) {
            delete key.stateIcons[state];
        }
        else {
            key.stateIcons[state] = value.startsWith('preset:') ? 'preset:' + basename(icon) : icon;
        }
    });
}
//# sourceMappingURL=icons.js.map