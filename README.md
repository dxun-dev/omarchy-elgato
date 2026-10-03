# Elgato Controls for Omarchy — website

The project website uses **Astro** for static site generation and **Tailwind CSS v4**
through its Vite plugin. The current Elgato / Omarchy design, locally hosted fonts,
three color themes, screenshots, and installation-command copying are preserved.

The plugin source and guides live on the [main branch](https://github.com/dxun-dev/omarchy-elgato/tree/main).
Keep website changes on `website`; do not merge this site-only branch into `main`.

## Development

Requires Node.js 22.18 or newer.

```bash
npm ci
npm run dev
```

Open **http://localhost:4321/omarchy-elgato/**. Astro reloads as source files change.

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. Preview uses the same repository base
path as GitHub Pages. Generated output and Astro caches are ignored by Git.

## Structure

- `src/pages/index.astro`: homepage content and sections.
- `src/layouts/SiteLayout.astro`: document metadata, global styles, and shared shell.
- `src/components/`: header, footer, and Stream Deck illustration.
- `src/styles/global.css`: Tailwind v4 import, font declarations, and theme tokens only.
- `src/scripts/site.js`: theme persistence and clipboard behavior.
- `src/assets/fonts/`: locally hosted Geist and JetBrains Mono, with licenses.
- `public/`: screenshots, favicon, and files copied directly into the build.
- `astro.config.mjs`: static output, GitHub Pages URL/base, and Tailwind Vite integration.

All visual styling uses Tailwind utility classes directly in Astro markup, including
responsive variants, focus states, and illustration effects. Keep CSS limited to
font declarations and shared theme variables; avoid component selectors and `@apply`.

Add pages under `src/pages/` and reuse the shared layout. Prefix public asset and
internal route URLs with `import.meta.env.BASE_URL` so they work on GitHub Pages.
Fonts are bundled from CSS; Astro resolves their generated URLs automatically.

## Publishing

Set repository **Settings → Pages → Source** to **GitHub Actions**, then push
`website`. The workflow builds with Astro and deploys `dist/` to:

https://dxun-dev.github.io/omarchy-elgato/

See [publishing instructions](docs/publishing.md) for deployment details.

## License

Website code uses the [MIT license](LICENSE). Font licenses are included in
`src/assets/fonts/`. This community project is not affiliated with Elgato or Corsair.
