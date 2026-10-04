import { runCli } from './cli/run.js';

runCli().catch((error) => {
  console.error(`omarchy-elgato: ${error.message || error}`);
  process.exitCode = 1;
});
