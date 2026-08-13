# Amritsar Soormas — landing page

Static site. No build step, no dependencies.

## Run locally

```
python -m http.server 8787
```
Then open http://localhost:8787

## Deploy

Drop the folder on any static host (Vercel, Netlify, S3, cPanel). On Vercel: `vercel --prod`
from this directory — it is detected as a static site.

## Files

| Path | What |
|---|---|
| `index.html` | All seven sections + header/footer |
| `styles.css` | Theme tokens at the top (`:root`), then sections in page order |
| `bat-section.css` | The "more than a bat" section, copied verbatim from the experiment build |
| `script.js` | Hero slider (autoplay + arrows + dots + swipe) and the mobile nav toggle |
| `assets/` | Web-sized images cut from `Branding Stuff/` |
| `assets/players/` | Player cut-outs (transparent WebP) — 1 marquee, 2 icon, 17 squad |
| `assets/bat/` | WebGL textures + feature cards for the bat section |
| `Branding Stuff/` | Original source art — not served, keep for future re-cuts |

## Player images

The supplied squad portraits were JPEGs on a white studio backdrop. That backdrop is flood-filled
out and saved as transparent PNGs in `assets/players/`, so the cards paint their own navy/maroon
gradient behind each player. Abhishek Sharma's three files were already cut out and are used as-is
(`abhishek-sharma.png` is on the marquee card; `-helmet` and `-sign` are spare).

To add a player: drop the source in `Branding Stuff/Player images/The soorma squad/` named
`Name, Role Whatever.jpg`, re-run the keying script, then add one `<article class="squad-card">`
block in `#squad`. Names and roles in the markup come straight from those filenames.

## The bat section

Section 6 ("Every Soorma carries more than a bat") is not original work — the markup, the WebGL
shader, the lockbox anchors and the CSS were lifted out of `Desktop/expiremen/index.html` and
`dash.css`. That folder was read only; nothing in it was touched.

Changes to the copy:

1. Asset paths repointed from `Branding_stuff/...` to `assets/bat/...`.
2. `id="bat"` added to the `<section>` so the nav can link to it.
3. The Webflow CDN webfont dropped; the headline uses Archivo like the rest of the page.

The shader, the textures and the reveal animation are **unmodified**.

### Why the sheet is still white

The section shipped white with Dropbox blue. Theming it meant one of two things: recolour the
artwork, or frame it. Recolouring was tried and reverted, because both routes to a dark sheet
break something:

- The shader sizes its spotlight mask from `activeColor.r * (0.4 * activeColor.g + 0.6) * 2.0` —
  the artwork's own brightness. That only works because the sheet is white (r = g = 1, a flat ×2).
  Darken the sheet and the reveal collapses to a sliver.
- Patching that term to use alpha instead restores the footprint, but the coloured splice still
  has to survive whatever recolouring hit the sheet, and per-pixel inversion made those colours
  look wrong.
- Leaving the colour texture alone while darkening only the idle one works mechanically, but the
  active sheet is opaque white, so the reveal opens as a white blob on navy.

So the canvas is left completely alone and the theming goes around it: the sheet sits as a framed
white panel (gold hairline, rounded, dropped shadow) on the Soormas navy, with a gold eyebrow, an
Archivo headline, and the blue lockbox glow swapped for gold. All of that lives in the marked
override block at the bottom of `bat-section.css`; everything above it is the untouched copy.

`tools/theme-bat-textures.js` only resizes the textures 4000px → 2048px. The one thing it has to
do by hand is keep **white RGB under fully transparent pixels** — the canvas runs on an
`alpha:false` context and samples those values regardless, and sharp zeroes them on resize, which
paints a black slab over the canvas. Re-run it (needs `npm i sharp`) if the source art changes.

## Things to swap when real material arrives

- **Icon player stats** — the design only shows names, so the cards carry name + role. Stats
  markup exists in the marquee panel if you want to copy it across.
- **Jersey sponsor** on Abhishek's marquee cut-out still reads "SPONSOR" placeholder.
- **Social URLs** in the footer point at `@amritsarsoormas` on Instagram, Facebook and YouTube.
  Confirm the Facebook and YouTube handles before launch.
- **Punjab map** (`assets/punjab-map.jpg`) is lifted from the deck slide. If a vector version
  turns up, swap the file — the section already sits on the same navy (`#102240`).
