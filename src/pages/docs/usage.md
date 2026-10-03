---
layout: ../../layouts/DocsLayout.astro
title: 'Using your controls'
description: 'Configure buttons, pages, folders, dials, artwork, and action-state icons.'
slug: 'usage'
---

The examples below run from the plugin directory and use its `bin/omarchy-elgato` helper.
The UI provides the same configuration operations. This helper ships inside the
plugin; it is not a global command on your PATH. For an installed plugin, change
to its directory before running the examples:

```bash
cd ~/.config/omarchy/plugins/dxun-dev.omarchy-elgato
bin/omarchy-elgato --help
```

If you use a custom XDG configuration directory, use
`$XDG_CONFIG_HOME/omarchy/plugins/dxun-dev.omarchy-elgato` instead.

## Button icons

The button inspector includes **Browse icons**, a fixed-size searchable popup gallery
of bundled presets and images in `~/.config/omarchy-elgato/icons` (or
`$XDG_CONFIG_HOME/omarchy-elgato/icons`). The folder is created automatically.
Save PNG, JPG/JPEG, WebP, or SVG files in it or any nested subdirectory.
Subdirectories act as icon packs: `icons/Minimal/terminal.png` appears under
**Minimal**, while `icons/Minimal/Audio/mute.png` appears under **Minimal/Audio**.
Search matches both the pack path and filename. Install a pack by copying or
extracting its folder into this directory; no manifest or reinstall is needed.
Identical filenames in different packs remain separate choices. Directory
symlinks are not scanned. Files must be smaller than 20 MB. The gallery refreshes while
the editor is open. Custom files survive plugin reinstalls.

Select custom images from the gallery after adding them to the icons directory.
Icon overrides are stored per button as `icon` in the profile, independently of
its action. **Use action icon** removes the override. Custom images fit inside the
button display, preserving aspect ratio with black padding. Replacing an assigned
image refreshes the hardware artwork; removing it falls back to the action icon.
Pedal and Neo's two RGB touch controls do not support image overrides.

```bash
bin/omarchy-elgato icons
bin/omarchy-elgato set-device-icon classic 1 preset:browser.svg
bin/omarchy-elgato set-device-icon plus 2 ~/Pictures/my-icon.png
bin/omarchy-elgato set-device-icon plus 2 automatic
```

## Button text

For display buttons, **Button display** selects **Text only**, **Icon and text**,
or **Icon only**. Text controls appear only in modes that show text; icon controls
appear only in modes that show icons. Text-only captions are centered and larger.
Captions save on Enter or leaving the field. Escape cancels an unsaved caption.
The reset icon beside the field restores the action name. Changing display mode preserves your caption and
icon selection. The preview uses the same artwork as the device.

Bundled presets are white SVG icons without glow or embedded captions. Captions
remain independent of the assigned action and are limited to 80 characters on
one line; long captions scale down to fit. Text embedded in your own image remains
part of that image. Existing profiles retain their previous appearance until you
choose a display mode.

The optional `displayMode` field is `text`, `icon-text`, `icon`, `color`, or `color-text`. `displayText`
contains a custom caption or is absent for the action name. Legacy hidden captions
and custom icon-only images remain supported.

```bash
bin/omarchy-elgato set-device-text classic 1 custom "My terminal"
bin/omarchy-elgato set-device-text classic 1 hidden
bin/omarchy-elgato set-device-text classic 1 automatic
```

## Pages

Each device model has its own pages and remembers its active page. Existing
buttons, icons, captions, and dials become **Page 1** automatically. A pre-migration
backup is saved as `profile.before-pages.json` alongside the profile. The page
selector below the device dropdown switches both the editor and physical device.
Use **Add**, **Duplicate**, **Rename**, or **Delete** to manage pages. New pages
start unassigned; duplicates copy all button and dial settings. Keep at least
one page. Deletion asks for confirmation in the editor and clears direct links
to the deleted page. Up to 50 pages are supported per model.

