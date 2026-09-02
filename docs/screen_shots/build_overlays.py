#!/usr/bin/env python3
"""Compose caption overlays onto the app screenshots.

Two outputs per screenshot, because "a picture that explains the app" and "a file App Store
Connect will accept" are not the same thing:

  overlay/   the caption drawn on the screenshot itself, at its native size
  appstore/  1320x2868, the App Store 6.9" size, with the caption above the screenshot

The App Store variant places the screenshot at its original pixel size on a larger canvas
rather than scaling it up. The sources are 868x1887 — close to the 6.9" aspect but a little
over half its resolution — and enlarging them would soften every line of text in the UI,
which is the part a reader is being asked to look at.

Run from anywhere:  python3 docs/screen_shots/build_overlays.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
OVERLAY_DIR = HERE / "overlay"
APPSTORE_DIR = HERE / "appstore"

# From expo/src/constants/theme.ts, so the captions sit in the same palette as the UI
# underneath them.
INK = (36, 48, 68)          # textPrimary
MUTED = (94, 106, 125)      # textSecondary
HOT_PINK = (255, 47, 154)
BACKGROUND = (255, 248, 252)
SURFACE_PINK = (255, 234, 245)

# Noto Sans JP, kept next to this script rather than taken from the system.
#
# macOS ships no Japanese face that PIL can open — its Hiragino lives inside a protected
# asset bundle, and the one loose file, Hiragino Sans GB, is the Simplified Chinese cut,
# which gives a handful of kanji their Chinese glyph form. Wrong glyphs on a store listing
# are the kind of thing a Japanese reader notices without being able to say why.
#
# This is the variable build, so every weight comes from one file. Licensed under the SIL
# Open Font License; redistributing it alongside the images is allowed.
FONT_PATH = str(HERE / "fonts" / "NotoSansJP[wght].ttf")
FONT_URL = "https://github.com/google/fonts/raw/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"

# Black rather than Bold for headlines. At the size a store gallery shows these, Bold reads
# as ordinary text; the extra weight is what makes the headline arrive first.
WEIGHT_HEAD = "Black"
WEIGHT_SUB = "Medium"

# APP_STORE_SIZE is fixed by Apple. The screenshot is placed inside it, never resized to it.
APP_STORE_SIZE = (1320, 2868)

# One caption per screenshot. Headlines are kept to roughly 12 characters so they hold one
# line at the size a store gallery shows them.
#
# Written to sound like someone who trains, not like a feature list. A gallery is skimmed:
# "スレッド一覧" tells a reader what the screen is, which they can already see — the line has
# to tell them why they would want it.
CAPTIONS = {
    "threads": ("その話、ここなら通じる", "ラットの軌道もハックの深さも。語れる相手がここにいます"),
    "gym_map": ("設備で選べば、ハズさない", "料金もマシンも先に分かる。地図から気になるジムへ"),
    "machines": ("あのマシン、どこにある？", "Hammer Strength、CYBEX、Nautilus。メーカーから引ける"),
    "category": ("最初から49種目そろってる", "BIG3も腹筋も有酸素も。開いた日からすぐ記録できます"),
    "custom_record": ("無い種目は、作っちゃおう", "部位ごと増やせるから、あなたのメニューがそのまま入る"),
    "memo": ("前回を見ながら、もう1kg", "重量も回数も補助も。保存ボタンは押さなくて大丈夫"),
    "record_menu": ("積み上げた重さは、裏切らない", "累計トン数とトレ日が、続けた分だけ増えていく"),
    "record_graph": ("伸びてるのが、目で分かる", "推定1RMの推移をグラフで。停滞も更新も一目で"),
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT_PATH, size)
    f.set_variation_by_name(WEIGHT_HEAD if bold else WEIGHT_SUB)
    return f


def ensure_font() -> None:
    """Fetches the font once, so a fresh checkout can build the images without a setup step."""
    path = Path(FONT_PATH)
    if path.exists():
        return
    import urllib.request

    path.parent.mkdir(parents=True, exist_ok=True)
    print(f"downloading {path.name} ...")
    urllib.request.urlretrieve(FONT_URL, path)


def fit_size(
    draw: ImageDraw.ImageDraw,
    text: str,
    max_w: int,
    start: int,
    bold: bool,
    floor_ratio: float = 0.74,
) -> int:
    """Largest size at or below `start` that keeps `text` on one line.

    The captions get rewritten far more often than this layout does, and a line that wraps
    unexpectedly grows the backing band into whatever is underneath it — which is how the
    first pass ended up covering half the app's own chip row. Shrinking a couple of points
    is invisible; a caption sliced through the screen is not.
    """
    floor = max(int(start * floor_ratio), 12)
    size = start
    while size > floor and draw.textlength(text, font=font(size, bold=bold)) > max_w:
        size -= 1
    return size


def wrap(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """Break on width, one character at a time.

    Japanese has no spaces to break on, so the usual word wrap would leave any long line
    untouched and let it run off the edge.
    """
    lines: list[str] = []
    line = ""
    for ch in text:
        if draw.textlength(line + ch, font=f) <= max_w:
            line += ch
        else:
            lines.append(line)
            line = ch
    if line:
        lines.append(line)
    return lines


def draw_block(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    max_w: int,
    headline: str,
    sub: str,
    head_size: int,
    sub_size: int,
    head_color,
    sub_color,
    center: bool = False,
    dry: bool = False,
) -> int:
    """Draws headline + subline, returns the y just past the block.

    `dry` measures without drawing, which is how the overlay learns how tall its backing
    band has to be before it paints it.
    """
    head_f = font(head_size, bold=True)
    sub_f = font(sub_size)

    for line in wrap(draw, headline, head_f, max_w):
        if not dry:
            w = draw.textlength(line, font=head_f)
            draw.text((x + (max_w - w) / 2 if center else x, y), line, font=head_f, fill=head_color)
        y += int(head_size * 1.32)

    y += int(head_size * 0.22)

    for line in wrap(draw, sub, sub_f, max_w):
        if not dry:
            w = draw.textlength(line, font=sub_f)
            draw.text((x + (max_w - w) / 2 if center else x, y), line, font=sub_f, fill=sub_color)
        y += int(sub_size * 1.45)

    return y


def make_overlay(src: Image.Image, headline: str, sub: str) -> Image.Image:
    """The caption drawn onto the screenshot itself."""
    img = src.convert("RGB")
    w, h = img.size

    margin = int(w * 0.075)
    top = int(h * 0.055)
    probe0 = ImageDraw.Draw(Image.new("RGB", (w, h)))
    inner = w - margin * 2
    head_size = fit_size(probe0, headline, inner, int(w * 0.072), bold=True)
    sub_size = fit_size(probe0, sub, inner, int(w * 0.036), bold=False)

    # Measured first, then the band is cut to fit. A fixed-height scrim either wastes screen
    # or — as the first attempt did — lets the app's own header show through the caption,
    # which put two headings on top of each other.
    probe = ImageDraw.Draw(Image.new("RGB", (w, h)))
    end = draw_block(
        probe, margin, top, w - margin * 2, headline, sub,
        head_size, sub_size, INK, MUTED, dry=True,
    )
    band_h = end + int(head_size * 0.55)
    fade_h = int(head_size * 1.1)

    # Opaque over the text, then a short fade so the band does not end on a hard line across
    # the screenshot.
    band = Image.new("RGBA", (w, band_h + fade_h), BACKGROUND + (255,))
    bd = ImageDraw.Draw(band)
    for i in range(fade_h):
        alpha = int(255 * (1 - i / fade_h) ** 1.5)
        bd.line([(0, band_h + i), (w, band_h + i)], fill=BACKGROUND + (alpha,))
    img.paste(band, (0, 0), band)

    d = ImageDraw.Draw(img)
    draw_block(d, margin, top, w - margin * 2, headline, sub, head_size, sub_size, INK, MUTED)

    # The app's own header carries a pink rule under it; repeating it here closes the band.
    d.rectangle([0, band_h - 3, w, band_h], fill=HOT_PINK)
    return img


def rounded(img: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def make_appstore(src: Image.Image, headline: str, sub: str) -> Image.Image:
    """Caption above, screenshot below, on the 6.9\" canvas."""
    cw, ch = APP_STORE_SIZE
    canvas = Image.new("RGB", (cw, ch), BACKGROUND)

    # A wash of the app's pink at the top so the caption sits on something, fading out well
    # before the screenshot starts.
    grad = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for i in range(int(ch * 0.42)):
        t = i / (ch * 0.42)
        gd.line([(0, i), (cw, i)], fill=SURFACE_PINK + (int(255 * (1 - t) ** 1.4),))
    canvas.paste(grad, (0, 0), grad)

    d = ImageDraw.Draw(canvas)
    margin = 90
    inner = cw - margin * 2
    end = draw_block(
        d, margin, 150, inner, headline, sub,
        head_size=fit_size(d, headline, inner, 92, bold=True),
        sub_size=fit_size(d, sub, inner, 44, bold=False),
        head_color=INK, sub_color=MUTED, center=True,
    )
    bar_w = 120
    d.rectangle([(cw - bar_w) // 2, end + 26, (cw + bar_w) // 2, end + 34], fill=HOT_PINK)

    # Enlarged by about 15%. The sources are a little over half of the 6.9" resolution, so
    # some scaling is unavoidable to stop the screenshot floating in the middle of the
    # canvas; this much keeps the UI text readable while filling the frame.
    shot_w = 1000
    shot_h = round(src.height * shot_w / src.width)
    shot = rounded(src.convert("RGB").resize((shot_w, shot_h), Image.LANCZOS), 56)
    x = (cw - shot.width) // 2
    y = 500

    # A soft shadow so the screenshot reads as a screen sitting on the background rather
    # than a rectangle pasted into it.
    shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x + 8, y + 24, x + shot.width - 8, y + shot.height + 16], 56, fill=(120, 60, 100, 90)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.paste(shadow, (0, 0), shadow)
    canvas.paste(shot, (x, y), shot)

    return canvas


def main() -> None:
    ensure_font()
    OVERLAY_DIR.mkdir(exist_ok=True)
    APPSTORE_DIR.mkdir(exist_ok=True)

    sources = sorted(HERE.glob("*.jpg"))
    if not sources:
        raise SystemExit(f"no .jpg screenshots in {HERE}")

    missing = [p.stem for p in sources if p.stem not in CAPTIONS]
    if missing:
        raise SystemExit(f"no caption written for: {', '.join(missing)}")

    for path in sources:
        headline, sub = CAPTIONS[path.stem]
        with Image.open(path) as src:
            src.load()
            make_overlay(src, headline, sub).save(OVERLAY_DIR / f"{path.stem}.png")
            make_appstore(src, headline, sub).save(APPSTORE_DIR / f"{path.stem}.png")
        print(f"{path.stem}: overlay + appstore")


if __name__ == "__main__":
    main()
