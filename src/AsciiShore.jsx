import { useEffect, useMemo, useRef, useState } from "react";

// ---------- home page settings ----------
const USER_NAME = "Ruari";
// The scene and greeting follow the real clock in this time zone (EST/EDT handled automatically).
const TIME_ZONE = "America/New_York";
const SEARCH_URL = "https://duckduckgo.com/?q=";
const SEARCH_PLACEHOLDER = "Search with DuckDuckGo or enter address";
const STORAGE_KEY = "ascii-shore-settings";

/*
  AsciiShore — ASCII waves rolling onto a beach, with a 24-hour day/night cycle.
  Drop into any React app (Vite / CRA / Next client component) and render <AsciiShore />.
*/

const FONT_SIZE = 13;
const LINE_HEIGHT = 1.1;

// wave timing (seconds at 1x speed)
const TRAVEL = 9.5; // base horizon -> shore time
const SWASH = 5; // run-up + backwash on the sand
const MAXW = 14; // max waves traveling at once

// Three overlapping wave sets with jittered timing, so the sea never repeats:
//   swell  — big, wide sets that always reach the beach (sometimes skip → lulls)
//   middle — medium waves; about half fade out before shore
//   chop   — small, narrow ripples that die partway in
// amp/width/travel are [min, max]; width is the half-width as a fraction of screen
const STREAMS = [
  { period: 7.6, jitter: 0.45, offset: 0, amp: [0.65, 1.0], reach: 1, skip: 0.12, width: [1.0, 2.4], travel: [0.92, 1.15] },
  { period: 5.3, jitter: 0.6, offset: 2.1, amp: [0.35, 0.7], reach: 0.5, skip: 0.1, width: [0.3, 0.85], travel: [0.85, 1.25] },
  { period: 3.4, jitter: 0.75, offset: 1.3, amp: [0.16, 0.38], reach: 0, skip: 0.05, width: [0.1, 0.35], travel: [0.8, 1.3] },
];
const MAX_LIFE = TRAVEL * 1.3 + SWASH * 2.4;

// sun column as a fraction of width: rises on the left (6 AM), sets on the right (6 PM),
// sweeping across in between
const sunX = (hour) => 0.22 + 0.46 * clamp((hour - 6) / 12);

const WATER_CH = ".-~~=≈"; // . - ~ ~ = ≈
const FOAM_CH = ".:°oO*%#@";
const SAND_CH = ".,:;'`";
const CLOUD_CH = " .:-~=+*";
const SUN_CH = ".:-=+*%#@";

// ---------- helpers ----------
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (t) => t * t * (3 - 2 * t);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) =>
  a >= 1
    ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
    : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// =====================================================================
// Time-of-day looks. Each key sets the scene at an hour; hours between
// keys blend smoothly. Water ramps stay blue throughout — only the
// reflections (glint) pick up the sky's color.
// =====================================================================
const NIGHT = {
  skyTop: [0, 0, 0], skyHor: [6, 9, 22],
  wBgFar: [4, 8, 18], wBgNear: [0, 0, 0], sandBg: [0, 0, 0], wetBg: [3, 6, 16],
  wDark: [5, 10, 24], wMid: [20, 48, 102], wLight: [68, 118, 190], glint: [200, 222, 255],
  foamDim: [60, 72, 92], foamMid: [150, 165, 190], foamBright: [245, 250, 255],
  sandDim: [18, 17, 17], sandBright: [70, 66, 60], wetDim: [8, 13, 28], wetBright: [85, 115, 165],
  starDim: [26, 32, 50], starBright: [236, 240, 255], stars: 1,
  cloudDark: [6, 8, 16], cloudLight: [26, 30, 48], clouds: 0.3,
  sunEdge: [0, 0, 0], sunCore: [0, 0, 0], sunEl: -0.6, vignette: 0.75,
};

const DAY = {
  ...NIGHT,
  skyTop: [80, 128, 172], skyHor: [196, 212, 214],
  wBgFar: [100, 145, 165], wBgNear: [24, 70, 104], sandBg: [128, 116, 100], wetBg: [95, 100, 108],
  wDark: [22, 62, 100], wMid: [50, 105, 150], wLight: [130, 180, 212], glint: [245, 250, 255],
  foamDim: [150, 175, 195], foamMid: [220, 230, 238], foamBright: [252, 253, 255],
  sandDim: [100, 90, 78], sandBright: [182, 168, 150], wetDim: [70, 78, 92], wetBright: [205, 220, 230],
  stars: 0, cloudDark: [165, 180, 196], cloudLight: [246, 247, 250], clouds: 0.5,
  sunEdge: [255, 250, 230], sunCore: [255, 255, 245], sunEl: 2, vignette: 0.32,
};

