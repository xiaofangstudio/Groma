from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(r"D:\20533\deskbox\fangwork\Groma\assets\brand\candidates")
OUT.mkdir(parents=True, exist_ok=True)

YELLOW = (242, 183, 5, 255)
INK = (24, 18, 3, 255)
BLUE = (47, 107, 255, 255)
CREAM = (248, 247, 244, 255)
SIZE = 4096
FINAL = 1024


def canvas(bg=YELLOW):
    im = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((256, 256, SIZE - 256, SIZE - 256), radius=896, fill=bg)
    return im, d


def line(d, pts, width, fill=INK):
    d.line(pts, fill=fill, width=width, joint="curve")
    r = width // 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def frame_node():
    im, d = canvas()
    # 四角取景框：方形画板 + 四角手柄
    w = 208
    arm = 552
    x1, x2 = 1024, SIZE - 1024
    line(d, [(x1, x1), (x1 + arm, x1)], w)
    line(d, [(x1, x1), (x1, x1 + arm)], w)
    line(d, [(x2 - arm, x1), (x2, x1)], w)
    line(d, [(x2, x1), (x2, x1 + arm)], w)
    line(d, [(x1, x2), (x1 + arm, x2)], w)
    line(d, [(x1, x2 - arm), (x1, x2)], w)
    line(d, [(x2 - arm, x2), (x2, x2)], w)
    line(d, [(x2, x2 - arm), (x2, x2)], w)
    # 中心节点
    s = 512
    d.rounded_rectangle((SIZE//2 - s//2, SIZE//2 - s//2, SIZE//2 + s//2, SIZE//2 + s//2), radius=128, fill=BLUE)
    return im


def survey_cross():
    im, d = canvas()
    w = 344
    r = 576
    # 测绘十字，中心留出节点
    line(d, [(SIZE//2, 1024), (SIZE//2, SIZE//2 - r)], w)
    line(d, [(SIZE//2, SIZE//2 + r), (SIZE//2, SIZE - 1024)], w)
    line(d, [(1024, SIZE//2), (SIZE//2 - r, SIZE//2)], w)
    line(d, [(SIZE//2 + r, SIZE//2), (SIZE - 1024, SIZE//2)], w)
    # 十字端点小方块
    end = 128
    for cx, cy in ((SIZE//2, 1024), (SIZE//2, SIZE - 1024), (1024, SIZE//2), (SIZE - 1024, SIZE//2)):
        d.rounded_rectangle((cx - end//2, cy - end//2, cx + end//2, cy + end//2), radius=28, fill=INK)
    # 中心蓝节点
    s = 384
    d.rounded_rectangle((SIZE//2 - s//2, SIZE//2 - s//2, SIZE//2 + s//2, SIZE//2 + s//2), radius=96, fill=BLUE)
    return im


def artboards():
    im, d = canvas()
    # 后画板：黑描边
    back = (704, 704, 2656, 2656)
    d.rounded_rectangle(back, radius=192, outline=INK, width=160)
    # 前画板：奶油填充 + 黑描边
    front = (1360, 1424, 3392, 3392)
    d.rounded_rectangle(front, radius=192, fill=CREAM, outline=INK, width=120)
    # 对齐节点
    s = 224
    cx, cy = 1664, 1664
    d.rounded_rectangle((cx - s//2, cy - s//2, cx + s//2, cy + s//2), radius=64, fill=BLUE)
    return im


def paper_frame():
    im, d = canvas()
    # 奶油画板
    d.rounded_rectangle((920, 920, SIZE - 920, SIZE - 920), radius=256, fill=CREAM)
    # 四角取景框压在画板边缘
    w = 208
    arm = 552
    x1, x2 = 1024, SIZE - 1024
    line(d, [(x1, x1), (x1 + arm, x1)], w)
    line(d, [(x1, x1), (x1, x1 + arm)], w)
    line(d, [(x2 - arm, x1), (x2, x1)], w)
    line(d, [(x2, x1), (x2, x1 + arm)], w)
    line(d, [(x1, x2), (x1 + arm, x2)], w)
    line(d, [(x1, x2 - arm), (x1, x2)], w)
    line(d, [(x2 - arm, x2), (x2, x2)], w)
    line(d, [(x2, x2 - arm), (x2, x2)], w)
    # 中心节点
    s = 384
    d.rounded_rectangle((SIZE//2 - s//2, SIZE//2 - s//2, SIZE//2 + s//2, SIZE//2 + s//2), radius=96, fill=BLUE)
    return im


for name, fn in [
    ("frame-node", frame_node),
    ("survey-cross", survey_cross),
    ("artboards", artboards),
    ("paper-frame", paper_frame),
]:
    im = fn().resize((FINAL, FINAL), Image.Resampling.LANCZOS)
    im.save(OUT / f"{name}.png")
    print(name, OUT / f"{name}.png")
