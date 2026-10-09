# Style and branding

FACTS uses Vertex Education branding. Source: https://brand.vertexeducation.com/ (the planning session could not reach it; the details below were pasted by the user). The 2022 presentation template is dated; the web guide wins where they differ.

## Colors

| Name | Hex | Use |
|---|---|---|
| Vertex Blue | #003865 | Primary. Use whenever possible. |
| Vertex Gray | #707372 | Secondary |
| Vertex Gold | #CBA052 | Secondary |
| Dark Gray | #404342 | Neutral |
| Light Gray | #C0C3C2 | Neutral |
| White | #FFFFFF | Neutral |
| Tertiary Green | #2DA44A | Sparingly |

Define as tokens on `:root` with light and dark variants. No hex was given for the gradient blues in the icons.

Cautions: red already means over budget in FACTS and green means positive, so keep brand green and gold out of status colors. Check WCAG AA contrast for text on Vertex Blue and on gold.

## Fonts

- Headlines: Europa Bold (Adobe license). Use **Red Hat Display** instead (Bold for titles).
- Body: **DM Sans**. Fallback: Arial.
- Self-hosted in `src/fonts` (variable fonts, OFL licenses beside them); the app loads nothing from Google. The supplied zip also holds Arsenal, which the guide does not mention; it is not used. Done 10/9/2026.
- Colors: the palette is in `src/styles.css` as `--vx-*` tokens. Vertex Blue drives primary buttons, focus rings and headings in the light theme; the dark theme keeps a lighter blue for contrast. Gold and gray are defined but not used yet. Logos are still to do (files not in the repo).

## Logos

- Do not rotate, recolor, crop or squeeze. Do not place the standard logo on a colored background or an image.
- The reversed (white) wordmark and the white-on-blue mountain icon are approved on a Vertex Blue header (confirmed by the user).
- Use the full-color logo on white or light areas only.
- The mountain icon is the favicon.
- Original logo files are in `assets/` (PNG and JPG, supplied by the user; see `assets/README.md`). The app uses the reversed wordmark on a Vertex Blue band at the top of the sidebar (same in light and dark themes) and the square mountain icon as the favicon, as resized copies in `public/brand/`. Confirm the repository is private before keeping brand files in it.
- Do not copy NMPED or OBMS logos or imagery. The in-app BAR view mirrors OBMS's layout only and stays neutral.

## Tone for anything sent to the state

Plain, factual, one sentence of purpose. Justifications are rule-based templates the user can edit. Max 255 characters, no double quotes or pipes.
