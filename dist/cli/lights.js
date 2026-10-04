import { availableLights, controlLights, lightStates } from '../lights.js';
import { output } from './context.js';
export async function handleLights({ command, args }) {
    switch (command) {
        case 'lights': {
            const action = args.shift();
            if (!action ||
                !['on', 'off', 'toggle', 'brightness', 'temperature', 'refresh'].includes(action)) {
                throw new Error('Unsupported light action');
            }
            let target = 'all';
            let value;
            while (args.length) {
                const option = args.shift();
                const argument = args.shift();
                if (argument === undefined) {
                    throw new Error('Missing option value');
                }
                if (option === '--target') {
                    target = argument;
                }
                else if (option === '--value') {
                    value = Number(argument);
                }
                else {
                    throw new Error('Unknown light option: ' + option);
                }
            }
            output(action === 'refresh'
                ? await lightStates(await availableLights())
                : await controlLights(target, action, value));
            break;
        }
        default:
            return false;
    }
    return true;
}
//# sourceMappingURL=lights.js.map