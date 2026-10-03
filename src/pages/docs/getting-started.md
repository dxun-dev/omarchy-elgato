---
layout: ../../layouts/DocsLayout.astro
title: 'Getting started'
description: 'Install the plugin, connect your gear, and keep your setup up to date.'
slug: 'getting-started'
---

## Requirements

Omarchy Quattro with Omarchy Shell and the `omarchy plugin` commands.
First enable checks system requirements and opens a terminal prompt if setup is
needed. Accept the prompt to install missing packages through `omarchy pkg add`
and configure Stream Deck USB access. Administrator authentication may be
requested. The plugin then prepares its locked Node.js runtime automatically.

### System packages

Only missing requirements are passed to `omarchy pkg add`. Existing packages
are reused. The complete set the script can request is:

| Arch package | Requirement and purpose |
| --- | --- |
| `nodejs` | Node.js 22.18 or newer for the backend and runtime setup. |
| `npm` | Installs the locked runtime dependencies. |
| `imagemagick` | `magick` renders button icons and LCD artwork. |
| `fontconfig` | `fc-match` selects the artwork font. |
| `ttf-dejavu` | Font fallback when the selected font file is unavailable. |
| `avahi` | `avahi-browse` discovers network Key Lights. |
| `wireplumber` | `wpctl` controls audio volume and mute. |
| `wtype` | Sends keyboard input for actions. |
| `uwsm` | `uwsm-app` launches applications in the desktop session. |
| `gtk3` | `gtk-launch` launches desktop entries. |
| `xdg-utils` | `xdg-open` opens files and URLs. |

The package manager may also install their dependencies. Setup does not record
which packages were already installed. Omarchy supplies the surrounding tools:
`omarchy`, `omarchy-shell`, `bash`, `gum`, `jq`, `flock`, `sudo`,
`systemctl`, `udevadm`, and standard filesystem utilities; the requirements
script does not install these separately. Git is needed for repository-based
installation and updates.

### System changes

Setup copies `assets/udev/70-omarchy-elgato.rules` to
`/etc/udev/rules.d/70-omarchy-elgato.rules` with mode `0644`. If a different
file already exists there, it is replaced without a backup. The rules match
`hidraw*` devices, set device mode `0660`, and add `uaccess` so the active
local desktop user can access them without running the daemon as root.

The complete USB vendor/product match list is:

- Vendor `0fd9`: `0060`, `0063`, `006c`, `006d`, `0080`, `0084`,
  `0086`, `008f`, `0090`, `009a`, `00a5`, `00aa`, `00b3`, `00b8`,
  `00b9`, `00ba`, `00c6`, `00e4`.
- Vendor `1b1c`: `2b18`.

Setup runs `udevadm control --reload-rules` and
`udevadm trigger --subsystem-match=hidraw --action=add`. Reconnect the Stream
Deck if it is not detected afterward. No user is added to a device-access group.

If `avahi-daemon.service` is inactive, setup runs
`systemctl enable --now avahi-daemon.service`, starting it immediately and
allowing it to start at boot. An already active service is left as it is.
These changes require administrator authentication. There is no separate
systemd service installed for the plugin: Omarchy Shell owns its daemon.

Actions for optional applications appear only when their executable is
available. User-installed action packs provide their own dependency checks.

## Install

Install and enable through Omarchy:

```bash
omarchy plugin add https://github.com/dxun-dev/omarchy-elgato.git --enable
```

Omarchy asks where to place the widget. On first enable, accept any system setup
prompt; the service then installs its locked runtime dependencies in the user
data directory. This requires internet access and may take a moment. Click the
Elgato icon when it appears to configure your devices.

Without `--enable`, setup waits until you enable the plugin. If you decline the
system setup prompt, no packages or USB rules are changed; use **Retry setup**
in the editor when you are ready.

For an earlier development install, disable `omarchy-elgato` before enabling
this plugin. Existing profiles, icons, and action packs are preserved.

## Use and configure

Click the Elgato bar icon to open the editor. Choose a connected device or an
offline model, select a button or dial, and assign an action. Use the display
settings for icons, text, background colors, and dial LCD artwork. Stateful
actions expose an icon setting for each reported state; launchers keep a single
icon. **Detach** opens the editor in a separate window; **Dock** returns it to the
bar. Escape closes the editor or cancels an active edit.

Move the widget with:

```bash
omarchy bar move dxun-dev.omarchy-elgato --section left
```

See [the usage guide](../usage/) for pages, folders, colors, status icons,
and CLI examples. See [action packs](../action-packs/) to add your own actions.

## User files

Plugin data paths respect `XDG_CONFIG_HOME`, `XDG_STATE_HOME`,
`XDG_CACHE_HOME`, and `XDG_DATA_HOME`, respectively. The Omarchy plugin
manager currently uses `~/.config/omarchy/plugins/`; the local installer
also supports `XDG_CONFIG_HOME` for that destination.

| Purpose                               | Default location                         |
| ------------------------------------- | ---------------------------------------- |
| Installed plugin | `~/.config/omarchy/plugins/dxun-dev.omarchy-elgato/` |
| Local-install backups | `~/.local/share/omarchy-plugin-backups/dxun-dev.omarchy-elgato.backup-<timestamp>` |
| Omarchy removal backups (non-Git installs) | `~/.config/omarchy/plugins/.dxun-dev.omarchy-elgato.bak.<timestamp>` |
| Mappings and pages                    | `~/.config/omarchy-elgato/profile.json`  |
| Custom icons                          | `~/.config/omarchy-elgato/icons/`        |
| Action packs                          | `~/.config/omarchy-elgato/actions/`      |
| Status and discovered-light inventory | `~/.local/state/omarchy-elgato/`         |
| Generated artwork cache               | `~/.cache/omarchy-elgato/`               |
| Runtime dependencies                  | `~/.local/share/omarchy-elgato/runtime/` |