const KEYS = [
  { h: 0, ...NIGHT },
  { h: 3.5, ...NIGHT },
  {
    // before dawn
    h: 4.6, ...NIGHT,
    skyTop: [4, 6, 18], skyHor: [30, 30, 62], wBgFar: [16, 18, 38], wBgNear: [2, 3, 9],
    sandBg: [4, 4, 8], wetBg: [8, 10, 24], glint: [200, 205, 245],
    sandDim: [22, 20, 26], sandBright: [80, 74, 86],
    stars: 0.7, cloudDark: [14, 14, 30], cloudLight: [55, 50, 88], clouds: 0.35,
    sunEl: -0.35, vignette: 0.7,
  },
  {
    // first light — mauve / pink
    h: 5.3,
    skyTop: [16, 22, 52], skyHor: [125, 82, 112],
    wBgFar: [50, 46, 84], wBgNear: [6, 10, 26], sandBg: [14, 12, 20], wetBg: [30, 28, 52],
    wDark: [10, 18, 42], wMid: [30, 55, 105], wLight: [90, 115, 170], glint: [255, 195, 175],
    foamDim: [90, 85, 115], foamMid: [175, 165, 190], foamBright: [255, 236, 232],
    sandDim: [30, 24, 32], sandBright: [112, 90, 100], wetDim: [20, 20, 40], wetBright: [195, 140, 152],
    starDim: [40, 40, 70], starBright: [210, 210, 240], stars: 0.3,
    cloudDark: [50, 40, 76], cloudLight: [215, 132, 142], clouds: 0.45,
    sunEdge: [200, 80, 60], sunCore: [255, 170, 110], sunEl: -0.12, vignette: 0.6,
  },
  {
    // sunrise — orange
    h: 6,
    skyTop: [40, 55, 102], skyHor: [242, 142, 80],
    wBgFar: [100, 82, 108], wBgNear: [12, 22, 48], sandBg: [45, 32, 36], wetBg: [80, 55, 60],
    wDark: [12, 24, 52], wMid: [36, 66, 118], wLight: [110, 135, 182], glint: [255, 192, 110],
    foamDim: [110, 100, 120], foamMid: [210, 185, 180], foamBright: [255, 236, 212],
    sandDim: [55, 40, 42], sandBright: [172, 120, 95], wetDim: [40, 32, 48], wetBright: [242, 172, 112],
    starDim: [40, 40, 70], starBright: [210, 210, 240], stars: 0,
    cloudDark: [92, 70, 102], cloudLight: [255, 172, 122], clouds: 0.5,
    sunEdge: [240, 110, 50], sunCore: [255, 226, 152], sunEl: 0.06, vignette: 0.5,
  },
  {
    // golden morning
    h: 7.2, ...DAY,
    skyTop: [70, 105, 155], skyHor: [236, 192, 142],
    wBgFar: [112, 126, 148], wBgNear: [20, 45, 80], sandBg: [100, 85, 75], wetBg: [110, 100, 100],
    wDark: [18, 45, 85], wMid: [45, 90, 140], wLight: [120, 165, 205], glint: [255, 232, 182],
    foamDim: [140, 150, 170], foamMid: [215, 215, 215], foamBright: [255, 248, 236],
    sandDim: [80, 68, 60], sandBright: [192, 166, 136], wetDim: [60, 60, 76], wetBright: [242, 212, 172],
    cloudDark: [150, 140, 152], cloudLight: [255, 226, 196], clouds: 0.45,
    sunEdge: [255, 192, 112], sunCore: [255, 246, 216], sunEl: 0.45, vignette: 0.4,
  },
  {
    // morning — soft, hazy blue
    h: 9.5, ...DAY,
    skyTop: [78, 122, 168], skyHor: [186, 205, 212], wBgFar: [95, 135, 160], wBgNear: [22, 62, 98],
    cloudLight: [245, 247, 250], clouds: 0.55, sunEl: 1.5,
  },
  { h: 12.5, ...DAY },
  {
    // afternoon — a touch warmer
    h: 15.5, ...DAY,
    skyTop: [82, 118, 160], skyHor: [206, 205, 194], wBgFar: [105, 135, 150], wBgNear: [24, 62, 96],
    sandBg: [130, 114, 96], sandDim: [100, 88, 74], sandBright: [186, 165, 140],
    cloudLight: [248, 240, 228], sunEl: 1.5,
  },
  {
    // golden evening
    h: 17, ...DAY,
    skyTop: [72, 95, 145], skyHor: [240, 176, 112],
    wBgFar: [112, 112, 132], wBgNear: [18, 40, 75], sandBg: [105, 80, 62], wetBg: [110, 88, 84],
    wDark: [18, 42, 82], wMid: [42, 85, 135], wLight: [118, 158, 200], glint: [255, 212, 142],
    foamDim: [140, 135, 150], foamMid: [220, 205, 195], foamBright: [255, 242, 225],
    sandDim: [82, 62, 52], sandBright: [196, 150, 112], wetDim: [62, 52, 62], wetBright: [250, 196, 140],
    cloudDark: [140, 110, 122], cloudLight: [255, 202, 152], clouds: 0.5,
    sunEdge: [255, 160, 80], sunCore: [255, 236, 182], sunEl: 0.42, vignette: 0.42,
  },
  {
    // sunset — deep orange
    h: 18,
    skyTop: [50, 48, 96], skyHor: [246, 116, 60],
    wBgFar: [104, 72, 98], wBgNear: [12, 20, 46], sandBg: [50, 32, 35], wetBg: [92, 50, 50],
    wDark: [10, 20, 46], wMid: [32, 58, 110], wLight: [105, 125, 176], glint: [255, 166, 86],
    foamDim: [110, 85, 105], foamMid: [212, 166, 160], foamBright: [255, 222, 192],
    sandDim: [60, 38, 40], sandBright: [172, 106, 80], wetDim: [45, 30, 45], wetBright: [255, 152, 92],
    starDim: [40, 30, 60], starBright: [220, 210, 240], stars: 0,
    cloudDark: [96, 55, 92], cloudLight: [255, 152, 102], clouds: 0.6,
    sunEdge: [236, 80, 40], sunCore: [255, 202, 122], sunEl: 0.06, vignette: 0.5,
  },
  {
    // dusk — magenta afterglow
    h: 19,
    skyTop: [24, 22, 58], skyHor: [152, 66, 86],
    wBgFar: [58, 38, 72], wBgNear: [6, 10, 28], sandBg: [18, 12, 20], wetBg: [40, 22, 40],
    wDark: [8, 14, 34], wMid: [26, 46, 95], wLight: [85, 105, 160], glint: [242, 152, 172],
    foamDim: [85, 70, 100], foamMid: [170, 140, 170], foamBright: [246, 216, 226],
    sandDim: [32, 22, 30], sandBright: [112, 72, 82], wetDim: [22, 18, 36], wetBright: [202, 122, 142],
    starDim: [40, 30, 60], starBright: [220, 210, 240], stars: 0.25,
    cloudDark: [45, 28, 60], cloudLight: [202, 92, 112], clouds: 0.5,
    sunEdge: [150, 40, 40], sunCore: [220, 100, 70], sunEl: -0.25, vignette: 0.62,
  },
  {
    // blue hour
    h: 20, ...NIGHT,
    skyTop: [8, 10, 28], skyHor: [36, 40, 82], wBgFar: [18, 22, 50], wBgNear: [1, 2, 8],
    sandBg: [3, 3, 7], wetBg: [8, 10, 26],
    wDark: [6, 12, 30], wMid: [22, 48, 104], wLight: [72, 118, 188], glint: [205, 222, 255],
    sandDim: [18, 17, 22], sandBright: [72, 68, 78], wetDim: [8, 12, 28], wetBright: [88, 115, 165],
    stars: 0.7, cloudDark: [10, 12, 26], cloudLight: [46, 50, 88], clouds: 0.35,
    vignette: 0.7,
  },
  { h: 21.3, ...NIGHT },
  { h: 24, ...NIGHT },
];

function sampleTime(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const u = smooth(clamp((h - a.h) / (b.h - a.h)));
  const out = {};
  for (const k in a) {
    if (k === "h") continue;
    const va = a[k];
    const vb = b[k];
    out[k] = Array.isArray(va) ? mix(va, vb, u) : va + (vb - va) * u;
  }
  return out;
}

// ---------- palette (quantized so draws can be batched by color) ----------
function colorRamp(stops, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let j = 0;
    while (j < stops.length - 2 && t > stops[j + 1][0]) j++;
    const [t0, c0] = stops[j];
    const [t1, c1] = stops[j + 1];
    out.push(css(mix(c0, c1, clamp((t - t0) / (t1 - t0)))));
  }
  return out;
}

