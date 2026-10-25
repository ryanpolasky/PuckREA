from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

OUT = 'C:/Projects/PuckREA/assets/generated'
os.makedirs(OUT, exist_ok=True)

def font(name, size):
    for cand in [name, 'impact.ttf', 'ariblk.ttf', 'arialbd.ttf']:
        p = f'C:/Windows/Fonts/{cand}'
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

sioux = Image.open('C:/Projects/PuckREA/assets/sioux_logo.png').convert('RGBA')

def load_sponsor(name):
    p = f'C:/Projects/PuckREA/assets/sponsors/{name}.png'
    return Image.open(p).convert('RGBA') if os.path.exists(p) else None

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

# 4. ELECTRIC LED RIBBON BANNER (4096x128 - true 32:1 aspect ratio matching Fascia_Ribbon's 8 repeats on 330mx1.0m!)
def make_led_ribbon():
    W, H = 4096, 128
    im = Image.new('RGBA', (W, H), (8, 18, 14, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 8], fill=(0, 235, 105, 255))
    d.rectangle([0, H - 8, W, H], fill=(0, 235, 105, 255))

    # 8 equal 512x128 ad modules so every module is 4:1 aspect ratio with wide padding
    modules = [
        'sioux_banner', 'scheels', 'altru', 'nd_banner',
        'coca_cola', 'subaru', 'bauer', 'pepsi'
    ]
    sw = W // len(modules)  # 512px each
    for i, kind in enumerate(modules):
        x0 = i * sw
        x1 = (i + 1) * sw
        d.rectangle([x0, 8, x0 + 10, H - 8], fill=(0, 240, 110, 255))
        if kind == 'sioux_banner':
            d.rectangle([x0 + 14, 10, x1 - 6, H - 10], fill=(0, 95, 42, 255))
            d.rounded_rectangle([x0 + 18, 14, x1 - 10, H - 14], radius=10, outline=(0, 235, 105, 255), width=3)
            paste_fit(im, sioux, (x0 + 28, 18, x0 + 132, H - 18), pad=2)
            fit_text(d, (x0 + 138, 18, x1 - 22, 62), 'NORTH DAKOTA', 'arialbd.ttf', 26, (220, 255, 232, 255))
            fit_text(d, (x0 + 138, 60, x1 - 22, H - 18), 'FIGHTING SIOUX', 'impact.ttf', 44, (255, 255, 255, 255))
        elif kind == 'nd_banner':
            d.rectangle([x0 + 14, 10, x1 - 6, H - 10], fill=(22, 16, 44, 255))
            d.rounded_rectangle([x0 + 18, 14, x1 - 10, H - 14], radius=10, outline=(0, 235, 105, 255), width=3)
            paste_fit(im, load_sponsor('nd'), (x0 + 28, 20, x0 + 132, H - 20), pad=4, bg=(245, 250, 246, 255))
            fit_text(d, (x0 + 138, 18, x1 - 22, 60), 'WELCOME TO', 'arialbd.ttf', 24, (0, 235, 105, 255))
            fit_text(d, (x0 + 138, 58, x1 - 22, H - 18), 'THE RALPH', 'impact.ttf', 48, (255, 255, 255, 255))
        else:
            d.rectangle([x0 + 14, 10, x1 - 6, H - 10], fill=(242, 248, 245, 255))
            d.rounded_rectangle([x0 + 18, 14, x1 - 10, H - 14], radius=10, outline=(0, 185, 82, 255), width=3)
            paste_fit(im, load_sponsor(kind), (x0 + 36, 20, x1 - 28, H - 20), pad=4)

    im.save(f'{OUT}/led_ribbon.png')

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

