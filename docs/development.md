# Development

Keep a source checkout separate from the installed plugin folder. npm creates
symlinks under `node_modules/.bin`; Omarchy rejects symlinks inside plugin folders.
Run these commands from any source checkout location:

```bash
npm ci
npm test
npm run test:editor
npm run install:local -- --offline --section right
```

The local installer builds the backend, prepares dependencies outside the plugin
folder, validates a staged copy, backs up an existing installation, and installs
it in the user's Omarchy plugin directory. Existing placement and enabled state
are preserved unless a section or `--enable` is explicitly requested. On a first
interactive install, it asks for a bar section. Noninteractive installs remain
disabled unless a section or `--enable` is supplied.

After edits, `npm run dev` builds, installs with existing dependencies, and
restarts Omarchy Shell. The bar briefly disappears during the restart. Use
`npm ci` again after dependency changes. The plugin never assumes a particular
checkout directory, user name, connected serial number, or light address.

## Repository layout

- `src/`: TypeScript backend; `dist/`: compiled backend shipped with the plugin.
- `BarWidget.qml`, `Panel.qml`, `Service.qml`: interface and daemon lifecycle.
- `defaults/`, `assets/`: generic model layouts, initial mappings, and artwork.
- `scripts/system-setup.sh`: first-enable system requirement checks and confirmed installation through Omarchy.
- `scripts/setup.mjs`: automatic runtime preparation on enable; manual repair and offline development setup.
- `scripts/install.mjs`: staged local development installation.
- `test/`: profile, action, artwork, mock hardware, and lifecycle coverage.
- `examples/actions/`: optional starter action packs.

The release repository must include an up-to-date `dist/`; a normal Omarchy Git
installation does not run TypeScript compilation or arbitrary install hooks.
Run `npm run build` before preparing a release and commit its output.

## Validate a distribution folder

```bash
npm run check
npm test
npm run package:plugin -- --output /tmp/omarchy-elgato-release
omarchy plugin validate /tmp/omarchy-elgato-release
```

`package:plugin` builds and copies only distributable files, then validates the
result. It excludes npm dependencies, local user data, and the Git working tree.
The output directory must not already exist. It is a validation artifact, not an
automatic marketplace submission. Run `bin/omarchy-elgato doctor` after setup.

For QML checks against an installed Omarchy Shell:

```bash
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml Service.qml
```

Test bar click, Escape, detach/dock, shell restart, disable/re-enable, and removal
before a release. Exercise hardware separately from mock tests and state which
models were tested. Do not check personal profiles, status files, custom action
packs, generated artwork caches, dependency folders, or private device logs into
the repository. Tests use synthetic private-network addresses as fixtures.

## Regenerate preview images

```bash
npm run previews
```

Requires Quickshell (`qs`), ImageMagick, and the installed Omarchy Shell QML
components. Set `OMARCHY_SHELL_PATH` if the shell is outside
`/usr/share/omarchy/shell`. The generator renders the current `Panel.qml`
offscreen with synthetic device and light data, the bundled profile, and the
backend's actual artwork. It isolates configuration, state, cache, and theme
files in a temporary directory and does not connect to hardware. The temporary
copy substitutes only the shell popup container and disables backend polling.

Outputs are `preview.png`, `docs/previews/dials.png`, and
`docs/previews/key-lights.png`, `docs/previews/runtime-preparing.png`, and
`docs/previews/runtime-failed.png`. Review them after interface changes.

`npm run test:editor` exercises the actual QML save queue offscreen, including
rapid edits, caption snapshots, selection/page changes, and closing the editor.
It requires the same shell components as preview generation and uses isolated
sample data.
