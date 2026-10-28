from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images"
SIZE = 1024
SCALE = 4
MARK_SCALE = SIZE * SCALE // 256


def draw_mark(draw: ImageDraw.ImageDraw, offset: tuple[int, int] = (0, 80), scale: int = MARK_SCALE, color: str = "#B69A68") -> None:
    ox, oy = offset

    def point(x: int, y: int) -> tuple[int, int]:
        return (ox + x * scale, oy + y * scale)

    outer = [(128, 20), (211, 53), (211, 121), (207, 143), (198, 165), (185, 185), (168, 202), (149, 215), (128, 226), (107, 215), (88, 202), (71, 185), (58, 165), (49, 143), (45, 121), (45, 53)]
    inner = [(128, 34), (197, 61), (197, 120), (193, 140), (185, 158), (174, 175), (159, 190), (143, 201), (128, 210), (113, 201), (97, 190), (82, 175), (71, 158), (63, 140), (59, 120), (59, 61)]
    draw.polygon([point(*p) for p in outer], fill=None)
    draw.line([point(*p) for p in outer + [outer[0]]], fill=color, width=6 * scale, joint="curve")
    draw.line([point(*p) for p in inner + [inner[0]]], fill="#6E5837", width=2 * scale, joint="curve")

    # An upright sword with a broad crossguard: the Chronicle's iron mark.
    blade = [(128, 67), (142, 96), (137, 105), (137, 151), (155, 188), (128, 175), (101, 188), (119, 151), (119, 105), (114, 96)]
    draw.polygon([point(*p) for p in blade], fill=color)
    guard = [(91, 105), (165, 105), (157, 117), (99, 117)]
    draw.polygon([point(*p) for p in guard], fill="#D4C7AC")
    cx, cy = point(128, 55)
    r = 8 * scale
    draw.ellipse((cx-r, cy-r, cx+r, cy+r), fill="#D4C7AC", outline=color, width=3 * scale)
    draw.line([point(111, 196), point(145, 196)], fill=color, width=3*scale)
    draw.line([point(117, 205), point(139, 205)], fill=color, width=3*scale)


def transparent_mark(size: int, color: str) -> Image.Image:
    img = Image.new("RGBA", (SIZE*SCALE, SIZE*SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_mark(draw, offset=(0, 80), scale=MARK_SCALE, color=color)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon = Image.new("RGBA", (SIZE*SCALE, SIZE*SCALE), "#101113")
    draw_mark(ImageDraw.Draw(icon))
    icon.resize((SIZE, SIZE), Image.Resampling.LANCZOS).convert("RGB").save(OUT / "icon.png", optimize=True)
    transparent_mark(1024, "#B69A68").save(OUT / "android-icon-foreground.png", optimize=True)
    transparent_mark(1024, "#FFFFFF").save(OUT / "android-icon-monochrome.png", optimize=True)
    transparent_mark(256, "#D4C7AC").save(OUT / "splash-icon.png", optimize=True)
    icon.resize((128, 128), Image.Resampling.LANCZOS).convert("RGB").save(OUT / "favicon.png", optimize=True)


if __name__ == "__main__":
    main()
