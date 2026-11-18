# ASCII Shore — Firefox Home Page

An animated ASCII-art beach scene (waves rolling onto a shore under a full 24-hour
day/night cycle) that serves as Ruari's Firefox home page and new-tab page, with a
Claude-style greeting and a frosted-glass search bubble on top.

- **Phase 1 (done):** the ASCII animation itself.
- **Phase 2 (current):** turning it into a home page (greeting, logo, search, Firefox setup).

---

## Working with Ruari

- Windows 11, PowerShell, VS Code + Claude Code.
- When making code changes, **keep explanations brief** — a short summary of what changed
  is preferred over long walkthroughs.
- Aesthetic direction is the priority: **dark, moody, dreamy**. Daytime should feel
  "aesthetic", muted and hazy, never a bright postcard beach. Sunrise/sunset should be
  warm orange and beautiful. Night should be dark with reflective blue.
- Ruari iterates visually ("a little less X", "I don't like the shape"). When a shape or
  style is subjective, offering 2–4 small options before committing has worked well.
- Prefer subtle over loud: subtle horizon, rare wildlife, small fins.

## Location on disk

The project lives in Downloads, **nested one level** (Windows "Extract All" created it):

```
C:\Users\rxwha\Downloads\ascii-shore-home\ascii-shore-home\
```

Firefox points at the built file:

```
file:///C:/Users/rxwha/Downloads/ascii-shore-home/ascii-shore-home/dist/index.html
```

Don't move/rename this folder without updating Firefox's settings (see Deployment).

---

## Stack & commands

- React 19 + Vite 8, `vite-plugin-singlefile` (everything inlined into one HTML file).
- No other runtime dependencies. No CSS framework — styles are a template string
  (`CSS`) injected via `<style>` inside the component.

```powershell
npm install
npm run dev      # http://localhost:5173 (hot reload) — use for iterating
npm run build    # -> dist/index.html, single self-contained file (~250 KB)
```

If PowerShell blocks npm ("running scripts is disabled"):
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## File layout

```
ascii-shore-home/
├─ CLAUDE.md                  ← this file
├─ README.md                  ← short user-facing setup notes
├─ index.html                 ← Vite entry; sets black bg, no scroll
├─ vite.config.js             ← react() + viteSingleFile(), base "./"
├─ package.json
├─ src/
│  ├─ main.jsx                ← createRoot(...).render(<AsciiShore />)
│  ├─ AsciiShore.jsx          ← EVERYTHING: scene, UI, styles (~1150 lines)
│  └─ firefox-logo.svg        ← PLACEHOLDER (neutral circle); user swaps in real logo
├─ firefox-newtab/
│  ├─ autoconfig.js           ← for Option B new-tab setup (LF line endings!)
│  └─ autoconfig.cfg          ← path must be edited to the dist/index.html above
└─ dist/index.html            ← build output Firefox loads
```

---

## Architecture of `src/AsciiShore.jsx`

Single file, organized top-to-bottom:

1. **Home-page settings** — `USER_NAME`, `SEARCH_URL`, `SEARCH_PLACEHOLDER`, `STORAGE_KEY`.
2. **Scene constants** — font/grid (`FONT_SIZE` 13, `LINE_HEIGHT` 1.1), wave timing
   (`TRAVEL`, `SWASH`, `MAXW`, `STREAMS`, `MAX_LIFE`), `sunX(hour)`, character ramps.
3. **Helpers** — `clamp`, `smooth`, `mix` (RGB lerp), `css` (rgb/rgba string),
   `hash(x,y)` (integer hash → [0,1)), `vnoise(x,y)` (value noise).
4. **Time-of-day looks** — `NIGHT`, `DAY` base objects and `KEYS` (keyframes by hour);
   `sampleTime(hour)` blends adjacent keys with smoothstep.
5. **Palette** — `RAMP_SIZES`, ramp indices (`WATER FOAM SAND WET STAR CLOUD SUN HAZE FIN BIRD`),
   `buildPalette(look)` → flat array of CSS color strings.
6. **UI helpers** — `HOUR_NAMES`, `fmtHour`, `DEFAULTS`, `loadSettings`/`saveSettings`
   (localStorage), `toDestination` (URL vs search), `greetingFor`, `HomeHeader` component.
