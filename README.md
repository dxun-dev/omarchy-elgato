# Elgato Controls for Omarchy — website

This branch contains the GitHub Pages website for Elgato Controls for Omarchy.
The plugin source and installation documentation live on the [main branch](https://github.com/dxun-dev/omarchy-elgato/tree/main).

## Local preview

Requires Node.js 22.18 or newer. No dependencies or build step are needed.

```bash
npm run dev
```

Open http://localhost:8000. Use `PORT=8001 npm run dev` to choose another port.

## Files

- `docs/index.html`: homepage and content.
- `docs/style.css`: layout, typography, and theme colors.
- `docs/site.js`: theme selection and install-command copying.
- `docs/site-assets/`: illustration icon, editor screenshot, and licensed fonts.
- `docs/previews/`: dial and Key Light screenshots.
- `scripts/preview-site.mjs`: local Node.js preview server.

## Publishing

Push the `website` branch, then select **Settings → Pages → Deploy from a branch → website → /docs**.
The published URL is https://dxun-dev.github.io/omarchy-elgato/.
See [publishing instructions](docs/publishing.md) for details.

Keep website changes on `website` and plugin development on `main`.
Do not merge the site-only branch into `main`: it intentionally omits plugin files.

## License

Website code uses the [MIT license](LICENSE). Geist and JetBrains Mono are
locally hosted with their respective licenses in `docs/site-assets/fonts/`.
This community project is not affiliated with Elgato or Corsair.
