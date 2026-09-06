#!/usr/bin/env python3
"""Compose caption overlays onto the app screenshots.

Two outputs per screenshot, because "a picture that explains the app" and "a file App Store
Connect will accept" are not the same thing:

  overlay/   the caption drawn on the screenshot itself, at its native size
  appstore/  1242x2688, the App Store 6.5" size, with the caption above the screenshot

Plus one extra file the sources cannot provide: `01_hero.png`, a cover built from type and
the app icon rather than from a screen. It is the first thing in the gallery, where a reader
decides in about a second whether the app is for them, and no single screen of the app says
"this is a place to talk" on its own.

1242x2688 is the 6.5" display size (iPhone 11 Pro Max / XS Max). App Store Connect accepts a
6.5" set on its own and derives the larger devices from it; an earlier build targeted 6.9"
(1320x2868) and was rejected on dimensions.

The App Store variant places the screenshot on the canvas rather than scaling it to fit. The
sources are 868x1887 — close to the right aspect but a little over half the resolution — and
enlarging them further would soften every line of text in the UI, which is the part a reader
is being asked to look at.

Run from anywhere:  python3 docs/screen_shots/build_overlays.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
RAW_DIR = HERE / "raw"
OVERLAY_DIR = HERE / "overlay"
APPSTORE_DIR = HERE / "appstore"
ICON_PATH = HERE.parents[1] / "expo" / "assets" / "images" / "icon.png"

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
APP_STORE_SIZE = (1242, 2688)

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

# Gallery order. App Store Connect keeps the order files are added in, and the numbered
# filenames make that order survive a drag-and-drop of the whole folder. Anything not listed
# here still gets built, just after these.
ORDER = [
    "threads",
    "machines",
    "gym_map",
    "category",
    "custom_record",
    "memo",
    "record_menu",
    "record_graph",
]

# The cover. Lines are broken by hand rather than by the wrapper: this is the one image whose
# rhythm matters more than its fit, and 「登場。」 landing alone on the last line is the point
# of the sentence.
#
# No 「、」 after 筋トレアプリ. The line break already reads as the pause, and a centred line
# ending in a comma sits in its own half-width of blank space, which pulls the line visibly
# off-centre against the two around it.
HERO_HEAD = ["話せる", "筋トレアプリ", "登場。"]
HERO_SUB = ["ジムのマシン1台ごとにスレッドが立つ、", "筋トレ好きのための匿名掲示板。"]
HERO_SHOT = "threads"


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


def pink_wash(canvas: Image.Image, depth: float, strength: float = 1.0) -> None:
    """Fades the app's pink down from the top of `canvas` over `depth` of its height."""
    cw, ch = canvas.size
    span = max(int(ch * depth), 1)
    grad = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for i in range(span):
        t = i / span
        gd.line([(0, i), (cw, i)], fill=SURFACE_PINK + (int(255 * strength * (1 - t) ** 1.4),))
    canvas.paste(grad, (0, 0), grad)


def place_shot(
    canvas: Image.Image, src: Image.Image, width_ratio: float, y: int
) -> None:
    """Drops the screenshot onto the canvas with a soft shadow under it.

    `y` may put the bottom of the shot past the canvas edge; the paste is clipped, which is
    how the cover gets a screen rising out of the bottom rather than a floating rectangle.
    """
    cw, ch = canvas.size
    shot_w = round(cw * width_ratio)
    shot_h = round(src.height * shot_w / src.width)
    radius = round(cw * 0.045)
    shot = rounded(src.convert("RGB").resize((shot_w, shot_h), Image.LANCZOS), radius)
    x = (cw - shot_w) // 2

    shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [x + 8, y + 24, x + shot_w - 8, y + shot_h + 16], radius, fill=(120, 60, 100, 90)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    canvas.paste(shadow, (0, 0), shadow)
    canvas.paste(shot, (x, y), shot)


