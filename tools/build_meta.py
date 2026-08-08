#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""اشتقاق البيانات الوصفية للفهرس — layout/meta.json — من الأصول المُثبتة نفسها.

المصادر (كلها داخل خط الأصول، لا مصدر خارجي ولا كتابة يدوية):
  - بدايات السور: أسطر surah_name في layout/pages.json (جدول تخطيط QPC V2).
  - بدايات الأجزاء/الأحزاب/الأرباع: حقول juz_number / hizb_number /
    rub_el_hizb_number في بيانات الصفحات (QDC) — أول صفحة يظهر فيها الرقم.

بعد الإنشاء يجب تشغيل:  python tools/fetch_assets.py --verify-only
لتضمين الملف الجديد في manifest.json وبصمة الحزمة.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # quran-app/
OUT = ROOT / "src-tauri" / "assets" / "mushaf"
LAYOUT_JSON = OUT / "layout" / "pages.json"
PAGES_DIR = OUT / "data" / "pages"
META_PATH = OUT / "layout" / "meta.json"

EXPECTED = (("surahs", 114), ("juz", 30), ("hizb", 60), ("rub", 240))
# مرساة معروفة يقيناً: البقرة تبدأ صفحة 2، الناس تبدأ صفحة 604
ANCHORS = (("surahs", 2, 2), ("surahs", 114, 604))


def fail(msg: str) -> None:
    print(f"✗ {msg}", flush=True)
    sys.exit(1)


def ensure_writable(p: Path) -> None:
    if p.exists():
        p.chmod(0o644)


def main() -> None:
    if not LAYOUT_JSON.exists():
        fail(f"خريطة التخطيط غير موجودة: {LAYOUT_JSON}")
    layout = json.loads(LAYOUT_JSON.read_text(encoding="utf-8"))

    # بدايات السور من أسطر surah_name (أول ورود يكفي — السورة تُفتتح مرة واحدة)
    surah_page: dict[int, int] = {}
    for page_s, lines in layout.items():
        for ln in lines:
            if ln["line_type"] == "surah_name" and ln.get("surah_number"):
                surah_page.setdefault(ln["surah_number"], int(page_s))

    # بدايات الأجزاء/الأحزاب/الأرباع بمسح تصاعدي واحد على بيانات الصفحات
    first: dict[str, dict[int, int]] = {"juz": {}, "hizb": {}, "rub": {}}
    fields = (("juz", "juz_number"), ("hizb", "hizb_number"), ("rub", "rub_el_hizb_number"))
    page_files = sorted(PAGES_DIR.glob("page_*.json"), key=lambda p: int(p.stem.split("_")[1]))
    if len(page_files) != 604:
        fail(f"متوقع 604 ملفات صفحات، وُجد {len(page_files)}")
    for p in page_files:
        page_n = int(p.stem.split("_")[1])
        data = json.loads(p.read_text(encoding="utf-8"))
        for v in data["verses"]:
            for key, field in fields:
                val = v.get(field)
                if isinstance(val, int) and val > 0:
                    first[key].setdefault(val, page_n)

    meta = {
        "surahs": [{"n": n, "page": surah_page[n]} for n in sorted(surah_page)],
        "juz": [{"n": n, "page": first["juz"][n]} for n in sorted(first["juz"])],
        "hizb": [{"n": n, "page": first["hizb"][n]} for n in sorted(first["hizb"])],
        "rub": [{"n": n, "page": first["rub"][n]} for n in sorted(first["rub"])],
    }

    # تحققات صارمة — أي انحراف يوقف الخط قبل كتابة أي ملف
    for key, want in EXPECTED:
        entries = meta[key]
        if len(entries) != want:
            fail(f"{key}: متوقع {want} مدخلاً، وُجد {len(entries)}")
        if [e["n"] for e in entries] != list(range(1, want + 1)):
            fail(f"{key}: الترقيم غير متسلسل من 1 إلى {want}")
        pages = [e["page"] for e in entries]
        if pages != sorted(pages):
            fail(f"{key}: ترتيب الصفحات غير متصاعد")
        if not all(1 <= pg <= 604 for pg in pages):
            fail(f"{key}: صفحة خارج النطاق 1..604")
    for key, n, page in ANCHORS:
        got = next((e["page"] for e in meta[key] if e["n"] == n), None)
        if got != page:
            fail(f"مرساة {key}[{n}]: متوقع صفحة {page}، وُجد {got}")

    ensure_writable(META_PATH)
    META_PATH.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"✓ layout/meta.json: 114 سورة · 30 جزءاً · 60 حزباً · 240 ربعاً", flush=True)
    print("  شغّل الآن: python tools/fetch_assets.py --verify-only", flush=True)


if __name__ == "__main__":
    main()