7. **Wildlife** — `nextSighting`, dolphin roll frames (`ROLL_SMALL`, `ROLL_LARGE`, `ROLLS`),
   bird frames (`BIRD_SMALL`, `BIRD_BIG`).
8. **`AsciiShore` component** — state, the canvas `useEffect` animation loop, JSX.
9. **`CSS`** — all styles (control panel `.shore-*`, home page `.home-*`).

### Rendering pipeline (per frame, inside the `useEffect`)

The scene is a **character grid drawn on a `<canvas>`** with `fillText`, not DOM.

1. **Timing** — `dt` from rAF (capped 50 ms). `simT += dt * speed` drives waves (wave-speed
   slider); `rt` (real time) drives star twinkle, cloud drift, wildlife.
2. **Time-of-day easing** — `curHour` eases toward the slider's target hour (wraps across
   midnight via shortest path). When it changes, `look = sampleTime(curHour)` and
   `palette = buildPalette(look)` are rebuilt.
3. **Layout** — `H` = horizon row (36% of rows), `S0` = mean shoreline row (70%).
   `d = (y - H) / span` is normalized distance from horizon (0) to shore (1).
4. **Waves** — collect active waves from `STREAMS` (see below) into `travel[]` (still moving
   in) and `swash[]` (running up/down the sand).
5. **Per-column geometry** — for each column x: shoreline `edge[x]`, `base[x]`, wet-sand reach
   (`wetReach`, `wetAmt`), lingering foam (`residual`), edge foam (`lead`); and for each
   traveling wave: `crestY[i][x]`, breaking amount `brk[i][x]`, strength `str[i][x]`.
6. **Wildlife overlay** — spawn/update dolphin pods and bird flocks; write their glyphs into
   `overlay` (a `Map` keyed by `y*cols+x` → `[ramp, level, char|null]`). `null` char = a
   transparent hole (cell is suppressed but nothing drawn).
7. **Cells** — loop every cell: overlay first; then SKY (sun disc → clouds → horizon
   line/haze → stars), WATER (swell noise, ripple highlights, glints, sun path, crests,
   foam), WET SAND, DRY SAND. Each visible cell calls `put(ramp, level, char, px, py)`.
8. **Backgrounds** — sand fill, sky linear gradient, sun radial glow, per-column water
   gradient rects (follows the moving shoreline), wet-sand tint (alpha = wetness).
9. **Draw** — `put` pushes into **color buckets** (one per palette entry); each bucket sets
   `fillStyle` once and draws all its chars. This batching is the main perf trick — keep it.

Typical frame cost ~9–10 ms at 1440×900 in headless tests. Avoid per-cell allocations,
string building, or `fillStyle` changes inside the cell loop.

### Color system

- Colors never get hard-coded per cell. A cell picks a **ramp** + **level (0–1)**; the
  palette maps that to a quantized color for the current time of day.
- Ramps come from the current `look` (keyframe blend):
  - `WATER`: `wDark → wMid → wLight → glint` (water stays **blue at all hours**; only `glint`
    takes on sky color, e.g. orange at sunset)
  - `FOAM`: `foamDim → foamMid → foamBright`
  - `SAND`, `WET`, `STAR` (`starDim/Bright`), `CLOUD`, `SUN` (`sunEdge/sunCore`)
  - `HAZE`: horizon line/haze, derived from `skyHor`
  - `FIN`, `BIRD`: **derived** in `buildPalette` from background luminance — light/moonlit on
    dark backgrounds, dark silhouettes on bright ones.
- Background fills use `skyTop`, `skyHor`, `wBgFar`, `wBgNear`, `sandBg`, `wetBg`.
- Other per-key scalars: `stars` (0–1 visibility), `clouds` (coverage), `sunEl` (sun
  elevation in horizon-heights; <0 below horizon, >1.3 off-screen), `vignette` (overlay opacity).

### Time-of-day keyframes (`KEYS`)

Hours → look: 0–3.5 night · 4.6 before dawn · 5.3 first light (mauve/pink) · 6 sunrise
(orange, sun on horizon) · 7.2 golden morning · 9.5 morning (hazy blue) · 12.5 midday ·
15.5 afternoon (slightly warm) · 17 golden evening · 18 sunset (deep orange) · 19 dusk
(magenta) · 20 blue hour · 21.3+ night.

