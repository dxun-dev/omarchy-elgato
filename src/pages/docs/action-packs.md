---
layout: ../../layouts/DocsLayout.astro
title: 'Action packs'
description: 'Extend your buttons and dials with custom commands, icons, and status queries.'
slug: 'action-packs'
---

Action packs add button and dial actions without rebuilding the plugin. Install
one by copying its folder into `~/.config/omarchy-elgato/actions/` (or
`$XDG_CONFIG_HOME/omarchy-elgato/actions/`). The folder name must match its ID.
The catalog refreshes when the editor opens and every ten seconds while open.
The daemon notices pack changes within about one second. User packs survive
plugin reinstalls. Runtime preparation seeds a VOXtype discard-recording pack without
replacing an existing pack; it appears only when `voxtype` is executable.

## Manifest

For `actions/example/manifest.json`:

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example",
  "requires": ["my-tool"],
  "actions": [
    {
      "id": "next",
      "label": "Next item",
      "controls": ["button", "dialPress", "dialTurn"],
      "icon": "icons/next.svg",
      "press": ["my-tool", "next"],
      "timeoutMs": 3000
    }
  ]
}
```

The action is saved in profiles as `ext:example/next`. IDs start with a lowercase
letter and contain up to 64 lowercase letters, numbers, dots, underscores, or
hyphens. Labels are plain text. `requires`, `icon`, and `timeoutMs` are optional.

`controls` determines which dropdowns offer an action. Include `dialTurn` only
for repeatable adjustments or navigation. Action-pack control compatibility is
also checked when assigning through the CLI.

`press` is an executable and its literal arguments, never an implicitly evaluated
shell command. For a bundled executable use `["./handler", "next"]` and mark the
handler executable. Other arguments are passed unchanged; file arguments should
be absolute paths or paths relative to the pack directory. Shell, Node,
and compiled handlers are supported through their executables. No interpreter
is downloaded or installed automatically.

Handlers run with the pack directory as their working directory and inherit the
daemon environment, plus `ELGATO_ACTION_ID` and `ELGATO_EVENT` (`press` or
`release`). They must finish promptly. The timeout defaults to 3 seconds and can
be set from 100 to 10000 milliseconds. Nonzero exit, timeout, and excess output
are reported as action errors. Extension commands run in their own serial queue
so slow handlers do not hold up core audio or page commands.

Packs are trusted local programs, run with your user permissions; the subprocess
boundary is not a security sandbox. Discovering a pack checks files and
executables but does not execute handlers or dependency commands.

## Held actions

An optional `release` argument array runs on button/dial release, disconnect, or
daemon shutdown. An action with `release` cannot declare `dialTurn` support.
The handler definition captured on press is used for release, even if the
manifest or assignment changes while held. Removing a manifest preserves this
pairing. Removing a bundled executable while held can make release fail; external
commands can still release if the pack folder has gone.

Example:

```json
{
  "id": "talk",
  "label": "Push to talk",
  "controls": ["button", "dialPress"],
  "press": ["voxtype", "record", "start"],
  "release": ["voxtype", "record", "stop"]
}
```

## Icons, availability, and diagnostics

Icons must be PNG, JPEG, WebP, or SVG files within the pack, under 20 MB. Pack
icons participate in artwork reloads. Missing dependencies or invalid manifests
hide that pack's actions without affecting other packs. Assignments remain saved
when their pack is unavailable; invoking one reports an error. Reinstalling a
pack with the same IDs restores those assignments.

```bash
bin/omarchy-elgato action-packs
bin/omarchy-elgato catalog
bin/omarchy-elgato set-device-key plus 1 ext:example/next
```

`action-packs` lists the directory and any manifest/dependency errors. Change or
remove a pack folder to update/uninstall it. There is no automatic Git fetching,
package installation, or update mechanism in this first version.

## Scope

Version 1 provides command actions, status queries, and static icons per state. Live tile providers,
column reservations, device editors, and custom settings forms are future work.
Herdr's live agent columns need that provider layer; they cannot be reproduced
by a static action manifest alone. Touch navigation is not implemented.

## Status and state icons

Stateful actions can declare a read-only status command and their possible states:

```json
{
  "id": "toggle",
  "label": "Toggle device",
  "controls": ["button", "dialPress"],
  "press": ["./handler", "toggle"],
  "status": {
    "command": ["./handler", "status"],
    "timeoutMs": 1000,
    "states": [
      { "value": "on", "label": "On", "icon": "icons/on.svg" },
      { "value": "off", "label": "Off", "icon": "icons/off.svg" }
    ]
  }
}
```

The status command must print exactly one declared state, such as `on`, followed
by an optional newline. It receives `ELGATO_EVENT=status`. It must be read-only;
status is queried while the action is assigned to a connected device's active
page. Identical actions share one query per polling pass. Polling runs about once
a second separately from button commands, with at most four simultaneous
queries. Slow queries can lengthen that interval. The status timeout defaults to
1 second and may be set from 100 to 3000 milliseconds. Output is limited to 4 KB.

Declare 1–16 states. State values start with a lowercase letter and contain up to
32 lowercase letters, numbers, underscores, or hyphens. `unknown` is reserved
for unavailable state. Icons are optional and follow the pack-icon rules. An
invalid command, state definition, or icon makes the pack unavailable; a failed,
timed-out, or malformed status response sets that action's current state to
unavailable. Details appear under `actionStateErrors` in `status --json`.

In the editor's icon section, **Icon setting** offers **Default icon** and a
setting for each state, including **Unavailable**. Users can override the pack's
state icon using the existing gallery. Resetting an override uses the pack's
state default, or the normal icon if none exists. Missing image files also fall
back to the normal icon. The same settings work for a dial's custom LCD icon,
using the action assigned to **Press**. Text-only and color-only displays do not
show icons. Launchers without status metadata retain their single-icon editor.

State-specific overrides are saved per button/dial and page/folder, tied to the
action that declared the states. They are not applied to a different action.
State queries observe external changes; icons are not simply alternated on each
press. Built-in output mute, microphone mute, and grouped Key Light toggles also
expose states. Key Lights report **Mixed** when some are on, and **Unavailable**
when any known light cannot report its current state.

```bash
bin/omarchy-elgato set-state-icon plus 1 button on preset:mic_mute.svg
bin/omarchy-elgato set-state-icon plus 1 button off preset:mic_up.svg
bin/omarchy-elgato set-state-icon plus 1 button on automatic
```
