/*
 * Prepare the two WebGL bat textures: 4000px -> 2048px, nothing else.
 *
 * Neither texture is recoloured. The shader sizes its spotlight mask from
 * activeColor.r/.g, so changing the artwork's brightness changes how the reveal
 * opens; and the coloured splice has to arrive exactly as drawn. The section is
 * themed around the canvas instead — see the override block in bat-section.css.
 *
 * The one thing that must survive the resize is white RGB under fully transparent
 * pixels. The canvas runs on an `alpha:false` context and samples those values
 * regardless, and sharp zeroes them — which paints a black slab over the canvas.
 *
 * Sources are read from Branding Stuff/ and never modified.
 */
const sharp = require('sharp');
const path = require('path');

const B = 'C:/Users/pushk/Desktop/Amritsar Soormas New/Branding Stuff';
const A = 'C:/Users/pushk/Desktop/Amritsar Soormas New/assets/bat';
const SIZE = 2048;

async function build(src, out) {
  const { data, info } = await sharp(path.join(B, src))
    .resize(SIZE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < info.width * info.height; i++) {
    const p = i * 4;
    if (data[p + 3] === 0) { data[p] = data[p + 1] = data[p + 2] = 255; }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(A, out));
  console.log(out, `${info.width}x${info.height}`);
}

(async () => {
  await build('Cricket bat no color square.png', 'bat-idle.png');
  await build('Cricket bat with color square.png', 'bat-active.png');
})();