To change how an hour looks, edit its key (or add one). Keys spread `...NIGHT` / `...DAY`
and override fields. Keep `wBgFar` muted at sunrise/sunset so the water reads blue, not brown.

**Sun position:** `sunX(hour)` — rises on the **left** (~22% width at 6 AM), sets on the
**right** (~68% at 6 PM). The sun's glow, glitter path on the water, and wet-sand sheen all
use this x. This was an explicit request; keep it.

### Waves (`STREAMS`)

Three overlapping wave sets with jittered timing so the sea doesn't repeat:

| stream | size | reaches shore | width | notes |
|---|---|---|---|---|
| swell | big (0.65–1.0) | always (`reach: 1`) | wide (1.0–2.4 × screen half-width) | `skip: 0.12` makes lulls |
| middle | medium | ~50% | partial | others fade out mid-way |
| chop | small | never | narrow | die 35–90% of the way in |

Each wave gets deterministic random params from `hash(id, n)`: start jitter, travel time,
amplitude, `pMax` (where dying waves fade), lateral center/width (`cx`, `hw`), and `tilt`
(slight angle). Smaller waves break closer to shore. Swash run-up scales with
amplitude × lateral window. Tuning knobs: `period`, `jitter`, `reach`, `skip`, `amp`, `width`.

### Wildlife

- **No sliders** (removed by request). Each kind appears on its own random timer of
  **1–3 minutes** (`nextSighting`). First sightings come sooner (15–45 s after load).