const RAMP_SIZES = [28, 18, 10, 10, 14, 12, 10, 8, 6, 5]; // water, foam, sand, wet, stars, cloud, sun, haze, fin, bird
const WATER = 0, FOAM = 1, SAND = 2, WET = 3, STAR = 4, CLOUD = 5, SUN = 6, HAZE = 7, FIN = 8, BIRD = 9;
const lum = (c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
const BLACK = [0, 0, 0];
const OFF = [];
let PALETTE_SIZE = 0;
for (const n of RAMP_SIZES) {
  OFF.push(PALETTE_SIZE);
  PALETTE_SIZE += n;
}

function buildPalette(L) {
  const W = [255, 255, 255];
  const ramps = [
    [[0, L.wDark], [0.35, L.wMid], [0.65, L.wLight], [1, L.glint]],
    [[0, L.foamDim], [0.45, L.foamMid], [1, L.foamBright]],
    [[0, L.sandDim], [1, L.sandBright]],
    [[0, L.wetDim], [1, L.wetBright]],
    [[0, L.starDim], [1, L.starBright]],
    [[0, L.cloudDark], [1, L.cloudLight]],
    [[0, L.sunEdge], [1, L.sunCore]],
    [[0, L.skyHor], [1, mix(L.skyHor, W, 0.5)]],
  ];
  // fins: moonlit blue on dark water, dark silhouettes on bright water
  const tf = smooth(clamp((lum(L.wBgFar) - 0.12) / 0.25));
  ramps.push([
    [0, mix(mix(L.wMid, L.wLight, 0.5), mix(L.wBgFar, BLACK, 0.45), tf)],
    [1, mix(mix(L.wLight, L.glint, 0.5), mix(L.wBgFar, BLACK, 0.7), tf)],
  ]);
  // birds: soft grey at night, dark silhouettes against day / sunset skies
  const tb = smooth(clamp((lum(mix(L.skyTop, L.skyHor, 0.5)) - 0.12) / 0.25));
  ramps.push([
    [0, mix([80, 90, 115], mix(L.skyTop, BLACK, 0.45), tb)],
    [1, mix([165, 175, 200], mix(L.skyTop, BLACK, 0.75), tb)],
  ]);
  const out = [];
  ramps.forEach((stops, i) => out.push(...colorRamp(stops, RAMP_SIZES[i])));
  return out;
}

const HOUR_NAMES = [
  "midnight", "deep night", "deep night", "deep night", "before dawn", "first light",
  "sunrise", "golden hour", "morning", "morning", "morning", "midday",
  "midday", "midday", "afternoon", "afternoon", "afternoon", "golden hour",
  "sunset", "dusk", "blue hour", "night", "night", "night",
];
const fmtHour = (h) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);

const DEFAULTS = { speed: 1, reflect: 1 };

// current time of day in TIME_ZONE as a fractional hour (e.g. 18.5 = 6:30 PM)
const clockFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});
function liveHourNow() {
  const parts = clockFmt.formatToParts(new Date());
  const get = (type) => +parts.find((p) => p.type === type).value;
  return (get("hour") % 24) + get("minute") / 60 + get("second") / 3600;
}
const fmtClock = (h) => {
  const hh = Math.floor(h);
  const mm = String(Math.floor((h - hh) * 60)).padStart(2, "0");
  return `${hh % 12 || 12}:${mm} ${hh < 12 ? "AM" : "PM"}`;
};

// remember slider settings between new tabs
const loadSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};
const saveSettings = (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable — settings just won't persist */
  }
};

// "github.com", "localhost:3000", "https://…" → open it; anything else → search
function toDestination(input) {
  const q = input.trim();
  if (!q) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return q;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(q)) return "http://" + q;
  if (!/\s/.test(q) && /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(q)) return "https://" + q;
  return SEARCH_URL + encodeURIComponent(q);
}

// one is picked at random per page load; "{name}" → USER_NAME
const GREETINGS = {
  morning: [
    "Good morning, {name}",
    "Morning, {name}",
    "Coffee and waves, {name}?",
    "Rise and shine, {name}",
    "A fresh tide, {name}",
    "Early light, {name}",
  ],
  afternoon: [
    "Good afternoon, {name}",
    "Afternoon, {name}",
    "Back at it, {name}",
    "How's the day going, {name}?",
    "Hello, {name}",
    "What's on your mind, {name}?",
  ],
  evening: [
    "Good evening, {name}",
    "Evening, {name}",
    "Winding down, {name}?",
    "The tide's coming in, {name}",
    "Golden hour, {name}",
    "What's next, {name}?",
  ],
  night: [
    "Hello, night owl",
    "Still up, {name}?",
    "Burning the midnight oil, {name}?",
    "Quiet hours, {name}",
    "The sea never sleeps, {name}",
    "Late night thoughts, {name}?",
  ],
};
const periodFor = (h) => (h < 5 || h >= 23 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : "evening");

function HomeHeader({ hour }) {
  const [query, setQuery] = useState("");
  const pick = useMemo(() => Math.random(), []); // stable for this page load
  const list = GREETINGS[periodFor(hour)];
  const text = list[Math.floor(pick * list.length)].replace("{name}", USER_NAME);

  const submit = (e) => {
    e.preventDefault();
    const dest = toDestination(query);
    if (dest) window.location.href = dest;
  };

  return (
    <div className="home">
      <h1 className="home-greeting">{text}</h1>
      <form className="home-search" onSubmit={submit} role="search">
        <svg className="home-search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M15.5 15.5 L20.5 20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={SEARCH_PLACEHOLDER}
          aria-label={SEARCH_PLACEHOLDER}
          spellCheck={false}
          autoComplete="off"
        />
        {query && <kbd className="home-enter">↵</kbd>}
      </form>
    </div>
  );
}

// dolphins + birds each show up about once every 1–3 minutes (birds only when it's light out)
const nextSighting = () => 60 + Math.random() * 120;

// dolphin "rolling arc": the back rolls through the surface with a small fin on top.
// Frames are for a dolphin swimming LEFT (head dips first on the left); mirrored for right.
// [until-u, frame] — u runs 0→1 over one surfacing
const ROLL_SMALL = [[0.15, " _ "], [0.32, ".-."], [0.68, ".^."], [0.85, "_^."], [1, "  ."]];
const ROLL_LARGE = [[0.15, "  _  "], [0.32, " .-. "], [0.68, ".-^-."], [0.85, "_-^-."], [1, "   ._"]];
const flip = (f) => f.map(([u, str]) => [u, str.split("").reverse().join("")]);
const ROLLS = { small: [ROLL_SMALL, flip(ROLL_SMALL)], large: [ROLL_LARGE, flip(ROLL_LARGE)] };

// bird flap frames (frame 0 is also the glide pose, so gliding birds still read as birds)
const BIRD_SMALL = ["v", "v", "-", "v"];
const BIRD_BIG = ["\\/", "\\/", "--", "/\\"];

