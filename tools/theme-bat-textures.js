/*
 * Prepare the two WebGL bat textures from the navy artwork.
 *
 * The sources are already 2048px squares and already registered against each
 * other pixel for pixel — a 50/50 blend of the two lands the line drawing exactly
 * on the painted silhouette — so nothing is cropped, scaled or nudged here. The
 * bat also lands in the same place the old white artwork did (x 276-1770,
 * y 716-1330), which is what the shader's hardcoded reveal hotspots are aimed at,
 * so the reveal is left untouched.
 *
 * Two edits. The generator's sparkle watermarks are painted out — they sit on flat
 * background in both files.
 *
 * And the active sheet gets an alpha channel cut to the bat's silhouette. The shader
 * clips the reveal with `activeArea *= activeColor.a`, so alpha is what kept the
 * splice on the bat instead of blooming over the paper around it. The old white
 * artwork carried that alpha for free; the new sheets arrive fully opaque, and
 * without it the reveal reads as a blob eating the background. RGB is left alone
 * under the transparent pixels — the shader samples it regardless of alpha.
 *
 * Sources are read from Branding Stuff/ and never modified.
 */
const sharp = require('sharp');
const path = require('path');

const B = 'C:/Users/pushk/Desktop/Amritsar Soormas New/Branding Stuff';
const A = 'C:/Users/pushk/Desktop/Amritsar Soormas New/assets/bat';

/* Watermark boxes, in source pixels: [left, top, right, bottom, keepAbove].
   keepAbove leaves any pixel brighter than that value alone — the idle sheet's
   second watermark is a faint outline sitting a few pixels off a bright
   construction line, and a plain box fill takes a bite out of the line. */
const WATERMARKS = {
  'bat-idle.png': [[1875, 1875, 1985, 1985], [1610, 1178, 1706, 1262, 90]],
  'bat-active.png': [[1875, 1875, 1985, 1985]],
};

/* Median, not mean: the idle sheet's second watermark sits a few pixels from a
   bright construction line, and averaging it in tints the patch visibly lighter. */
function ringColor(data, W, [x0, y0, x1, y1]) {
  const pad = 6;
  const ch = [[], [], []];
  const add = (x, y) => { const p = (y * W + x) * 3; ch[0].push(data[p]); ch[1].push(data[p + 1]); ch[2].push(data[p + 2]); };
  for (let x = x0 - pad; x <= x1 + pad; x++) { add(x, y0 - pad); add(x, y1 + pad); }
  for (let y = y0 - pad; y <= y1 + pad; y++) { add(x0 - pad, y); add(x1 + pad, y); }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
}

const FIELD = [38, 49, 69];   // the flat navy both sheets are drawn on
const CUTOFF = 14;            // channel distance from the field that counts as paint

/* Alpha for the painted bat. Thresholding alone punches holes wherever the artwork
   happens to match the field — the navy grip does, in places — so the outside is
   found by flooding in from the border and everything the flood cannot reach is
   treated as bat. The faint construction lines stay out of the mask on purpose:
   they are scaffolding, and the reveal belongs on the bat itself. */
function silhouette(data, W, H) {
  const isField = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const p = i * 3;
    const d = Math.max(
      Math.abs(data[p] - FIELD[0]),
      Math.abs(data[p + 1] - FIELD[1]),
      Math.abs(data[p + 2] - FIELD[2]),
    );
    if (d <= CUTOFF) isField[i] = 1;
  }

  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    const i = y * W + x;
    if (isField[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W, y = (i - x) / W;
    if (x > 0) push(x - 1, y);
    if (x < W - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < H - 1) push(x, y + 1);
  }

  const alpha = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = outside[i] ? 0 : 255;
  return alpha;
}

async function build(src, out, cutAlpha = false) {
  const { data, info } = await sharp(path.join(B, src))
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;

  for (const box of WATERMARKS[out]) {
    const [x0, y0, x1, y1, keepAbove = Infinity] = box;
    const [r, g, b] = ringColor(data, W, box);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = (y * W + x) * 3;
        if (Math.max(data[p], data[p + 1], data[p + 2]) > keepAbove) continue;
        data[p] = r; data[p + 1] = g; data[p + 2] = b;
      }
    }
  }

  let image = sharp(data, { raw: { width: W, height: info.height, channels: 3 } });

  if (cutAlpha) {
    // one pass of blur softens the cut so the reveal's edge is not stair-stepped.
    // blur promotes a one-channel buffer to three, and joinChannel would then read
    // the top third of the image as the mask, so pull channel 0 back out.
    const alpha = await sharp(silhouette(data, W, info.height), {
      raw: { width: W, height: info.height, channels: 1 },
    }).blur(1.2).extractChannel(0).raw().toBuffer();
    if (alpha.length !== W * info.height) {
      throw new Error(`alpha mask is ${alpha.length} bytes, expected ${W * info.height}`);
    }
    image = image.joinChannel(alpha, { raw: { width: W, height: info.height, channels: 1 } });
  }

  await image.png({ compressionLevel: 9 }).toFile(path.join(A, out));
  console.log(out, `${W}x${info.height}`, cutAlpha ? '+alpha' : '');
}

(async () => {
  await build('Bat no color new.png', 'bat-idle.png');
  await build('Bat color new.png', 'bat-active.png', true);
})();
