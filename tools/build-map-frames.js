/* Turn the six supplied "Map <city>.png" slides into aligned, background-free WebP frames.

   The sources are six separate renders: different canvases, different zooms, and not even
   the same generation of the artwork — outlines and proportions wander a little from file
   to file. Measuring one number per frame (a bounding box, a pixel count) and scaling by it
   was never going to hold, because the thing being measured is not the same thing twice.

   So the frames are registered instead: one file is the reference, and every other frame is
   fitted to it by searching scale and offset for the best silhouette overlap. Punjab then
   comes out the same size in the same place in all six, which is what the cross-fade needs. */
const sharp = require('sharp');
const path = require('path');

const SRC = 'Branding Stuff';
const OUT = 'assets/maps';

const FRAMES = [
  ['Map amritsar.png', 'amritsar'],
  ['Map Jalandhar.png', 'jalandhar'],
  ['Map Ludhiana.png', 'ludhiana'],
  ['Map Mohali.png', 'mohali'],
  ['Map fazilka.png', 'fazilka'],
  ['Map Bhatinda.png', 'bathinda'],
];
const REFERENCE = 'amritsar';

// alpha key: distance from the frame's own flat navy, in max-channel terms
const KEY_LO = 26;   // fully background
const KEY_HI = 54;   // fully opaque
// the generator dropped a small "AI sparkle" glyph in the bottom-right of some frames
const SPARKLE = { x: 0.92, y: 0.84 };
// output geometry
const CANVAS_W = 1500;
const BODY_W_FRAC = 0.55;   // Punjab's width as a share of the canvas
const BODY_CX = 0.5;        // where the body sits on the canvas
const BODY_CY = 0.5;
// registration workspace: silhouettes are compared on a small grid, in abstract units
const UNIT = 1000;          // Punjab is UNIT wide by definition
const GRID_W = 260, GRID_H = 200, GRID_BODY_W = 150;
const U2G = GRID_BODY_W / UNIT;

async function keyed(file) {
  const { data, info } = await sharp(path.join(SRC, file))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  // background = median of a ring of border samples (the backdrop is flat per frame)
  const samples = [];
  for (let i = 0; i < 200; i++) {
    const x = Math.floor((i / 200) * w), y = Math.floor((i / 200) * h);
    samples.push([data[(2 * w + x) * 3], data[(2 * w + x) * 3 + 1], data[(2 * w + x) * 3 + 2]]);
    samples.push([data[(y * w + 2) * 3], data[(y * w + 2) * 3 + 1], data[(y * w + 2) * 3 + 2]]);
  }
  const bg = [0, 1, 2].map(c => {
    const v = samples.map(s => s[c]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  });

  const out = Buffer.alloc(w * h * 4);
  const sx = Math.floor(w * SPARKLE.x), sy = Math.floor(h * SPARKLE.y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3, o = (y * w + x) * 4;
      const d = Math.max(
        Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]));
      let a = (d - KEY_LO) / (KEY_HI - KEY_LO);
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      if (x > sx && y > sy) a = 0;
      out[o] = data[i]; out[o + 1] = data[i + 1]; out[o + 2] = data[i + 2];
      out[o + 3] = Math.round(a * 255);
    }
  }
  return { raw: out, w, h };
}

/* The silhouette as a sparse point list, plus a first guess at its scale and centre.
   The guess uses the 2nd/98th percentile of the mask's row and column mass: label text and
   leader lines are too light to move a percentile much, unlike a bounding box. */
function silhouette({ raw, w, h }) {
  const step = Math.max(1, Math.round(w / 300));
  const cols = new Float64Array(Math.ceil(w / step));
  const rows = new Float64Array(Math.ceil(h / step));
  const pts = [];
  for (let y = 0, gy = 0; y < h; y += step, gy++) {
    for (let x = 0, gx = 0; x < w; x += step, gx++) {
      if (raw[(y * w + x) * 4 + 3] > 128) { pts.push(x, y); cols[gx]++; rows[gy]++; }
    }
  }
  const span = (acc) => {
    const total = acc.reduce((a, b) => a + b, 0);
    let run = 0, lo = 0, hi = acc.length - 1;
    for (let i = 0; i < acc.length; i++) {
      run += acc[i];
      if (run >= 0.02 * total) { lo = i; break; }
    }
    run = 0;
    for (let i = 0; i < acc.length; i++) {
      run += acc[i];
      if (run >= 0.98 * total) { hi = i; break; }
    }
    return [lo * step, hi * step];
  };
  const [x0, x1] = span(cols), [y0, y1] = span(rows);
  return {
    pts: Int32Array.from(pts),
    k: UNIT / (x1 - x0),               // source px -> units
    cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
  };
}

/* Stamp a silhouette onto the comparison grid under a candidate transform. */
function stamp(sil, k, cx, cy, grid, gen) {
  const p = sil.pts;
  let n = 0;
  for (let i = 0; i < p.length; i += 2) {
    const gx = Math.round((p[i] - cx) * k * U2G + GRID_W / 2);
    const gy = Math.round((p[i + 1] - cy) * k * U2G + GRID_H / 2);
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
    const o = gy * GRID_W + gx;
    if (grid[o] !== gen) { grid[o] = gen; n++; }
  }
  return n;
}

