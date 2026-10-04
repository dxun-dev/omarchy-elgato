import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const check = process.argv.includes('--check');
const candidates = ['qmlformat', '/usr/lib/qt6/bin/qmlformat'];
const formatter = candidates.find((file) => spawnSync(file, ['--version']).status === 0);
if (!formatter) {
  console.error('QML formatting requires qmlformat from Qt 6 declarative tools.');
  process.exit(1);
}
const files = [
  'BarWidget.qml',
  'Panel.qml',
  'Service.qml',
  'ToggleDropdown.qml',
  'test/editor-checks.qml',
];
for (const file of files) {
  // The editor checks are a fragment injected into Panel, so wrap them for parsing.
  const fragment = file === 'test/editor-checks.qml';
  const temporary = fragment ? mkdtempSync(join(tmpdir(), 'elgato-qml-format-')) : null;
  const input = fragment ? join(temporary, 'checks.qml') : file;
  if (fragment) {
    writeFileSync(input, `import QtQuick\nItem {\n${readFileSync(file, 'utf8')}\n}\n`);
  }
  const result = spawnSync(formatter, ['--settings', resolve('.qmlformat.ini'), input], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) {
    if (temporary) {
      rmSync(temporary, { recursive: true });
    }
    console.error(
      result.stderr || result.error?.message || `Could not format ${file} (${result.signal}).`,
    );
    process.exit(1);
  }
  const formattedOutput = fragment
    ? result.stdout.split('\n').slice(3, -2).join('\n') + '\n'
    : result.stdout;
  // Keep functions visually separate without reordering bindings.
  const formatted = formattedOutput
    .replace(/\n+  function /g, '\n\n  function ')
    .replace(
      /\n  }\n(?=  (?:property |readonly |Process |Timer |KeyboardPanel |FloatingWindow ))/g,
      '\n  }\n\n',
    );
  if (temporary) {
    rmSync(temporary, { recursive: true });
  }
  if (!check) {
    writeFileSync(file, formatted);
  }
  if (check && formatted !== readFileSync(file, 'utf8')) {
    console.error(`${file} needs formatting.`);
    process.exitCode = 1;
  }
}
