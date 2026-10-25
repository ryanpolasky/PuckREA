from PIL import Image, ImageDraw, ImageFont
from functools import lru_cache
from pathlib import Path
import math, shutil, subprocess, sys

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / 'assets'
OUT = ASSETS / 'generated'
OUT.mkdir(parents=True, exist_ok=True)
WINDOWS_FONTS = Path('C:/Windows/Fonts')
LINUX_FONTS = {
    'impact.ttf': ('Liberation Sans Narrow:style=Bold', 'LiberationSansNarrow-Bold.ttf'),
    'arialbd.ttf': ('Liberation Sans:style=Bold', 'LiberationSans-Bold.ttf'),
    'ariblk.ttf': ('Liberation Sans:style=Bold', 'LiberationSans-Bold.ttf'),
}

@lru_cache(maxsize=None)
def linux_font(name):
    family, filename = LINUX_FONTS.get(name, ('Liberation Sans', name))
    fc_match = shutil.which('fc-match')
    if fc_match:
        result = subprocess.run([fc_match, '-f', '%{file}', family], capture_output=True, text=True, check=False)
        match = Path(result.stdout.strip()) if result.returncode == 0 else None
        if match and match.is_file():
            return match
    for root in [Path('/usr/share/fonts'), Path.home() / '.local/share/fonts']:
        if root.exists():
            match = next(root.rglob(filename), None)
            if match:
                return match
    return None

def font(name, size):
    windows_font = WINDOWS_FONTS / name
    if windows_font.is_file():
        return ImageFont.truetype(str(windows_font), size)
    linux_path = linux_font(name)
    if linux_path:
        return ImageFont.truetype(str(linux_path), size)
    return ImageFont.load_default()

sioux = Image.open(ASSETS / 'sioux_logo.png').convert('RGBA')

def load_sponsor(name):
    p = ASSETS / 'sponsors' / f'{name}.png'
    return Image.open(p).convert('RGBA') if p.exists() else None

def white_silhouette(src):
    if src is None:
        return None
    silhouette = Image.new('RGBA', src.size, (255, 255, 255, 255))
    silhouette.putalpha(src.getchannel('A'))
    return silhouette

def paste_fit(dst, src, box, pad=0, bg=None):
    if src is None:
        return
    x0, y0, x1, y1 = box
    if bg:
        ImageDraw.Draw(dst).rounded_rectangle(box, radius=8, fill=bg)
    w = max(1, (x1 - x0) - 2 * pad)
    h = max(1, (y1 - y0) - 2 * pad)
    scale = min(w / src.width, h / src.height)
    nw = max(1, int(round(src.width * scale)))
    nh = max(1, int(round(src.height * scale)))
    im = src.resize((nw, nh), Image.LANCZOS)
    px = x0 + (x1 - x0 - nw) // 2
    py = y0 + (y1 - y0 - nh) // 2
    dst.alpha_composite(im, (px, py))

def fit_text(d, box, text, font_name, max_size, fill):
    x0, y0, x1, y1 = box
    max_w = max(10, (x1 - x0) - 16)
    max_h = max(8, (y1 - y0) - 6)
    sz = max_size
    while sz > 8:
        f = font(font_name, sz)
        bb = d.textbbox((0, 0), text, font=f)
        if (bb[2] - bb[0]) <= max_w and (bb[3] - bb[1]) <= max_h:
            break
        sz -= 2
    f = font(font_name, sz)
    d.text(((x0 + x1) / 2, (y0 + y1) / 2), text, font=f, fill=fill, anchor='mm')

def draw_arc_text(img, text, cx, cy, radius, start_deg, end_deg, fnt, fill, top=True):
    chars = list(text)
    n = len(chars)
    for i, ch in enumerate(chars):
        t = 0.5 if n <= 1 else i / (n - 1)
        ang_deg = start_deg + (end_deg - start_deg) * t
        ang = math.radians(ang_deg)
        bx = cx + math.cos(ang) * radius
        by = cy + math.sin(ang) * radius
        glyph = Image.new('RGBA', (120, 120), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glyph)
        gd.text((60, 60), ch, font=fnt, fill=fill, anchor='mm')
        rot = -(ang_deg + 90) if top else -(ang_deg - 90)
        glyph_r = glyph.rotate(rot, resample=Image.BICUBIC, expand=True)
        img.alpha_composite(glyph_r, (int(round(bx - glyph_r.width / 2)), int(round(by - glyph_r.height / 2))))

