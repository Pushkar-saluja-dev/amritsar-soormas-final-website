/* Lift the Punjab district map off the deck slide and recolour it into the brand palette.
   The slide bakes its headline, copy and city labels into the JPEG, which is why the
   section could not respond below ~760px. Here the map is cut out on its own so the
   page can draw the type and the city markers as real HTML. */
const sharp = require('sharp');

const SRC = 'assets/punjab-map.jpg';
const OUT = 'assets/punjab-map.webp';

const BACKDROP = [12, 31, 61];   // the slide's navy field, incl. its faint line pattern
const BACKDROP_TOL = [16, 16, 18];
const THIN_OPEN = 9;             // opens away the leader lines that run outside the map
const LINE_ERODE = 4;            // and tells the ones drawn across it from the Amritsar fill
const LINE_DILATE = 5;           // reach far enough to take their anti-aliased shoulders

const OUTLINE = -1;              // district borders, kept as drawn
const UNKNOWN = -2;              // leader-line pixels, filled in from their neighbours
const AMRITSAR = 8;
const STONE = 9;

/* Eight warm brand tones plus the two specials. Navy is deliberately absent: the section
   behind the map is midnight navy, so districts painted in it would sink into the page. */
const RAMP = [
  [352, 0.42, 0.34], [33, 0.52, 0.50], [16, 0.35, 0.40], [1, 0.55, 0.40],
  [33, 0.34, 0.34], [352, 0.30, 0.46], [20, 0.45, 0.30], [40, 0.45, 0.42],
  [33, 0.62, 0.55], // Amritsar — the brightest tile on the board
  [33, 0.22, 0.44], // greys and creams -> warm stone
];

const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
};

const hslToRgb = (h, s, l) => {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const chan = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [chan(h + 1 / 3), chan(h), chan(h - 1 / 3)].map((v) => Math.round(v * 255));
};

const isBackdrop = (r, g, b) =>
  Math.abs(r - BACKDROP[0]) <= BACKDROP_TOL[0] &&
  Math.abs(g - BACKDROP[1]) <= BACKDROP_TOL[1] &&
  Math.abs(b - BACKDROP[2]) <= BACKDROP_TOL[2];

const isBrightYellow = (h, s, l) => h >= 38 && h < 80 && s > 0.45 && l > 0.42;
const isWarmLight = (h, s, l) => h >= 26 && h < 92 && s > 0.28 && l > 0.38;

