import { setControl } from '../actions/mapping.js';
import { profilePath } from '../paths.js';
import { deckModels } from '../devices/models.js';
import { type CommandContext } from './context.js';

export async function handleMapping({ command, args, pageId }: CommandContext): Promise<boolean> {
  switch (command) {
    case 'set-device-key':
    case 'set-device-dial': {
      const dial = command === 'set-device-dial';
      const model = args.shift();
      if (!deckModels.some((m) => m.id === model) || args.length !== (dial ? 3 : 2)) {
        throw new Error('Invalid device mapping arguments');
      }
      await setControl(
        dial ? 'dials' : 'keys',
        Number(args[0]) - 1,
        dial ? args[1] : 'action',
        dial ? args[2] : args[1],
        model,
        pageId,
      );
      console.log(profilePath);
      break;
    }
    case 'set-key':
    case 'set-classic-key':
    case 'set-dial': {
      const dial = command === 'set-dial';
      if (args.length !== (dial ? 3 : 2)) {
        throw new Error('Incorrect mapping arguments');
      }
      const kind = dial ? 'dials' : command === 'set-key' ? 'keys' : 'classicKeys';
      await setControl(
        kind,
        Number(args[0]) - 1,
        dial ? args[1] : 'action',
        dial ? args[2] : args[1],
      );
      console.log(profilePath);
      break;
    }
    default:
      return false;
  }
  return true;
}