# 1. CENTER ICE LOGO (1024x1024) - real Fighting Sioux logo (with TM removed!)
def make_center_ice():
    im = Image.new('RGBA', (1024, 1024), (236, 244, 240, 255))
    d = ImageDraw.Draw(im)
    cx, cy = 512, 512
    d.ellipse([16, 16, 1008, 1008], fill=(0, 138, 60, 255))
    d.ellipse([48, 48, 976, 976], fill=(16, 22, 18, 255))
    d.ellipse([58, 58, 966, 966], fill=(240, 247, 243, 255))
    d.ellipse([156, 156, 868, 868], fill=(0, 138, 60, 255))
    d.ellipse([172, 172, 852, 852], fill=(242, 248, 245, 255))

    f_arc = font('ariblk.ttf', 50)
    draw_arc_text(im, 'RALPH ENGELSTAD ARENA', cx, cy, 408, -152, -28, f_arc, (14, 22, 18, 255), top=True)
    draw_arc_text(im, 'NORTH DAKOTA FIGHTING SIOUX', cx, cy, 408, 154, 26, f_arc, (0, 128, 55, 255), top=False)

    paste_fit(im, sioux, (215, 205, 809, 805), pad=10)
    d.ellipse([496, 496, 528, 528], fill=(0, 132, 56, 255), outline=(255, 255, 255, 255), width=4)
    im.save(f'{OUT}/center_ice.png')

# 2. NEUTRAL-ZONE ICE LOGOS (512x512) - real Fighting Sioux logo (TM removed!)
def make_neutral_ice():
    im = Image.new('RGBA', (512, 512), (236, 244, 240, 255))
    d = ImageDraw.Draw(im)
    d.ellipse([10, 10, 502, 502], fill=(0, 138, 60, 255))
    d.ellipse([26, 26, 486, 486], fill=(240, 247, 243, 255))
    paste_fit(im, sioux, (64, 64, 448, 448), pad=8)
    im.save(f'{OUT}/ice_sioux.png')

# 3. DASHER BOARD ADS (4096x128 - true 32:1 aspect ratio so 8 repeats on 245mx0.88m boards have 1:1 pixels!)
def make_boards_ads():
    W, H = 4096, 128
    im = Image.new('RGBA', (W, H), (244, 247, 245, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 10], fill=(0, 138, 60, 255))
    d.rectangle([0, 114, W, H], fill=(238, 192, 32, 255))

    slots = [
        ('altru', (244, 247, 245, 255)),
        ('scheels', (244, 247, 245, 255)),
        ('sioux', (0, 118, 52, 255)),
        ('subaru', (244, 247, 245, 255)),
        ('ford', (244, 247, 245, 255)),
        ('coca_cola', (244, 247, 245, 255)),
        ('bauer', (244, 247, 245, 255)),
        ('midco', (244, 247, 245, 255)),
    ]
    sw = W // len(slots)  # 512x128 (4:1 aspect ratio per board ad!)
    for i, (key, bg) in enumerate(slots):
        x0 = i * sw
        x1 = (i + 1) * sw
        d.rectangle([x0 + 6, 12, x1 - 6, 112], fill=bg)
        d.line([(x0, 10), (x0, 114)], fill=(185, 194, 190, 255), width=4)
        if key == 'sioux':
            paste_fit(im, sioux, (x0 + 24, 16, x0 + 132, 108), pad=2)
            fit_text(d, (x0 + 136, 18, x1 - 20, 106), 'FIGHTING SIOUX', 'impact.ttf', 54, (255, 255, 255, 255))
        elif key == 'midco':
            d.rounded_rectangle([x0 + 16, 18, x1 - 16, 106], radius=8, fill=(12, 30, 22, 255))
            fit_text(d, (x0 + 28, 22, x1 - 28, 102), 'MIDCO SPORTS', 'impact.ttf', 50, (0, 225, 100, 255))
        else:
            sp = load_sponsor(key)
            paste_fit(im, sp, (x0 + 36, 18, x1 - 36, 106), pad=4)
    im.save(f'{OUT}/boards_ads.png')

