# Build the six captain portraits the teams map draws beside the lit district.
#
# The sources are ordinary studio shots: each captain photographed against a flat backdrop,
# each on a different one — black for most, white for the small Gill frame, and the home side
# arriving as an already-cut transparent PNG. The card wants none of that. It wants a head,
# framed the same way every time, sitting in a round holder over the card's own gold gradient.
#
# So each source goes through the same two steps. The backdrop is flooded away from the border,
# which leaves the subject on transparency whatever colour the studio used. Then the head is
# found from that silhouette and cropped square and neck-up, so the six read as one set as the
# map cycles through them rather than six photos at six different distances.
from collections import deque
from PIL import Image, ImageFilter
import numpy as np
import os

SRC = os.path.join('Branding Stuff', 'captains')
OUT = os.path.join('assets', 'players')

# the home side is the one portrait already cut out, and it lives with the site's own art
CAPTAINS = [
    ('abhishek-sharma',   os.path.join(OUT, 'abhishek-sharma.webp')),
    ('prabhsimran-singh', os.path.join(SRC, 'prabhsimran-singh.png')),
    ('arshdeep-singh',    os.path.join(SRC, 'arshdeep-singh.png')),
    ('ramandeep-singh',   os.path.join(SRC, 'ramandeep-singh.png')),
    ('shubman-gill',      os.path.join(SRC, 'shubman-gill.png')),
    ('gurnoor-brar',      os.path.join(SRC, 'gurnoor-brar.png')),
]

SIZE = 320             # square, comfortably over the card's 52px slot at 3x
BG_TOLERANCE = 25      # how far off the backdrop's own colour still counts as backdrop
HEAD_AIR = 0.07        # slack above the hair so the crop is not shrink-wrapped to the head
NECK_WIDEN = 1.45      # a row this much wider than the neck is shoulder, not neck
SMOOTH_DIV = 40        # rows averaged before reading turning points, as a fraction of height
SMOOTH_MIN = 9
ALPHA_FEATHER = 1.0    # takes the stair-step off the cut edge without eating into the hair


def cut_backdrop(image):
    """Flood the studio backdrop away from the edges, leaving the subject opaque.

    The backdrop colour is read off the border rather than assumed, so the same pass handles a
    black studio, a white one, and anything between. Only backdrop reachable from the border is
    cleared, which is what keeps a white sleeve or a dark patch of jersey from being punched out
    along with it.

    Dark hair against a black backdrop is the hard case, and the tolerance is set tight enough
    that some backdrop survives in the gaps. That residue is invisible: the card it lands on is
    darker than the backdrop it came from.
    """
    if image.mode == 'RGBA' and np.asarray(image)[:, :, 3].min() < 250:
        return image        # already cut out; nothing to flood

    rgb = np.asarray(image.convert('RGB')).astype(int)
    h, w = rgb.shape[:2]

    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    backdrop = np.median(border, axis=0)
    is_backdrop = np.sqrt(((rgb - backdrop) ** 2).sum(axis=2)) < BG_TOLERANCE

    seen = np.zeros((h, w), bool)
    queue = deque()
    for y, x in [(y, x) for x in range(w) for y in (0, h - 1)] + \
                [(y, x) for y in range(h) for x in (0, w - 1)]:
        if is_backdrop[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and is_backdrop[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))

    cut = image.convert('RGBA')
    alpha = Image.fromarray(np.where(seen, 0, 255).astype('uint8'), 'L')
    cut.putalpha(alpha.filter(ImageFilter.GaussianBlur(ALPHA_FEATHER)))
    return cut


def crop_head(portrait, size):
    """Square neck-up crop of a cutout, centred on the head.

    The head is found by following how wide the silhouette is, row by row: it widens across the
    skull, narrows at the jaw, then widens again into the shoulders. So the neck is the first
    turning point back upwards, and the crop stops just past it, where the shoulders flare.
    Turning points are read off a smoothed profile rather than a plain minimum and maximum,
    because on a full-length shot the torso is wider than the head and the widest row is always
    somewhere down at the hips. The smoothing scales with the image: a window fixed in pixels
    is wide enough to ride over the wobble inside a tall head of hair on a small photo, and too
    narrow on a large one, where it finds a turning point in the hair and crops that instead of
    the head.

    Cropping square and centred means the round holder shows a portrait rather than a face
    pushed against one edge.
    """
    opaque = np.asarray(portrait)[:, :, 3] > 40
    widths = opaque.sum(axis=1)
    window = max(SMOOTH_MIN, len(widths) // SMOOTH_DIV)
    smooth = np.convolve(widths, np.ones(window) / window, mode='same')

    top = int(np.argmax(widths > 0))
    end = len(widths) - window
    cheeks = next((y for y in range(top + window, end) if smooth[y] > smooth[y + 1]), top)
    neck = next((y for y in range(cheeks, end) if smooth[y] < smooth[y + 1]), cheeks)
    shoulder = neck
    while shoulder < len(widths) - 1 and widths[shoulder] < widths[neck] * NECK_WIDEN:
        shoulder += 1

    # centred on the head alone, skull to jaw. Measuring across the shoulders instead pulls the
    # centre off wherever the body is not square to the camera — crossed arms, a turned torso —
    # and the face ends up sitting to one side of the round holder.
    xs = np.nonzero(opaque[top:neck].any(axis=0))[0]
    centre = (int(xs.min()) + int(xs.max())) // 2
    air = int((shoulder - top) * HEAD_AIR)
    y0 = max(0, top - air)
    side = shoulder - y0
    half = side // 2

    head = portrait.crop((centre - half, y0, centre - half + side, y0 + side))
    return head.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for slug, source in CAPTAINS:
        head = crop_head(cut_backdrop(Image.open(source)), SIZE)
        path = os.path.join(OUT, 'captain-%s.webp' % slug)
        head.save(path, 'WEBP', quality=92, method=6)
        print('%-46s from %s' % (path, source))


if __name__ == '__main__':
    main()
