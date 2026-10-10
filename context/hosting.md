# Hosting: ledgersandlearning.com

FACTS is static files only (no server code, nothing uploaded). It will be published on ledgersandlearning.com, a support site for business managers that requires an internal work email to sign in.

## What the repo already does

- **Relative paths.** `vite.config.js` sets `base: './'`, so the build runs from a site root, a subdomain or a folder. Tested served from a sub-folder.
- **No outside requests.** Fonts are served with the app (`src/fonts`, SIL OFL licenses included); the Google Fonts link is gone. In a real browser, with real exports loaded, every request went to the app's own origin.
- **Content-Security-Policy** (meta tag, build only): `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`. No violations in that run. Inline styles are allowed because screens set style attributes. (The AI narrative button, built and then removed on 10/10/2026, briefly added api.anthropic.com to `connect-src`; it is gone again.) If the host can send headers, send the same policy as a real header and add `frame-ancestors 'self'` (a meta tag cannot do that).

## To settle with whoever runs the site

1. **Sign-in must cover the app's files.** A direct link to the app (and to a subdomain, if one is used) should ask for sign-in. Test it signed out.
2. **Own subdomain is safer** (for example `facts.ledgersandlearning.com`). Browser storage is shared by every page on one origin, and FACTS stores school profiles, BARs and parsed reports with employee data. A separate origin keeps other pages and plugins from reading it. The sign-in has to protect that subdomain too.
3. **No site-wide scripts** (analytics, chat widgets, plugins) on the app's pages. They would sit in the same origin as the data.
4. **Who deploys, to where, and the final URL.** `npm run build` writes `dist/`; copy it to the site.
5. **Repo visibility.** The repository is public (user decision 10/10/2026). The Vertex logo files are in it knowingly. No real data is tracked: reports and exports are git-ignored and none is committed.

## Things users are told (About page, written; contact: tim.nguyen@vertexeducation.com)

- Everything runs in your browser; reports are not uploaded. Browser storage can be cleared, so use the backup file.
- Check numbers against the state's reports before submitting anything to OBMS. No warranty.
- Use a current desktop browser.

## Answers from the user (10/10/2026) and what was done

- The site is `facts.ledgerandlearning.com` (shown as "Financial Analysis Control & Tracking System", a suite with Account Code Advisor, Cash Report Tie-Out, Federal Funds, Invoice Generator in a sidebar). All its tools are on that one subdomain, so they share one browser origin.
- **No sign-in is set up yet.** The app keeps nothing on the server, but until sign-in exists anyone can open the page. Sign-in still has to protect the app's files when it is added.
- **No site-wide scripts** (analytics, chat, plugins) run on the site.
- **The site owner deploys.** The BAR Builder is one tool in the suite.
- **BAR Builder-only build** (decided): `npm run build:bar` writes `dist-bar-builder/` with only Load reports, BAR Builder, Schools, How to use and About, and no FACTS header or logo, because the suite has its own frame. The site owner puts that folder at a path such as `/bar-builder/` and adds a sidebar link. The default `npm run build` (whole FACTS app) is unchanged. `npm run dev:bar` runs the same mode locally.
- **Storage names** now start with `barbuilder` (localStorage `barbuilder.v1`, `barbuilder.profiles.v1`, `barbuilder.fy`, `barbuilder.dataVersion`; IndexedDB database `barbuilder`) so other tools cannot clash. Data saved under the earlier `facts.*` names is moved over once on first load. This does not stop another tool on the same origin from reading the data; a separate subdomain would. The user chose prefix names only.

## Decisions from the user (10/10/2026, later)

- **No sign-in and no separate subdomain.** The BAR Builder stays a public page on `facts.ledgerandlearning.com`, sharing one browser origin with the site's other tools. Nothing is stored on the server, but anyone who opens the page can use it, and any tool on that subdomain can read what the BAR Builder keeps in a user's browser (profiles, saved BARs, parsed report rows with employee names). Mitigations that stay: no site-wide scripts on the site, storage names prefixed `barbuilder`, reports pruned after 30 days, "Clear loaded reports", and a plain statement of this on the About page.
- **No real OBMS upload yet.** The user will try one when there is a BAR to upload. Until then the location rule, FTE formula and file layout remain unproven.

## AI narrative (built, then removed 10/10/2026)

An optional button that drafted a longer PED explanation through the Anthropic API was built and then removed at the user's request (it needed each person's own API key). Gone: `src/lib/narrative.js`, `src/lib/aiKey.js`, the `@anthropic-ai/sdk` dependency, the CSP host and the screen section. On load the app deletes any key an earlier build left in the browser (`clearRetiredKeys`). The page again makes no outside requests. If the idea returns, the alternative discussed was a small server holding one company key.