def make_led_ribbon():
    W, H = 4096, 128
    green = (0, 138, 60, 255)
    im = Image.new('RGBA', (W, H), green)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 8], fill=(220, 255, 232, 255))
    d.rectangle([0, H - 8, W, H], fill=(220, 255, 232, 255))
    modules = [
        'sioux_banner', 'scheels', 'altru', 'nd_banner',
        'coca_cola', 'subaru', 'bauer', 'pepsi'
    ]
    sw = W // len(modules)
    for i, kind in enumerate(modules):
        x0 = i * sw
        x1 = (i + 1) * sw
        d.rectangle([x0, 8, x0 + 8, H - 8], fill=(220, 255, 232, 255))
        if kind == 'sioux_banner':
            d.rounded_rectangle([x0 + 16, 12, x1 - 8, H - 12], radius=10, outline=(220, 255, 232, 255), width=3)
            paste_fit(im, white_silhouette(sioux), (x0 + 28, 18, x0 + 132, H - 18), pad=2)
            fit_text(d, (x0 + 138, 18, x1 - 22, 62), 'NORTH DAKOTA', 'arialbd.ttf', 26, (220, 255, 232, 255))
            fit_text(d, (x0 + 138, 60, x1 - 22, H - 18), 'FIGHTING SIOUX', 'impact.ttf', 44, (255, 255, 255, 255))
        elif kind == 'nd_banner':
            d.rounded_rectangle([x0 + 16, 12, x1 - 8, H - 12], radius=10, outline=(220, 255, 232, 255), width=3)
            paste_fit(im, white_silhouette(load_sponsor('nd')), (x0 + 28, 20, x0 + 132, H - 20), pad=4)
            fit_text(d, (x0 + 138, 18, x1 - 22, 60), 'WELCOME TO', 'arialbd.ttf', 24, (220, 255, 232, 255))
            fit_text(d, (x0 + 138, 58, x1 - 22, H - 18), 'THE RALPH', 'impact.ttf', 48, (255, 255, 255, 255))
        else:
            paste_fit(im, white_silhouette(load_sponsor(kind)), (x0 + 36, 20, x1 - 28, H - 20), pad=4)

    im.save(OUT / 'led_ribbon.png')

# 5. JUMBOTRON TOP CROWN: "RALPH ENGELSTAD ARENA" (1024x128)
def make_scoreboard_header():
    im = Image.new('RGBA', (1024, 128), (6, 12, 9, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1024, 8], fill=(0, 230, 100, 255))
    d.rectangle([0, 120, 1024, 128], fill=(0, 230, 100, 255))
    fit_text(d, (32, 14, 992, 114), 'RALPH ENGELSTAD ARENA', 'impact.ttf', 78, (45, 255, 130, 255))
    im.save(f'{OUT}/scoreboard_header.png')

