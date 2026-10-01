import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';
const source = fileURLToPath(new URL('../',import.meta.url));
const runtime = process.env.OMARCHY_ELGATO_RUNTIME || (existsSync(join(source,'node_modules')) ? source : join(process.env.XDG_DATA_HOME || join(homedir(),'.local/share'),'omarchy-elgato/runtime'));
let failed = false;
function check(name, fn) {
  try { fn(); console.log('OK  '+name); }
  catch(error) { failed=true; console.error('FAIL '+name+': '+error.message); }
}
check('Node.js 22.18+',()=>{const [major,minor]=process.versions.node.split('.').map(Number);if(major<22||(major===22&&minor<18))throw new Error('Upgrade Node.js');});
check('Compiled backend',()=>{if(!existsSync(join(source,'dist/cli.js')))throw new Error('Run npm run build in the source checkout');});
for(const command of ['omarchy','omarchy-shell','magick','fc-match','flock']) {
  check(command,()=>{if(!(process.env.PATH||'').split(delimiter).some(p=>existsSync(join(p,command))))throw new Error('Install the package that provides '+command);});
}
check('Runtime modules',()=>{const require=createRequire(join(runtime,'package.json')); require('@elgato-stream-deck/node');require('node-hid').getHidapiVersion();require('@julusian/jpeg-turbo');});
check('Artwork font',()=>{if(process.env.OMARCHY_ELGATO_FONT){if(!existsSync(process.env.OMARCHY_ELGATO_FONT))throw new Error('Font override is missing');}else{const font=execFileSync('fc-match',['-f','%{file}','sans-serif'],{encoding:'utf8'}).trim();if(!font||!existsSync(font))throw new Error('Install a sans-serif font');}});
check('System requirements',()=>{try { execFileSync('bash',[join(source,'scripts/system-setup.sh'),'--check'],{encoding:'utf8'}); } catch(error) { throw new Error((error.stdout?.toString().trim() || error.message) + '\nRun bin/elgato-control install-requirements in a terminal.'); }});
console.log('Runtime: '+runtime);
process.exitCode=failed?1:0;
