# Omarchy Elgato — site contributions

> [!IMPORTANT]
> **Beta project.** Omarchy Elgato is currently in beta. Features and behavior may change.

This branch contains the project's marketing site and documentation, built with
**Astro** and **Tailwind CSS v4**. Production is https://omarchy-elgato.dxun.dev/.
The site and plugin share [dxun-dev/omarchy-elgato](https://github.com/dxun-dev/omarchy-elgato):
plugin development lives on `main`, and site development lives on `site`.

## Contribute to the site

Contributions use a fork of
[dxun-dev/omarchy-elgato](https://github.com/dxun-dev/omarchy-elgato/fork).
When creating the fork, clear **Copy the main branch only** so it includes
`site` as well as `main`. Site and documentation pull requests target
`dxun-dev/omarchy-elgato:site`; plugin pull requests target `main`.
This branch omits the plugin source and must not be merged into `main`.

Replace `YOUR-USERNAME` with the GitHub account that owns your fork:

```bash
git clone --branch site git@github.com:YOUR-USERNAME/omarchy-elgato.git omarchy-elgato-site
cd omarchy-elgato-site
git remote add upstream https://github.com/dxun-dev/omarchy-elgato.git
git fetch upstream
git switch -c docs/my-change upstream/site
npm ci
npm run dev
```

Requires Node.js 22.18 or newer. Open **http://localhost:4321/**; Astro reloads as
source files change. Use a descriptive contribution branch name.
`origin` points to your fork; `upstream` points to the original project.
For later contributions, fetch `upstream` again and start a new branch from
`upstream/site`.

If your fork is already checked out for plugin work, create a site worktree
from that checkout instead:

```bash
git fetch upstream
git worktree add -b docs/my-change ../omarchy-elgato-site upstream/site
cd ../omarchy-elgato-site
npm ci
npm run dev
```

Before submitting:

```bash
npm run format
npm run build
npm run preview
```

Check desktop and mobile layouts, all three themes, the install-command copy
button, and navigation between documentation pages. Development, production
builds, and preview serve from `/`. Generated output in `dist/` and Astro caches
are ignored by Git.

After checking your changes, commit and push the contribution branch to your fork:

```bash
git add <changed-files>
git commit -m "Describe the site or documentation change"
git push -u origin docs/my-change
```

Open a pull request with **base repository** `dxun-dev/omarchy-elgato`,
**base branch** `site`, and your fork's contribution branch as the head.
Describe the change and how you checked it. Contributors do not need write
access to the original repository or to configure Pages on their fork.

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
and internal route URLs; it resolves to `/` in development and production builds.

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
upload the Pages artifact, followed by a separate deployment job. Both jobs
require the upstream repository's numeric identity, a non-fork repository, and
a push to `site`. Pull requests and manual runs do not deploy. A fork may show
a skipped workflow run, but it does not build, upload, or deploy through this
workflow. The identity guard does not depend on a maintainer username.

Contributors push to their forks and submit pull requests. Accepted site changes
deploy after merging into upstream `site`; plugin changes update upstream
`main` after acceptance. Repository branch protection controls who can accept
changes; the workflow does not grant contributors repository write access.
The Pages environment accepts only the `site` branch. GitHub Pages uses
**GitHub Actions** as its publishing source because Astro requires a build step.

## License

Website code uses the [MIT license](LICENSE). Font licenses are included in
`src/assets/fonts/`. This community project is not affiliated with Elgato or Corsair.
