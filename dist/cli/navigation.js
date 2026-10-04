import { loadProfile } from '../profile/store.js';
import { pageCommand, pageCatalog, createFolder, navigatePage } from '../pages.js';
import { output } from './context.js';
export async function handleNavigation({ command, args, profile, }) {
    switch (command) {
        case 'folder-create': {
            if (args.length !== 4) {
                throw new Error('Expected model, parent ID, button index and name');
            }
            await createFolder(args[0], args[1], Number(args[2]) - 1, args[3]);
            output((await loadProfile()).pages?.[args[0]]);
            break;
        }
        case 'folder-back': {
            if (args.length !== 1) {
                throw new Error('Expected model');
            }
            await navigatePage(args[0], 'folder_back');
            break;
        }
        case 'page': {
            const [model, operation, ...rest] = args;
            if (operation === 'add') {
                if (rest.length !== 1) {
                    throw new Error('Expected page name');
                }
                await pageCommand(model, operation, undefined, rest[0]);
            }
            else if (operation === 'rename' || operation === 'duplicate') {
                if (rest.length !== 2) {
                    throw new Error('Expected page ID and name');
                }
                await pageCommand(model, operation, rest[0], rest[1]);
            }
            else if (operation === 'select' || operation === 'delete') {
                if (rest.length !== 1) {
                    throw new Error('Expected page ID');
                }
                await pageCommand(model, operation, rest[0]);
            }
            else {
                throw new Error('Unknown page operation');
            }
            output((await loadProfile()).pages?.[model]);
            break;
        }
        case 'page-catalog': {
            if (args.length !== 1) {
                throw new Error('Expected model');
            }
            output(pageCatalog(profile, args[0]));
            break;
        }
        default:
            return false;
    }
    return true;
}
//# sourceMappingURL=navigation.js.map