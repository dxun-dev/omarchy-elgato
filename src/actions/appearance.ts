import { deckModels } from '../devices/models.js';
import { deviceMapping } from '../profile/mapping.js';
import { updateProfile } from '../profile/store.js';
import type { Key } from '../profile/types.js';
import { iconPath } from '../icons.js';

export async function setButtonText(
  model: string,
  index: number,
  mode: string,
  text = '',
  pageId?: string,
) {
  const control = deckModels
    .find((d) => d.id === model)
    ?.controls.find((c) => c.type === 'button' && c.index === index);
  if (!control || control.type !== 'button' || control.feedbackType !== 'lcd') {
    throw new Error('This button does not have an image display');
  }
  if (!['automatic', 'hidden', 'custom'].includes(mode)) {
    throw new Error('Invalid text mode');
  }
  if (text.length > 80 || /[\r\n\x00-\x1f]/.test(text)) {
    throw new Error('Text must be a single line of at most 80 characters');
  }
  await updateProfile(async (profile) => {
    const key = deviceMapping(profile, model, pageId).keys[index];
    if (mode === 'hidden') {
      key.displayMode = 'icon';
    } else if (key.displayMode === 'icon') {
      key.displayMode = 'icon-text';
    }
    if (mode === 'automatic') {
      delete key.displayText;
    } else {
      key.displayText = mode === 'hidden' ? '' : text;
    }
  });
}

export async function setButtonDisplay(
  model: string,
  index: number,
  mode: string,
  pageId?: string,
) {
  const control = deckModels
    .find((d) => d.id === model)
    ?.controls.find((c) => c.type === 'button' && c.index === index);
  if (!control || control.type !== 'button' || control.feedbackType !== 'lcd') {
    throw new Error('This button does not have an image display');
  }
  if (!['text', 'icon-text', 'icon', 'color', 'color-text'].includes(mode)) {
    throw new Error('Invalid display mode');
  }
  await updateProfile(async (profile) => {
    const key = deviceMapping(profile, model, pageId).keys[index];
    key.displayMode = mode as 'text' | 'icon-text' | 'icon';
    if (mode !== 'icon' && key.displayText === '') {
      delete key.displayText;
    }
  });
}

export async function setControlColor(
  model: string,
  index: number,
  target: string,
  hex: string,
  pageId?: string,
) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error('Expected color #RRGGBB');
  }
  if (!['button', 'text', 'dial'].includes(target)) {
    throw new Error('Invalid color target');
  }
  const control = deckModels
    .find((d) => d.id === model)
    ?.controls.find(
      (c) => c.type === (target === 'dial' ? 'encoder' : 'button') && c.index === index,
    );
  if (
    !control ||
    (control.type === 'button' &&
      (control.feedbackType === 'none' || (target === 'text' && control.feedbackType !== 'lcd'))) ||
    (control.type === 'encoder' && !control.hasLed && !control.ledRingSteps)
  ) {
    throw new Error('This control does not support that color');
  }
  const color = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  await updateProfile(async (p) => {
    const mapping = deviceMapping(p, model, pageId);
    if (target === 'dial') {
      mapping.dials[index].color = color;
    } else if (target === 'text') {
      mapping.keys[index].textColor = color;
    } else {
      mapping.keys[index].color = color;
    }
  });
}

export async function setDialDisplay(
  model: string,
  index: number,
  field: string,
  value: string,
  pageId?: string,
) {
  const definition = deckModels.find((m) => m.id === model);
  if (
    !Number.isInteger(index) ||
    !definition?.controls.some((c) => c.type === 'encoder' && c.index === index) ||
    !definition.controls.some((c) => c.type === 'lcd-segment')
  ) {
    throw new Error('This dial does not have an LCD display');
  }
  if (!['mode', 'text', 'background', 'foreground', 'icon'].includes(field)) {
    throw new Error('Invalid display field');
  }
  if (
    field === 'mode' &&
    !['default', 'text', 'icon', 'icon-text', 'color', 'color-text'].includes(value)
  ) {
    throw new Error('Invalid display mode');
  }
  if (field === 'text' && (value.length > 80 || /[\r\n\x00-\x1f]/.test(value))) {
    throw new Error('Invalid display text');
  }
  if (['background', 'foreground'].includes(field) && !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error('Expected #RRGGBB');
  }
  const icon = field === 'icon' && value !== 'automatic' ? await iconPath(value) : '';
  await updateProfile(async (p) => {
    const dial = deviceMapping(p, model, pageId).dials[index];
    dial.display ||= { action: dial.press, label: dial.label };
    const display = dial.display;
    if (field === 'mode') {
      display.displayMode = value === 'default' ? undefined : (value as Key['displayMode']);
    }
    if (field === 'text') {
      display.displayText = value;
    }
    if (field === 'icon') {
      display.icon = value === 'automatic' ? undefined : value.startsWith('preset:') ? value : icon;
    }
    if (field === 'background' || field === 'foreground') {
      display[field === 'background' ? 'color' : 'textColor'] = [1, 3, 5].map((i) =>
        parseInt(value.slice(i, i + 2), 16),
      );
    }
  });
}
