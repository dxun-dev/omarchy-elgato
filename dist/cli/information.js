import { iconCatalog } from '../icons.js';
import { catalog } from '../actions/catalog.js';
import { profilePath } from '../paths.js';
import { actionPacks } from '../extensions.js';
import { output } from './context.js';
export async function handleInformation({ command, profile }) {
    switch (command) {
        case 'init':
            console.log(profilePath);
            break;
        case 'profile':
            output(profile);
            break;
        case 'action-packs':
            output({
                directory: (await import('../extensions.js')).actionsDir,
                packs: (await actionPacks(true)).packs,
            });
            break;
        case 'icons':
            output(await iconCatalog());
            break;
        case 'catalog':
            output(await catalog());
            break;
        default:
            return false;
    }
    return true;
}
//# sourceMappingURL=information.js.map