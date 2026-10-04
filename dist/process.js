import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export async function run(file, args, timeout = 3000) {
    const result = await exec(file, args, { timeout, maxBuffer: 8 * 1024 * 1024 });
    return result.stdout;
}
export async function launch(args) {
    const child = spawn(args[0], args.slice(1), { detached: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
    });
    child.unref();
}
//# sourceMappingURL=process.js.map