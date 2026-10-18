"""Turn the landing screen captures (PNG, 2x) into the WebP files the page serves: 640 px wide, the 2x of the page's
320 px picture box. Called by scripts/landing-shots.mjs as `python scripts/landing-webp.py <png dir> <out dir>`."""
import pathlib
import sys

from PIL import Image

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
total = 0
for png in sorted(src.glob("*.png")):
    im = Image.open(png).convert("RGB")
    w, h = im.size
    im = im.resize((640, round(h * 640 / w)), Image.LANCZOS)
    dest = out / (png.stem + ".webp")
    im.save(dest, "WEBP", quality=80, method=6)
    total += dest.stat().st_size
print(f"landing-webp: {len(list(src.glob('*.png')))} files, {round(total / 1024)} KB in all")
