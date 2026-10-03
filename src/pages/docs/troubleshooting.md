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
Manual `bin/omarchy-elgato setup` remains available to repair the runtime.
To check or repair system requirements, run
`bin/omarchy-elgato install-requirements` in a terminal. Reconnect the Stream Deck
after USB access setup if needed. Network lights must be reachable on the local
network and discoverable through Avahi.

For action packs, run `bin/omarchy-elgato action-packs`. Runtime and status-query
errors are reported by `bin/omarchy-elgato status --json`. Shell load errors
appear in `journalctl --user -t omarchy-shell`.

## Hardware support

See [compatibility and limitations](../getting-started/#compatibility-and-limitations) for implemented features and outstanding hardware verification.

## Still need help?

[Open an issue](https://github.com/dxun-dev/omarchy-elgato/issues) with your device model, the steps to reproduce the problem, and relevant error messages. Review diagnostic output before sharing it, and remove personal paths or private device information.
