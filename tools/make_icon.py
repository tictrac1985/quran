# -*- coding: utf-8 -*-
"""توليد أيقونة «ورتل القرآن» برمجياً — بلا ملفات ثنائية في المستودع.

يرسم icon-src.png (1024×1024): مكتب أخضر داكن بإطار ذهبي مزدوج وكتاب
عاجي مفتوح في الوسط. بعد التوليد أنتج كل المقاسات:
    python tools/make_icon.py
    npx tauri icon src-tauri/icons/icon-src.png
"""
from pathlib import Path

from PIL import Image, ImageDraw

SIZE = 1024
GREEN = (44, 48, 43)        # 2c302b — أخضر المكتب
GREEN_DEEP = (34, 38, 33)   # تظليل الحواف
GILT = (201, 162, 39)       # c9a227 — الذهبي
IVORY = (245, 239, 224)     # صفحات الكتاب
IVORY_DIM = (214, 205, 182) # حواف الصفحات
INK = (90, 84, 66)          # سطور الصفحات

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "icon-src.png"


def rounded(draw: ImageDraw.ImageDraw, box, radius, **kw):
    draw.rounded_rectangle(box, radius=radius, **kw)


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # القاعدة: مربع أخضر مدوّر مع تظليل سفلي خفيف
    rounded(d, [24, 24, SIZE - 24, SIZE - 24], 200, fill=GREEN)
    rounded(d, [24, SIZE - 220, SIZE - 24, SIZE - 24], 200, fill=GREEN_DEEP)
    d.rectangle([24, SIZE - 420, SIZE - 24, SIZE - 220], fill=GREEN_DEEP)
    rounded(d, [24, 24, SIZE - 24, SIZE - 24], 200, outline=GILT, width=14)

    # الإطار الذهبي الداخلي (خطان متقاربان كزخرفة مصاحف)
    rounded(d, [92, 92, SIZE - 92, SIZE - 92], 140, outline=GILT, width=6)
    rounded(d, [116, 116, SIZE - 116, SIZE - 116], 120, outline=GILT, width=3)

    # الكتاب المفتوح: صفحتان عاجيتان يجمعهما غلاف ذهبي
    cx, top, bot = SIZE // 2, 350, 700
    half_w, spine = 200, 14
    # غلاف خلف الصفحات
    rounded(d, [cx - half_w - 26, top - 24, cx + half_w + 26, bot + 30], 26, fill=GILT)
    # الصفحة اليمنى واليسرى
    d.polygon([(cx - spine, top), (cx - half_w, top + 26), (cx - half_w, bot - 26),
               (cx - spine, bot)], fill=IVORY)
    d.polygon([(cx + spine, top), (cx + half_w, top + 26), (cx + half_w, bot - 26),
               (cx + spine, bot)], fill=IVORY)
    # حرفا الصفحتين
    d.line([(cx - half_w, top + 26), (cx - half_w, bot - 26)], fill=IVORY_DIM, width=8)
    d.line([(cx + half_w, top + 26), (cx + half_w, bot - 26)], fill=IVORY_DIM, width=8)
    # ثنية الكعب
    d.line([(cx, top + 6), (cx, bot - 6)], fill=IVORY_DIM, width=10)
    # سطور النص على كل صفحة
    for i in range(5):
        y = top + 74 + i * 52
        d.line([(cx - half_w + 40, y), (cx - spine - 34, y + 6)], fill=INK, width=7)
        d.line([(cx + spine + 34, y + 6), (cx + half_w - 40, y)], fill=INK, width=7)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print("وُلّدت الأيقونة:", OUT)


if __name__ == "__main__":
    main()