/* Fit a frame to the reference: search scale and offset for the best silhouette overlap
   (intersection over union), coarse pass then fine pass around the winner. */
function register(sil, refGrid, refCount, work) {
  let best = { iou: -1, m: 1, dx: 0, dy: 0 };
  let gen = 1;

  const score = (m, dx, dy) => {
    const k = sil.k * m;
    const cx = sil.cx - dx / (k * U2G), cy = sil.cy - dy / (k * U2G);
    gen++;
    const n = stamp(sil, k, cx, cy, work, gen);
    let hit = 0;
    for (let i = 0; i < work.length; i++) if (work[i] === gen && refGrid[i]) hit++;
    return hit / (n + refCount - hit);
  };

  const sweep = (mFrom, mTo, mStep, dRange, dStep, seed) => {
    for (let m = mFrom; m <= mTo + 1e-9; m += mStep)
      for (let dx = seed.dx - dRange; dx <= seed.dx + dRange; dx += dStep)
        for (let dy = seed.dy - dRange; dy <= seed.dy + dRange; dy += dStep) {
          const iou = score(m, dx, dy);
          if (iou > best.iou) best = { iou, m, dx, dy };
        }
  };

  sweep(0.88, 1.12, 0.02, 12, 3, { dx: 0, dy: 0 });
  const coarse = { dx: best.dx, dy: best.dy };
  sweep(best.m - 0.02, best.m + 0.02, 0.004, 3, 1, coarse);
  return best;
}

(async () => {
  const canvasH = Math.round(CANVAS_W * 0.75);
  const work = new Int32Array(GRID_W * GRID_H);
  const refGrid = new Int32Array(GRID_W * GRID_H);

  const frames = [];
  for (const [file, slug] of FRAMES) {
    const img = await keyed(file);
    frames.push({ slug, img, sil: silhouette(img) });
  }

  const ref = frames.find(f => f.slug === REFERENCE);
  const refCount = stamp(ref.sil, ref.sil.k, ref.sil.cx, ref.sil.cy, refGrid, 1);

  for (const f of frames) {
    const fit = f === ref
      ? { iou: 1, m: 1, dx: 0, dy: 0 }
      : register(f.sil, refGrid, refCount, work);

    // units -> canvas, then source -> canvas
    const k = f.sil.k * fit.m;
    const cx = f.sil.cx - fit.dx / (k * U2G), cy = f.sil.cy - fit.dy / (k * U2G);
    const scale = (CANVAS_W * BODY_W_FRAC / UNIT) * k;

    const sw = Math.round(f.img.w * scale), sh = Math.round(f.img.h * scale);
    const left = Math.round(CANVAS_W * BODY_CX - cx * scale);
    const top = Math.round(canvasH * BODY_CY - cy * scale);

    const scaled = sharp(f.img.raw, { raw: { width: f.img.w, height: f.img.h, channels: 4 } })
      .resize({ width: sw, height: sh });

    // whatever falls outside the canvas is padding, so crop the overhang off
    const cropX = Math.max(0, -left), cropY = Math.max(0, -top);
    const cropW = Math.min(sw - cropX, CANVAS_W - Math.max(0, left));
    const cropH = Math.min(sh - cropY, canvasH - Math.max(0, top));
    const piece = await scaled
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png().toBuffer();

    await sharp({ create: { width: CANVAS_W, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }])
      .webp({ quality: 88 })
      .toFile(path.join(OUT, `${f.slug}.webp`));

    console.log(f.slug.padEnd(10), 'fit x' + fit.m.toFixed(3),
      'overlap', (fit.iou * 100).toFixed(1) + '%', 'scale', scale.toFixed(3));
  }

  /* Check the built frames, not the plan. Every output shares one canvas, so read each
     one back under the identity transform and ask the fitter whether it could still be
     improved: if the best fit is a 1.000x scale and a zero shift, the maps already line up.
     (Measuring a span or a box here would fail on the labels, not on the map.) */
  const built = [];
  for (const [, slug] of FRAMES) {
    const { data, info } = await sharp(path.join(OUT, `${slug}.webp`))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const sil = silhouette({ raw: data, w: info.width, h: info.height });
    sil.k = UNIT / (CANVAS_W * BODY_W_FRAC);       // the canvas is the unit space now
    sil.cx = CANVAS_W * BODY_CX;
    sil.cy = canvasH * BODY_CY;
    built.push({ slug, sil });
  }
  const baseGrid = new Int32Array(GRID_W * GRID_H);
  const base = built.find(b => b.slug === REFERENCE).sil;
  const baseCount = stamp(base, base.k, base.cx, base.cy, baseGrid, 1);

  for (const b of built) {
    const fit = register(b.sil, baseGrid, baseCount, work);
    const size = (fit.m - 1) * 100;
    const dx = fit.dx / GRID_BODY_W * 100, dy = fit.dy / GRID_BODY_W * 100;
    console.log('check', b.slug.padEnd(10), 'residual size ' + size.toFixed(1) + '%',
      'shift ' + dx.toFixed(1) + '% / ' + dy.toFixed(1) + '%');
    if (Math.abs(size) > 2 || Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      throw new Error(`${b.slug}: map is off by more than 2% — the frames would jump on the fade`);
    }
  }
})();
