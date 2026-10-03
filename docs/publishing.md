# Publishing the Astro website

> [!IMPORTANT]
> **Beta project.** Omarchy / Elgato is currently in beta. Features and behavior may change.

Website development lives on `website`; plugin development stays on `main`.
The production URL is https://omarchy-elgato.dxun.dev/.

## GitHub Pages setup

1. Open repository **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Set **Custom domain** to `omarchy-elgato.dxun.dev`.
4. At the DNS provider for `dxun.dev`, add a CNAME record for `omarchy-elgato`
   pointing to `dxun-dev.github.io` (without a repository path).
5. Enable **Enforce HTTPS** once GitHub has verified the domain and provisioned
   the certificate.
6. If the `github-pages` environment restricts deployment branches, allow `website`
   under **Settings → Environments → github-pages**.
7. Push the branch: `git push -u origin website`.

`public/CNAME` contains the production domain and is included in the build.
GitHub Pages custom-domain settings and DNS must also be configured; the local
file does not make those external changes.

`.github/workflows/deploy.yml` uses the official Astro action to install from
`package-lock.json`, build, and upload the site. A separate deployment job publishes
the artifact. Pushes to `website` trigger deployment; manual runs must also target
`website`. No plugin build or plugin dependencies are involved.

## Local validation

Run `npm ci`, then `npm run build` and `npm run preview`.
Visit http://localhost:4321/ and check desktop/mobile widths, themes,
installation-command copying, screenshots, and documentation links.
Use `npm run dev` for development with automatic reloads.

## Configuration and assets

`astro.config.mjs` declares static output and
`site: 'https://omarchy-elgato.dxun.dev'`. There is no repository-path prefix;
development, preview, and production all serve routes from `/`.
Public assets and navigation use `import.meta.env.BASE_URL`, which resolves to `/`.
CSS font imports are bundled automatically. Tailwind CSS v4 uses the
`@tailwindcss/vite` plugin, with CSS-first theme tokens in `src/styles/global.css`.
Generated files in `dist/` are not committed.
