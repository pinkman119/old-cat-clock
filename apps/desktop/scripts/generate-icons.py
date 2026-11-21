"""生成耄猫时钟的系统图标（托盘 / 任务栏 / 窗口 / 通知）。

用法：python apps/desktop/scripts/generate-icons.py

图形取自主界面 logo 的「甲骨文猫」线稿，配色沿用 --fill / --ink，
按尺寸分别绘制（小尺寸加粗线条并省略胡须），避免缩放后糊成一团。

产出：
  assets/tray.png      32x32 托盘图标（非 Windows 平台 / 兜底）
  assets/tray.ico      Windows 托盘多尺寸图标
  assets/app-icon.png  256x256 窗口 / 通知图标
  assets/app-icon.ico  Windows 任务栏 / 窗口多尺寸图标
"""
from __future__ import annotations

import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / "assets"
SUPERSAMPLE = 8

BG_TOP = (222, 238, 158)
BG_BOTTOM = (194, 216, 116)
INK = (34, 48, 31, 255)

EARS = (
    ((8, 17), (11, 4), (19, 12)),
    ((32, 17), (29, 4), (21, 12)),
)
FACE_LEFT = ((11, 13), (7, 21), (9, 30), (20, 35))
FACE_RIGHT = ((20, 35), (31, 30), (33, 21), (29, 13))
EYES = (
    ((15, 21), (18.5, 21)),
    ((21.5, 21), (25, 21)),
)
NOSE = ((18.5, 27), (20, 29), (21.5, 27))
WHISKERS = (
    ((10, 25), (3, 23)),
    ((10, 28), (4, 30)),
    ((30, 25), (37, 23)),
    ((30, 28), (36, 30)),
)


def bezier(points: tuple[tuple[float, float], ...], steps: int = 48) -> list[tuple[float, float]]:
    p0, p1, p2, p3 = points
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        out.append(
            (
                u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
            )
        )
    return out


def background(side: int) -> Image.Image:
    gradient = Image.new("RGBA", (1, side))
    pixels = gradient.load()
    for y in range(side):
        t = y / (side - 1)
        pixels[0, y] = tuple(
            round(top + (bottom - top) * t) for top, bottom in zip(BG_TOP, BG_BOTTOM)
        ) + (255,)
    image = gradient.resize((side, side), Image.Resampling.NEAREST)
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, side - 1, side - 1), radius=round(side * 0.22), fill=255
    )
    image.putalpha(mask)
    return image


def render(size: int) -> Image.Image:
    side = size * SUPERSAMPLE
    image = background(side)
    draw = ImageDraw.Draw(image)
    stroke_units = 3.4 if size < 24 else (3.0 if size < 48 else 2.6)
    width = max(1, round(stroke_units / 40 * side))
    scale = side / 40

    def transform(point: tuple[float, float]) -> tuple[float, float]:
        return point[0] * scale, (point[1] + 2) * scale

    def stroke(points) -> None:
        coords = [transform(point) for point in points]
        draw.line(coords, fill=INK, width=width, joint="curve")
        radius = width / 2
        for x, y in (coords[0], coords[-1]):
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=INK)

    for ear in EARS:
        stroke(ear)
    stroke(bezier(FACE_LEFT) + bezier(FACE_RIGHT))
    for eye in EYES:
        stroke(eye)
    stroke(NOSE)
    if size >= 24:
        for whisker in WHISKERS:
            stroke(whisker)

    return image.resize((size, size), Image.Resampling.LANCZOS)


def png_bytes(image: Image.Image) -> bytes:
    buffer = BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def write_ico(path: Path, images: dict[int, Image.Image]) -> None:
    """把每个尺寸的 PNG 直接嵌入 ICO，保留完整 alpha 与抗锯齿边缘。"""
    blobs = [(size, png_bytes(image)) for size, image in sorted(images.items())]
    offset = 6 + 16 * len(blobs)
    entries = []
    for size, blob in blobs:
        encoded_size = 0 if size >= 256 else size
        entries.append(
            struct.pack(
                "<BBBBHHII",
                encoded_size,
                encoded_size,
                0,
                0,
                1,
                32,
                len(blob),
                offset,
            )
        )
        offset += len(blob)
    path.write_bytes(
        struct.pack("<HHH", 0, 1, len(blobs))
        + b"".join(entries)
        + b"".join(blob for _, blob in blobs)
    )


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    render(32).save(ASSETS / "tray.png")
    render(256).save(ASSETS / "app-icon.png")
    write_ico(ASSETS / "tray.ico", {size: render(size) for size in (16, 20, 24, 32, 40, 48, 64)})
    write_ico(
        ASSETS / "app-icon.ico",
        {size: render(size) for size in (16, 20, 24, 32, 40, 48, 64, 128, 256)},
    )
    for path in sorted(ASSETS.iterdir()):
        if path.suffix.lower() in {".png", ".ico"}:
            with Image.open(path) as image:
                sizes = image.ico.sizes() if hasattr(image, "ico") else (image.size,)
            print(f"{path.name}: {path.stat().st_size} bytes, sizes={sorted(set(sizes))}")


if __name__ == "__main__":
    main()
