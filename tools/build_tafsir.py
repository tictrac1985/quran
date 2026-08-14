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
import os
import re
import sys
import tempfile
import time
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
EXPECTED_ASSETS = 661
MAX_MANIFEST_BYTES = 1024 * 1024
MAX_ASSET_BYTES = 8 * 1024 * 1024
MAX_TAFSIR_SOURCE_BYTES = 16 * 1024 * 1024
MAX_TAFSIR_ENTRY_CHARS = 1_000_000
TRUSTED_BUNDLE_SHA256 = "b2e4f708e0111045d0f5a0e238ed7e139cebff2ca098e7f9603a550834ffc8f2"
TRUSTED_TAFSIR_OUTPUT_ROOT = "0f437a9737287834bbd025bf061fc803cb512afca0d88069653c562d38e72049"
MAX_TAFSIR_OUTPUT_BYTES = 160 * 1024 * 1024

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


def expected_asset_paths() -> set[str]:
    paths = {
        "LICENSE.md",
        "README.md",
        "extras/surah-name-v2.ttf",
        "font-map.json",
        "index.json",
        "layout/meta.json",
        "surah-names.json",
        "verses-text.json",
        "verses.json",
        "fonts/QCF4_QBSML.woff2",
    }
    paths.update(f"pages/{page:03d}.json" for page in range(1, 605))
    paths.update(f"fonts/QCF4_Hafs_{font:02d}_W.woff2" for font in range(1, 48))
    return paths


def load_and_verify_manifest() -> dict:
    """يمنع اشتقاق أي خرج من صفحات غير مطابقة للحزمة المسمّرة."""
    manifest_path = ASSETS / "manifest.json"
    size = manifest_path.stat().st_size
    if not 0 < size <= MAX_MANIFEST_BYTES:
        raise SystemExit("✗ حجم manifest.json غير صالح")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(manifest.get("bundle"), dict) or not isinstance(manifest.get("files"), list):
        raise SystemExit("✗ مخطط manifest.json غير صالح")
    bundle_sha = manifest["bundle"].get("sha256")
    if bundle_sha != TRUSTED_BUNDLE_SHA256:
        raise SystemExit("✗ بصمة الحزمة ليست البصمة المعتمدة لهذه الأداة")

    expected = expected_asset_paths()
    entries = manifest["files"]
    if len(entries) != EXPECTED_ASSETS or len(entries) != len(expected):
        raise SystemExit(f"✗ مخزون المانيفست غير مكتمل: {len(entries)}")
    seen: set[str] = set()
    declared_hashes: list[str] = []
    for entry in sorted(entries, key=lambda item: item.get("path", "") if isinstance(item, dict) else ""):
        if not isinstance(entry, dict):
            raise SystemExit("✗ مدخل غير صالح في المانيفست")
        rel = entry.get("path")
        declared = entry.get("sha256")
        if not isinstance(rel, str) or rel not in expected or rel in seen or not isinstance(declared, str) or not re.fullmatch(r"[0-9a-f]{64}", declared):
            raise SystemExit(f"✗ مدخل مانيفست غير صالح: {rel!r}")
        seen.add(rel)
        path = ASSETS / rel
        if not path.is_file() or path.is_symlink():
            raise SystemExit(f"✗ أصل مفقود أو رابط رمزي: {rel}")
        actual_size = path.stat().st_size
        if not 0 < actual_size <= MAX_ASSET_BYTES:
            raise SystemExit(f"✗ حجم أصل غير صالح: {rel}")
        declared_size = entry.get("size")
        if declared_size is not None and declared_size != actual_size:
            raise SystemExit(f"✗ حجم أصل لا يطابق المانيفست: {rel}")
        actual = sha256_file(path)
        if actual != declared:
            raise SystemExit(f"✗ بصمة أصل لا تطابق المانيفست: {rel}")
        declared_hashes.append(declared)
    if seen != expected:
        raise SystemExit("✗ قائمة الأصول لا تطابق مخزون الإصدار المغلق")
    recomputed = hashlib.sha256("".join(declared_hashes).encode("ascii")).hexdigest()
    if recomputed != bundle_sha:
        raise SystemExit("✗ بصمة المانيفست الذاتية غير صحيحة")
    return manifest


