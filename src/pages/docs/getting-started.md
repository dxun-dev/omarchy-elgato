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

Setup covers Node.js 22.18+, npm, ImageMagick, Fontconfig and a font, Avahi,
WirePlumber, keyboard input, and application-launch tools. Most of these are
already part of Omarchy. USB rules grant access to the active desktop user for
supported Stream Deck devices; other USB devices are unaffected. Reconnect the
Stream Deck if it is not detected after setup.

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

All paths respect the corresponding XDG environment variable.

| Purpose                               | Default location                         |
| ------------------------------------- | ---------------------------------------- |
| Mappings and pages                    | `~/.config/omarchy-elgato/profile.json`  |
| Custom icons                          | `~/.config/omarchy-elgato/icons/`        |
| Action packs                          | `~/.config/omarchy-elgato/actions/`      |
| Status and discovered-light inventory | `~/.local/state/omarchy-elgato/`         |
| Generated artwork cache               | `~/.cache/omarchy-elgato/`               |
| Runtime dependencies                  | `~/.local/share/omarchy-elgato/runtime/` |

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

Disabling stops the daemon. Removal deletes or backs up the plugin through
Omarchy. User profiles, icons, action packs, state, cache, and runtime dependencies
remain available for reinstalling.

To also remove your personal settings, delete `~/.config/omarchy-elgato/` (or
`$XDG_CONFIG_HOME/omarchy-elgato/` if you use a custom configuration directory).
This directory contains your device mappings, pages and folders, custom icons,
and user-installed action packs. Back up anything you want to keep before
deleting it; removing these files resets your configuration for a future install.

Other retained data can be removed using the locations in **User files**. System
packages and the Stream Deck USB access rule installed during setup remain
available after removal.

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
