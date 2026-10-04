import { availableLights, controlLights, lightStates } from '../lights.js';
import { output, type CommandContext } from './context.js';

export async function handleLights({ command, args }: CommandContext): Promise<boolean> {
  switch (command) {
    case 'lights': {
      const action = args.shift();
      if (
        !action ||
        !['on', 'off', 'toggle', 'brightness', 'temperature', 'refresh'].includes(action)
      ) {
        throw new Error('Unsupported light action');
      }
      let target = 'all';
      let value: number | undefined;
      while (args.length) {
        const option = args.shift();
        const argument = args.shift();
        if (argument === undefined) {
          throw new Error('Missing option value');
        }
        if (option === '--target') {
          target = argument;
        } else if (option === '--value') {
          value = Number(argument);
        } else {
          throw new Error('Unknown light option: ' + option);
        }
      }
      output(
        action === 'refresh'
          ? await lightStates(await availableLights())
          : await controlLights(target, action, value),
      );
      break;
    }
    default:
      return false;
  }
  return true;
}
