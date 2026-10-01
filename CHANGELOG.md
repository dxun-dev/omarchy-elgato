# Changelog

## 0.0.1 — Initial release

Prepared for the first public release; publication and tagging are pending.

### Features

- Omarchy bar widget with a configurable editor and detachable window.
- Stream Deck button, dial-turn, and dial-press mappings, with offline model previews.
- Per-model pages and nested folders, including global page navigation.
- Custom icons, captions, display colors, and state-specific toggle artwork.
- Dial LCD artwork and Neo information-screen support.
- Network Key Light discovery and individual or grouped controls.
- User-installed action packs with command handlers and status queries.
- Installation and updates through Omarchy's plugin commands, with automatic
  runtime preparation, visible setup errors, and retry from the editor.
- Serialized profile initialization, migration, and edits; queued editor saves
  preserve captions when switching controls, pages, or closing the editor.

### Known limitations

- Multiple devices of the same model share mappings and page state.
- Physical verification is incomplete across the full supported model range;
  additional models have automated mock coverage.
- Touch gestures, Studio NFC, Network Dock transport, Wave-specific controls,
  Facecam controls, and live tile providers are not implemented.

See [compatibility and limitations](README.md#compatibility-and-limitations)
for details and [installation](README.md#install) to get started.
