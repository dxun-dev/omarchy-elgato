# Publishing the Astro website

> [!IMPORTANT]
> **Beta project.** Omarchy / Elgato is currently in beta. Features and behavior may change.

Website development lives on `website`; plugin development stays on `main`.

## GitHub Pages setup

1. Open repository **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. If the `github-pages` environment restricts deployment branches, allow `website`
   under **Settings → Environments → github-pages**.
4. Push the branch: `git push -u origin website`.

`.github/workflows/deploy.yml` uses the official Astro action to install from
`package-lock.json`, build, and upload the site. A separate deployment job publishes
the artifact. Pushes to `website` trigger deployment; manual runs must also target
`website`. No plugin build or plugin dependencies are involved.

The published URL is https://dxun-dev.github.io/omarchy-elgato/.

## Local validation

Run `npm ci`, then `npm run build` and `npm run preview`.
Visit http://localhost:4321/omarchy-elgato/ and check desktop/mobile widths,
themes, installation-command copying, screenshots, and documentation links.
Use `npm run dev` for development with automatic reloads.

## Configuration and assets

`astro.config.mjs` declares static output, `site: 'https://dxun-dev.github.io'`,
and `base: '/omarchy-elgato'`. Homepage public assets use `import.meta.env.BASE_URL`;
CSS font imports are bundled automatically. Tailwind CSS v4 uses the
`@tailwindcss/vite` plugin, with CSS-first theme tokens in `src/styles/global.css`.

For a future custom domain, change `site`, remove or update `base`, and add the
requested domain to `public/CNAME`. Generated files in `dist/` are not committed.
