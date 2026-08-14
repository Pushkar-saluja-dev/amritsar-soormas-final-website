/* Turn the supplied cut-out player PNGs into web-sized WebP, plus the card backdrop. */
const sharp = require('sharp');
const path = require('path');

const SRC = 'Branding Stuff/assets_/images/png';
const OUT = 'assets/players';

// The source files are numbered, not named — this is the mapping, confirmed against the
// named squad photos. The numbering does not track the numbered JPEGs: 8 and 9 are swapped.
const PLAYERS = [
  ['1', 'abhishek-sharma', 800],
  ['2', 'mayank-markande', 800],
  ['3', 'naman-dhir', 800],
  ['4', 'rahul-kumar', 560],
  ['5', 'sahil-khan', 560],
  ['6', 'jashanpreet-singh', 560],
  ['7', 'dhruv-rahul-jindal', 560],
  ['8', 'reavan-preet-singh', 560],
  ['9', 'prabhjit-singh', 560],
  ['10', 'ishan-sood', 560],
  ['11', 'adhiraj-singh-mangat', 560],
  ['12', 'abhay-chaudhary', 560],
  ['13', 'dhrub-bhagania', 560],
  ['14', 'shubham-rana', 560],
  ['15', 'sahaj-dhawan', 560],
  ['16', 'ishmeet-singh-sandhu', 560],
  ['17', 'navneet-virk', 560],
  ['18', 'akash-pandey', 560],
  ['19', 'vaibhav-kalra', 560],
  ['20', 'jai-partap-johal', 560],
];

(async () => {
  for (const [num, slug, width] of PLAYERS) {
    const src = path.join(SRC, `${num}.png`);
    const meta = await sharp(src).metadata();
    if (!meta.hasAlpha) throw new Error(`${src} has no alpha channel`);
    const info = await sharp(src)
      .trim({ threshold: 1 })
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 92, effort: 6 })
      .toFile(path.join(OUT, `${slug}.webp`));
    console.log(slug.padEnd(24), `${info.width}x${info.height}`, `${(info.size / 1024) | 0}kb`);
  }

  // Stadium plate that sits behind every cut-out in the card frame.
  const bg = await sharp(path.join(SRC, 'bg.png'))
    .resize({ width: 900 })
    .webp({ quality: 76, effort: 6 })
    .toFile('assets/players/card-bg.webp');
  console.log('card-bg'.padEnd(24), `${bg.width}x${bg.height}`, `${(bg.size / 1024) | 0}kb`);
})();
