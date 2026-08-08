#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""خط أصول المرحلة 3.1 — توليد ملفات التفسير ونص الآيات.

المدخلات:
  - tmp/tafsir_api/tafsir/ar-tafsir-ibn-kathir/{1..114}.json   (تفسير ابن كثير)
  - tmp/tafsir_api/tafsir/ar-tafsir-as-saadi/{1..114}.json    (تفسير السعدي)
  - src-tauri/assets/mushaf-qcf4/pages/{001..604}.json        (نص الكلمات العثماني)

المخرجات (داخل حزمة الأصول):
  - tafsir/ibn-kathir/{1..114}.json   مفتاح «سورة:آية» ← نص التفسير
  - tafsir/sadi/{1..114}.json         نفس الشكل
  - verses-text.json                  «سورة:آية» ← {t: عثماني، n: مُطبَّع للبحث}

ثم تحديث manifest.json: بصمة SHA-256 لكل ملف جديد + إعادة حساب بصمة الحزمة
(نفس خوارزمية fetch_assets.py: sha256 لتسلسل بصمات hex مرتبة أبجدياً بالمسار).

قواعد صارمة:
  - لا يُكتب حرف قرآني بيدنا: نص الآيات يُجمع من حقول text داخل أصول الصفحات فقط.
  - أي نقص في عدد الآيات (6236) أو اختلاط مفاتيح يوقف الخط بخطأ.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # quran-app/
WS = ROOT.parent                                        # E:/quran
ASSETS = ROOT / "src-tauri" / "assets" / "mushaf-qcf4"
SRC = WS / "tmp" / "tafsir_api" / "tafsir"

TAFSIRS = {
    "ibn-kathir": SRC / "ar-tafsir-ibn-kathir",
    "sadi": SRC / "ar-tafsir-as-saadi",
}

EXPECTED_VERSES = 6236

# علامات التصحيح الطباعي في نص ابن كثير: [[في أ: "..."]] — تُحذف كاملة
EDITOR_MARKS = re.compile(r"\[\[[^\]]*\]\]")

# ------------- تطبيع النص للبحث (بحث بتشكيل/بدون) -------------
TASHKEEL = re.compile(
    "[ً-ْٰـۖ-ۭ۪-ۻ]"
)

def normalize_arabic(s: str) -> str:
    s = unicodedata.normalize("NFKC", s)
    s = TASHKEEL.sub("", s)
    for a in "أإآٱ":
        s = s.replace(a, "ا")
    s = s.replace("ة", "ه").replace("ى", "ي")
    # إبقاء الحروف العربية والمسافات فقط
    s = re.sub(r"[^ء-غف-ي٠-٩\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_tafsir(text: str) -> str:
    t = EDITOR_MARKS.sub("", text)
    t = t.replace("\r\n", "\n")
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> int:
    # --only-verses: إعادة توليد verses-text.json فقط (بلا مصادر التفسير —
    # مفيد بعد تنظيف tmp/ أو عند إصلاح يخص نص الآيات وحده)
    only_verses = "--only-verses" in sys.argv
    verses_meta = json.loads((ASSETS / "verses.json").read_text(encoding="utf-8"))
    verse_keys = set(verses_meta.keys())
    assert len(verse_keys) == EXPECTED_VERSES, f"verses.json فيه {len(verse_keys)} آية!"

    # 1) التفسيران
    if only_verses:
        print("… --only-verses: تخطي التفسيرين")
    for slug, folder in ([] if only_verses else TAFSIRS.items()):
        if not folder.is_dir():
            print(f"✗ مصدر مفقود: {folder}", file=sys.stderr)
            return 1
        out_dir = ASSETS / "tafsir" / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        total = 0
        for surah in range(1, 115):
            src = folder / f"{surah}.json"
            items = json.loads(src.read_text(encoding="utf-8"))
            mapped: dict[str, str] = {}
            for it in items:
                if int(it["surah"]) != surah:
                    raise SystemExit(f"✗ اختلاط سورة في {src}: {it['surah']}")
                mapped[f"{surah}:{it['ayah']}"] = clean_tafsir(it["text"])
            missing = [k for k in verse_keys if k.startswith(f"{surah}:") and k not in mapped]
            if missing:
                raise SystemExit(f"✗ {slug} سورة {surah} ناقصة الآيات: {missing[:3]}…")
            (out_dir / f"{surah}.json").write_text(
                json.dumps(mapped, ensure_ascii=False, indent=None), encoding="utf-8"
            )
            total += len(mapped)
        assert total == EXPECTED_VERSES, f"{slug}: {total} آية فقط"
        size_mb = sum(p.stat().st_size for p in out_dir.glob("*.json")) / 1e6
        print(f"✓ {slug}: {total} آية في 114 ملفاً ({size_mb:.1f} MB)")

    # 2) نص الآيات العثماني + المُطبَّع (من أصول الصفحات فقط — لا كتابة يدوية)
    # قاعدة: «word» فقط. كلمات «end» (علامة نهاية الآية المزخرفة) ليست نصاً —
    # حقل text فيها شيفرة محرف «V<رقم>»، وإدخالها كان يلصق حرفاً لاتينياً
    # بآخر كل آية معروضة (عيب §3.2 في تقرير REDESIGN-2026-08-08).
    acc: dict[str, list[str]] = {}
    for pf in sorted(ASSETS.glob("pages/*.json")):
        page = json.loads(pf.read_text(encoding="utf-8"))
        for line in page["lines"]:
            for w in line["words"]:
                if w.get("type") == "word" and w.get("verse_key") and w.get("text"):
                    acc.setdefault(w["verse_key"], []).append((w.get("position") or 10_000, w["text"]))
    out = {}
    for k, parts in acc.items():
        parts.sort()
        uthmani = " ".join(t for _, t in parts)
        out[k] = {"t": uthmani, "n": normalize_arabic(uthmani)}
    missing = verse_keys - set(out)
    if missing:
        raise SystemExit(f"✗ آيات بلا نص مجمع: {sorted(missing)[:3]}…")
    (ASSETS / "verses-text.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=None), encoding="utf-8"
    )
    print(f"✓ verses-text.json: {len(out)} آية (عثماني + مُطبَّع)")

    # 3) تحديث المانيفست (إضافة الجديد فقط، وإعادة حساب بصمة الحزمة).
    # ملفات tafsir/ تُستثنى عمداً: بصمات الإيقاف تحمي النص القرآني فقط؛ التفسير
    # محتوى تفسيري (~120MB) وإدخاله يبطئ فحص الإقلاع بلا فائدة أمنية.
    manifest_path = ASSETS / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = {f["path"]: f["sha256"] for f in manifest["files"] if not f["path"].startswith("tafsir/")}
    new_rel = [p for p in ASSETS.rglob("*.json") if p.name == "verses-text.json"]
    added = 0
    for p in sorted(new_rel):
        rel = p.relative_to(ASSETS).as_posix()
        h = sha256_file(p)
        if files.get(rel) != h:
            files[rel] = h
            added += 1
    ordered = [{"path": r, "sha256": files[r]} for r in sorted(files)]
    bundle = hashlib.sha256("".join(f["sha256"] for f in ordered).encode()).hexdigest()
    manifest["files"] = ordered
    manifest["bundle"] = {"sha256": bundle}
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ manifest.json: {len(ordered)} ملفاً (+{added} جديد/مُحدَّث) — بصمة الحزمة {bundle[:12]}…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
