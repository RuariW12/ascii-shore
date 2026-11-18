# ASCII Shore — Firefox home page

## Run / build

```bash
npm install
npm run dev      # preview at http://localhost:5173
npm run build    # -> dist/index.html (one self-contained file)
```

## Logo

`src/firefox-logo.svg` is a placeholder. Replace it with the real logo SVG
(same file name), then rebuild. It gets inlined into the single file.

## Use it in Firefox

**Home page / new windows:** Settings → Home → *Homepage and new windows* →
*Custom URLs…* → paste the full path to `dist/index.html`, e.g.
`file:///C:/Users/you/ascii-shore-home/dist/index.html`.

**New tabs:** Firefox can't point new tabs at a local file directly. Install the
**New Tab Override** add-on → choose *Local file* → import `dist/index.html`.
Re-import after each rebuild (the add-on stores a copy).
Alternative: keep `npm run dev` running and set New Tab Override to the URL
`http://localhost:5173`.

## Settings

Top of `src/AsciiShore.jsx`: `USER_NAME`, `SEARCH_URL`, `SEARCH_PLACEHOLDER`.
Slider settings (wave speed, reflection, time) are remembered between tabs.
