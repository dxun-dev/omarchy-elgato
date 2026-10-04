import { pathToFileURL } from 'node:url';
import { savedActionStates, statefulKey } from '../action-state.js';
import { setDialDisplay, setControlColor, setButtonText, setButtonDisplay, } from '../actions/appearance.js';
import { keyPreview, dialDisplayKey } from '../artwork.js';
import { profilePath } from '../paths.js';
import { deckModels } from '../devices/models.js';
import { deviceMapping } from '../profile/mapping.js';
import { setIcon, setStateIcon } from '../icons.js';
import { output } from './context.js';
export async function handleAppearance({ command, args, profile, pageId, }) {
    switch (command) {
        case 'button-previews': {
            if (args.length !== 1 || !deckModels.some((d) => d.id === args[0])) {
                throw new Error('Invalid preview model');
            }
            const states = await savedActionStates();
            output(await Promise.all(deviceMapping(profile, args[0], pageId).keys.map(async (key) => pathToFileURL(await keyPreview(await statefulKey(key, states[key.action]))).href)));
            break;
        }
        case 'set-dial-display': {
            if (args.length !== 4) {
                throw new Error('Expected MODEL INDEX FIELD VALUE');
            }
            await setDialDisplay(args[0], Number(args[1]) - 1, args[2], args[3], pageId);
            console.log(profilePath);
            break;
        }
        case 'dial-previews': {
            const mapping = deviceMapping(profile, args[0], pageId);
            const states = await savedActionStates();
            output(await Promise.all(mapping.dials.map(async (d) => d.display?.displayMode
                ? pathToFileURL(await keyPreview(await statefulKey(dialDisplayKey(d), states[d.press]), 200, 100, true)).href
                : '')));
            break;
        }
        case 'set-device-color': {
            if (args.length !== 4) {
                throw new Error('Expected MODEL INDEX TARGET #RRGGBB');
            }
            await setControlColor(args[0], Number(args[1]) - 1, args[2], args[3], pageId);
            console.log(profilePath);
            break;
        }
        case 'set-device-display': {
            if (args.length !== 3) {
                throw new Error('Expected MODEL INDEX MODE');
            }
            await setButtonDisplay(args[0], Number(args[1]) - 1, args[2], pageId);
            console.log(profilePath);
            break;
        }
        case 'set-device-text': {
            if (args.length !== (args[2] === 'custom' ? 4 : 3)) {
                throw new Error('Invalid text arguments');
            }
            await setButtonText(args[0], Number(args[1]) - 1, args[2], args[3], pageId);
            console.log(profilePath);
            break;
        }
        case 'set-state-icon': {
            if (args.length !== 5) {
                throw new Error('Expected MODEL INDEX button|dial STATE ICON');
            }
            await setStateIcon(args[0], Number(args[1]) - 1, args[2], args[3], args[4], pageId);
            console.log(profilePath);
            break;
        }
        case 'set-device-icon': {
            if (args.length !== 3) {
                throw new Error('Expected MODEL INDEX ICON');
            }
            await setIcon(args[0], Number(args[1]) - 1, args[2], pageId);
            console.log(profilePath);
            break;
        }
        default:
            return false;
    }
    return true;
}
//# sourceMappingURL=appearance.js.map