def make_appstore(src: Image.Image, headline: str, sub: str) -> Image.Image:
    """Caption above, screenshot below, on the 6.5\" canvas.

    Every measurement is a fraction of the canvas so that changing APP_STORE_SIZE for a
    different device class re-lays the page out instead of shifting everything off it.
    """
    cw, ch = APP_STORE_SIZE
    canvas = Image.new("RGB", (cw, ch), BACKGROUND)

    # A wash of the app's pink at the top so the caption sits on something, fading out well
    # before the screenshot starts.
    pink_wash(canvas, depth=0.42)

    d = ImageDraw.Draw(canvas)
    margin = round(cw * 0.068)
    inner = cw - margin * 2
    end = draw_block(
        d, margin, round(ch * 0.052), inner, headline, sub,
        head_size=fit_size(d, headline, inner, round(cw * 0.070), bold=True),
        sub_size=fit_size(d, sub, inner, round(cw * 0.033), bold=False),
        head_color=INK, sub_color=MUTED, center=True,
    )
    bar_w = round(cw * 0.091)
    bar_y = end + round(ch * 0.009)
    d.rectangle([(cw - bar_w) // 2, bar_y, (cw + bar_w) // 2, bar_y + 8], fill=HOT_PINK)

    # Enlarged by about 8%. The sources are a little over half of the canvas resolution, so
    # some scaling is unavoidable to stop the screenshot floating in the middle of it; this
    # much keeps the UI text readable while filling the frame.
    place_shot(canvas, src, width_ratio=0.758, y=round(ch * 0.174))
    return canvas


def make_hero(src: Image.Image) -> Image.Image:
    """The cover: icon, headline, and the board screen rising from the bottom.

    Built from type rather than from a screen. It is the first frame in the gallery, read at
    thumbnail size in about a second, and no single screen of the app says "this is somewhere
    to talk" clearly enough on its own at that size.
    """
    cw, ch = APP_STORE_SIZE
    canvas = Image.new("RGB", (cw, ch), BACKGROUND)
    pink_wash(canvas, depth=0.60)
    d = ImageDraw.Draw(canvas)

    # Wider than the caption pages use. The headline is set large enough that it will take
    # whatever width it is given, and a line that ends a hair short of the edge reads as
    # deliberate where one that ends flush with it reads as overflow.
    inner = cw - round(cw * 0.095) * 2

    with Image.open(ICON_PATH) as raw_icon:
        raw_icon.load()
        icon_px = round(cw * 0.145)
        icon = rounded(
            raw_icon.convert("RGB").resize((icon_px, icon_px), Image.LANCZOS),
            round(icon_px * 0.235),  # the iOS squircle, near enough at this size
        )
    icon_y = round(ch * 0.050)
    canvas.paste(icon, ((cw - icon_px) // 2, icon_y), icon)

    # Sized off the longest line so all three share one size — stepping the size per line
    # would read as a mistake rather than as emphasis.
    head_size = fit_size(
        d, max(HERO_HEAD, key=len), inner, round(cw * 0.125), bold=True, floor_ratio=0.5
    )
    head_f = font(head_size, bold=True)
    y = icon_y + icon_px + round(ch * 0.032)
    for i, line in enumerate(HERO_HEAD):
        # The last line carries the pink, so the eye lands on 「登場。」 and not on the middle.
        color = HOT_PINK if i == len(HERO_HEAD) - 1 else INK
        w = d.textlength(line, font=head_f)
        d.text(((cw - w) / 2, y), line, font=head_f, fill=color)
        y += round(head_size * 1.24)

    y += round(head_size * 0.30)
    sub_size = fit_size(d, max(HERO_SUB, key=len), inner, round(cw * 0.040), bold=False)
    sub_f = font(sub_size)
    for line in HERO_SUB:
        w = d.textlength(line, font=sub_f)
        d.text(((cw - w) / 2, y), line, font=sub_f, fill=MUTED)
        y += round(sub_size * 1.50)

    place_shot(canvas, src, width_ratio=0.72, y=y + round(ch * 0.030))
    return canvas


def main() -> None:
    ensure_font()
    OVERLAY_DIR.mkdir(exist_ok=True)
    APPSTORE_DIR.mkdir(exist_ok=True)

    sources = {p.stem: p for p in sorted(RAW_DIR.glob("*.jpg"))}
    if not sources:
        raise SystemExit(f"no .jpg screenshots in {RAW_DIR}")

    missing = [stem for stem in sources if stem not in CAPTIONS]
    if missing:
        raise SystemExit(f"no caption written for: {', '.join(missing)}")
    if HERO_SHOT not in sources:
        raise SystemExit(f"the cover needs {HERO_SHOT}.jpg in {RAW_DIR}")

    # Stale numbering outlives a rename, and a leftover 02_ from a previous run would sit in
    # the gallery next to the new one.
    for old in APPSTORE_DIR.glob("*.png"):
        old.unlink()

    with Image.open(sources[HERO_SHOT]) as src:
        src.load()
        make_hero(src).save(APPSTORE_DIR / "01_hero.png")
    print("01_hero: appstore cover")

    ordered = ORDER + [stem for stem in sources if stem not in ORDER]
    for i, stem in enumerate(ordered, start=2):
        headline, sub = CAPTIONS[stem]
        with Image.open(sources[stem]) as src:
            src.load()
            make_overlay(src, headline, sub).save(OVERLAY_DIR / f"{stem}.png")
            make_appstore(src, headline, sub).save(APPSTORE_DIR / f"{i:02d}_{stem}.png")
        print(f"{i:02d}_{stem}: overlay + appstore")


if __name__ == "__main__":
    main()
