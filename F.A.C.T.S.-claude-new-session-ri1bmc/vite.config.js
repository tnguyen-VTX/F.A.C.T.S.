import { defineConfig } from 'vite';

// The app is static files only. It must not load anything from another host, so the built page
// carries a Content-Security-Policy that allows only its own files. (Dev keeps the default, because
// Vite's hot reload needs a websocket.) The one outside host is the AI service, used only when the user
// previews and sends a narrative request (src/lib/narrative.js).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'", // screens set inline style attributes
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.anthropic.com",
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
