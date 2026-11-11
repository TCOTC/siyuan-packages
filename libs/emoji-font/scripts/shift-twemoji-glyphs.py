#!/usr/bin/env python3
"""把 Twemoji 的全部字形整体上移，生成字体插件内使用的 Twemoji 字体。

两个字体插件里的 `Twemoji/twemoji-colr0-17.0.3.woff2` 都是**改写过**的产物：所有字形都
上移了 167/1024 em。上游版本请从 https://github.com/TCOTC/twemoji-colr 下载，然后对其运行：

    python3 libs/emoji-font/scripts/shift-twemoji-glyphs.py \\
        --input /path/to/twemoji-colr0-17.0.3.woff2 \\
        --output libs/emoji-font/fonts/twemoji-colr0-17.0.3.woff2

字体本体只存这一份（`libs/emoji-font/fonts`），两个包构建时由 `build.config.ts` 的
`{ from: "@repo/libs/emoji-font/fonts/…", to: "Twemoji" }` 各自复制进产物。

依赖：`pip install fonttools brotli`（woff2 编解码需要 brotli）。

为什么要改字形：Twemoji 的墨迹为 -0.254em…+0.938em，重心在基线上方 0.342em，而中文
「中」的重心在 0.384em。插件用 `size-adjust: 76%` 把 Twemoji 缩到与内置 emoji 一样大，
缩放以基线为原点，重心随之降到 0.260em，于是正文里与中文混排的表情明显偏下；图标位
（文档树、菜单等定高盒）也会偏离盒子中心。CSS 无法把字形相对基线单独上移（行内内容
共用基线，`ascent-override` 只改行盒高度），只能在字体层面移动轮廓。

167 个字体单位在 76% 缩放下等效 +0.124em，重心变为 0.384em，与中文一致；同时
-0.254+0.163 = -0.091em、0.938+0.163 = 1.101em 乘上 76% 后为 -0.069em…+0.837em，
与中文的 -0.074em…+0.841em 几乎重合。

改完必须重新标定 `libs/emoji-font/src/index.ts` 里的 `ascent-override`：图标位置与
`--dy` 成正比，那组 100% / 8% 是配着 167 实测出来的。
"""

import argparse
import sys

from fontTools.ttLib import TTFont

# 上游字体的墨迹上界（u1F600 等基础表情），用于识别是否已经上移过
UPSTREAM_Y_MAX = 960
TARGET_Y_MAX = 1127


def shift(font: TTFont, dy: int) -> tuple[int, int]:
    glyf = font["glyf"]
    simple = 0
    components = 0
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        if glyph.numberOfContours == 0:
            continue
        if glyph.isComposite():
            # 组件引用的是已被上移的字形，变换矩阵会把位移按比例缩放（如 0.154 的压扁阴影），
            # 因此按 (1 - 纵向缩放) 补偿组件的偏移量，保证合成结果整体上移 dy
            for component in glyph.components:
                transform = getattr(component, "transform", None)
                y_scale = 1.0 if transform is None else transform[1][1]
                component.y = int(round(component.y + (1.0 - y_scale) * dy))
                components += 1
        else:
            glyph.coordinates.translate((0, dy))
            simple += 1

    y_min = y_max = 0
    for name in font.getGlyphOrder():
        glyph = glyf[name]
        glyph.recalcBounds(glyf)
        if hasattr(glyph, "yMin"):
            y_min = min(y_min, glyph.yMin)
            y_max = max(y_max, glyph.yMax)
    font["head"].yMin = y_min
    font["head"].yMax = y_max
    return simple, components


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, help="上游 twemoji-colr 的 woff2 文件")
    parser.add_argument("--output", required=True, help="输出路径，通常就是 libs/emoji-font/fonts/twemoji-colr0-17.0.3.woff2")
    parser.add_argument("--dy", type=int, default=167, help="上移的字体单位，默认 167（配 size-adjust: 76%）")
    args = parser.parse_args()

    font = TTFont(args.input)
    cmap = font.getBestCmap()
    glyph_name = cmap.get(0x1F600)
    if glyph_name is None:
        print(f"[x] {args.input} 中没有 U+1F600，可能不是 twemoji-colr", file=sys.stderr)
        return 1
    pen_bounds = font["glyf"][glyph_name]
    pen_bounds.recalcBounds(font["glyf"])
    if pen_bounds.yMax == TARGET_Y_MAX:
        print(f"[x] {args.input} 看起来已经上移过（yMax={TARGET_Y_MAX}），请改用上游原始文件", file=sys.stderr)
        return 1
    if pen_bounds.yMax != UPSTREAM_Y_MAX:
        print(
            f"[!] U+1F600 的 yMax 为 {pen_bounds.yMax}，与预期的上游值 {UPSTREAM_Y_MAX} 不符，"
            "可能换过上游版本，请复核 --dy",
            file=sys.stderr,
        )

    simple, components = shift(font, args.dy)
    font.save(args.output)
    font.close()
    print(f"已写出 {args.output}：简单字形 {simple} 个、组件 {components} 个上移 {args.dy} 单位")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