# 7. END-WALL VIDEO BOARD (1024x512)
def make_end_video():
    im = Image.new('RGBA', (1024, 512), (6, 14, 10, 255))
    d = ImageDraw.Draw(im)
    cx, cy = 512, 256
    for y in [64, 256, 448]:
        d.line([(0, y), (1024, y)], fill=(0, 155, 68, 255), width=4)
    for rot_deg, col, w in [(8, (0, 235, 105, 255), 8), (28, (230, 255, 240, 255), 6), (52, (0, 195, 88, 255), 8), (74, (240, 255, 245, 255), 6)]:
        pts = []
        for k in range(4):
            a = math.radians(rot_deg + k * 90)
            pts.append((cx + math.cos(a) * 215, cy + math.sin(a) * 215))
        d.polygon(pts, outline=col, width=w)
    d.ellipse([cx - 180, cy - 180, cx + 180, cy + 180], fill=(0, 148, 65, 255), outline=(240, 255, 245, 255), width=8)
    paste_fit(im, sioux, (cx - 115, cy - 165, cx + 115, cy + 45), pad=4)
    fit_text(d, (cx - 135, cy + 50, cx + 135, cy + 106), 'NORTH DAKOTA', 'impact.ttf', 40, (255, 255, 255, 255))
    fit_text(d, (cx - 115, cy + 106, cx + 115, cy + 148), 'FIGHTING SIOUX', 'arialbd.ttf', 22, (245, 210, 75, 255))
    im.save(f'{OUT}/end_video.png')

# 8. NCAA CHAMPIONSHIP BANNERS (512x1024)
def make_banner_champ():
    im = Image.new('RGBA', (512, 1024), (0, 128, 56, 255))
    d = ImageDraw.Draw(im)
    d.rectangle([16, 16, 496, 1008], outline=(245, 250, 246, 255), width=12)
    d.rectangle([34, 34, 478, 990], outline=(238, 195, 65, 255), width=6)
    d.rectangle([48, 48, 464, 210], fill=(245, 250, 246, 255))
    paste_fit(im, load_sponsor('ncaa'), (64, 58, 220, 200), pad=4)
    fit_text(d, (226, 62, 456, 128), 'NATIONAL', 'impact.ttf', 48, (0, 122, 52, 255))
    fit_text(d, (226, 128, 456, 196), 'CHAMPIONS', 'impact.ttf', 44, (16, 24, 18, 255))

    d.ellipse([96, 250, 416, 570], fill=(245, 250, 246, 255), outline=(238, 195, 65, 255), width=8)
    paste_fit(im, sioux, (120, 274, 392, 546), pad=6)

    fit_text(d, (48, 595, 464, 665), 'NORTH DAKOTA', 'impact.ttf', 58, (255, 255, 255, 255))
    fit_text(d, (48, 668, 464, 735), 'FIGHTING SIOUX', 'impact.ttf', 50, (242, 202, 70, 255))
    fit_text(d, (48, 755, 464, 808), '1959  •  1963  •  1980  •  1987', 'arialbd.ttf', 30, (240, 250, 244, 255))
    fit_text(d, (48, 810, 464, 865), '1997  •  2000  •  2016', 'arialbd.ttf', 34, (240, 250, 244, 255))
    d.rectangle([58, 890, 454, 955], fill=(245, 250, 246, 255))
    fit_text(d, (64, 894, 448, 950), 'SIOUX FOREVER', 'impact.ttf', 46, (0, 122, 52, 255))
    im.save(f'{OUT}/banner_champ.png')

