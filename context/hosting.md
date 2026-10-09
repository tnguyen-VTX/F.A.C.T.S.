# Hosting: ledgersandlearning.com

FACTS is static files only (no server code, nothing uploaded). It will be published on ledgersandlearning.com, a support site for business managers that requires an internal work email to sign in.

## What the repo already does

- **Relative paths.** `vite.config.js` sets `base: './'`, so the build runs from a site root, a subdomain or a folder. Tested served from a sub-folder.
- **No outside requests.** Fonts are served with the app (`src/fonts`, SIL OFL licenses included); the Google Fonts link is gone. In a real browser, with real exports loaded, every request went to the app's own origin.
- **Content-Security-Policy** (meta tag, build only): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`. No violations in that run. Inline styles are allowed because screens set style attributes. When the AI narrative button is built, add its API host to `connect-src` and nothing else. If the host can send headers, send the same policy as a real header and add `frame-ancestors 'self'` (a meta tag cannot do that).

## To settle with whoever runs the site

1. **Sign-in must cover the app's files.** A direct link to the app (and to a subdomain, if one is used) should ask for sign-in. Test it signed out.
2. **Own subdomain is safer** (for example `facts.ledgersandlearning.com`). Browser storage is shared by every page on one origin, and FACTS stores school profiles, BARs and parsed reports with employee data. A separate origin keeps other pages and plugins from reading it. The sign-in has to protect that subdomain too.
3. **No site-wide scripts** (analytics, chat widgets, plugins) on the app's pages. They would sit in the same origin as the data.
4. **Who deploys, to where, and the final URL.** `npm run build` writes `dist/`; copy it to the site.
5. **Repo visibility.** Fonts are open-licensed; logos and real data must not go into a public repo.

## Things users should be told (About page, still to write)

- Everything runs in your browser; reports are not uploaded. Browser storage can be cleared, so use the backup file.
- Check numbers against the state's reports before submitting anything to OBMS. No warranty.
- Use a current desktop browser.
