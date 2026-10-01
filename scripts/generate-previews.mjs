import { mkdtemp, mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Render the actual editor with synthetic data; never read or change user profiles.
const root = fileURLToPath(new URL('../', import.meta.url));
const verify = process.argv.includes('--verify');
const outputIndex = process.argv.indexOf('--output-directory');
const outputRoot = outputIndex < 0 ? root : process.argv[outputIndex + 1];
if (!outputRoot) throw new Error('--output-directory needs a path');
const shell = process.env.OMARCHY_SHELL_PATH || '/usr/share/omarchy/shell';
const temp = await mkdtemp(join(tmpdir(), 'elgato-previews-'));
const env = { ...process.env, HOME: temp, XDG_CONFIG_HOME: join(temp, 'config'), XDG_STATE_HOME: join(temp, 'state'), XDG_CACHE_HOME: join(temp, 'cache'), XDG_RUNTIME_DIR: join(temp, 'runtime'), QT_QPA_PLATFORM: 'offscreen', QT_QUICK_BACKEND: 'software' };
try {
  await mkdir(env.XDG_RUNTIME_DIR, { mode: 0o700 });
  await mkdir(join(env.XDG_CONFIG_HOME, 'omarchy-elgato'), { recursive: true });
  for (const dir of ['Commons', 'Ui']) await cp(join(shell, dir), join(temp, dir), { recursive: true });
  await writeFile(join(temp, 'Ui/KeyboardPanel.qml'), `import QtQuick
Item {
  property var anchorItem; property var owner; property var bar; property bool open
  property bool centerOnBar; property int gap; property var borderSpec; property var focusTarget
  property real contentWidth; property real contentHeight
  width: contentWidth; height: contentHeight
  function fittedContentWidth(value) { return value }
  function fittedContentHeight(value) { return value }
}
`);
  for (const path of ['assets' , 'ToggleDropdown.qml']) await cp(join(root, path), join(temp, path), { recursive: true });
  const profile = JSON.parse(await readFile(join(root, 'defaults/profile.json'), 'utf8'));
  profile.name = 'Studio controls';
  profile.pages = { plus: { active: 'page-1', items: [{ id: 'page-1', name: 'Daily controls', keys: profile.keys, dials: profile.dials }, { id: 'page-2', name: 'Creative tools', keys: profile.keys, dials: profile.dials }] } };
  profile.dials[0].display = { label: 'Volume', action: 'volume_up', displayMode: 'icon-text', color: [65,145,235] };
  await writeFile(join(env.XDG_CONFIG_HOME, 'omarchy-elgato/profile.json'), JSON.stringify(profile));
  const cli = (...args) => JSON.parse(execFileSync('node', [join(root, 'dist/cli.js'), ...args], { env, encoding: 'utf8' }));
  const fixture = { profile, models: JSON.parse(await readFile(join(root, 'defaults/models.json'), 'utf8')), actionOptions: cli('catalog'), icons: cli('icons'), buttonPreviews: cli('button-previews', 'plus'), dialPreviews: cli('dial-previews', 'plus'), status: { running: true, profile: profile.name, brightness: 55, devices: [{ kind: 'plus', connected: true }], actionStates: { mic_mute: 'unmuted' }, lights: [{ name: 'Key Light · Left', host: '192.0.2.10', port: 9123, reachable: true, on: 1, brightness: 65, temperature: 200 }, { name: 'Key Light · Right', host: '192.0.2.11', port: 9123, reachable: true, on: 1, brightness: 65, temperature: 200 }] } };
  await mkdir(join(outputRoot, 'docs/previews'), { recursive: true });
  let qml = await readFile(join(root, 'Panel.qml'), 'utf8');
  qml = qml.replace(/running: !root.opened && !detachedWindow.visible/g, 'running: false').replace(/running: root.opened \|\| detachedWindow.visible/g, 'running: false');
  qml = qml.replace('implicitHeight: Math.max(Style.space(520), content.implicitHeight + Style.space(32))', 'implicitHeight: 620');
  qml = qml.replace(/readonly property string helper: .*/, 'readonly property string helper: "/bin/true"');
  if (verify) {
    qml = qml.replace('if (saveProc.running || !saveQueue.length) return', 'if (testPauseSaves || saveProc.running || !saveQueue.length) return');
    qml = qml.replace('saveProc.command = next.command;', 'testDispatched = testDispatched.concat([next.command]); saveProc.command = next.command;');
    qml = qml.replace('function refresh() {', 'function refresh() { return;');
    qml = qml.replace(/\n}\s*$/, (await readFile(join(root, 'test/editor-checks.qml'), 'utf8')) + '\n}');
  }
  // Keep layout and controls untouched; expose only a capture hook in the temporary copy.
  qml = qml.replace(/\n}\\?\s*$/, `
  Component.onCompleted: {
    var fixture = ${JSON.stringify(fixture)}
    root.models = fixture.models; root.profile = fixture.profile; root.status = fixture.status; root.actionOptions = fixture.actionOptions
    root.buttonPreviews = fixture.buttonPreviews; root.dialPreviews = fixture.dialPreviews
    root.availableIcons = fixture.icons.icons; root.iconsDirectory = fixture.icons.directory; root.textDraft = root.selectedKey.label
    root.detached = true; detachedWindow.visible = true
    ${verify ? "Qt.callLater(root.runEditorChecks)" : ""}
  }
  property var fixtureStatus: ${JSON.stringify(fixture.status)}
  property var fixtureButtons: ${JSON.stringify(fixture.buttonPreviews)}
  property var fixtureDials: ${JSON.stringify(fixture.dialPreviews)}
  Timer {
    property int stage: 0
    interval: 800; running: ${!verify}; repeat: true
    onTriggered: {
      var outputs = ${JSON.stringify([join(outputRoot, 'preview.png'), join(outputRoot, 'docs/previews/dials.png'), join(outputRoot, 'docs/previews/key-lights.png'), join(outputRoot, 'docs/previews/runtime-preparing.png'), join(outputRoot, 'docs/previews/runtime-failed.png')])}
      content.grabToImage(function(result) {
        if (!result.saveToFile(outputs[stage])) throw new Error("Could not save preview"); stage++
        if (stage === 1) { root.selectedControl = "dial"; root.selectedIndex = 0 }
        else if (stage === 2) { root.selectedDevice = "lights"; root.selectedControl = "lights" }
        else if (stage === 3) { root.selectedDevice = "plus"; root.selectedControl = "key"; root.status = Object.assign({}, fixtureStatus, {running:false,devices:[],lights:[],runtime:{phase:"preparing"}}); root.buttonPreviews = fixtureButtons; root.dialPreviews = fixtureDials }
        else if (stage === 4) root.status = Object.assign({}, fixtureStatus, {running:false,devices:[],lights:[],runtime:{phase:"failed",error:"Could not download runtime dependencies: registry unavailable."}})
        else Qt.quit()
      })
    }
  }
}
`);
  await writeFile(join(temp, 'Editor.qml'), qml);
  await writeFile(join(temp, 'shell.qml'), 'import QtQuick\nimport Quickshell\nShellRoot { Editor {} }\n');
  const log = execFileSync('qs', ['-p', join(temp, 'shell.qml'), '--no-color'], { env, timeout: 20000, encoding: 'utf8', stdio: 'pipe' });
  if (verify) {
    if (!log.includes('EDITOR_CHECK_PASSED') || log.includes('EDITOR_CHECK_FAILED')) throw new Error(log);
    console.log('Editor checks passed: queued saves, captured captions, selection/page changes, close, FIFO dispatch.');
  } else {
    for (const path of ['preview.png', 'docs/previews/dials.png', 'docs/previews/key-lights.png', 'docs/previews/runtime-preparing.png', 'docs/previews/runtime-failed.png']) execFileSync('magick', [join(outputRoot, path), '-background', '#101315', '-alpha', 'remove', '-bordercolor', '#101315', '-border', '20', join(outputRoot, path)]);
    console.log('Generated preview.png and dial, light, runtime preparation, and failure previews.');
  }
} catch (error) {
  if (error.stdout) console.error(error.stdout.toString());
  if (error.stderr) console.error(error.stderr.toString());
  throw error;
} finally { await rm(temp, { recursive: true, force: true }); }