(async () => {
  const src = sharp(SRC).removeAlpha();
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const N = w * h;
  const at = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];

  // JPEG noise inside the darker fills straddles the hue buckets and speckles the recolour,
  // so the palette is read off a median-filtered copy.
  const flat = await sharp(SRC).removeAlpha().median(3).raw().toBuffer();
  const flatHsl = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [hu, s, l] = rgbToHsl(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
    flatHsl[i * 3] = hu; flatHsl[i * 3 + 1] = s; flatHsl[i * 3 + 2] = l;
  }

  const erode = (mask, times) => {
    let cur = Uint8Array.from(mask);
    for (let t = 0; t < times; t++) {
      const nxt = new Uint8Array(N);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          nxt[i] = cur[i] && cur[i - 1] && cur[i + 1] && cur[i - w] && cur[i + w] ? 1 : 0;
        }
      }
      cur = nxt;
    }
    return cur;
  };

  /** Largest 4-connected component of a binary mask. */
  const largest = (mask) => {
    const seen = new Uint8Array(N);
    let best = [];
    for (let seed = 0; seed < N; seed++) {
      if (!mask[seed] || seen[seed]) continue;
      const cells = [], q = [seed];
      seen[seed] = 1;
      while (q.length) {
        const i = q.pop(); cells.push(i);
        const x = i % w, y = (i / w) | 0;
        const step = (j) => { if (mask[j] && !seen[j]) { seen[j] = 1; q.push(j); } };
        if (x > 0) step(i - 1);
        if (x < w - 1) step(i + 1);
        if (y > 0) step(i - w);
        if (y < h - 1) step(i + w);
      }
      if (cells.length > best.length) best = cells;
    }
    const out = new Uint8Array(N);
    for (const i of best) out[i] = 1;
    return out;
  };

  // ---- cut the map out of the slide -------------------------------------------------
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) solid[i] = isBackdrop(...at(i)) ? 0 : 1;

  // The headline and paragraph are their own islands, but the leader lines touch the map.
  // Opening removes every thin structure; the polygon is then grown back inside `solid`.
  let grown = largest(erode(solid, THIN_OPEN));
  for (let t = 0; t < THIN_OPEN; t++) {
    const nxt = Uint8Array.from(grown);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (grown[i] || !solid[i]) continue;
        if (grown[i - 1] || grown[i + 1] || grown[i - w] || grown[i + w]) nxt[i] = 1;
      }
    }
    grown = nxt;
  }

  // ---- classify every kept pixel into a brand tone -----------------------------------
  // Three of the six leader lines are drawn *across* the map, so they cannot be opened
  // away. They are thin and bright yellow; the Amritsar fill is bright yellow and thick.
  const yellow = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    yellow[i] = isBrightYellow(flatHsl[i * 3], flatHsl[i * 3 + 1], flatHsl[i * 3 + 2]) ? 1 : 0;
  }
  const thickYellow = erode(yellow, LINE_ERODE);

  // The lines are drawn anti-aliased, so their soft shoulders read as an ordinary warm
  // district colour. Grow the thin-line seed outward and take the shoulders with it.
  let lineMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) lineMask[i] = yellow[i] && !thickYellow[i] ? 1 : 0;
  for (let t = 0; t < LINE_DILATE; t++) {
    const nxt = Uint8Array.from(lineMask);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (lineMask[i] || thickYellow[i]) continue;
        if (!isWarmLight(flatHsl[i * 3], flatHsl[i * 3 + 1], flatHsl[i * 3 + 2])) continue;
        if (lineMask[i - 1] || lineMask[i + 1] || lineMask[i - w] || lineMask[i + w]) nxt[i] = 1;
      }
    }
    lineMask = nxt;
  }

  const tone = new Int8Array(N).fill(UNKNOWN);
  let unknowns = 0;
  for (let i = 0; i < N; i++) {
    if (!grown[i]) { tone[i] = OUTLINE; continue; } // outside pixels are never drawn
    const hu = flatHsl[i * 3], s = flatHsl[i * 3 + 1], l = flatHsl[i * 3 + 2];
    if (l < 0.16) tone[i] = OUTLINE;
    else if (lineMask[i]) { unknowns++; }  // a leader line — fill it in from around it
    else if (yellow[i]) tone[i] = AMRITSAR;
    else if (s < 0.14) tone[i] = STONE;
    else tone[i] = Math.min(7, Math.floor(hu / 360 * 8));
  }

  // Diffuse the surrounding district colour over the leader lines.
  while (unknowns) {
    let filled = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (tone[i] !== UNKNOWN) continue;
        const votes = new Map();
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (tone[j] === UNKNOWN || tone[j] === OUTLINE) continue;
          votes.set(tone[j], (votes.get(tone[j]) || 0) + 1);
        }
        if (!votes.size) continue;
        tone[i] = [...votes].sort((a, b) => b[1] - a[1])[0][0];
        filled++;
      }
    }
    unknowns -= filled;
    if (!filled) break; // nothing reachable is left
  }
  for (let i = 0; i < N; i++) if (tone[i] === UNKNOWN) tone[i] = OUTLINE;

  // Majority-filter the fills so JPEG mottling does not survive as speckle. Border pixels
  // are left alone, which is what keeps the district outlines crisp.
  const smoothed = Int8Array.from(tone);
  const R = 2;
  for (let y = R; y < h - R; y++) {
    for (let x = R; x < w - R; x++) {
      const i = y * w + x;
      if (tone[i] === OUTLINE) continue;
      const votes = new Map();
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const t = tone[i + dy * w + dx];
          if (t === OUTLINE) continue;
          votes.set(t, (votes.get(t) || 0) + 1);
        }
      }
      smoothed[i] = [...votes].sort((a, b) => b[1] - a[1])[0][0];
    }
  }

  // ---- paint, feather, trim ----------------------------------------------------------
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) alpha[i] = grown[i] ? 255 : 0;
  const eroded = Uint8Array.from(alpha);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!alpha[i]) continue;
      if (!alpha[i - 1] || !alpha[i + 1] || !alpha[i - w] || !alpha[i + w]) eroded[i] = 0;
    }
  }
  const soft = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          sum += eroded[yy * w + xx]; n++;
        }
      }
      soft[y * w + x] = (sum / n) | 0;
    }
  }

  const palette = RAMP.map(([hu, s, l]) => hslToRgb(hu, s, l));
  const rgba = Buffer.alloc(N * 4);
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < N; i++) {
    const t = grown[i] ? smoothed[i] : OUTLINE;
    const [r, g, b] = t === OUTLINE ? [0x12, 0x19, 0x28] : palette[t];
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = soft[i];
    if (soft[i] > 24) {
      const x = i % w, y = (i / w) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const out = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract(box)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(OUT);
  console.log(`${OUT} ${out.width}x${out.height} ${(out.size / 1024) | 0}kb`);
})();
