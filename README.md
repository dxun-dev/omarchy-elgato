# Omarchy Elgato

> [!IMPORTANT]
> **Beta project.** Omarchy Elgato is currently in beta. Features and behavior may change.

Configure Stream Deck buttons and dials, customize their displays, and control
network Elgato Key Lights from the Omarchy Shell bar.

![Stream Deck button editor](preview.png)

[Documentation](https://omarchy-elgato.dxun.dev/docs/) ·
[Usage guide](https://omarchy-elgato.dxun.dev/docs/usage/) ·
[Action packs](https://omarchy-elgato.dxun.dev/docs/action-packs/)

## Requirements

Omarchy Quattro with Omarchy Shell and the `omarchy plugin` commands.
First enable checks system requirements and asks before installing missing
packages or configuring Stream Deck USB access. Administrator authentication
may be requested. The complete package set setup can request is `nodejs` (22.18+), `npm`,
`imagemagick`, `fontconfig`, `ttf-dejavu`, `avahi`, `wireplumber`, `wtype`,
`uwsm`, `gtk3`, and `xdg-utils`, plus their package-manager dependencies.
Only missing requirements are installed. Setup can replace
`/etc/udev/rules.d/70-omarchy-elgato.rules`, reload/trigger hidraw rules, and
start and enable `avahi-daemon.service` if inactive. Runtime dependencies
are prepared automatically in the user-data directory; first setup needs internet
access. Reconnect the Stream Deck after USB access setup if needed.

Physical hardware verification is incomplete. See
[compatibility and limitations](https://omarchy-elgato.dxun.dev/docs/getting-started/#compatibility-and-limitations)
for supported models and features.

## Install

```bash
omarchy plugin add https://github.com/dxun-dev/omarchy-elgato.git --enable
```

Choose where to place the widget, accept any first-enable setup prompt, then
click the Elgato icon to configure your devices. Without `--enable`, setup waits
until the plugin is enabled. If setup is declined or fails, use **Retry setup**
in the editor. For an earlier development install, disable `omarchy-elgato`
before enabling this plugin; existing profiles, icons, and action packs are preserved.

See [getting started](https://omarchy-elgato.dxun.dev/docs/getting-started/) for
setup details and [troubleshooting](https://omarchy-elgato.dxun.dev/docs/troubleshooting/)
for diagnostics. The helper ships inside the plugin at `bin/omarchy-elgato`;
it is not installed globally on PATH.

## Update

```bash
omarchy plugin update dxun-dev.omarchy-elgato
```

Omarchy reloads the plugin and refreshes runtime dependencies when needed,
preserving profiles, icons, action packs, and bar placement.

## Disable or remove

```bash
omarchy plugin disable dxun-dev.omarchy-elgato
omarchy plugin remove dxun-dev.omarchy-elgato
```

Disabling stops the service. Removal deletes or backs up the plugin through
Omarchy. Profiles, custom icons, action packs, state, cache, and runtime dependencies
remain available for reinstalling. System packages, npm cache/logs, the USB access rule, Avahi enablement,
and install/removal backups also remain. Runtime setup seeds the bundled
VOXtype action pack but does not install VOXtype itself.

See the [complete installation inventory](https://omarchy-elgato.dxun.dev/docs/getting-started/#system-packages),
[user-file inventory](https://omarchy-elgato.dxun.dev/docs/getting-started/#user-files),
and [optional removal cleanup](https://omarchy-elgato.dxun.dev/docs/getting-started/#optional-cleanup-after-removal)
for exact paths, USB device matches, npm/runtime contents, service changes,
and commands to reverse them. Setup does not record prior package/service/rule
state, so removal does not automatically undo shared system changes.

To reset personal settings, back up and then remove `~/.config/omarchy-elgato/`
(or `$XDG_CONFIG_HOME/omarchy-elgato/`). This resets mappings, pages, folders,
custom icons, and user-installed action packs. See
[user files](https://omarchy-elgato.dxun.dev/docs/getting-started/#user-files)
for the remaining retained-data locations.

## Documentation and contributions

Detailed documentation is maintained on the `site` branch and published at
[omarchy-elgato.dxun.dev/docs/](https://omarchy-elgato.dxun.dev/docs/).
If the site is unavailable, browse the [Markdown guides on GitHub](https://github.com/dxun-dev/omarchy-elgato/tree/site/src/pages/docs).

- [Plugin development and release validation](https://omarchy-elgato.dxun.dev/docs/development/): builds, tests, local installation, and packaging. Plugin contributions target `main`.
- [Site contributions](https://github.com/dxun-dev/omarchy-elgato/blob/site/README.md): documentation, design, and Astro development. Site contributions target `site`.
- [Release notes](CHANGELOG.md): plugin version history.

Contribute through a [fork](https://github.com/dxun-dev/omarchy-elgato/fork),
using a separate contribution branch. Clone your fork as `origin` and add
`https://github.com/dxun-dev/omarchy-elgato.git` as `upstream` to track the
original project. Push changes to your fork and open a pull request targeting
`main` for the plugin or `site` for the website and documentation. Clear
**Copy the main branch only** when creating your fork if you need both branches.
The linked guides above include checkout, checks, and submission commands.
Keep plugin and site changes in separate pull requests and link them when related.

When behavior changes, update the relevant site guide and this README's lifecycle
instructions if affected. The detailed guides are not duplicated on `main`.

## License and attribution

MIT licensed. This project began as a port of
[Amit Patel's Elgato Control](https://github.com/amitcpatel/omarchy-elgato-control).
The [license](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md)
are retained. Elgato product names identify compatible hardware and do not imply
endorsement or affiliation.
