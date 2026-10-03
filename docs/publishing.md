# Publishing the website

The site is maintained on the dedicated `website` branch. Plugin development
and documentation remain on `main`. The homepage links to the plugin guides
on GitHub rather than duplicating them here.

## GitHub Pages

1. Push the branch: `git push -u origin website`.
2. Open repository **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Choose **website** and **/docs**, then save.

The site URL is https://dxun-dev.github.io/omarchy-elgato/.
Later pushes to `website` update the site automatically. No build step or
GitHub Actions workflow is required. `docs/.nojekyll` disables Jekyll processing.
All local asset paths are relative, supporting the repository URL and a future
custom domain.

## Preview and checks

Run `npm run dev` and visit http://localhost:8000. Check desktop and mobile
widths, theme switching, installation-command copying, and documentation links.
The server binds only to the local machine. Override its port with `PORT`.

## Typography and assets

Section titles use locally hosted Geist (24–28px, weight 600); smaller
subheadings use Geist (18px, weight 500). The hero title uses JetBrains Mono
(24–30px, weight 500), with a separate decorative wordmark. Font licenses are
included alongside the font files. Screenshots come from the plugin project.