Assign **Next Page**, **Previous Page**, or **Go to [page name]** to a button,
dial turn, or dial press. Next/previous wrap around; a single page stays selected.
Navigation redraws hardware and preserves held push-to-talk releases. Pages are
shared by connected devices of the same model, like the existing mappings.
The selector works for offline models too. Swipe navigation is deferred.

Pages are stored in `profile.json` under `pages[model]` with stable IDs. The first
page continues to use the legacy `keys`, `classicKeys`, `dials`, or `devices`
fields; additional pages carry independent mappings. CLI mapping/preview
commands accept `--page ID` to edit a specific page; otherwise they use the active
page. Profile mutations are serialized to prevent page switching from overwriting
concurrent mapping edits.

```bash
bin/omarchy-elgato page plus add Work
bin/omarchy-elgato page plus duplicate page-1 "Page 1 Copy"
bin/omarchy-elgato page-catalog plus
bin/omarchy-elgato set-device-key plus 8 page_next --page page-1
```

## Folders

Select a button and choose **Folder** in **On press**, enter a name, then **Create and
open**. This assigns the folder to that button and opens it for editing. The
first button inside every folder is reserved for **Back**; the remaining buttons
and dials have independent assignments. Folders can contain other folders.

The page dropdown lists only main pages. The folder trail shows your current location. Double-click a folder button
preview to open it, and double-click the Back button preview to return. A single
click selects the button for editing. Assign **Folder · [name]** to another
button to link to an existing folder. **Rename**, **Duplicate**,
and **Delete** apply to the currently open page or folder. Deleting a folder
clears links to it; its nested folders remain available as folder actions.

Back remembers the entry path, even when several pages link to the same folder.
Next/previous page actions skip folders and leave the folder navigation path.
Navigation remains per device model, and is shared by connected devices of the
same model. Up to 50 pages and folders combined and 32 levels of nesting are
supported per model.

```bash
bin/omarchy-elgato folder-create plus page-1 2 Media
bin/omarchy-elgato folder-back plus
```

## Page buttons

Select a button, choose **Page** in **On press**, and choose its **Target page**.
Leave **Global** unchecked to switch only that device model. Check **Global**
to switch all currently connected models to a main page whose name exactly
matches the selected target page. Names are case sensitive: `Work` and `work`
are different. Devices without a match keep their current page; disconnected
models are not changed. Folders do not participate in name matching.

Matching uses the target page's current name, so renaming it updates global
navigation automatically. If another device has duplicate matching page names,
its first matching main page is selected. Existing text and icon choices remain
editable on page buttons. Connected devices of the same model share page state.

CLI actions are `page:ID` for local buttons and `page_global:ID` for global
buttons; the ID belongs to the button's own model.

The Page target dropdown also offers **Next**, **Previous**, **First**, and **Last**.
With Global checked, each connected model navigates its own main-page order,
regardless of page names or page counts. Next and Previous wrap at the ends.
Folders are skipped; navigation from a folder uses the main page it was entered
from and clears the folder return path. First and Last choose each model's first
or last main page. CLI actions are `page_next`, `page_previous`, `page_first`,
`page_last`, or their `page_global_` equivalents.

Page Add, Duplicate, and Rename reuse the page toolbar for the name field, Save,
and Cancel. Enter saves and Escape cancels. Delete replaces the same toolbar with
Confirm delete and Cancel. Icon selection closes its popup; Enter selects the first
search result and Escape dismisses the picker. The reset icon beside Browse icons
restores the action icon. Double-click previews to open folders or go Back.

## Control-specific action choices

Dial turn dropdowns offer repeatable adjustments and navigation: output volume,
microphone level, light brightness/temperature, workspace and page stepping, and
directional/navigation keys. Launches, toggles, screenshots, and push-to-talk
remain available on buttons and dial presses. Volume and other adjustments are
also available on buttons. Existing assignments are preserved, including actions
no longer offered for dial turns; CLI mappings remain unrestricted.

