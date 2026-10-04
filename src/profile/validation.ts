import { deckModels } from '../devices/models.js';
import { legacyMapping, pageSet } from './mapping.js';
import type { Profile, Key, Dial } from './types.js';

export function validRGB(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)
  );
}

export function validStateIcons(key: Key) {
  if (
    key.stateAction !== undefined &&
    (typeof key.stateAction !== 'string' || key.stateAction.length > 200)
  ) {
    return false;
  }
  if (key.stateIcons === undefined) {
    return true;
  }
  return (
    typeof key.stateAction === 'string' &&
    !!key.stateIcons &&
    typeof key.stateIcons === 'object' &&
    !Array.isArray(key.stateIcons) &&
    Object.keys(key.stateIcons).length <= 17 &&
    Object.entries(key.stateIcons).every(
      ([state, icon]) =>
        /^[a-z][a-z0-9_-]{0,31}$/.test(state) &&
        typeof icon === 'string' &&
        icon.length <= 4096 &&
        !icon.includes('\0'),
    )
  );
}

function validateDialDisplay(d: Dial) {
  const k = d.display;
  if (!k) {
    return;
  }
  if (
    typeof k !== 'object' ||
    !validStateIcons(k) ||
    typeof k.label !== 'string' ||
    typeof k.action !== 'string' ||
    !validStateIcons(k) ||
    (k.displayMode !== undefined &&
      !['text', 'icon', 'icon-text', 'color', 'color-text'].includes(k.displayMode)) ||
    (k.icon !== undefined && typeof k.icon !== 'string') ||
    (k.displayText !== undefined &&
      (typeof k.displayText !== 'string' ||
        k.displayText.length > 80 ||
        /[\r\n\x00-\x1f]/.test(k.displayText))) ||
    (k.color !== undefined && !validRGB(k.color)) ||
    (k.textColor !== undefined && !validRGB(k.textColor))
  ) {
    throw new Error('Invalid dial display');
  }
}

