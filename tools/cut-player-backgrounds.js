/* Cut the white studio backdrop off the squad portraits and emit brand-ready PNGs.

   SUPERSEDED. The client later supplied proper cut-outs in Branding Stuff/assets_/images/png,
   which build-player-pngs.js turns into the shipped assets/players/*.webp — every player on
   the roster is covered there. Running this script again overwrites those with the
   machine-cut versions, so only do that for a player the supplied set is missing. */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const B = 'C:/Users/pushk/Desktop/Amritsar Soormas New/Branding Stuff';
const A = 'C:/Users/pushk/Desktop/Amritsar Soormas New/assets/players';
const SRC = path.join(B, 'Player images');

const WHITE_MIN = 236;   // luminance above which a pixel can belong to the backdrop
const SPREAD_MAX = 12;   // max channel spread — keeps coloured highlights out of the fill
// roughly 2x the largest rendered size per group; WebP keeps the alpha cheap
const WIDTHS = { icon: 800, squad: 560, marquee: 800 };

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "Sahaj Dhawan, Role Right Hand Bat, Wicket Keeper.jpg" -> { name, role } */
function parseFileName(file) {
  const base = file.replace(/\.[a-z]+$/i, '');
  const [name, ...rest] = base.split(',');
  const role = rest.join(',').replace(/^\s*Role\s*/i, '').trim();
  return { name: name.trim(), role: titleCase(role) };
}

function titleCase(s) {
  return s.replace(/\w[^\s,]*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Flood fill the backdrop inward from the border, then erode + feather the edge. */
function buildAlpha(data, w, h) {
  const alpha = new Uint8Array(w * h).fill(255);
  const stack = [];
  const isBackdrop = (i) => {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return min >= WHITE_MIN && max - min <= SPREAD_MAX;
  };
  const push = (i) => { if (alpha[i] === 255 && isBackdrop(i)) { alpha[i] = 0; stack.push(i); } };

  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }

  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }

  // erode one pixel so the white fringe goes with the backdrop
  const eroded = Uint8Array.from(alpha);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (alpha[i] === 0) continue;
      if (!alpha[i - 1] || !alpha[i + 1] || !alpha[i - w] || !alpha[i + w]) eroded[i] = 0;
    }
  }

  // 3x3 box blur to feather the cut
  const soft = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += eroded[yy * w + xx]; n++;
        }
      }
      soft[y * w + x] = (sum / n) | 0;
    }
  }
  return soft;
}

async function cutout(file, outPath, width) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const alpha = buildAlpha(data, w, h);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = data[i * 3];
    rgba[i * 4 + 1] = data[i * 3 + 1];
    rgba[i * 4 + 2] = data[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 1 })
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90, effort: 5 })
    .toFile(outPath);
}

(async () => {
  fs.mkdirSync(A, { recursive: true });
  const manifest = { icon: [], squad: [] };

  for (const [group, dir] of [['icon', 'Icon'], ['squad', 'The soorma squad']]) {
    const folder = path.join(SRC, dir);
    for (const file of fs.readdirSync(folder).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
      const { name, role } = parseFileName(file);
      const out = `${slug(name)}.webp`;
      await cutout(path.join(folder, file), path.join(A, out), WIDTHS[group]);
      manifest[group].push({ name, role, img: `assets/players/${out}` });
      console.log(group, '|', name, '|', role);
    }
  }

  // Abhishek Sharma is already supplied cut out — just resize and recompress
  for (const [src, out] of [
    ['Abhishek Sharma.png', 'abhishek-sharma.webp'],
    ['Abhishek Sharma with helmet.png', 'abhishek-sharma-helmet.webp'],
    ['Abhieshek iconic sign.png', 'abhishek-sharma-sign.webp'],
  ]) {
    await sharp(path.join(B, src)).trim({ threshold: 1 })
      .resize({ width: WIDTHS.marquee, withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90, effort: 5 }).toFile(path.join(A, out));
  }

  fs.writeFileSync(path.join(A, '_manifest.json'), JSON.stringify(manifest, null, 2));
})();