## Button and dial colors

RGB-only buttons have a color picker with RGB sliders, presets, and hex entry.
Display buttons also offer **Color only** and **Color and text** in Button display;
the latter provides separate background and text colors. Colors are saved per
page/folder and survive changes to actions and display modes. Existing buttons
keep their appearance until a color display mode is selected.

Dials show **Dial LED color** only on models with a central LED or LED ring.
The Stream Deck Plus dials do not have these LEDs. LED-capable models use a
single color for the center and ring; physical LED hardware remains unverified.

```bash
bin/omarchy-elgato set-device-display classic 1 color-text
bin/omarchy-elgato set-device-color classic 1 button '#123456'
bin/omarchy-elgato set-device-color classic 1 text '#ffffff'
```

## LCD display above each dial

Select a dial (or click its LCD preview) and use **LCD display above dial**.
Choose **Default status**, **Text only**, **Icon and text**, **Icon only**,
**Color only**, or **Color and text**. Custom modes provide a background color;
text modes also provide a text color and caption. Icon modes use the same
**Browse icons** gallery as buttons. The preview uses the hardware artwork.
Settings belong to each dial on the active page/folder. **Default status** restores
the original status tile while keeping custom settings for later use. LCD colors
are separate from physical dial LED colors.

```bash
bin/omarchy-elgato set-dial-display plus 1 mode icon-text
bin/omarchy-elgato set-dial-display plus 1 icon preset:volume_up.svg
bin/omarchy-elgato set-dial-display plus 1 text Volume
bin/omarchy-elgato set-dial-display plus 1 background '#123456'
bin/omarchy-elgato set-dial-display plus 1 foreground '#ffffff'
```

## Optional action packs

Install your own button and dial actions under `~/.config/omarchy-elgato/actions/`.
Each pack has a versioned JSON manifest, optional icons, dependency checks,
and literal command arrays for press/release. Actions declare which controls
support them, including dial turns. Packs are user-owned and survive reinstalls.
See [the action-pack format and examples](../action-packs/). Diagnose missing
or invalid packs with `bin/omarchy-elgato action-packs`.

Runtime preparation supplies an optional VOXtype **Discard recording** action pack;
it is offered only when VOXtype is installed. Existing packs are preserved.
Live Herdr columns, Wave/Facecam editors, and additional hardware transports
remain separate integration work. Touch navigation is unchanged.

## Reliability and Neo information

The catalog refreshes on opening the editor and while it stays open, so newly
installed applications and action packs become available without a shell restart.
The bar checks connection status while closed and recognizes reachable lights,
while the editor separately indicates whether the selected model is connected.
Network-light discovery keeps a persistent inventory under the plugin's state
directory, retaining lights across temporary discovery failures. Unreachable
lights retain their last readings with an unavailable status. Group dial actions
step each reachable light from its own level instead of copying the first light.

Default dial captions stay within their LCD cells. The Neo information screen
shows the clock/date, active page or folder, default microphone mute state, and
reachable lights that are on. It refreshes when those values change; physical
Neo verification remains outstanding. Touch buttons remain ordinary assignable
RGB controls; no automatic touch navigation is added.

## Icons for action states

For a stateful action, select a button and choose an icon display mode. In the
icon section, **Icon setting** lets you choose **Default icon**, **When Muted**,
**When Unmuted**, or the states declared by that action. Use **Browse icons** to
assign each one. **Current state** reports the observed value. The reset button
removes that state's override. The same controls work on a dial's custom LCD
icon, following its Press action. Launchers retain their normal single icon.

Output mute, microphone mute, and grouped light toggles have built-in states.
Action packs can supply status commands and default icons for arbitrary states;
see [status and state icons](../action-packs/#status-and-state-icons). External
changes update icons automatically. A failed status query uses the unavailable
icon if assigned, otherwise the normal icon. Profiles retain their normal icon,
and state overrides only apply to the action they were configured for.
