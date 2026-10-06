---
layout: ../../layouts/DocsLayout.astro
title: 'Troubleshooting'
description: 'Get help with first-time setup, device access, runtime preparation, and lighting.'
slug: 'troubleshooting'
---

## Setup and runtime

The editor shows runtime preparation progress and failure details. After
resolving the problem (for example, restoring internet access), click **Retry
setup**. For more detail, check `journalctl --user -t omarchy-shell`. You can also
retry through Omarchy:

```bash
omarchy plugin disable dxun-dev.omarchy-elgato
omarchy plugin enable dxun-dev.omarchy-elgato
```

For detailed diagnostics, run
`~/.config/omarchy/plugins/dxun-dev.omarchy-elgato/bin/omarchy-elgato doctor`.
The following helper commands are optional repair tools. Normal installation
only needs the Omarchy install command and its setup confirmations.
`bin/omarchy-elgato setup` remains available to repair the runtime.
To check or repair system requirements, run
`bin/omarchy-elgato install-requirements` in a terminal. Reconnect the Stream Deck
after USB access setup if needed. Network lights must be reachable on the local
network and discoverable through Avahi.

For action packs, run `bin/omarchy-elgato action-packs`. Runtime and status-query
errors are reported by `bin/omarchy-elgato status --json`. Shell load errors
appear in `journalctl --user -t omarchy-shell`.

## Runtime preparation

Installation and updates use `omarchy plugin add … --enable` and
`omarchy plugin update`. Omarchy owns discovery, placement, and service lifetime.
On service startup, the launcher prepares locked npm dependencies outside the
plugin directory when absent or outdated. Successful preparation is recorded
against the package files, Node.js version, platform, and architecture; unchanged
runtimes are checked without downloading dependencies. A preparation failure
stops automatic restarts, avoiding repeated downloads. The panel shows
preparation progress and failure details; **Retry setup** restarts the service
through shell IPC. Disabling and re-enabling is also supported.
First enable opens a terminal confirmation for missing system packages,
Stream Deck USB access rules, and Avahi discovery. Packages are installed using
`omarchy pkg add`; USB access and service changes use administrator
authentication. Removal is handled by Omarchy and preserves user data as
documented in the README.

## Hardware support

See [compatibility and limitations](../getting-started/#compatibility-and-limitations) for implemented features and outstanding hardware verification.

## Still need help?

[Open an issue](https://github.com/dxun-dev/omarchy-elgato/issues) with your device model, the steps to reproduce the problem, and relevant error messages. Review diagnostic output before sharing it, and remove personal paths or private device information.
