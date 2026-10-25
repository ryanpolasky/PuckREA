from math import ceil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
MARKETING = ROOT / "marketing"
FONTS = ROOT / "assets" / "fonts"
LIBERATION_BOLD_CANDIDATES = (
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
)
TITLE_FONT = FONTS / "Anton-Regular.ttf"
SUBTITLE = "HOME OF THE NORTH DAKOTA FIGHTING SIOUX  •  CUSTOM PUCK ARENA + 3D PA AUDIO"


def load_bold_font(size):
    for candidate in LIBERATION_BOLD_CANDIDATES:
        if candidate.is_file():
            return ImageFont.truetype(str(candidate), size)
    raise FileNotFoundError("Install Liberation Sans Bold or Arial Bold to compose the hero.")


def make_overlay():
    overlay = Image.new("RGBA", (1920, 1080), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    shade = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    shade_draw = ImageDraw.Draw(shade)
    gradient_start = 828
    gradient_end = 1058
    for y in range(gradient_start, gradient_end):
        t = (y - gradient_start) / (gradient_end - gradient_start - 1)
        alpha = round(180 * t**1.15)
        shade_draw.line((0, y, 1919, y), fill=(2, 8, 5, alpha))
    overlay.alpha_composite(shade)

    center_x, center_y = 151, 952
    draw.ellipse((center_x - 104, center_y - 104, center_x + 104, center_y + 104), fill=(242, 202, 75, 255))
    draw.ellipse((center_x - 97, center_y - 97, center_x + 97, center_y + 97), fill=(0, 215, 95, 255))
    draw.ellipse((center_x - 89, center_y - 89, center_x + 89, center_y + 89), fill=(10, 26, 18, 255))

    logo = Image.open(ROOT / "assets" / "sioux_logo.png").convert("RGBA")
    logo = logo.resize((168, 168), Image.Resampling.LANCZOS)
    logo_mask = Image.new("L", logo.size, 0)
    ImageDraw.Draw(logo_mask).ellipse((0, 0, 167, 167), fill=255)
    logo.putalpha(ImageChops.multiply(logo.getchannel("A"), logo_mask))
    overlay.alpha_composite(logo, (center_x - 84, center_y - 84))

    title = "RALPH ENGELSTAD ARENA"
    title_font = ImageFont.truetype(str(TITLE_FONT), 88)
    title_bounds = draw.textbbox((0, 0), title, font=title_font)
    title_x, title_y = 274, 874
    title_origin = (title_x - title_bounds[0], title_y - title_bounds[1])
    draw.text((title_origin[0] + 6, title_origin[1] + 5), title, font=title_font, fill=(0, 0, 0, 255))
    draw.text(title_origin, title, font=title_font, fill=(255, 255, 255, 255))

    subtitle_font = load_bold_font(31)
    subtitle_bounds = draw.textbbox((0, 0), SUBTITLE, font=subtitle_font)
    subtitle = Image.new(
        "RGBA",
        (ceil(subtitle_font.getlength(SUBTITLE)) + 2, subtitle_bounds[3] - subtitle_bounds[1] + 2),
        (0, 0, 0, 0),
    )
    ImageDraw.Draw(subtitle).text(
        (1 - subtitle_bounds[0], 1 - subtitle_bounds[1]),
        SUBTITLE,
        font=subtitle_font,
        fill=(95, 255, 160, 255),
    )
    subtitle = subtitle.resize((1333, 22), Image.Resampling.LANCZOS)
    overlay.alpha_composite(subtitle, (278, 973))

    draw.rectangle((0, 1058, 1919, 1062), fill=(242, 202, 75, 255))
    draw.rectangle((0, 1063, 1919, 1079), fill=(0, 148, 65, 255))
    return overlay


def compose(source, overlay):
    image = Image.open(source).convert("RGBA")
    if image.size != (1920, 1080):
        raise ValueError(f"Expected 1920x1080 source: {source} has {image.size}")
    image.alpha_composite(overlay)
    return image.convert("RGB")


def main():
    overlay = make_overlay()
    day = compose(MARKETING / "shot_1_bowl.png", overlay)
    day.save(MARKETING / "hero_thumbnail_1080p.png", format="PNG", compress_level=6)
    day.resize((960, 540), Image.Resampling.LANCZOS).save(
        MARKETING / "hero_thumbnail.png", format="PNG", compress_level=6
    )
    day.resize((960, 540), Image.Resampling.LANCZOS).save(
        MARKETING / "hero_thumbnail.jpg", format="JPEG", quality=92, optimize=True
    )
    day.resize((800, 450), Image.Resampling.LANCZOS).save(
        MARKETING / "hero_thumbnail_small.jpg", format="JPEG", quality=92, optimize=True
    )


if __name__ == "__main__":
    main()
