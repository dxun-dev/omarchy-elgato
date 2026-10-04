import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, delimiter } from 'node:path';

export const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local/share');
export const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share')
  .split(delimiter)
  .filter(Boolean);
const appRoots = [
  ...new Set([
    join(dataHome, 'applications'),
    join(dataHome, 'flatpak/exports/share/applications'),
    '/var/lib/flatpak/exports/share/applications',
    ...dataDirs.map((dir) => join(dir, 'applications')),
  ]),
];
export const validID = (id: string) => /^[A-Za-z0-9_.+-]+$/.test(id);

export async function desktopEntry(id: string) {
  if (!validID(id)) {
    return null;
  }
  for (const dir of appRoots) {
    try {
      const raw = await readFile(join(dir, id + '.desktop'), 'utf8');
      const section = raw.split('[Desktop Entry]')[1]?.split(/\n\[/)[0] || '';
      const values: Record<string, string> = {};
      for (const line of section.split('\n')) {
        const m = line.match(/^([A-Za-z]+)=(.*)$/);
        if (m) {
          values[m[1]] = m[2];
        }
      }
      if (
        values.Hidden === 'true' ||
        values.NoDisplay === 'true' ||
        (values.Type && values.Type !== 'Application')
      ) {
        return null;
      }
      return values;
    } catch {
      /* Check the next desktop directory. */
    }
  }
  return null;
}

export async function applications() {
  const ids = new Set<string>();
  for (const dir of appRoots) {
    try {
      for (const f of await readdir(dir))
        if (f.endsWith('.desktop')) {
          ids.add(f.slice(0, -8));
        }
    } catch {}
  }
  const entries = await Promise.all(
    [...ids].map(async (id) => ({ id, entry: await desktopEntry(id) })),
  );
  return entries
    .filter((x) => x.entry?.Name)
    .sort((a, b) => a.entry!.Name.localeCompare(b.entry!.Name));
}