The installed plugin contains its manifest, QML widget/editor/service, compiled
backend, `bin/omarchy-elgato` helper, scripts, assets, default configuration,
example action packs, package manifests/lockfile, preview images, README,
changelog, license, and third-party notices. Git-based installs also contain the
repository metadata. The helper is not placed globally on PATH.

Runtime setup copies `package.json` and `package-lock.json` into the runtime,
then runs `npm ci --omit=dev`. This installs `@elgato-stream-deck/node`,
`node-hid`, and all locked transitive dependencies, including native HID and
JPEG modules. A `.runtime-ready` marker records the package/Node/platform
signature. Downloads can also create npm cache and logs (normally `~/.npm/`,
or the configured npm cache location). These are shared with other npm projects.
The local installer's `--offline` option copies the checkout's entire
`node_modules` instead, which can include development dependencies.

Setup seeds `actions/voxtype/` from the bundled example only if absent;
it does not install the VOXtype application. Optional action applications and
user action-pack dependencies are not automatically installed.

Normal use creates `profile.json`, optionally a migration backup
`profile.before-pages.json`, and `profile.lock` in the configuration directory.
The state directory holds `status.json`, `light-inventory.json`,
`runtime-status.json`, daemon/setup lock files, and temporary files used for
atomic writes. Cache files include generated RGB artwork, SVGs, and PNG previews.
Enabling changes Omarchy Shell's plugin enablement/bar placement configuration;
logs are written to the existing user journal. It does not install another
journal or logging service.

The local installer builds `dist/` in the checkout, stages files under
`.omarchy-elgato-stage-<UUID>` in the plugin directory, validates them, and
removes its staging directory on completion or failure. Replacing an existing
local installation moves it into the backup location above. Development
`npm ci` also creates `node_modules/` in the checkout, including TypeScript
and Node type definitions; those are separate from ordinary plugin setup.

`OMARCHY_ELGATO_RUNTIME` can override the dependency location.
`OMARCHY_ELGATO_FONT` can select a font file; otherwise Fontconfig resolves the
system's sans-serif font. Applications and icons use XDG data directories.

## Update

```bash
omarchy plugin update dxun-dev.omarchy-elgato
```

Omarchy reloads the plugin. The service refreshes runtime dependencies when
needed, preserving profiles, icons, action packs, and bar placement.

## Disable or remove

```bash
omarchy plugin disable dxun-dev.omarchy-elgato
omarchy plugin remove dxun-dev.omarchy-elgato
```

Disabling stops the daemon but retains all files. There is no project-specific
uninstall script: `omarchy plugin remove` unloads the plugin and handles its
installed directory. For a Git checkout it deletes that directory; for a local
non-Git installation it moves the directory to the hidden backup path in
**User files**. For a symlink installation it removes only the link.

### Optional cleanup after removal

Removal leaves profiles, icons, action packs (including the seeded VOXtype pack),
state, generated artwork, runtime dependencies, install/removal backups, npm
cache/logs, system packages, the udev rule, and Avahi's service configuration.
Back up your settings before deleting them. To remove plugin-owned user data,
delete these directories, substituting your XDG locations when set:

- `~/.config/omarchy-elgato/`: mappings, migration backup, custom icons and action packs.
- `~/.local/state/omarchy-elgato/`: status, inventory and locks.
- `~/.cache/omarchy-elgato/`: generated artwork.
- `~/.local/share/omarchy-elgato/runtime/`: npm runtime; use your
  `OMARCHY_ELGATO_RUNTIME` location if overridden.

Delete only this plugin's timestamped backups listed in **User files**;
`omarchy-plugin-backups/` and npm's cache may contain other projects' data.
Development checkouts and their `dist/` and `node_modules/` also remain.
Existing user-journal entries follow your system's normal retention policy.

To remove the USB access rule after removing the plugin:

```bash
sudo rm -- /etc/udev/rules.d/70-omarchy-elgato.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=hidraw --action=add
```

Disconnect and reconnect the devices to reapply access under the remaining
rules. If you had a custom rule at that path before setup, restore your own
backup instead. Another Elgato integration may still need this rule.

If setup enabled Avahi and no other application needs it, you can reverse that
change with `sudo systemctl disable --now avahi-daemon.service`. Keep it if
other applications rely on local-network discovery. Likewise, review the package
table above and your package-manager history before removing packages with
`omarchy pkg remove <package>`; many are shared Omarchy desktop requirements.
There is no automatic package removal or restoration of prior service/rule
state, because setup does not keep an ownership or before-state record.

## Compatibility and limitations

Model layouts cover Classic variants, Plus, Mini, XL, Neo, Pedal, Studio, Plus XL,
and supported Modules. Multiple units of the same model share mappings and page
state. Additional models and dial LEDs have automated mock coverage; physical
hardware verification is incomplete. The Neo information screen has clock/date,
page, microphone mute, and light status. Touch gestures, automatic touch
navigation, Studio NFC, Network Dock transport, Wave-specific controls, and
Facecam controls are not implemented.

Action packs provide command actions and status queries. Live tile providers
and column reservations, such as Herdr agent columns, are future work.
