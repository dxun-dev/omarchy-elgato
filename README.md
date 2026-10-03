# Omarchy / Elgato — site contributions

> [!IMPORTANT]
> **Beta project.** Omarchy / Elgato is currently in beta. Features and behavior may change.

This branch contains the project's marketing site and documentation, built with
**Astro** and **Tailwind CSS v4**. Production is https://omarchy-elgato.dxun.dev/.
The site and plugin share [dxun-dev/omarchy-elgato](https://github.com/dxun-dev/omarchy-elgato):
plugin development lives on `main`, and site development lives on `site`.

## Contribute to the site

Base site changes and pull requests on `site`. This branch intentionally omits
the plugin source and must not be merged into `main`.

For a new checkout:

```bash
git clone --branch site git@github.com:dxun-dev/omarchy-elgato.git omarchy-elgato-site
cd omarchy-elgato-site
npm ci
npm run dev
```

If you already have the plugin checked out on `main`, use a separate worktree:

```bash
git fetch origin
git worktree add ../omarchy-elgato-site site
cd ../omarchy-elgato-site
npm ci
npm run dev
```

Requires Node.js 22.18 or newer. Open **http://localhost:4321/**; Astro reloads as
source files change. Create a contribution branch from `site`, make your changes,
and open a pull request targeting `site`.

Before submitting:

```bash
npm run format
npm run build
npm run preview
```

Check desktop and mobile layouts, all three themes, the install-command copy
button, and navigation between documentation pages. Development and preview both
serve from `/`. Generated output in `dist/` and Astro caches are ignored by Git.

## Where to make changes

- `src/pages/index.astro`: marketing homepage.
- `src/pages/docs/*.md`: documentation content.
- `src/layouts/DocsLayout.astro`: docs navigation, typography, section links, and previous/next links.
- `src/data/docs.js`: documentation order, labels, and URLs.
- `src/layouts/SiteLayout.astro`: shared metadata, beta banner, header, and footer.
- `src/components/`: reusable page components and Stream Deck illustration.
- `src/styles/global.css`: Tailwind import, font declarations, and theme tokens only.
- `src/scripts/site.js`: persistent themes and install-command copying.
- `src/assets/fonts/`: locally hosted fonts and their licenses.
- `public/`: screenshots, favicon, and production-domain file.
- `astro.config.mjs`: static output, production domain, and Tailwind integration.

Use Tailwind utilities directly in Astro markup for styling. Keep CSS limited to
fonts and theme variables; avoid component selectors and `@apply`. Reuse the
shared layout when adding pages. Use `import.meta.env.BASE_URL` for public assets
and internal route URLs; it resolves to `/` in development and production.

## How documentation is maintained

The site is the single home for detailed plugin documentation under
`src/pages/docs/`. The plugin README on `main` retains a short description,
requirements, installation, updates, safe removal and retained-data notes,
license/attribution, and links to these guides. Detailed Markdown guides are no
longer duplicated on `main`. Its `docs/previews/` folder contains generated
plugin screenshots rather than documentation text.

When changing plugin behavior, update the relevant guide in a contribution
targeting `site`. Update the `main` README too if its requirements or lifecycle
instructions change. The two branches share links, not a documentation-sync
process; builds use the checked-in site guides without fetching `main`.

Each site Markdown page supplies a title, description, slug, and shared layout;
begin content headings at `##` because the layout renders the page title. Update
`src/data/docs.js` when adding or reordering guides, and check relative links.
Code blocks use plain text rendering so theme-aware styling remains in Tailwind
utilities without inline syntax-highlighter styles.

## Deployment for maintainers

The workflow in `.github/workflows/deploy.yml` builds and deploys pushes to `site`.
It uses the Astro action to install from `package-lock.json`, build `dist/`, and
upload the Pages artifact, followed by a separate deployment job. Manual workflow
runs must target `site`. GitHub Pages uses **GitHub Actions** as its publishing
source because Astro requires a build step.

In this repository's **Settings → Pages**, select **GitHub Actions** and set the
custom domain to `omarchy-elgato.dxun.dev`. If the `github-pages` environment limits
deployment branches, allow `site`. Configure the `omarchy-elgato` DNS CNAME to
point to `dxun-dev.github.io`, then enable HTTPS after verification and certificate
provisioning. `public/CNAME` is included in the build; it does not configure
repository settings or DNS by itself.

See [GitHub's publishing-source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## License

Website code uses the [MIT license](LICENSE). Font licenses are included in
`src/assets/fonts/`. This community project is not affiliated with Elgato or Corsair.
