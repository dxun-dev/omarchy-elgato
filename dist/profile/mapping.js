import { deckModels } from '../devices/models.js';
export function legacyMapping(p, kind) {
    if (kind === 'plus') {
        return { keys: p.keys, dials: p.dials };
    }
    if (kind === 'classic') {
        return { keys: p.classicKeys, dials: [] };
    }
    const model = deckModels.find((m) => m.id === kind);
    if (!model) {
        throw new Error('Unsupported device model: ' + kind);
    }
    p.devices ||= {};
    if (!Object.hasOwn(p.devices, kind)) {
        const keys = model.controls.filter((c) => c.type === 'button');
        const dials = model.controls.filter((c) => c.type === 'encoder');
        p.devices[kind] = {
            keys: keys.map((_, i) => kind === 'pedal'
                ? { label: 'Unassigned', action: 'none' }
                : structuredClone(p.keys[i] || { label: 'Unassigned', action: 'none' })),
            dials: dials.map((_, i) => structuredClone(p.dials[i] || { label: 'Unassigned', left: 'none', right: 'none', press: 'none' })),
        };
    }
    return p.devices[kind];
}
export function pageSet(p, kind) {
    const base = legacyMapping(p, kind);
    p.pages ||= {};
    if (!Object.hasOwn(p.pages, kind)) {
        p.pages[kind] = { active: 'page-1', items: [{ id: 'page-1', name: 'Page 1', ...base }] };
    }
    return p.pages[kind];
}
export function deviceMapping(p, kind, pageId) {
    const set = p.pages?.[kind];
    if (!set) {
        return legacyMapping(p, kind);
    }
    const id = pageId || set.active;
    if (id === set.items[0]?.id) {
        return legacyMapping(p, kind);
    }
    const page = set.items.find((p) => p.id === id);
    if (!page) {
        throw new Error('Unknown page: ' + id);
    }
    return page;
}
//# sourceMappingURL=mapping.js.map