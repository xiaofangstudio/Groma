from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(r"D:\20533\deskbox\fangwork\Groma")
BRAND = ROOT / "assets" / "brand"
TAURI = ROOT / "src-tauri" / "icons"
PUBLIC = ROOT / "public"

YELLOW = (242, 183, 5, 255)
INK = (24, 18, 3, 255)
BLUE = (47, 107, 255, 255)
S = 4096


def rounded_line(d, points, width, fill=INK):
    d.line(points, fill=fill, width=width, joint="curve")
    r = width // 2
    for x, y in (points[0], points[-1]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def render_icon(size):
    """按目标像素单独出图；小尺寸加粗框线，避免 16px 糊成四个黑团。"""
    ss = 8 if size <= 64 else 4
    W = size * ss
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = W / 1024.0

    d.rounded_rectangle(
        (64 * k, 64 * k, W - 64 * k, W - 64 * k),
        radius=224 * k,
        fill=YELLOW,
    )

    # 小尺寸最小笔宽：16px 下 1.8px，24px 下 1.8px，32px 下 1.8px
    stroke = max(52 * k, 1.8 * ss)
    arm = 138 * k
    x1, x2 = 256 * k, W - 256 * k
    for pts in (
        [(x1, x1), (x1 + arm, x1)],
        [(x1, x1), (x1, x1 + arm)],
        [(x2 - arm, x1), (x2, x1)],
        [(x2, x1), (x2, x1 + arm)],
        [(x1, x2), (x1 + arm, x2)],
        [(x1, x2 - arm), (x1, x2)],
        [(x2 - arm, x2), (x2, x2)],
        [(x2, x2 - arm), (x2, x2)],
    ):
        rounded_line(d, pts, int(round(stroke)))

    dot = max(128 * k, 2.8 * ss)
    d.rounded_rectangle(
        ((W - dot) / 2, (W - dot) / 2, (W + dot) / 2, (W + dot) / 2),
        radius=32 * k,
        fill=BLUE,
    )
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save_png(size, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    render_icon(size).save(path, "PNG")
    print(f"{path} {size}x{size}")


def main():
    save_png(1024, BRAND / "groma-icon-1024.png")
    save_png(1024, TAURI / "icon.png")
    save_png(512, PUBLIC / "groma-icon.png")
    save_png(32, TAURI / "32x32.png")
    save_png(128, TAURI / "128x128.png")
    save_png(256, TAURI / "128x128@2x.png")

    # 多尺寸 ICO：每帧单独绘制，小尺寸不靠 256 缩图
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [render_icon(s) for s in sizes]
    frames[-1].save(
        TAURI / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=frames[:-1],
    )
    print(f"{TAURI / 'icon.ico'} multi-size")


if __name__ == "__main__":
    main()
