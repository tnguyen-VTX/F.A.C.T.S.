# Deploying the BAR Builder (for the site owner)

The BAR Builder is static files. There is no server code, no database and nothing is uploaded: every report is read in the user's browser.

## Build

Needs Node 18 or newer.

```bash
npm install
npm run build:bar      # writes dist-bar-builder/  (BAR Builder only; use this one for the suite)
npm run build          # writes dist/  (the whole FACTS app, including the older v0.1 screens)
```

If `npm install` cannot reach `cdn.sheetjs.com` (the spreadsheet reader is downloaded from there), install `xlsx` from the npm registry instead; the app works with 0.18.5 and 0.20.3.

## Put it on the site

1. Copy the whole `dist-bar-builder/` folder to the web server, for example to `/bar-builder/` on `facts.ledgerandlearning.com`. Keep its files together; the page loads `assets/` and `brand/` next to `index.html`.
2. Add a link to it in the suite's sidebar. The page has its own menu (Load reports, BAR Builder, Schools, How to use, About) and its own title; it does not draw a site header.
3. Paths are relative, so any folder works. Serve it over HTTPS.

## Security notes

- **Sign-in:** none is planned (owner's decision). The page is public and holds no data until a user loads reports in their own browser. If sign-in is added later, it must cover this folder's files too.
- **Browser storage:** the page saves school profiles, BARs and the parsed rows of loaded reports (employee names and pay) in the user's browser, under names starting with `barbuilder`. Every tool on the same subdomain shares one browser origin and could read them; no separate subdomain is planned (owner's decision), so keep analytics, chat and other third-party scripts off this site.
- **Content-Security-Policy:** the build adds this as a meta tag: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`. If the server can send headers, send the same policy as a header and add `frame-ancestors 'self'`.
- Nothing needs to be allowed to reach other sites; the page makes no outside requests.

## Check after deploying

- The page loads, the menu shows five items and the title is "BAR Builder".
- Load reports accepts an Account Summary (.xlsx) and a Fund Audit (.csv) and nothing is sent anywhere (browser developer tools, Network tab: only requests to the same site).
- Contact for problems: tim.nguyen@vertexeducation.com.
