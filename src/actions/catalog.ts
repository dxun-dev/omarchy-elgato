import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { actionStateOptions } from '../action-state.js';
import { applications } from '../applications.js';
import { plainText } from '../utils.js';
import { actionPacks } from '../extensions.js';
import { builtin, keyActions, actionControls } from './definitions.js';
import { actionIcon } from './metadata.js';
import { commandFor } from './execution.js';

export async function catalog() {
  const actions = [...Object.entries(builtin), ...Object.entries(keyActions)].map(
    ([value, label]) => ({
      value,
      label: `${value.startsWith('key_') ? 'Key' : 'Function'} · ${label}`,
    }),
  );
  for (const { id, entry } of await applications()) {
    actions.push({ value: 'app:' + id, label: 'Application · ' + plainText(entry!.Name) });
  }
  const available = await Promise.all(
    actions.map(async (action) => {
      const executable = commandFor(action.value)?.[0];
      if (!executable) {
        return action;
      }
      for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
        try {
          await access(join(directory, executable), constants.X_OK);
          return action;
        } catch {}
      }
      return undefined;
    }),
  );
  const base = await Promise.all(
    available
      .filter((action): action is (typeof actions)[number] => !!action)
      .map(async (a) => ({
        ...a,
        controls: actionControls(a.value),
        states: await actionStateOptions(a.value),
        icon: await actionIcon(a.value),
      })),
  );
  return [
    ...base,
    ...(await Promise.all(
      (await actionPacks()).actions.map(async (a) => ({
        value: a.value,
        label: `${plainText(a.pack)} · ${plainText(a.label)}`,
        controls: a.controls,
        states: await actionStateOptions(a.value),
        icon: a.icon,
      })),
    )),
  ];
}