def atomic_write_text(path: Path, text: str) -> None:
    if ASSETS.is_symlink():
        raise SystemExit("✗ جذر حزمة QCF4 لا يجوز أن يكون رابطاً رمزياً")
    try:
        path.parent.resolve(strict=True).relative_to(ASSETS.resolve(strict=True))
    except (FileNotFoundError, ValueError):
        raise SystemExit(f"✗ وجهة كتابة خارج جذر حزمة QCF4: {path}") from None
    cursor = path.parent
    while cursor != ASSETS:
        if cursor.is_symlink():
            raise SystemExit(f"✗ مجلد وجهة الكتابة رابط رمزي مرفوض: {cursor}")
        cursor = cursor.parent
    if path.is_symlink():
        raise SystemExit(f"✗ وجهة الكتابة رابط رمزي مرفوض: {path}")
    temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as handle:
            temp = Path(handle.name)
            handle.write(text.encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        temp.replace(path)
    finally:
        if temp is not None and temp.exists():
            temp.unlink()


def read_json_limited(path: Path, maximum: int) -> object:
    size = path.stat().st_size
    if not 0 < size <= maximum:
        raise SystemExit(f"✗ حجم ملف المصدر غير صالح: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def tafsir_output_root(outputs: dict[str, str]) -> tuple[str, int]:
    digest = hashlib.sha256()
    total = 0
    for rel in sorted(outputs):
        blob = outputs[rel].encode("utf-8")
        total += len(blob)
        if total > MAX_TAFSIR_OUTPUT_BYTES:
            raise SystemExit("✗ حجم خرج التفسير يتجاوز الحد الآمن")
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(hashlib.sha256(blob).hexdigest().encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest(), total


def main() -> int:
    # --only-verses: إعادة توليد verses-text.json فقط (بلا مصادر التفسير —
    # مفيد بعد تنظيف tmp/ أو عند إصلاح يخص نص الآيات وحده)
    only_verses = "--only-verses" in sys.argv
    manifest = load_and_verify_manifest()
    verses_meta = json.loads((ASSETS / "verses.json").read_text(encoding="utf-8"))
    verse_keys = set(verses_meta.keys())
    assert len(verse_keys) == EXPECTED_VERSES, f"verses.json فيه {len(verse_keys)} آية!"

    # 1) التفسيران
    tafsir_outputs: dict[str, str] = {}
    if only_verses:
        print("… --only-verses: تخطي التفسيرين")
    for slug, folder in ([] if only_verses else TAFSIRS.items()):
        if not folder.is_dir():
            print(f"✗ مصدر مفقود: {folder}", file=sys.stderr)
            return 1
        total = 0
        for surah in range(1, 115):
            src = folder / f"{surah}.json"
            if not src.is_file() or src.is_symlink():
                raise SystemExit(f"✗ مصدر مفقود أو رابط رمزي: {src}")
            items = read_json_limited(src, MAX_TAFSIR_SOURCE_BYTES)
            if not isinstance(items, list):
                raise SystemExit(f"✗ مصدر التفسير ليس قائمة: {src}")
            mapped: dict[str, str] = {}
            expected_surah_keys = {key for key in verse_keys if key.startswith(f"{surah}:")}
            for it in items:
                if not isinstance(it, dict):
                    raise SystemExit(f"✗ مدخل تفسير غير صالح في {src}")
                try:
                    item_surah = int(it["surah"])
                    ayah = int(it["ayah"])
                except (KeyError, TypeError, ValueError):
                    raise SystemExit(f"✗ رقم سورة/آية غير صالح في {src}") from None
                text = it.get("text")
                if item_surah != surah:
                    raise SystemExit(f"✗ اختلاط سورة في {src}: {item_surah}")
                if not isinstance(text, str) or not text or len(text) > MAX_TAFSIR_ENTRY_CHARS or "\0" in text:
                    raise SystemExit(f"✗ نص تفسير غير صالح في {src} عند الآية {ayah}")
                key = f"{surah}:{ayah}"
                if key not in expected_surah_keys or key in mapped:
                    raise SystemExit(f"✗ آية زائدة/مكررة في {src}: {key}")
                mapped[key] = clean_tafsir(text)
            if set(mapped) != expected_surah_keys:
                missing = sorted(expected_surah_keys - set(mapped))
                raise SystemExit(f"✗ {slug} سورة {surah} ناقصة الآيات: {missing[:3]}…")
            tafsir_outputs[f"{slug}/{surah}.json"] = json.dumps(
                mapped, ensure_ascii=False, indent=None
            )
            total += len(mapped)
        assert total == EXPECTED_VERSES, f"{slug}: {total} آية فقط"
        size_mb = sum(
            len(text.encode("utf-8"))
            for rel, text in tafsir_outputs.items()
            if rel.startswith(f"{slug}/")
        ) / 1e6
        print(f"✓ {slug}: {total} آية في 114 ملفاً ({size_mb:.1f} MB)")

    if not only_verses:
        if len(tafsir_outputs) != 228:
            raise SystemExit(f"✗ خرج التفسير ناقص: {len(tafsir_outputs)} ملفاً")
        output_root, _ = tafsir_output_root(tafsir_outputs)
        if output_root != TRUSTED_TAFSIR_OUTPUT_ROOT:
            raise SystemExit(
                "✗ خرج التفسير لا يطابق النسخة المدققة؛ أُوقف البناء قبل استبدال أي ملف. "
                f"الجذر الناتج {output_root}"
            )
        for rel, text in tafsir_outputs.items():
            output = ASSETS / "tafsir" / rel
            output.parent.mkdir(parents=True, exist_ok=True)
            atomic_write_text(output, text)
        print(f"✓ تطابق جذر خرج التفسير المدقق {output_root[:16]}…")

    # 2) نص الآيات العثماني + المُطبَّع (من أصول الصفحات فقط — لا كتابة يدوية)
    # قاعدة: «word» فقط. كلمات «end» (علامة نهاية الآية المزخرفة) ليست نصاً —
    # حقل text فيها شيفرة محرف «V<رقم>»، وإدخالها كان يلصق حرفاً لاتينياً
    # بآخر كل آية معروضة (عيب §3.2 في تقرير REDESIGN-2026-08-08).
    acc: dict[str, list[tuple[int, str]]] = {}
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
    verses_text = json.dumps(out, ensure_ascii=False, indent=None)
    verses_digest = hashlib.sha256(verses_text.encode("utf-8")).hexdigest()
    expected_verses_digest = next(
        entry["sha256"] for entry in manifest["files"] if entry["path"] == "verses-text.json"
    )
    if verses_digest != expected_verses_digest:
        raise SystemExit(
            "✗ النص المشتق لا يطابق verses-text.json المدقق؛ أُوقف البناء بلا استبداله"
        )
    # الملف الحالي اجتاز بصمته أعلاه ومطابق للخرج المشتق، فلا نعيد كتابته.
    print(f"✓ verses-text.json: {len(out)} آية (عثماني + مُطبَّع)")

    # 3) تحديث المانيفست (إضافة الجديد فقط، وإعادة حساب بصمة الحزمة).
    # ملفات tafsir/ تُستثنى من بوابة النص القرآني الأساسية كي تبقى قائمة الأصول
    # مغلقة وفحص الإقلاع محدوداً؛ لها تحقق مخطط/حدود عند البناء والتحميل.
    manifest_path = ASSETS / "manifest.json"
    expected = expected_asset_paths()
    previous = {entry["path"]: entry["sha256"] for entry in manifest["files"]}
    ordered = []
    changed = 0
    for rel in sorted(expected):
        path = ASSETS / rel
        size = path.stat().st_size
        if not 0 < size <= MAX_ASSET_BYTES:
            raise SystemExit(f"✗ حجم أصل غير صالح بعد البناء: {rel}")
        digest = sha256_file(path)
        changed += digest != previous.get(rel)
        ordered.append({"path": rel, "sha256": digest, "size": size})
    bundle = hashlib.sha256("".join(f["sha256"] for f in ordered).encode()).hexdigest()
    manifest["files"] = ordered
    manifest["schema_version"] = 2
    bundle_metadata = dict(manifest.get("bundle", {}))
    bundle_metadata.update({
        "name": bundle_metadata.get("name", "mushaf-qcf4-bundle"),
        "mushaf": bundle_metadata.get("mushaf", "QCF4 Hafs — Madinah Mushaf 1441H (quran-qcf4@1.0.3)"),
        "pages_total": 604,
        "pages_present": list(range(1, 605)),
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sha256": bundle,
    })
    manifest["bundle"] = bundle_metadata
    atomic_write_text(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"✓ manifest.json: {len(ordered)} ملفاً ({changed} مُحدَّث) — بصمة الحزمة {bundle[:12]}…")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