# 6. JUMBOTRON MAIN SCREEN: RYAN POLASKY GOD-AWFUL STATS SPOTLIGHT (1024x512)
def make_scoreboard_main():
    im = Image.new('RGBA', (1024, 512), (8, 18, 13, 255))
    d = ImageDraw.Draw(im)

    d.rectangle([0, 0, 1023, 511], outline=(0, 225, 98, 255), width=6)
    d.rectangle([12, 12, 1011, 80], fill=(0, 122, 54, 255), outline=(230, 255, 240, 255), width=3)

    fit_text(d, (24, 16, 670, 76), 'FIGHTING SIOUX PLAYER SPOTLIGHT', 'impact.ttf', 42, (255, 255, 255, 255))
    paste_fit(im, load_sponsor('altru'), (685, 18, 840, 74), pad=4, bg=(245, 250, 247, 255))
    paste_fit(im, load_sponsor('scheels'), (850, 18, 1002, 74), pad=4, bg=(245, 250, 247, 255))

    d.rounded_rectangle([18, 92, 300, 438], radius=14, fill=(12, 32, 22, 255), outline=(0, 210, 92, 255), width=4)
    paste_fit(im, sioux, (32, 102, 286, 326), pad=6)
    d.rounded_rectangle([32, 336, 286, 426], radius=10, fill=(0, 135, 58, 255), outline=(245, 205, 70, 255), width=3)
    fit_text(d, (38, 342, 280, 380), '#45  LEFT BENCH', 'arialbd.ttf', 22, (245, 205, 70, 255))
    fit_text(d, (38, 380, 280, 420), 'OVR RATING: 12', 'impact.ttf', 32, (255, 80, 80, 255))

    fit_text(d, (315, 90, 1004, 150), 'RYAN POLASKY', 'impact.ttf', 66, (255, 255, 255, 255))
    fit_text(d, (315, 148, 1004, 180), 'POS: BENCH WARMER  |  SHOOTS: MUFFINS  |  SKATING: BAMBI', 'arialbd.ttf', 19, (140, 245, 180, 255))

    stats = [
        ('GOALS (CAREER)', '0', (255, 75, 75, 255)),
        ('ASSISTS', '0', (255, 75, 75, 255)),
        ('PLUS / MINUS', '-84', (255, 55, 55, 255)),
        ('OWN GOALS', '14', (255, 195, 50, 255)),
        ('PENALTY MINS', '247', (255, 95, 55, 255)),
        ('AVG SHIFT TIME', '3.2s', (255, 75, 75, 255)),
    ]
    gx0, gy0, gw, gh, gapx, gapy = 318, 188, 220, 94, 12, 10
    for idx, (lbl, val, vcol) in enumerate(stats):
        r, c = divmod(idx, 3)
        bx0 = gx0 + c * (gw + gapx)
        by0 = gy0 + r * (gh + gapy)
        d.rounded_rectangle([bx0, by0, bx0 + gw, by0 + gh], radius=10, fill=(16, 38, 26, 255), outline=(0, 185, 82, 255), width=3)
        fit_text(d, (bx0 + 8, by0 + 6, bx0 + gw - 8, by0 + 34), lbl, 'arialbd.ttf', 18, (210, 235, 220, 255))
        fit_text(d, (bx0 + 8, by0 + 34, bx0 + gw - 8, by0 + gh - 6), val, 'impact.ttf', 52, vcol)

    d.rounded_rectangle([318, 394, 1004, 438], radius=8, fill=(45, 14, 18, 255), outline=(255, 80, 80, 255), width=2)
    fit_text(d, (326, 398, 996, 434), 'PASS ACC: 4.1% (TO OPPONENT: 95.9%)  •  HEALTHY SCRATCHES: 68', 'arialbd.ttf', 18, (255, 215, 215, 255))

    d.rectangle([12, 448, 1011, 500], fill=(0, 105, 45, 255))
    fit_text(d, (20, 454, 1004, 494), 'ALTRU INJURY REPORT: POLASKY (ANKLES BROKEN BY AIR IN WARMUPS) - OUT INDEFINITELY', 'arialbd.ttf', 19, (255, 240, 110, 255))

    im.save(f'{OUT}/scoreboard_main.png')

def make_suite_band():
    W, H = 1024, 896
    im = Image.new('RGBA', (W, H), (86, 72, 56, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 28], fill=(185, 170, 144, 255))
    d.rectangle([0, H - 28, W, H], fill=(150, 132, 106, 255))
    d.rectangle([22, 44, W - 22, H - 44], fill=(48, 35, 27, 255))
    d.rectangle([46, 64, W - 46, H - 64], fill=(24, 42, 34, 255), outline=(112, 69, 42, 255), width=12)
    d.rectangle([60, 78, W - 60, 364], fill=(238, 196, 127, 255))
    d.rectangle([74, 92, W - 74, 348], fill=(224, 181, 111, 255))
    d.rectangle([60, 378, W - 60, H - 78], fill=(18, 39, 31, 255))
    d.rectangle([500, 64, 524, H - 64], fill=(111, 59, 34, 255))
    d.rectangle([46, 368, W - 46, 390], fill=(111, 59, 34, 255))
    for x in [18, W - 18]:
        d.ellipse([x - 14, 438, x + 14, 466], fill=(224, 179, 83, 255), outline=(95, 65, 32, 255), width=4)
        d.ellipse([x - 6, 446, x + 6, 458], fill=(255, 233, 155, 255))
    im.save(OUT / 'suite_band.png')

