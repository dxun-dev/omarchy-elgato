import { loadProfile } from '../profile/store.js';
import { deckModels } from '../devices/models.js';
import { loadStatus } from '../status.js';
import { output } from './context.js';
import { help } from './help.js';
import { handleNavigation } from './navigation.js';
import { handleAppearance } from './appearance.js';
import { handleMapping } from './mapping.js';
import { handleInformation } from './information.js';
import { handleLights } from './lights.js';
export async function runCli(argv = process.argv.slice(2)) {
    const [command, ...args] = argv;
    if (!command || command === '--help' || command === '-h') {
        console.log(help);
        return;
    }
    if (command === 'models') {
        output(deckModels);
        return;
    }
    if (command === 'daemon') {
        if (args.some((a) => a !== '--no-hardware')) {
            throw new Error('Unknown daemon option');
        }
        const { Daemon } = await import('../daemon.js');
        await new Daemon(args.includes('--no-hardware')).start();
        return;
    }
    if (command === 'devices') {
        const { streamDeck } = await import('../library.js');
        const { deviceKind } = await import('../daemon.js');
        output((await streamDeck.listStreamDecks()).filter((d) => deviceKind(d.model)));
        return;
    }
    if (command === 'status') {
        const status = await loadStatus();
        output(status);
        return;
    }
    let pageId;
    const pageOption = args.indexOf('--page');
    if (pageOption >= 0) {
        pageId = args[pageOption + 1];
        if (!pageId) {
            throw new Error('Missing page ID');
        }
        args.splice(pageOption, 2);
    }
    const profile = await loadProfile();
    const context = { command, args, profile, pageId };
    for (const handler of [
        handleNavigation,
        handleAppearance,
        handleMapping,
        handleInformation,
        handleLights,
    ]) {
        if (await handler(context))
            return;
    }
    throw new Error('Unknown command: ' + command);
}
//# sourceMappingURL=run.js.map