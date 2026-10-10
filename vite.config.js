import { defineConfig } from 'vite';

// The app is static files only. It must not load anything from another host, so the built page
// carries a Content-Security-Policy that allows only its own files. (Dev keeps the default, because
// Vite's hot reload needs a websocket.)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // screens set inline style attributes
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

export default defineConfig({
  // Relative paths, so the build works from the site root, a subdomain or a folder.
  base: './',
  plugins: [
    {
      name: 'csp-meta',
      apply: 'build',
      transformIndexHtml: (html) =>
        html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
    },
  ],
});