# 9. UPPER BOWL WALL + SUITE WINDOWS + BRICK MEDALLIONS (1024x1024 - replaces Bowl sub 5 WallWin)
# Each 1x1 UV tile on WallWin is 8.90m wide x 7.70m tall in 3D space (aspect = 1.156), so vertical pixel sizes are scaled by 1.156 for exact 1:1 world proportions!
def make_wall_window():
    W, H = 1024, 1024
    aspect_y = 8.90 / 7.70  # 1.1558
    im = Image.new('RGBA', (W, H), (198, 176, 142, 255))
    d = ImageDraw.Draw(im)
    # Upper band (y = 0..460): Warm-lit Luxury Suite Windows with cherry wood mullions
    d.rectangle([0, 0, W, 460], fill=(38, 24, 16, 255))
    for r in range(2):
        y0 = 22 + r * 212
        y1 = y0 + 188
        for c in range(6):
            x0 = 14 + c * 168
            x1 = x0 + 144
            d.rectangle([x0, y0, x1, y1], fill=(52, 74, 58, 255), outline=(88, 48, 28, 255), width=4)
            d.rectangle([x0 + 8, y0 + 8, x1 - 8, y0 + 70], fill=(245, 202, 125, 255))
            d.rectangle([x0 + 8, y0 + 76, x1 - 8, y1 - 8], fill=(26, 48, 36, 255))

    # Lower band (y = 460..1024): 3 portrait cream brick bays per 8.90m tile with 1:1 world-proportioned diamond Sioux crests
    for y in range(460, H, 18):
        d.line([(0, y), (W, y)], fill=(175, 152, 118, 255), width=2)
        off = 0 if ((y - 460) // 18) % 2 == 0 else 32
        for x in range(off, W, 64):
            d.line([(x, y), (x, y + 18)], fill=(180, 158, 124, 255), width=2)

    bay_w = W / 3.0
    for i in range(3):
        bx = int(round((i + 0.5) * bay_w))
        d.rectangle([bx - 126, 520, bx + 126, 968], fill=(182, 160, 128, 255), outline=(145, 125, 96, 255), width=4)
        cy = 744
        rx = 88
        ry = int(round(rx * aspect_y))
        d.polygon([(bx, cy - ry), (bx + rx, cy), (bx, cy + ry), (bx - rx, cy)], fill=(242, 235, 215, 255))
        rx2 = 74
        ry2 = int(round(rx2 * aspect_y))
        d.polygon([(bx, cy - ry2), (bx + rx2, cy), (bx, cy + ry2), (bx - rx2, cy)], fill=(0, 112, 50, 255))
        # Paste Sioux head pre-stretched vertically by aspect_y so on the 8.90x7.70m wall it is 100% 1:1 un-squished!
        lw = 92
        lh = int(round(lw * aspect_y))
        logo_stretched = sioux.resize((lw, lh), Image.LANCZOS)
        im.alpha_composite(logo_stretched, (bx - lw // 2, cy - lh // 2))

    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(4):
        sx = int(round(i * bay_w))
        gd.polygon([(sx, 735), (sx - 85, 485), (sx + 85, 485)], fill=(255, 230, 165, 105))
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    im = Image.alpha_composite(im, glow)
    d = ImageDraw.Draw(im)
    for i in range(4):
        sx = int(round(i * bay_w))
        d.rectangle([sx - 18, 480, sx + 18, 994], fill=(214, 194, 162, 255))
        d.ellipse([sx - 11, 722, sx + 11, 748], fill=(255, 248, 215, 255))
    d.rectangle([0, 456, W, 484], fill=(68, 42, 28, 255))
    d.rectangle([0, 992, W, H], fill=(150, 134, 110, 255))
    im = im.convert('RGB').convert('RGBA')
    im.save(f'{OUT}/wall_brick.png')

# 10. 3D STADIUM CHAIR TEXTURES: Forest-Green Leather & Kelly-Green Leather (256x128)
def make_seats():
    for fname, outer_col, inner_col, rib_col in [
        ('seat_dark_green.png', (18, 56, 36, 255), (26, 78, 50, 255), (14, 42, 27, 255)),
        ('seat_kelly_green.png', (22, 68, 44, 255), (32, 94, 60, 255), (16, 48, 31, 255)),
    ]:
        im = Image.new('RGBA', (256, 128), (14, 38, 25, 255))
        d = ImageDraw.Draw(im)
        for ox in [0, 128]:
            d.rounded_rectangle([ox + 8, 6, ox + 120, 122], radius=16, fill=outer_col, outline=(92, 52, 32, 255), width=3)
            d.rounded_rectangle([ox + 16, 14, ox + 112, 114], radius=12, fill=inner_col)
            for ry in [36, 56, 76, 94]:
                d.line([(ox + 24, ry), (ox + 104, ry)], fill=rib_col, width=3)
        d.rounded_rectangle([50, 98, 78, 112], radius=3, fill=(225, 190, 105, 255))
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

make_center_ice()
make_neutral_ice()
make_boards_ads()
make_led_ribbon()
make_scoreboard_header()
make_scoreboard_main()
make_end_video()
make_banner_champ()
make_wall_window()
make_seats()
make_stairs()
make_concourse()
make_signs()
print("Generated all REA textures in", OUT)
