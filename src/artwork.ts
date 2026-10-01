import { keyIcon } from './icons.js';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { actionLabel } from './actions.js';
import { cacheDir, type Key, type Dial, type Profile, type LightState } from './config.js';
const exec = promisify(execFile);
const escapeXML = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function rgb(args: string[], width: number, height: number) {
  const result = await exec('magick', [...args, '-resize', `${width}x${height}!`, '-depth', '8', 'rgb:-'], { encoding: 'buffer', timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
  if (result.stdout.length !== width * height * 3) throw new Error('Artwork renderer returned an unexpected image size');
  return result.stdout;
}
let artworkFont: Promise<string> | undefined;
async function fontPath() {
  artworkFont ||= (async () => {
    const path = process.env.OMARCHY_ELGATO_FONT || (await exec('fc-match',['-f','%{file}','sans-serif'],{encoding:'utf8',timeout:3000})).stdout.trim();
    if (!path) throw new Error('No artwork font found; install a sans-serif font or set OMARCHY_ELGATO_FONT');
    await stat(path); return path;
  })();
  return artworkFont;
}
export async function keyArtwork(key: Key, width: number, height: number, displayBackground = false) {
  const font = await fontPath();
  const mode = key.displayMode || (key.displayText === '' || (key.icon && key.displayText === undefined) ? 'icon' : 'icon-text');
  const colored = mode === 'color' || mode === 'color-text';
  const background = colored || (displayBackground && key.color) ? 'rgb(' + (key.color || [40, 90, 130]).join(',') + ')' : 'black';
  const foreground = 'rgb(' + (key.textColor || [255, 255, 255]).join(',') + ')';
  const textOnly = mode === 'text' || mode === 'color-text';
  const source = mode === 'text' || colored ? '' : await keyIcon(key), label = mode === 'icon' || mode === 'color' ? '' : key.displayText ?? (key.label || await actionLabel(key.action));
  const stamp = source ? (await stat(source)).mtimeMs : 0;
  const digest = createHash('sha256').update(JSON.stringify(['display-v10', font, background, foreground, source, stamp, label, width, height, !!key.icon, key.displayText === undefined, mode])).digest('hex').slice(0, 24);
  await mkdir(cacheDir, { recursive: true });
  const cache = join(cacheDir, digest + '.rgb');
  try { const data = await readFile(cache); if (data.length === width * height * 3) return data; } catch {}
  let data: Buffer;
  if (mode === 'icon' && key.icon && source) data = await rgb(['-background', 'none', source + '[0]', '-background', background, '-alpha', 'remove', '-alpha', 'off', '-resize', `${width}x${height}`, '-gravity', 'center', '-extent', `${width}x${height}`], width, height);
  else {
    const canvasWidth = Math.round(120 * width / height);
    const args = ['-size', `${canvasWidth}x120`, 'xc:' + background, '-font', font];
    if (source) {
      args.push('(', '-background', 'none', source + '[0]');
      args.push('-background', background, '-alpha', 'remove', '-alpha', 'off', '-resize', label ? '88x88' : '112x112', ')', '-gravity', 'center', '-geometry', label ? '+0-8' : '+0+0', '-composite');
    } else if (label && !key.displayMode) args.push('-fill', 'white', '-pointsize', '34', '-gravity', 'center', '-annotate', '+0-8', label.slice(0, 2).toUpperCase());
    if (label) {
      // Render a separate caption image and shrink it to fit without clipping.
      // Leading space prevents ImageMagick from treating an @label as a filename.
      args.push('(', '+size', '-background', background, '-fill', foreground, '-font', font, '-pointsize', textOnly ? '26' : '18', 'label: ' + label, '-resize', textOnly ? `${canvasWidth - 8}x100>` : '112x22>', ')', '-gravity', textOnly ? 'center' : 'south', '-geometry', textOnly ? '+0+0' : '+0+5', '-composite');
    }
    data = await rgb(args, width, height);
  }
  await writeFile(cache, data);
  return data;
}
export function lcdSVG(profile: Profile, lights: LightState[]) {
  const light = lights.find(l => l.reachable);
  const values = ['System', 'Input', light ? `${light.brightness}%` : '--', light?.temperature ? `${Math.round(1000000 / light.temperature)}K` : '--'];
  const colors = ['#38bdf8', '#f87171', '#fbbf24', '#fb923c'];
  if (!profile.dials.length) return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="100"><rect width="800" height="100" fill="#090b10"/><text x="400" y="62" text-anchor="middle" fill="white" font-size="32" font-family="sans-serif">${escapeXML(profile.name)}</text></svg>`;
  const cellWidth = 200, totalWidth = profile.dials.length * cellWidth;
  const cells = profile.dials.map((d, i) => `<defs><clipPath id="dial-label-${i}"><rect x="${i * 200 + 82}" y="18" width="108" height="34"/></clipPath></defs><rect x="${i * 200}" y="0" width="198" height="100" rx="10" fill="#141820" stroke="#303846"/><circle cx="${i * 200 + 44}" cy="50" r="27" fill="none" stroke="${colors[i % colors.length]}" stroke-width="6"/><text x="${i * 200 + 82}" y="47" fill="#f8fafc" font-size="16" font-family="sans-serif" clip-path="url(#dial-label-${i})">${escapeXML(Array.from(d.label).length > 12 ? Array.from(d.label).slice(0,11).join('') + '…' : d.label)}</text><text x="${i * 200 + 82}" y="72" fill="#94a3b8" font-size="16" font-family="sans-serif">${values[i] || '--'}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="100"><rect width="${totalWidth}" height="100" fill="#090b10"/>${cells.join('')}</svg>`;
}
export function neoInfoSVG(profile: Profile, lights: LightState[], now = new Date(), microphoneMuted?: boolean) {
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const date = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const on = lights.filter(l => l.reachable && l.on).length;
  const status = `Mic ${microphoneMuted === undefined ? '—' : microphoneMuted ? 'muted' : 'on'} · Lights ${on}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="248" height="58"><defs><clipPath id="page"><rect x="100" y="3" width="140" height="25"/></clipPath></defs><rect width="248" height="58" fill="#090b10"/><text x="7" y="25" fill="white" font-size="22" font-family="sans-serif">${escapeXML(time)}</text><text x="8" y="47" fill="#94a3b8" font-size="13" font-family="sans-serif">${escapeXML(date)}</text><text x="104" y="23" clip-path="url(#page)" fill="white" font-size="15" font-family="sans-serif">${escapeXML(profile.name)}</text><text x="104" y="46" fill="#94a3b8" font-size="11" font-family="sans-serif">${escapeXML(status)}</text></svg>`;
}
export async function lcdArtwork(profile: Profile, lights: LightState[], width: number, height: number, microphoneMuted?: boolean) {
  await mkdir(cacheDir, { recursive: true });
  const source = profile.dials.length ? lcdSVG(profile, lights) : neoInfoSVG(profile, lights, new Date(), microphoneMuted);
  const svg = join(cacheDir, 'lcd-' + createHash('sha256').update(source).digest('hex').slice(0, 24) + '.svg');
  await writeFile(svg, source);
  const args = [svg, '-resize', `${width}x${height}!`];
  for (let index = 0; index < profile.dials.length; index++) {
    const dial = profile.dials[index];
    if (!dial.display?.displayMode) continue;
    const x = Math.round(index * width / profile.dials.length), end = Math.round((index + 1) * width / profile.dials.length);
    const data = await keyArtwork(dialDisplayKey(dial), end - x, height, true);
    const tile = join(cacheDir, 'dial-' + createHash('sha256').update(data).digest('hex').slice(0,24) + '.rgb');
    await writeFile(tile, data);
    args.push('(', '-size', `${end - x}x${height}`, '-depth', '8', 'rgb:' + tile, ')', '-gravity', 'northwest', '-geometry', `+${x}+0`, '-composite');
  }
  return rgb(args, width, height);
}

export function dialDisplayKey(dial: Dial): Key { return { color: [40,90,130], ...dial.display, action: dial.press, label: dial.label }; }

export async function keyPreview(key: Key, width = 120, height = 120, displayBackground = false) {
  const data = await keyArtwork(key, width, height, displayBackground);
  const digest = createHash('sha256').update(`${width}x${height}`).update(data).digest('hex').slice(0, 24);
  const png = join(cacheDir, digest + '.png');
  try { await stat(png); return png; } catch {}
  const raw = join(cacheDir, digest + '-preview.rgb');
  await writeFile(raw, data);
  await exec('magick', ['-size', `${width}x${height}`, '-depth', '8', 'rgb:' + raw, png], { timeout: 8000 });
  return png;
}
