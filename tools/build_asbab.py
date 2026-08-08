#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""خط أصول 3.2 — أسباب النزول (صحيح أسباب النزول دراسة حديثية، إبراهيم محمد العلي).

المدخل: tmp/asbab-all.json  [{surah, ayahs: [..], occasions: [..]}, …]
المخرج: src-tauri/assets/mushaf-qcf4/tafsir/asbab/{1..114}.json
        مفتاح «سورة:آية» ← نص الأسباب (تتعدد الأسباب لنفس الآية بفاصل فارغ).

قاعدة: آية بلا سبب مُثبت لا يُكتب لها شيء — غياب المفتاح هو الجواب الصادق.
الملفات خارج بصمات الإقلاع (محتوى تفسيري، مثل ملفات التفسير).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WS = ROOT.parent
SRC = WS / "tmp" / "asbab-all.json"
OUT = ROOT / "src-tauri" / "assets" / "mushaf-qcf4" / "tafsir" / "asbab"

AYAH_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
    110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
    83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
    78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
    56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
    11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]


def main() -> int:
    entries = json.loads(SRC.read_text(encoding="utf-8"))
    per_surah: dict[int, dict[str, list[str]]] = {}
    for e in entries:
        s = int(e["surah"])
        if not (1 <= s <= 114):
            raise SystemExit(f"✗ سورة خارج النطاق: {s}")
        for a in e["ayahs"]:
            if a < 1:
                raise SystemExit(f"✗ آية خارج النطاق: {s}:{a}")
            if a > AYAH_COUNTS[s - 1]:
                # قيد المصدر 96:6..20 والعلق 19 آية — نُسقط الفائض الوهمي ونبقي
                # الآيات الحقيقية 6..19 مغطاة (لا توجد آية 20 فلا ضياع لشيء)
                print(f"⚠ قيد فائض أُسقط: {s}:{a}")
                continue
            per_surah.setdefault(s, {}).setdefault(f"{s}:{a}", []).extend(e["occasions"])

    OUT.mkdir(parents=True, exist_ok=True)
    covered = 0
    for s, m in sorted(per_surah.items()):
        texted = {k: "\n\n".join(v).strip() for k, v in m.items()}
        covered += len(texted)
        (OUT / f"{s}.json").write_text(
            json.dumps(texted, ensure_ascii=False, indent=None), encoding="utf-8"
        )
    print(f"✓ asbab: {len(entries)} سبباً يغطي {covered} آية في {len(per_surah)} سورة")
    return 0


if __name__ == "__main__":
    sys.exit(main())