export function validateProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') {
    throw new Error('Profile must be an object');
  }
  const p = value as Profile;
  if (
    typeof p.name !== 'string' ||
    !Number.isInteger(p.brightness) ||
    p.brightness < 0 ||
    p.brightness > 100
  ) {
    throw new Error('Invalid profile name or brightness');
  }
  for (const [kind, count] of [
    ['keys', 8],
    ['classicKeys', 15],
  ] as const) {
    if (!Array.isArray(p[kind]) || p[kind].length !== count) {
      throw new Error(`${kind} must contain ${count} keys`);
    }
    for (const key of p[kind]) {
      if (!validStateIcons(key)) {
        throw new Error('Invalid state icons');
      }
      if (typeof key.label !== 'string' || typeof key.action !== 'string') {
        throw new Error(`Invalid ${kind} mapping`);
      }
      if (key.textColor !== undefined && !validRGB(key.textColor)) {
        throw new Error('Invalid text color');
      }
      if (
        key.color &&
        (key.color.length !== 3 || key.color.some((v) => !Number.isInteger(v) || v < 0 || v > 255))
      ) {
        throw new Error('Invalid RGB color');
      }
    }
  }
  if (
    !Array.isArray(p.dials) ||
    p.dials.length !== 4 ||
    p.dials.some((d) =>
      ['label', 'left', 'press', 'right'].some((k) => typeof d[k as keyof Dial] !== 'string'),
    )
  ) {
    throw new Error('Four dial mappings are required');
  }
  if (
    !Array.isArray(p.lights) ||
    p.lights.some(
      (l) =>
        typeof l.host !== 'string' ||
        typeof l.name !== 'string' ||
        !Number.isInteger(l.port) ||
        l.port < 1 ||
        l.port > 65535,
    )
  ) {
    throw new Error('Invalid light configuration');
  }
  if (
    p.devices !== undefined &&
    (!p.devices || typeof p.devices !== 'object' || Array.isArray(p.devices))
  ) {
    throw new Error('Invalid device mappings');
  }
  for (const model of deckModels) {
    const mapping = legacyMapping(p, model.id);
    const buttons = model.controls.filter((c) => c.type === 'button').length;
    const encoders = model.controls.filter((c) => c.type === 'encoder').length;
    if (
      !mapping ||
      !Array.isArray(mapping.keys) ||
      mapping.keys.length !== buttons ||
      !Array.isArray(mapping.dials) ||
      mapping.dials.length !== encoders
    ) {
      throw new Error('Invalid mappings for ' + model.id);
    }
    if (
      mapping.keys.some(
        (k) =>
          !k ||
          typeof k.label !== 'string' ||
          typeof k.action !== 'string' ||
          !validStateIcons(k) ||
          (k.textColor !== undefined && !validRGB(k.textColor)) ||
          (k.displayMode !== undefined &&
            !['text', 'icon-text', 'icon', 'color', 'color-text'].includes(k.displayMode)) ||
          (k.icon !== undefined && typeof k.icon !== 'string') ||
          (k.displayText !== undefined &&
            (typeof k.displayText !== 'string' ||
              k.displayText.length > 80 ||
              /[\r\n\x00-\x1f]/.test(k.displayText))) ||
          (k.color !== undefined &&
            (!Array.isArray(k.color) ||
              k.color.length !== 3 ||
              k.color.some((v) => !Number.isInteger(v) || v < 0 || v > 255))),
      )
    ) {
      throw new Error('Invalid key mapping');
    }
    if (
      mapping.dials.some(
        (d) =>
          !d ||
          (d.color !== undefined && !validRGB(d.color)) ||
          ['label', 'left', 'press', 'right'].some((k) => typeof d[k as keyof Dial] !== 'string'),
      )
    ) {
      throw new Error('Invalid dial mapping');
    }
    mapping.dials.forEach(validateDialDisplay);
    if (
      p.pages !== undefined &&
      (!p.pages || typeof p.pages !== 'object' || Array.isArray(p.pages))
    ) {
      throw new Error('Invalid page configuration');
    }
    const set = pageSet(p, model.id);
    if (
      !set ||
      !Array.isArray(set.items) ||
      !set.items.length ||
      set.items.length > 50 ||
      typeof set.active !== 'string'
    ) {
      throw new Error('Invalid pages');
    }
    const ids = new Set<string>();
    for (const page of set.items) {
      if (
        !page ||
        typeof page.id !== 'string' ||
        !/^[a-zA-Z0-9_-]+$/.test(page.id) ||
        ids.has(page.id) ||
        typeof page.name !== 'string' ||
        !page.name.trim() ||
        page.name.length > 60 ||
        /[\r\n\x00-\x1f]/.test(page.name)
      ) {
        throw new Error('Invalid page identity');
      }
      ids.add(page.id);
      if (page === set.items[0]) {
        page.keys = mapping.keys;
        page.dials = mapping.dials;
      }
      if (
        !Array.isArray(page.keys) ||
        page.keys.length !== buttons ||
        !Array.isArray(page.dials) ||
        page.dials.length !== encoders
      ) {
        throw new Error('Invalid page mapping counts');
      }
      const pageMapping = page;
      if (
        pageMapping.keys.some(
          (k) =>
            !k ||
            typeof k.label !== 'string' ||
            typeof k.action !== 'string' ||
            !validStateIcons(k) ||
            (k.textColor !== undefined && !validRGB(k.textColor)) ||
            (k.displayMode !== undefined &&
              !['text', 'icon-text', 'icon', 'color', 'color-text'].includes(k.displayMode)) ||
            (k.icon !== undefined && typeof k.icon !== 'string') ||
            (k.displayText !== undefined &&
              (typeof k.displayText !== 'string' ||
                k.displayText.length > 80 ||
                /[\r\n\x00-\x1f]/.test(k.displayText))) ||
            (k.color !== undefined &&
              (!Array.isArray(k.color) ||
                k.color.length !== 3 ||
                k.color.some((v) => !Number.isInteger(v) || v < 0 || v > 255))),
        )
      ) {
        throw new Error('Invalid page key mapping');
      }
      pageMapping.dials.forEach(validateDialDisplay);
      if (
        pageMapping.dials.some(
          (d) =>
            !d ||
            (d.color !== undefined && !validRGB(d.color)) ||
            ['label', 'left', 'press', 'right'].some((k) => typeof d[k as keyof Dial] !== 'string'),
        )
      ) {
        throw new Error('Invalid page dial mapping');
      }
    }
    if (set.items[0].kind === 'folder' || !set.items.some((p) => !p.kind)) {
      throw new Error('Keep a main page');
    }
    for (const page of set.items) {
      if (page.kind !== undefined && page.kind !== 'folder') {
        throw new Error('Invalid page kind');
      }
      if (page.kind === 'folder' && page.keys[0]?.action !== 'folder_back') {
        throw new Error('Folder first button must be Back');
      }
    }
    if (
      set.history !== undefined &&
      (!Array.isArray(set.history) ||
        set.history.length > 32 ||
        set.history.some((id) => !ids.has(id)))
    ) {
      throw new Error('Invalid folder history');
    }
    if (!ids.has(set.active)) {
      throw new Error('Unknown active page');
    }
  }

  return p;
}
