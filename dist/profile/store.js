import { mkdir, readFile, copyFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { configDir, profilePath, root } from '../paths.js';
import { atomicJSON } from '../atomic-json.js';
import { validateProfile } from './validation.js';
async function ensureProfileUnlocked() {
    await mkdir(configDir, { recursive: true });
    try {
        await stat(profilePath);
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            throw error;
        }
        await atomicJSON(profilePath, JSON.parse(await readFile(join(root, 'defaults/profile.json'), 'utf8')));
    }
}
async function loadProfileUnlocked() {
    await ensureProfileUnlocked();
    const raw = JSON.parse(await readFile(profilePath, 'utf8'));
    const before = JSON.stringify(raw);
    if (raw.pages === undefined) {
        try {
            await copyFile(profilePath, join(configDir, 'profile.before-pages.json'), 1);
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }
    const profile = validateProfile(raw);
    // Persist newly initialized model mappings once so later Plus edits stay independent.
    if (JSON.stringify(profile) !== before) {
        await atomicJSON(profilePath, profile);
    }
    return profile;
}
async function withProfileLock(operation) {
    await mkdir(configDir, { recursive: true });
    const lock = join(configDir, 'profile.lock');
    let acquired = false;
    for (let attempt = 0; attempt < 200; attempt++) {
        try {
            await mkdir(lock);
            acquired = true;
            break;
        }
        catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
            try {
                if (Date.now() - (await stat(lock)).mtimeMs > 30000) {
                    await rm(lock, { recursive: true, force: true });
                }
            }
            catch { }
            await sleep(25);
        }
    }
    if (!acquired) {
        throw new Error('Profile is busy; try again');
    }
    try {
        return await operation();
    }
    finally {
        await rm(lock, { recursive: true, force: true });
    }
}
// Initialization, migrations, and user edits share one cross-process lock.
export async function ensureProfile() {
    return withProfileLock(ensureProfileUnlocked);
}
export async function loadProfile() {
    return withProfileLock(loadProfileUnlocked);
}
export async function updateProfile(edit) {
    return withProfileLock(async () => {
        const profile = await loadProfileUnlocked();
        await edit(profile);
        validateProfile(profile);
        await atomicJSON(profilePath, profile);
    });
}
//# sourceMappingURL=store.js.map