def make_seat_row_upper():
    W, H = 104, 100
    im = Image.new('RGBA', (W, H), (7, 9, 8, 255))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([5, 4, W - 6, 91], radius=15, fill=(20, 48, 34, 255), outline=(5, 8, 7, 255), width=5)
    d.rounded_rectangle([11, 9, W - 12, 85], radius=11, fill=(24, 56, 38, 255))
    for y in [28, 43, 58, 72]:
        d.line([(18, y), (W - 19, y)], fill=(17, 43, 30, 255), width=3)
    d.rectangle([0, 90, W, H], fill=(0, 0, 0, 255))
    d.rectangle([0, 8, 5, 87], fill=(110, 48, 28, 255))
    d.rectangle([W - 6, 8, W - 1, 87], fill=(110, 48, 28, 255))
    im.save(OUT / 'seat_row_upper.png')

def make_scoreboard_score():
    W, H = 1024, 320
    im = Image.new('RGBA', (W, H), (5, 8, 7, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([8, 8, W - 9, H - 9], outline=(0, 130, 58, 255), width=8)
    fit_text(d, (24, 18, W - 24, 76), 'NORTH DAKOTA FIGHTING SIOUX', 'impact.ttf', 48, (230, 240, 232, 255))
    d.line([(24, 82), (W - 24, 82)], fill=(0, 138, 60, 255), width=4)
    fit_text(d, (20, 86, W - 20, 206), 'SIOUX 2   15:42   PERIOD 2   VISITOR 1', 'impact.ttf', 52, (255, 188, 62, 255))
    fit_text(d, (24, 212, W - 24, 252), 'SHOTS 24–18   •   PENALTIES 2:00 / 2:00', 'arialbd.ttf', 28, (255, 85, 66, 255))
    fit_text(d, (24, 254, W - 24, 298), 'POWER PLAY 1:18   •   GOALIE #31', 'arialbd.ttf', 24, (91, 238, 139, 255))
    im.save(OUT / 'scoreboard_score.png')

def make_banners():
    cols, rows = 8, 3
    tile_w, tile_h = 512, 1024
    im = Image.new('RGBA', (cols * tile_w, rows * tile_h), (0, 0, 0, 0))
    ncaa_years = [1959, 1963, 1980, 1982, 1987, 1997, 2000]
    wcha_years = [1958, 1963, 1965, 1967, 1979, 1980, 1982, 1997, 1998, 1999, 2001, 2004, 2009, 2011]

    def draw_banner(index, year, ncaa):
        col, row = index % cols, index // cols
        x0, y0 = col * tile_w, row * tile_h
        d = ImageDraw.Draw(im)
        if ncaa:
            d.rectangle([x0, y0, x0 + tile_w, y0 + tile_h], fill=(0, 112, 50, 255))
            d.rectangle([x0 + 14, y0 + 14, x0 + 498, y0 + 1009], outline=(240, 245, 238, 255), width=10)
            d.rectangle([x0 + 28, y0 + 28, x0 + 484, y0 + 995], outline=(221, 183, 78, 255), width=5)
            d.rectangle([x0 + 48, y0 + 48, x0 + 464, y0 + 200], fill=(247, 248, 238, 255))
            paste_fit(im, load_sponsor('ncaa'), (x0 + 62, y0 + 62, x0 + 218, y0 + 188), pad=4)
            fit_text(d, (x0 + 225, y0 + 60, x0 + 450, y0 + 122), 'NATIONAL', 'impact.ttf', 42, (0, 112, 50, 255))
            fit_text(d, (x0 + 225, y0 + 126, x0 + 450, y0 + 190), 'CHAMPIONS', 'impact.ttf', 36, (16, 24, 18, 255))
            d.ellipse([x0 + 110, y0 + 238, x0 + 402, y0 + 530], fill=(247, 248, 238, 255), outline=(221, 183, 78, 255), width=8)
            paste_fit(im, sioux, (x0 + 132, y0 + 260, x0 + 380, y0 + 508), pad=6)
            fit_text(d, (x0 + 44, y0 + 552, x0 + 468, y0 + 626), 'NORTH DAKOTA', 'impact.ttf', 52, (255, 255, 255, 255))
            fit_text(d, (x0 + 44, y0 + 626, x0 + 468, y0 + 692), 'FIGHTING SIOUX', 'impact.ttf', 44, (236, 207, 116, 255))
            d.rectangle([x0 + 54, y0 + 742, x0 + 458, y0 + 948], fill=(247, 248, 238, 255))
            fit_text(d, (x0 + 62, y0 + 752, x0 + 450, y0 + 930), str(year), 'impact.ttf', 132, (0, 112, 50, 255))
        else:
            d.rectangle([x0, y0, x0 + tile_w, y0 + tile_h], fill=(246, 246, 237, 255))
            d.rectangle([x0 + 12, y0 + 12, x0 + 500, y0 + 1012], outline=(0, 105, 50, 255), width=12)
            d.rectangle([x0 + 25, y0 + 25, x0 + 487, y0 + 45], fill=(212, 176, 72, 255))
            d.rectangle([x0 + 25, y0 + 979, x0 + 487, y0 + 999], fill=(212, 176, 72, 255))
            paste_fit(im, sioux, (x0 + 102, y0 + 76, x0 + 410, y0 + 374), pad=4)
            fit_text(d, (x0 + 42, y0 + 396, x0 + 470, y0 + 496), 'WCHA', 'impact.ttf', 76, (0, 105, 50, 255))
            fit_text(d, (x0 + 36, y0 + 500, x0 + 476, y0 + 614), 'CHAMPIONS', 'impact.ttf', 68, (0, 105, 50, 255))
            d.rectangle([x0 + 54, y0 + 696, x0 + 458, y0 + 934], fill=(0, 105, 50, 255))
            fit_text(d, (x0 + 62, y0 + 704, x0 + 450, y0 + 926), str(year), 'impact.ttf', 144, (255, 255, 255, 255))

    for i, year in enumerate(ncaa_years):
        draw_banner(i, year, True)
    for i, year in enumerate(wcha_years, start=len(ncaa_years)):
        draw_banner(i, year, False)
    im.save(OUT / 'banners.png')

# 10. 3D STADIUM CHAIR TEXTURES: Forest-Green Leather & Kelly-Green Leather (256x128)
def make_seats():
    for fname, outer_col, inner_col, rib_col in [
        ('seat_dark_green.png', (20, 50, 34, 255), (24, 56, 38, 255), (15, 39, 27, 255)),
        ('seat_kelly_green.png', (24, 56, 38, 255), (28, 62, 42, 255), (18, 44, 30, 255)),
    ]:
        im = Image.new('RGBA', (256, 128), (8, 10, 9, 255))
        d = ImageDraw.Draw(im)
        for ox in [0, 128]:
            d.rounded_rectangle([ox + 8, 6, ox + 120, 122], radius=16, fill=outer_col, outline=(5, 7, 6, 255), width=4)
            d.rounded_rectangle([ox + 16, 14, ox + 112, 114], radius=12, fill=inner_col)
            for ry in [36, 56, 76, 94]:
                d.line([(ox + 24, ry), (ox + 104, ry)], fill=rib_col, width=3)
        d.rounded_rectangle([46, 102, 82, 114], radius=4, fill=(110, 48, 30, 255))
        im.save(f'{OUT}/{fname}')

# 11. STAIRS TEXTURE: Warm Ralph Limestone/Tan Step with Bright Gold/Brass Nosing Strip (128x128)
def make_stairs():
    im = Image.new('RGBA', (128, 128), (226, 206, 172, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 128, 22], fill=(245, 205, 82, 255))
    d.rectangle([0, 22, 128, 27], fill=(168, 144, 108, 255))
    im.save(f'{OUT}/stairs_rea.png')

# 12. CONCOURSE CONCESSIONS (2048x512): SIOUX SHOP / THE RALPH PUB / FIGHTING SIOUX GRILL / DAKOTA CLUB
def make_concourse():
    im = Image.new('RGBA', (2048, 512), (62, 56, 48, 255))
    d = ImageDraw.Draw(im)
    booths = [
        ('SIOUX SHOP', (0, 128, 56, 255)),
        ('THE RALPH PUB', (165, 125, 35, 255)),
        ('SIOUX GRILL', (0, 105, 46, 255)),
        ('DAKOTA CLUB', (24, 48, 34, 255)),
    ]
    bw = 2048 // 4
    for i, (title, hdr_col) in enumerate(booths):
        x0 = i * bw
        d.rectangle([x0 + 20, 32, x0 + bw - 20, 165], fill=(16, 22, 18, 255))
        d.rectangle([x0 + 26, 38, x0 + bw - 26, 86], fill=hdr_col)
        fit_text(d, (x0 + 36, 40, x0 + bw - 36, 84), title, 'impact.ttf', 38, (255, 255, 255, 255))
        for m in range(3):
            mx0 = x0 + 40 + m * 148
            d.rectangle([mx0, 96, mx0 + 132, 154], fill=(238, 232, 214, 255))
            paste_fit(im, sioux, (mx0 + 4, 100, mx0 + 48, 150), pad=2)
        # Warm lit counter opening
        d.rectangle([x0 + 58, 185, x0 + bw - 58, 300], fill=(22, 26, 24, 255))
        for p in range(5):
            px0 = x0 + 78 + p * 76
            d.rectangle([px0, 220, px0 + 44, 300], fill=(225, 195, 145, 255))
        # Granite counter top + base
        d.rectangle([x0 + 18, 298, x0 + bw - 18, 316], fill=(218, 208, 192, 255))
        d.rectangle([x0 + 18, 316, x0 + bw - 18, 512], fill=(138, 122, 104, 255))
    im.save(f'{OUT}/concourse_rea.png')

# 13. SECTION SIGNS (2048x1024): SECTION 101..118 + SIOUX COUNTRY over vomitories
def make_signs():
    im = Image.new('RGBA', (2048, 1024), (12, 32, 22, 255))
    d = ImageDraw.Draw(im)
    cw, ch = 2048 // 8, 1024 // 8
    sec = 101
    for r in range(8):
        for c in range(8):
            x0, y0 = c * cw, r * ch
            x1, y1 = x0 + cw, y0 + ch
            if r < 4:
                d.rectangle([x0 + 4, y0 + 4, x1 - 4, y1 - 4], fill=(14, 42, 28, 255), outline=(235, 195, 65, 255), width=3)
                fit_text(d, (x0 + 14, y0 + 16, x1 - 14, y1 - 16), f'SECTION {sec}', 'impact.ttf', 42, (245, 205, 70, 255))
                sec += 1
            else:
                d.rectangle([x0 + 4, y0 + 4, x1 - 4, y1 - 4], fill=(0, 138, 60, 255), outline=(245, 250, 246, 255), width=3)
                fit_text(d, (x0 + 14, y0 + 16, x1 - 14, y1 - 16), 'SIOUX', 'impact.ttf', 52, (255, 255, 255, 255))
    im.save(f'{OUT}/signs_rea.png')

MAKERS = [
    ('center_ice', make_center_ice),
    ('neutral_ice', make_neutral_ice),
    ('boards_ads', make_boards_ads),
    ('led_ribbon', make_led_ribbon),
    ('scoreboard_header', make_scoreboard_header),
    ('scoreboard_main', make_scoreboard_main),
    ('scoreboard_score', make_scoreboard_score),
    ('banners', make_banners),
    ('suite_band', make_suite_band),
    ('seat_row_upper', make_seat_row_upper),
    ('seats', make_seats),
    ('stairs', make_stairs),
    ('concourse', make_concourse),
    ('signs', make_signs),
]

if __name__ == '__main__':
    makers = dict(MAKERS)
    requested = sys.argv[1:]
    unknown = [name for name in requested if name not in makers]
    if unknown:
        raise SystemExit(f'Unknown maker(s): {", ".join(unknown)}')
    selected = requested or [name for name, _ in MAKERS]
    for name in selected:
        makers[name]()
    print(f'Generated {", ".join(selected)} in {OUT}')
