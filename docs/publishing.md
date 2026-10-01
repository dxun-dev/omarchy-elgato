# Publication preparation

Follow the [Omarchy publishing guide](https://plugins.omarchy.org/publish.html)
and [development guide](https://plugins.omarchy.org/develop.html).

## Repository and identity

- Public repository: `https://github.com/dxun-dev/omarchy-elgato`.
- Maintainer SSH remote: `git@github.com:dxun-dev/omarchy-elgato.git`.
- Permanent plugin ID: `dxun-dev.omarchy-elgato`. The manifest, QML identity, and
  documented Omarchy commands use this ID.
- The user-data directory stays `omarchy-elgato`, preserving existing profiles,
  icons, and action packs. Disable the old `omarchy-elgato` development plugin
  before enabling the new ID to avoid duplicate hardware services.

Author attribution is publisher metadata, not a dependency on a particular
machine. Keep the original copyright and third-party notices.

## Release validation

1. Build and test the backend; include `dist/` in the public Git repository.
2. Package a clean plugin folder and run `omarchy plugin validate` against it.
3. Validate the QML against the target Omarchy Shell imports.
4. Test installation in a fresh XDG configuration/data directory. The repository
   clone must contain every setup/runtime file and no symlinks or `node_modules`.
5. Verify first-enable runtime preparation, bar/panel operation, disable/re-enable, update, and removal.
   User-owned profiles and extensions should be preserved.
6. Review the README, MIT license, third-party notices, preview, version, and
   declared hardware limitations for the release.
7. Submit the repository link, category, and tags using the marketplace form.

Installation and updates use `omarchy plugin add … --enable` and
`omarchy plugin update`. Omarchy owns discovery, placement, and service lifetime.
On service startup, the launcher prepares locked npm dependencies outside the
plugin directory when absent or outdated. Successful preparation is recorded
against the package files, Node.js version, platform, and architecture; unchanged
runtimes are checked without downloading dependencies. A preparation failure
stops automatic restarts, avoiding repeated downloads. The panel shows
preparation progress and failure details; **Retry setup** restarts the service
through shell IPC. Disabling and re-enabling is also supported.
No system packages or USB rules are changed. Removal is handled by Omarchy and
preserves user data as documented in the README.

The repository was supplied by the maintainer. No marketplace submission or
published listing has been created by this preparation work.