- **Dolphins** — pods of 1–4, **far out only**: `d` in 0.05–0.22 (very near the horizon).
  Style is the **"rolling arc"** (chosen from options): single row, back rolls through the
  surface with a small fin: `_ → .-. → .^. → _^. → .` (`ROLL_SMALL`, 3 wide) or the
  5-wide `ROLL_LARGE` for slightly nearer pods. Frames flip with swim direction so the head
  dips first. Light splash at surfacing/diving + faint wake. Members spaced ≥ arc width + 2.
  - Rejected styles (don't reintroduce): tall 2–3-row fins, straight `/|` shark fins, the
    hooked `_, / /` fin — "too big", "don't like the shape".
- **Birds** — flocks of 3–8 crossing the sky in a V or loose group, flapping/gliding/bobbing.
  `v` for small/far, `\/` for ~35% larger/closer flocks; glide pose is `v`/`\/` so they always
  read as birds. **Never at night**: only spawn when `look.stars < 0.35` (≈5 AM–7 PM);
  a timer that fires at night is skipped and rescheduled.

### Home page UI (`HomeHeader`)

- Positioned at `top: 17vh`, centered, inside the sky area.
- **Greeting** like a blank Claude chat: serif (Iowan Old Style / Palatino / Georgia),
  `[logo] Good afternoon, Ruari`. Uses the **real clock** (not the scene's time slider):
  5–11 morning, 12–16 afternoon, 17–23 evening, 0–4 "Hello, night owl". Updates every 30 s.
- **Logo**: `import logoUrl from "./firefox-logo.svg"` so Vite inlines it into the single
  file. Hidden automatically if it fails to load. **Do not draw/recreate the Firefox logo
  in code** — the user supplies the official SVG and replaces the placeholder file.
- **Search bubble**: frosted glass (`backdrop-filter: blur(14px) saturate(115%)`, 7% white
  fill, 1px translucent border), pill shape, 54 px tall, `min(680px, 88vw)` wide; magnifier
  icon (generic, hand-made SVG); `↵` hint appears while typing; `autoFocus`.
  `toDestination()`: full URLs → open; `localhost[:port]` → http; `something.tld[/path]`
  with no spaces → https; anything else → DuckDuckGo search.
- `document.title = "New Tab"`.

### Control panel

- Right edge, vertically centered, **collapsed by default** (tab `‹` peeks out; closed
  transform `translate(calc(100% - 10px), -50%)` hides the body fully).
- Sliders: **wave speed** (0–3×), **reflection** (0–200%: ripple highlights, glints, sun
  path, wet-sand sheen), **time** (0–23, one step per hour; track shows the day's sky
  colors; label shows e.g. "6 PM" + "sunset"). Reset button.
- Settings `{speed, reflect, hour, open}` persist in `localStorage[STORAGE_KEY]`
  (wrapped in try/catch). Note: the home page (file://) and New Tab Override's stored copy
  have **separate** storage, so settings may differ between them.
- Default hour is 22 (night) — the original vibe.

---

## Deployment to Firefox (Windows 11)

After any change: `npm run build`, then:

- **Home page / new windows**: `about:preferences#home` → *Homepage and new windows* →
  *Custom URLs…* → the `file:///…/dist/index.html` path above. Picks up rebuilds automatically.
- **New tabs** (Firefox can't natively point new tabs at a local file):
  - **Option A — New Tab Override add-on**: type *Local file* → import `dist/index.html`;
    enable "focus the website instead of the address bar". It stores a **copy**, so
    **re-import after every rebuild**.
  - **Option B — autoconfig** (reads the file live): copy `firefox-newtab/autoconfig.cfg` to
    `C:\Program Files\Mozilla Firefox\` and `firefox-newtab/autoconfig.js` to
    `C:\Program Files\Mozilla Firefox\defaults\pref\` (admin). Edit the path in the .cfg.
    Both files must start with a `//` comment line and `autoconfig.js` must use **LF** line
    endings. Uses `ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs")`
    (the old `AboutNewTab.jsm` form broke in Firefox 136). Fully restart Firefox after changes.
    With this option, focus starts in the address bar.

### Why single-file

`file://` pages can't reliably load separate module scripts/assets, and New Tab Override
only stores one HTML file. `vite-plugin-singlefile` inlines JS, CSS, and the SVG logo.
**Keep the build single-file**: don't add runtime fetches of local files, external fonts
that are required to render, or assets referenced by path (import them so Vite inlines them).

---

## Conventions & gotchas

- **ASCII only in the scene** — all visuals are characters on the grid (plus background
  gradients). Don't introduce images/emoji into the scene.
- **Deterministic noise**: use `hash`/`vnoise` (seeded by position/time buckets) rather than
  `Math.random()` inside the cell loop, otherwise glyphs flicker every frame. `Math.random()`
  is fine for one-off spawn parameters.
- `hash` truncates inputs with `| 0`; pass integers (or values that are fine to floor).
- Keep new visual elements tied to the palette (`put(RAMP, level, ...)`) so they recolor
  with the time of day automatically. If a new element needs its own color family, add a
  ramp: extend `RAMP_SIZES`, add an index constant, and push its stops in `buildPalette`.
- Things layered over the scene that must suppress underlying chars → use `overlay`.
- Refs vs. state: sliders write to `params.current`, which the animation loop reads each
  frame — the canvas effect runs once (`[]` deps) and is never restarted. Keep it that way.
- Perspective: things farther out (small `d`) are smaller/slower; scale sizes and speeds by
  `persp = 0.1 + 0.9 * d`.
- Avoid putting bright UI over the busy shoreline; the sky region (top ~36%) is where
  overlaid UI reads best.
- The vignette is a CSS radial-gradient overlay whose opacity follows `look.vignette`.

## Design history (decisions already made — don't regress)

1. Started as a black-sky, dark-blue ASCII shoreline with white ripples/foam.
2. **Moon removed** (didn't want it in the top-right); **stars kept**.
3. Horizon made **subtly** more visible (faint line, thin haze, slight sheen on far water).
4. Hue slider **replaced** by a 24-hour time-of-day slider; water stays blue at all hours.
5. Waves made less predictable: multiple overlapping sets, small waves that die before shore.
6. Dolphins + birds added → fins made smaller/curvier → switched to rolling arc →
   moved very far out → sliders removed, rarity set to 1–3 min, birds disabled at night.
7. Sun rises left, sets right.
8. Phase 2: greeting + logo slot + glass search bubble; panel collapsed by default;
   settings persisted; single-file build for Firefox.

## Ideas not yet done (only if asked)

- "Live" mode: scene time follows the real clock (greeting already does).
- Moon phase or shooting stars at night (moon was removed once — ask first).
- Quick links / bookmarks row under the search bar.
- Keyboard shortcut (e.g. `/`) to focus the search bubble when focus starts in the URL bar.
- Search suggestions dropdown.

## Verifying changes

- Fastest: `npm run dev` and look at it. Use the time slider to check several hours
  (at least night 22, sunrise 6, midday 12, sunset 18), since every visual change must look
  right across the whole palette range.
- Before finishing: `npm run build` and open `dist/index.html` directly from disk to confirm
  it works over `file://` (check the browser console for errors).