export default function AsciiShore() {
  const canvasRef = useRef(null);
  const saved = useMemo(loadSettings, []);
  const [speed, setSpeed] = useState(saved.speed ?? DEFAULTS.speed);
  const [reflect, setReflect] = useState(saved.reflect ?? DEFAULTS.reflect);
  const [open, setOpen] = useState(saved.open ?? false);
  // live clock time; the slider sets a temporary manual override (not saved, so new tabs are always live)
  const [liveHour, setLiveHour] = useState(liveHourNow);
  const [manualHour, setManualHour] = useState(null);
  const hour = manualHour ?? liveHour;
  const isLive = manualHour === null;
  useEffect(() => saveSettings({ speed, reflect, open }), [speed, reflect, open]);
  useEffect(() => {
    document.title = "New Tab";
    const tick = () => setLiveHour(liveHourNow());
    const id = setInterval(tick, 30000);
    // tabs left open in the background catch up as soon as they're shown again
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // live values read by the animation loop (no effect restarts)
  const params = useRef({ speed, reflect, hour });
  params.current.speed = speed;
  params.current.reflect = reflect;
  params.current.hour = hour;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    const buckets = Array.from({ length: PALETTE_SIZE }, () => []);

    let raf = 0;
    let cols = 0, rows = 0, cw = 8, ch = 14, vw = 0, vh = 0;
    let edge, base, wetReach, wetAmt, residual, lead;
    let crestY = [], brk = [], str = [];
    let simT = 0;
    let last = null;
    const overlay = new Map(); // cell -> [ramp, level, char|null] drawn instead of the scene
    const pods = [];
    const flocks = [];
    // first sightings come a bit sooner so you don't wait minutes after loading
    let nextD = 20 + Math.random() * 25;
    let nextB = 15 + Math.random() * 25;

    const spawnPod = () => {
      const r = Math.random;
      const d = 0.05 + 0.17 * r(); // far out: 5–22% of the way from horizon to shore
      const persp = 0.1 + 0.9 * d;
      const n = 1 + Math.floor(r() * 4);
      const finW = d < 0.13 ? 3 : 5; // matches arc widths below
      const members = [];
      let off = 0;
      for (let i = 0; i < n; i++) {
        if (i > 0) off += finW + 2 + r() * 5; // keep fins from overlapping
        members.push({
          dx: -off,
          dt: i * (0.2 + 0.5 * r()) + 0.3 * r(),
          dy: 0,
        });
      }
      const cycle = 1.9 + 0.9 * r();
      const surf = 2 + Math.floor(r() * 4); // number of times each dolphin surfaces
      const maxDt = Math.max(...members.map((m) => m.dt));
      pods.push({
        age: 0, d, persp, members, cycle, surf,
        x0: cols * (0.12 + 0.76 * r()),
        dir: r() < 0.5 ? -1 : 1,
        speed: (1.2 + 1.3 * r()) * persp * 3,
        life: maxDt + surf * cycle + 0.5,
      });
    };

    const spawnFlock = () => {
      const r = Math.random;
      const n = 3 + Math.floor(r() * 6);
      const dir = r() < 0.5 ? -1 : 1;
      const bigFlock = r() < 0.35; // closer flock = larger birds
      const vform = r() < 0.55;
      const list = [];
      for (let i = 0; i < n; i++) {
        let dx, dy;
        if (vform) {
          const rank = Math.ceil(i / 2);
          const side = i % 2 ? 1 : -1;
          dx = -rank * (2.6 + r() * 0.8) * (bigFlock ? 1.5 : 1);
          dy = side * rank * (bigFlock ? 0.9 : 0.6);
        } else {
          dx = -r() * 14 * (bigFlock ? 1.4 : 1);
          dy = (r() - 0.5) * (bigFlock ? 5 : 3);
        }
        list.push({ dx, dy, ph: r() * 6.28, rate: 6 + r() * 3, big: bigFlock ? r() < 0.85 : r() < 0.1 });
      }
      const speed = 4 + r() * 4;
      flocks.push({
        age: 0, dir, speed, birds: list, ph: r() * 6.28,
        yf: 0.12 + 0.5 * r(),
        x0: dir > 0 ? -20 : cols + 20,
        life: (cols + 60) / speed,
      });
    };

    let curHour = params.current.hour;
    let look = sampleTime(curHour);
    let palette = buildPalette(look);
    let lookHour = curHour;

    const put = (r, level, c, px, py) => {
      const n = RAMP_SIZES[r];
      const i = (clamp(level) * (n - 1) + 0.5) | 0;
      buckets[OFF[r] + i].push(c, px, py);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.width = Math.floor(vw * dpr);
      canvas.height = Math.floor(vh * dpr);
      canvas.style.width = vw + "px";
      canvas.style.height = vh + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${FONT_SIZE}px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;
      ctx.textBaseline = "top";
      cw = ctx.measureText("M").width;
      ch = Math.round(FONT_SIZE * LINE_HEIGHT);
      cols = Math.ceil(vw / cw) + 1;
      rows = Math.ceil(vh / ch) + 1;
      edge = new Float32Array(cols);
      base = new Float32Array(cols);
      wetReach = new Float32Array(cols);
      wetAmt = new Float32Array(cols);
      residual = new Float32Array(cols);
      lead = new Float32Array(cols);
      crestY = Array.from({ length: MAXW }, () => new Float32Array(cols));
      brk = Array.from({ length: MAXW }, () => new Float32Array(cols));
      str = Array.from({ length: MAXW }, () => new Float32Array(cols));
    };

    const frame = (ms) => {
      const { speed: spd, reflect: R, hour: target } = params.current;
      const dt = last === null ? 0 : Math.min(0.05, (ms - last) / 1000);
      last = ms;
      simT += dt * spd;
      const t = simT + 30; // start mid-cycle so waves are already rolling
      const rt = ms / 1000; // real time: star twinkle, cloud drift

      // ease the scene toward the selected hour (wraps around midnight)
      const diff = ((((target - curHour) % 24) + 36) % 24) - 12;
      curHour = (curHour + diff * Math.min(1, dt * 2.5) + 24) % 24;
      if (Math.abs(curHour - lookHour) > 0.001) {
        look = sampleTime(curHour);
        palette = buildPalette(look);
        lookHour = curHour;
      }
      const L = look;

      for (let i = 0; i < buckets.length; i++) buckets[i].length = 0;

      const H = Math.floor(rows * 0.36); // horizon row
      const S0 = rows * 0.7; // mean shoreline row
      const span = S0 - H;
      const aspect = cw / ch;

      // sun
      const sx = cols * sunX(curHour);
      const sr = Math.max(3, rows * 0.055);
      const sy = H - L.sunEl * H;
      const sunVis = L.sunEl > 1.3 ? 0 : clamp((L.sunEl * H + sr) / sr);
      const pathStr = sunVis * clamp(1.25 - L.sunEl);

      // ---- active waves ----
      const travel = [];
      const swash = [];
      for (let j = 0; j < STREAMS.length; j++) {
        const S = STREAMS[j];
        const kLo = Math.floor((t - S.offset - MAX_LIFE) / S.period) - 1;
        const kHi = Math.floor((t - S.offset) / S.period) + 1;
        for (let k = kLo; k <= kHi; k++) {
          const id = k * 7 + j * 1013;
          const r = (n) => hash(id, n);
          if (r(9) < S.skip) continue;
          const start = S.offset + (k + (r(1) - 0.5) * S.jitter) * S.period;
          const travelT = TRAVEL * (S.travel[0] + (S.travel[1] - S.travel[0]) * r(2));
          const p = (t - start) / travelT;
          if (p < 0) continue;
          const reaches = r(3) < S.reach;
          const w = {
            p,
            s: id,
            amp: S.amp[0] + (S.amp[1] - S.amp[0]) * r(4),
            pMax: reaches ? 9 : 0.35 + 0.55 * r(5), // where a dying wave fades out
            cx: (r(6) * 1.4 - 0.2) * cols,
            hw: (S.width[0] + (S.width[1] - S.width[0]) * r(7)) * cols,
            tilt: (r(8) - 0.5) * 7, // rows of slant across the screen
          };
          if (p < 1) {
            if (p < w.pMax) travel.push(w);
          } else if (reaches) {
            w.q = (p - 1) / (SWASH / travelT);
            if (w.q < 2.4) swash.push(w);
          }
        }
      }
      travel.sort((a, b) => b.amp - a.amp);
      const nT = Math.min(travel.length, MAXW);

      // ---- per-column shoreline + crest geometry ----
      for (let x = 0; x < cols; x++) {
        const b0 =
          S0 +
          1.3 * Math.sin(x * 0.018 + 0.7) +
          2.4 * (vnoise(x * 0.03, 2.2) - 0.5) +
          0.5 * Math.sin(t * 0.9 + x * 0.05);
        let e = b0, wr = 0, wa = 0, res = 0, ld = 0.25;

        for (const w of swash) {
          const wx0 = (x - w.cx) / w.hw;
          const win = 0.25 + 0.75 * Math.exp(-wx0 * wx0);
          const Rup = (2.5 + 5.5 * vnoise(x * 0.028 + w.s * 0.37, w.s * 1.7)) * w.amp * win;
          const q = w.q;
          if (q <= 1) {
            const shape = q < 0.3 ? Math.sin((q / 0.3) * (Math.PI / 2)) : 1 - smooth((q - 0.3) / 0.7);
            const ee = b0 + Rup * shape;
            if (ee > e) {
              e = ee;
              ld = q < 0.3 ? 1 : 0.25 + 0.6 * (1 - (q - 0.3) / 0.7);
            }
          }
          if (q > 0.2 && q < 2.2) {
            const wet = 1 - (q - 0.2) / 2;
            if (b0 + Rup > wr) wr = b0 + Rup;
            if (wet > wa) wa = wet;
          }
          if (q < 1.6) res = Math.max(res, (1 - q / 1.6) * w.amp * win);
        }
        edge[x] = e;
        base[x] = b0;
        wetReach[x] = wr;
        wetAmt[x] = wa;
        residual[x] = res;
        lead[x] = ld;

        for (let i = 0; i < nT; i++) {
          const w = travel[i];
          const dc = Math.pow(w.p, 1.4);
          const wob = 1.7 * Math.sin(x * 0.045 + w.s * 0.21) + 2.4 * (vnoise(x * 0.035, w.s * 0.31) - 0.5);
          const slant = w.tilt * ((x - cols * 0.5) / cols) * 4 * dc * (1 - dc);
          crestY[i][x] = H + dc * (b0 - H) + wob * Math.sin(dc * Math.PI) * 0.9 + slant;
          // smaller waves break later (closer in); dying waves may never break
          const thr = 0.48 + 0.3 * vnoise(x * 0.022, w.s * 0.57 + 3) + (1 - w.amp) * 0.22;
          brk[i][x] = clamp((w.p - thr) / 0.2);
          // strength: size × lateral extent × fade-in at horizon × fade-out if dying
          const wx0 = (x - w.cx) / w.hw;
          const win = Math.exp(-wx0 * wx0);
          const fadeIn = clamp(w.p / 0.1);
          const fadeOut = w.pMax > 1 ? 1 : 1 - smooth(clamp((w.p - (w.pMax - 0.2)) / 0.2));
          str[i][x] = w.amp * win * fadeIn * fadeOut;
        }
      }

      const flickT = (t * 6) | 0;
      const drift = rt * 0.02;
      const cloudTh = 1 - L.clouds * 0.62;
      const glowR = rows * 0.35;

      // ---- dolphins + birds (real time, independent of wave speed) ----
      if ((nextD -= dt) <= 0) {
        spawnPod();
        nextD = nextSighting();
      }
      if ((nextB -= dt) <= 0) {
        if (L.stars < 0.35) spawnFlock(); // no birds at night
        nextB = nextSighting();
      }
      for (let i = pods.length - 1; i >= 0; i--) if ((pods[i].age += dt) > pods[i].life) pods.splice(i, 1);
      for (let i = flocks.length - 1; i >= 0; i--) if ((flocks[i].age += dt) > flocks[i].life) flocks.splice(i, 1);

      overlay.clear();
      const setOv = (x, y, r, lvl, c) => {
        if (x >= 0 && x < cols && y >= 0 && y < rows) overlay.set(y * cols + x, [r, lvl, c]);
      };
      const fq = (rt * 8) | 0;

      for (const pod of pods) {
        const frames = ROLLS[pod.d < 0.13 ? "small" : "large"][pod.dir > 0 ? 1 : 0];
        const fw = frames[0][1].length;
        const xp = pod.x0 + pod.dir * pod.speed * pod.age;
        const y0base = Math.round(H + pod.d * span);
        for (const m of pod.members) {
          const ph = (pod.age - m.dt) / pod.cycle;
          if (ph < 0) continue;
          const k = Math.floor(ph);
          if (k >= pod.surf) continue;
          const u = (ph - k) / 0.55; // visible for 55% of each breath cycle
          if (u > 1) continue;
          const y0 = y0base + m.dy;
          const xc = Math.round(xp + pod.dir * m.dx + pod.dir * (u - 0.5) * 2.5 * pod.persp);
          const xl = xc - (fw >> 1);
          let f = 0;
          while (u > frames[f][0]) f++;
          const str = frames[f][1];
          for (let q = 0; q < str.length; q++) {
            const c = str[q];
            if (c !== " ") setOv(xl + q, y0, FIN, c === "^" ? 1 : 0.7, c);
          }
          const xb = xc;
          // splash at the waterline as it breaks the surface / dives
          const sp = u < 0.2 || u > 0.8 ? 0.7 : 0.2;
          for (let q = -1; q <= fw; q++) {
            if (hash(xb * 3 + q, fq + m.dy * 7) < sp * 0.6) {
              setOv(xl + q, y0 + 1, FOAM, 0.2 + 0.35 * sp, q & 1 ? "~" : "-");
            }
          }
          // faint wake behind
          for (let q = 2; q <= 3 + (fw >> 1); q++) {
            if (hash(xb * 5 + q, fq) < 0.5) setOv(xb - pod.dir * (q + (fw >> 1)), y0 + 1, WATER, 0.62, "-");
          }
        }
      }

      for (const fl of flocks) {
        const fx = fl.x0 + fl.dir * fl.speed * fl.age;
        const fy = fl.yf * H + Math.sin(fl.age * 0.35 + fl.ph) * 1.5;
        for (const b of fl.birds) {
          const bx = Math.round(fx + fl.dir * b.dx);
          const by = Math.round(fy + b.dy + Math.sin(fl.age * 1.3 + b.ph) * 0.35);
          if (by < 0 || by >= H - 1) continue;
          const glide = Math.sin(fl.age * 0.6 + b.ph * 2) > 0.55;
          const fi = glide ? 0 : Math.floor(fl.age * b.rate + b.ph) % 4;
          const s = (b.big ? BIRD_BIG : BIRD_SMALL)[fi];
          for (let q = 0; q < s.length; q++) setOv(bx + q, by, BIRD, b.big ? 0.95 : 0.65, s[q]);
        }
      }
      const hasOv = overlay.size > 0;

      // ---- cells ----
      for (let y = 0; y < rows; y++) {
        const py = y * ch;

        // SKY
        if (y < H) {
          const dyS = y - sy;
          for (let x = 0; x < cols; x++) {
            const px = x * cw;
            if (hasOv) {
              const o = overlay.get(y * cols + x);
              if (o) {
                if (o[2]) put(o[0], o[1], o[2], px, py);
                continue;
              }
            }

            // sun disc
            let dS = 1e9;
            if (sunVis > 0) {
              const dxS = (x - sx) * aspect;
              dS = Math.sqrt(dxS * dxS + dyS * dyS);
              if (dS < sr) {
                const k = dS / sr;
                const br = clamp(0.35 + 0.65 * Math.sqrt(1 - k * k) + 0.1 * (vnoise(x * 0.5, y * 0.8 + rt) - 0.5));
                put(SUN, br, SUN_CH[Math.min(SUN_CH.length - 1, (br * SUN_CH.length) | 0)], px, py);
                continue;
              }
            }

            // drifting clouds, lit by the sun when it's near
            if (L.clouds > 0.02) {
              const nx = x * 0.018 + drift;
              const ny = y * 0.2;
              const cd = vnoise(nx, ny) * 0.65 + vnoise(nx * 2.6 + 3.1, ny * 2.2 + 1.7) * 0.35;
              if (cd > cloudTh) {
                const k = clamp((cd - cloudTh) / (1 - cloudTh) * 1.6);
                const ci = Math.min(CLOUD_CH.length - 1, (k * CLOUD_CH.length) | 0);
                if (ci > 0) {
                  const glow = sunVis * 0.5 * Math.exp(-((dS / glowR) ** 2));
                  put(CLOUD, 0.2 + 0.55 * k + glow + 0.15 * (y / H), CLOUD_CH[ci], px, py);
                  continue;
                }
              }
            }

            // subtle horizon: a faint, near-continuous line with a thin haze above it
            if (y === H - 1) {
              const hn = vnoise(x * 0.08, 3.3);
              if (hash(x, 5) < 0.85) put(HAZE, 0.22 + 0.12 * hn, hn > 0.6 ? "-" : "_", px, py);
              continue;
            }
            if (y >= H - 4) {
              const k = H - 1 - y; // 1..3 rows above the line
              if (hash(x * 5 + 2, y * 3 + 1) < 0.3 / k) {
                put(HAZE, 0.1 / k + 0.04, ".", px, py);
                continue;
              }
            }

            // stars
            if (L.stars > 0.02) {
              const h = hash(x * 7 + 1, y * 13 + 2);
              if (h > 0.982 + 0.014 * (y / H)) {
                const h2 = hash(x + 97, y + 31);
                const tw = 0.5 + 0.5 * Math.sin(rt * (0.7 + h2 * 2.6) + h2 * 60);
                const br = clamp(0.15 + 0.85 * h2 * (0.35 + 0.65 * tw)) * L.stars;
                if (br > 0.08) {
                  const c = br > 0.75 ? "*" : br > 0.5 ? "+" : br > 0.3 ? "·" : ".";
                  put(STAR, br, c, px, py);
                }
              }
            }
          }
          continue;
        }

        const d = (y - H) / span;
        const dd = Math.min(d, 1.2);
        const d1 = Math.min(d, 1);

        for (let x = 0; x < cols; x++) {
          const px = x * cw;
          if (hasOv && y < edge[x]) {
            const o = overlay.get(y * cols + x);
            if (o) {
              if (o[2]) put(o[0], o[1], o[2], px, py);
              continue;
            }
          }

          // WATER
          if (y < edge[x]) {
            const persp = 0.1 + 0.9 * dd;
            const wx = (x - cols * 0.5) / (5.5 * persp);
            const wz = 1 / (d + 0.22);
            const s =
              0.5 +
              0.26 * Math.sin(wx * 0.9 + wz * 3.1 - t * 1.15) +
              0.16 * Math.sin(wx * 1.9 - wz * 1.7 + t * 0.75 + 1.3) +
              0.4 * (vnoise(wx * 0.7 + t * 0.08, wz * 2.4 - t * 0.55) - 0.5);

            let lvl = 0.16 + 0.34 * d1 * s + 0.12 * s;
            let c = null;
            const sv = s - (0.32 - 0.1 * d1);
            if (sv > 0) c = WATER_CH[Math.min(WATER_CH.length - 1, ((sv / (0.68 + 0.1 * d1)) * WATER_CH.length) | 0)];

            // faint sheen on the farthest rows so the water edge reads against the sky
            const hz = y - H;
            if (hz < 3) {
              lvl += 0.07 * (1 - hz / 3);
              if (hz === 0) c = c || "-";
            }

            // white ripple highlights on swell peaks (scaled by reflection)
            if (R > 0 && s > 0.74 - 0.06 * d1 && hash(x * 3 + flickT, y * 7) < (0.25 + 0.5 * d1) * R) {
              lvl = Math.max(lvl, 0.5 + (0.12 + (s - 0.7) * 0.9) * Math.min(R, 1.6));
              c = d1 > 0.45 ? "~" : "-";
            }

            // scattered glints across the surface
            if (R > 0 && s > 0.62) {
              const g = (s - 0.62) * 2.6 * R;
              if (hash(x * 11 + flickT * 3, y * 5 + 9) < g * 0.12) {
                lvl = Math.max(lvl, 0.7 + 0.3 * clamp(g));
                c = g > 0.9 ? "*" : "=";
              }
            }

            // sun path — a glittering column under a low sun
            if (pathStr > 0.02 && R > 0) {
              const bw = 1.5 + 12 * d1;
              const rx = (x - sx) / bw;
              const pth = Math.exp(-rx * rx) * pathStr;
              if (pth > 0.04) {
                const flick = 0.5 + 0.5 * Math.sin(t * 2.7 + x * 0.9 + y * 2.3 + s * 6);
                const g = pth * Math.pow(s, 1.2) * flick * R;
                if (g > 0.15) {
                  lvl = Math.max(lvl, 0.6 + g * 0.4);
                  c = g > 0.6 ? "*" : g > 0.35 ? "=" : "-";
                }
              }
            }

            // rolling crests + whitewater
            let foam = 0;
            let shade = 1;
            for (let i = 0; i < nT; i++) {
              const st = str[i][x];
              if (st < 0.03) continue;
              // bigger waves stand taller (thicker crest band)
              const th = (0.4 + 1.6 * d1) * (0.55 + 0.45 * st);
              const z = (y - crestY[i][x]) / th;
              if (z > -8 && z < 3) {
                const A = (0.5 + 0.5 * d1) * st;
                const g = Math.exp(-z * z) * A;
                if (g > 0.08) {
                  lvl = Math.max(lvl, 0.42 + g * 0.45);
                  c = g > 0.45 ? "≈" : g > 0.25 ? "~" : c || "-";
                }
                if (z > 0.7) {
                  const sh = 0.4 + 0.6 * ((z - 0.7) / 2.3);
                  shade = Math.min(shade, 1 - (1 - sh) * Math.min(1, st * 1.4));
                }
                const b = brk[i][x];
                if (b > 0) {
                  const zz = z * 0.9;
                  let f = Math.exp(-zz * zz) * b * 1.1;
                  if (z < 0) f = Math.max(f, Math.exp(z / (0.6 + 3.5 * b)) * b * 0.85);
                  foam = Math.max(foam, f * st * (0.4 + 0.6 * d1));
                }
              }
            }

            // shoreline foam: leading edge, lingering lace, swash film
            const dE = edge[x] - y;
            if (dE < 1.3) foam = Math.max(foam, lead[x] * (1.15 - (dE / 1.3) * 0.6));
            foam = Math.max(foam, residual[x] * Math.exp(-dE / 4.5) * 0.95);
            if (y > base[x] - 0.5) {
              lvl = Math.max(lvl, 0.28);
              c = c || ".";
            }

            if (foam > 0.12) {
              const n =
                vnoise(x * 0.22 + t * 0.25, y * 0.55 - t * 0.9) * 0.65 +
                vnoise(x * 0.6 - t * 0.4, y * 1.3 + t * 0.3) * 0.35;
              const fv = foam * (0.35 + 0.95 * n);
              if (fv > 0.3) {
                const k = clamp((fv - 0.3) / 0.75);
                put(FOAM, k, FOAM_CH[Math.min(FOAM_CH.length - 1, (k * FOAM_CH.length) | 0)], px, py);
                continue;
              }
            }
            if (c && !(shade < 0.6 && hash(x, y + 77) > shade)) put(WATER, lvl * shade, c, px, py);
            continue;
          }

          // WET SAND (recent backwash) — glossy sheen scaled by reflection, catches the sun path
          if (y < wetReach[x] && wetAmt[x] > 0) {
            const wv = wetAmt[x];
            const h = hash(x * 3 + 7, y * 5 + 1);
            const rx = (x - sx) / 18;
            const sunSheen = Math.exp(-rx * rx) * pathStr;
            const sheen = wv * R * (0.25 + 0.75 * vnoise(x * 0.08, y * 0.4 + 11) + sunSheen);
            if (hash(x * 19, y * 23) > 0.985 - 0.03 * wv * wv) {
              put(FOAM, 0.1 + 0.3 * wv, "°", px, py);
            } else if (sheen > 0.3 && h < sheen * 0.45) {
              put(WET, 0.4 + clamp(sheen) * 0.6, h < 0.1 ? "=" : "-", px, py);
            } else if (h < 0.35 * wv + 0.1) {
              put(WET, 0.15 + 0.35 * wv * hash(x + 3, y + 9), h < 0.2 ? "." : ",", px, py);
            }
            continue;
          }

          // DRY SAND
          const sd = clamp((y - S0) / (rows - S0 + 1));
          const h = hash(x * 5 + 3, y * 9 + 4);
          if (h < 0.18 + 0.4 * sd) {
            const h2 = hash(x * 17 + 1, y * 3 + 8);
            put(SAND, 0.15 + 0.6 * h2 * (0.4 + 0.6 * sd), SAND_CH[(h2 * SAND_CH.length) | 0], px, py);
          }
        }
      }

      // ---- backgrounds ----
      const skyH = H * ch;
      ctx.fillStyle = css(L.sandBg);
      ctx.fillRect(0, 0, vw, vh);

      const skyG = ctx.createLinearGradient(0, 0, 0, skyH);
      skyG.addColorStop(0, css(L.skyTop));
      skyG.addColorStop(1, css(L.skyHor));
      ctx.fillStyle = skyG;
      ctx.fillRect(0, 0, vw, skyH);

      if (sunVis > 0) {
        const gx = sx * cw;
        const gy = sy * ch;
        const rad = vh * 0.55;
        const sg = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        sg.addColorStop(0, css(L.sunCore, 0.45 * sunVis));
        sg.addColorStop(0.25, css(L.sunEdge, 0.18 * sunVis));
        sg.addColorStop(1, css(L.sunEdge, 0));
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, vw, skyH);
      }

      const waterG = ctx.createLinearGradient(0, skyH, 0, (S0 + 4) * ch);
      waterG.addColorStop(0, css(L.wBgFar));
      waterG.addColorStop(1, css(L.wBgNear));
      ctx.fillStyle = waterG;
      for (let x = 0; x < cols; x++) ctx.fillRect(x * cw, skyH, cw + 0.6, (edge[x] - H) * ch);

      ctx.fillStyle = css(L.wetBg);
      for (let x = 0; x < cols; x++) {
        if (wetAmt[x] > 0 && wetReach[x] > edge[x]) {
          ctx.globalAlpha = wetAmt[x] * 0.8;
          ctx.fillRect(x * cw, edge[x] * ch, cw + 0.6, (wetReach[x] - edge[x]) * ch);
        }
      }
      ctx.globalAlpha = 1;

      // ---- characters, batched by color ----
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i];
        if (!b.length) continue;
        ctx.fillStyle = palette[i];
        for (let j = 0; j < b.length; j += 3) ctx.fillText(b[j], b[j + 1], b[j + 2]);
      }

      raf = requestAnimationFrame(frame);
    };

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // slider track = the sky across all 24 hours
  const track = useMemo(() => {
    const stops = [];
    for (let h = 0; h <= 24; h++) {
      const L = sampleTime(h);
      stops.push(`${css(mix(L.skyTop, L.skyHor, 0.65))} ${((h / 24) * 100).toFixed(1)}%`);
    }
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }, []);
  const vignette = sampleTime(hour).vignette;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      <style>{CSS}</style>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          transition: "opacity 1s ease",
          opacity: vignette / 0.75,
          background: "radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.75) 100%)",
        }}
      />

      <HomeHeader hour={liveHour} />

      <div className={`shore-panel ${open ? "" : "closed"}`}>
        <button className="shore-toggle" onClick={() => setOpen((o) => !o)} aria-label="Toggle controls">
          {open ? "›" : "‹"}
        </button>
        <div className="shore-body">
          <div className="shore-title">~ controls ~</div>

          <label className="shore-row">
            <span>
              wave speed <b>{speed.toFixed(1)}×</b>
            </span>
            <input type="range" min="0" max="3" step="0.05" value={speed} onChange={(e) => setSpeed(+e.target.value)} />
          </label>

          <label className="shore-row">
            <span>
              reflection <b>{Math.round(reflect * 100)}%</b>
            </span>
            <input type="range" min="0" max="2" step="0.05" value={reflect} onChange={(e) => setReflect(+e.target.value)} />
          </label>

          <label className="shore-row">
            <span>
              time <b>{isLive ? fmtClock(hour) : fmtHour(hour)}</b>
            </span>
            <input
              className="shore-time"
              style={{ background: track }}
              type="range"
              min="0"
              max="23"
              step="1"
              value={Math.floor(hour)}
              onChange={(e) => setManualHour(+e.target.value)}
            />
            <em className="shore-hint">
              {isLive ? (
                <span className="shore-live">● live · {HOUR_NAMES[Math.floor(hour)]}</span>
              ) : (
                <>
                  {HOUR_NAMES[Math.floor(hour)]} ·{" "}
                  <button type="button" className="shore-link" onClick={() => setManualHour(null)}>
                    back to live
                  </button>
                </>
              )}
            </em>
          </label>

          <button
            className="shore-reset"
            onClick={() => {
              setSpeed(DEFAULTS.speed);
              setReflect(DEFAULTS.reflect);
              setManualHour(null);
            }}
          >
            reset
          </button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.shore-panel {
  position: absolute; top: 50%; right: 18px; transform: translateY(-50%);
  display: flex; align-items: center; gap: 6px;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 11px;
  color: rgba(200, 210, 230, 0.8); transition: transform .35s ease;
}
.shore-panel.closed { transform: translate(calc(100% - 10px), -50%); }
.shore-toggle {
  width: 22px; height: 44px; border-radius: 6px; cursor: pointer;
  background: rgba(8, 12, 22, 0.6); color: rgba(200, 210, 230, 0.7);
  border: 1px solid rgba(255,255,255,0.08); font-size: 16px; line-height: 1;
}
.shore-body {
  width: 190px; padding: 14px 14px 12px; border-radius: 10px;
  background: rgba(6, 9, 16, 0.6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.08);
  display: flex; flex-direction: column; gap: 14px;
}
.shore-title { text-align: center; letter-spacing: .15em; color: rgba(200,210,230,0.45); }
.shore-row { display: flex; flex-direction: column; gap: 7px; }
.shore-row span { display: flex; align-items: center; gap: 6px; }
.shore-row b { margin-left: auto; font-weight: 400; color: rgba(235,240,255,0.92); }
.shore-hint { font-style: normal; text-align: right; color: rgba(200,210,230,0.5); margin-top: -2px; }
.shore-row input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 4px;
  background: rgba(255,255,255,0.12); outline: none; margin: 0;
}
.shore-row input.shore-time { height: 8px; border: 1px solid rgba(255,255,255,0.08); }
.shore-row input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
  background: #dfe6f5; border: 2px solid #0a0e18; cursor: pointer;
}
.shore-row input[type=range]::-moz-range-thumb {
  width: 10px; height: 10px; border-radius: 50%;
  background: #dfe6f5; border: 2px solid #0a0e18; cursor: pointer;
}
.shore-reset {
  align-self: center; background: none; cursor: pointer; padding: 4px 12px; border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.1); color: rgba(200,210,230,0.6); font: inherit;
}
.shore-live { color: rgba(170, 215, 190, 0.7); }
.shore-link {
  background: none; border: none; padding: 0; font: inherit; cursor: pointer;
  color: rgba(200, 220, 255, 0.75); text-decoration: underline; text-underline-offset: 2px;
}
.shore-link:hover { color: #fff; }
.shore-reset:hover, .shore-toggle:hover { color: #fff; border-color: rgba(255,255,255,0.25); }

/* ---------- home page ---------- */
.home {
  position: absolute; left: 50%; top: 17vh; transform: translateX(-50%);
  width: min(680px, 88vw); display: flex; flex-direction: column; align-items: center; gap: 30px;
}
.home-greeting {
  margin: 0; text-align: center;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif;
  font-weight: 400; font-size: clamp(28px, 3.6vw, 42px); letter-spacing: -0.01em;
  color: rgba(242, 240, 235, 0.94); text-shadow: 0 1px 18px rgba(0, 0, 0, 0.35);
}
.home-search {
  width: 100%; height: 54px; box-sizing: border-box; padding: 0 18px;
  display: flex; align-items: center; gap: 12px; border-radius: 27px;
  background: rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(14px) saturate(115%); -webkit-backdrop-filter: blur(14px) saturate(115%);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transition: border-color .2s ease, background .2s ease, box-shadow .2s ease;
}
.home-search:focus-within {
  background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 10px 44px rgba(0, 0, 0, 0.32), 0 0 0 4px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.home-search-icon { width: 18px; height: 18px; flex: none; color: rgba(235, 240, 250, 0.6); }
.home-search input {
  flex: 1; min-width: 0; height: 100%; background: none; border: none; outline: none;
  font: 400 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  color: rgba(245, 247, 252, 0.95); caret-color: rgba(245, 247, 252, 0.9);
}
.home-search input::placeholder { color: rgba(225, 230, 240, 0.5); }
.home-enter {
  flex: none; font: 12px/1 ui-monospace, Menlo, monospace; color: rgba(225, 230, 240, 0.55);
  padding: 4px 7px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.14);
}
`;
