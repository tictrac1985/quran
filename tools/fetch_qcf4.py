#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""جلب أصول QCF4 — مصحف المدينة طبعة 1441هـ (التنضيد الحديث) — من حزمة quran-qcf4.

المصدر: npm/quran-qcf4 عبر jsdelivr (بيانات MIT؛ الخطوط مرخّصة لعرض المصحف —
انظر LICENSE.md داخل الحزمة). يبني src-tauri/assets/mushaf-qcf4 كاملة:
  pages/{1..604}.json · fonts/*.woff2 · index/verses/font-map · extras · layout/meta.json
ثم تحققات بنيوية إلزامية، ثم manifest.json ببصمات SHA-256 بنفس مخطط الطبقة 1:
  بصمة الحزمة = sha256(تسلسل بصمات hex للملفات مرتبة تصاعدياً بالمسار)

لا يعتمد على حزمة V2 القديمة. layout/meta.json يجب أن يكون الأصل المدقق المثبت
حالياً أو ملفاً يمرر عبر QCF4_LAYOUT_META ويطابق البصمة المسمّرة.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CDN = "https://cdn.jsdelivr.net/npm/quran-qcf4@1.0.3"
SURAH_FONT_URL = "https://static-cdn.tarteel.ai/qul/fonts/surah-names/v2/surah-name-v2.ttf"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "assets" / "mushaf-qcf4"
PAGES_TOTAL = 604
MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024

# مراسي مستقلة عن CDN. لا تُحدّث هذه القيم آلياً: تغييرها يتطلب تدقيق إصدار
# quran-qcf4 الجديد أولاً ثم إضافة بصمة الحزمة الجديدة إلى src/lib/integrity.ts.
TRUSTED_UPSTREAM_ROOT = "6da1d56a83745574f4bd851953df1979ad8e193542f993cd13efc6efc47cd3a1"
TRUSTED_SURAH_FONT_SHA256 = "2d4678ef53ef76c361c32c13a9ad26317b8f8219089ab5822aafa6ed5d17502a"
TRUSTED_LAYOUT_META_SHA256 = "16c0e8fbeb58b488003865945537c5c86f2d0f9f3bb9ce73d2cef1d4633bad6f"
TRUSTED_BUNDLE_SHA256 = "b2e4f708e0111045d0f5a0e238ed7e139cebff2ca098e7f9603a550834ffc8f2"

FONT_FILES = [f"QCF4_Hafs_{i:02d}_W.woff2" for i in range(1, 48)] + ["QCF4_QBSML.woff2"]
STATIC_FILES = ["index.json", "verses.json", "font-map.json", "LICENSE.md", "README.md"]

# عدد آيات كل سورة — بيانات وصفية قياسية (لاشتقاق توسيط أسطر خواتيم السور لاحقاً في العارض)
AYAH_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109,      # 1-10
    123, 111, 43, 52, 99, 128, 111, 110, 98, 135,       # 11-20
    112, 78, 118, 64, 77, 227, 93, 88, 69, 60,          # 21-30
    34, 30, 73, 54, 45, 83, 182, 88, 75, 85,            # 31-40
    54, 53, 89, 59, 37, 35, 38, 29, 18, 45,             # 41-50
    60, 49, 62, 55, 78, 96, 29, 22, 24, 13,             # 51-60
    14, 11, 11, 18, 12, 12, 30, 52, 52, 44,             # 61-70
    28, 28, 20, 56, 40, 31, 50, 40, 46, 42,             # 71-80
    29, 19, 36, 25, 22, 17, 19, 26, 30, 20,             # 81-90
    15, 21, 11, 8, 8, 19, 5, 8, 8, 11,                  # 91-100
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,                     # 101-110
    5, 4, 5, 6,                                         # 111-114
]


def log(msg: str) -> None:
    print(f"[fetch_qcf4] {msg}", flush=True)


def fail(msg: str) -> None:
    print(f"[fetch_qcf4] ❌ {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def http_get(url: str, tries: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(1, tries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "mushaf-qcf4-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=60) as res:
                declared = int(res.headers.get("Content-Length", "0") or "0")
                if declared > MAX_DOWNLOAD_BYTES:
                    raise ValueError(f"حجم الاستجابة المعلن يتجاوز الحد: {declared}")
                blob = res.read(MAX_DOWNLOAD_BYTES + 1)
                if not blob or len(blob) > MAX_DOWNLOAD_BYTES:
                    raise ValueError(f"حجم الاستجابة غير صالح: {len(blob)}")
                return blob
        except Exception as e:  # noqa: BLE001 — نعيد المحاولة مهما كان الخطأ الشبكي
            last = e
            time.sleep(0.4 * attempt)
    fail(f"تعذر الجلب بعد {tries} محاولات: {url} — {last}")
    raise AssertionError  # لا يُReached


def sha256(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def source_root(files: dict[str, bytes]) -> str:
    digest = hashlib.sha256()
    for rel in sorted(files):
        digest.update(rel.encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256(files[rel]).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def atomic_write(path: Path, blob: bytes) -> None:
    if OUT.is_symlink():
        fail("جذر حزمة QCF4 لا يجوز أن يكون رابطاً رمزياً")
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.parent.resolve(strict=True).relative_to(OUT.resolve(strict=True))
    except (FileNotFoundError, ValueError):
        fail(f"وجهة كتابة خارج جذر حزمة QCF4: {path}")
    cursor = path.parent
    while cursor != OUT:
        if cursor.is_symlink():
            fail(f"مجلد وجهة الكتابة رابط رمزي مرفوض: {cursor}")
        cursor = cursor.parent
    if path.is_symlink():
        fail(f"وجهة الكتابة رابط رمزي مرفوض: {path}")
    temp: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as handle:
            temp = Path(handle.name)
            handle.write(blob)
            handle.flush()
            os.fsync(handle.fileno())
        temp.replace(path)
    finally:
        if temp is not None and temp.exists():
            temp.unlink()


def trusted_layout_meta() -> bytes:
    """يقرأ metadata مدققة صراحة بدلاً من الاعتماد الخفي على حزمة V2 قديمة.

    يمكن تمرير QCF4_LAYOUT_META إلى ملف مدقق عند بناء نظيف. الافتراضي هو الملف
    المثبت في حزمة QCF4 الحالية، ويُرفض الاثنان إن لم تطابق البصمة المسمّرة.
    """
    configured = os.environ.get("QCF4_LAYOUT_META")
    path = Path(configured).expanduser() if configured else OUT / "layout" / "meta.json"
    if not path.is_file():
        fail("layout/meta.json المدقق مفقود؛ عيّن QCF4_LAYOUT_META إلى نسخة ذات البصمة المعتمدة")
    blob = path.read_bytes()
    if sha256(blob) != TRUSTED_LAYOUT_META_SHA256:
        fail("بصمة layout/meta.json لا تطابق النسخة المعتمدة")
    return blob


def build_surah_names(index_blob: bytes) -> bytes:
    index = json.loads(index_blob.decode("utf-8"))
    chapters = index.get("chapters")
    if not isinstance(chapters, list) or len(chapters) != 114:
        fail("index.json لا يحوي 114 سورة")
    names = []
    for expected, chapter in enumerate(chapters, 1):
        if not isinstance(chapter, dict) or chapter.get("id") != expected or not isinstance(chapter.get("name_arabic"), str):
            fail(f"بيانات اسم السورة {expected} غير صالحة في index.json")
        names.append({"n": expected, "name": chapter["name_arabic"]})
    return json.dumps(names, ensure_ascii=False).encode("utf-8")


def build_verses_text(pages: dict[int, dict]) -> bytes:
    # الاستيراد يوحّد التطبيع مع أداة بناء التفسير؛ النص نفسه مشتق حصراً من
    # حقول الصفحات المنزّلة ولا توجد هنا كتابة يدوية لأي حرف قرآني.
    from build_tafsir import normalize_arabic

    acc: dict[str, list[tuple[int, str]]] = {}
    for page in pages.values():
        for line in page["lines"]:
            for word in line["words"]:
                if word.get("type") == "word" and word.get("verse_key") and word.get("text"):
                    position = word.get("position")
                    acc.setdefault(word["verse_key"], []).append(
                        (position if isinstance(position, int) else 10_000, word["text"])
                    )
    if len(acc) != 6236:
        fail(f"النص المشتق يحوي {len(acc)} آية بدلاً من 6236")
    output = {}
    for key, parts in acc.items():
        parts.sort()
        uthmani = " ".join(text for _, text in parts)
        output[key] = {"t": uthmani, "n": normalize_arabic(uthmani)}
    return json.dumps(output, ensure_ascii=False).encode("utf-8")


def expected_asset_paths() -> set[str]:
    paths = {f"pages/{page:03d}.json" for page in range(1, PAGES_TOTAL + 1)}
    paths.update(f"fonts/{font}" for font in FONT_FILES)
    paths.update(STATIC_FILES)
    paths.update({
        "extras/surah-name-v2.ttf",
        "layout/meta.json",
        "surah-names.json",
        "verses-text.json",
    })
    return paths


def main() -> None:
    # نلتقط الملحق الوصفي المسمّر قبل أي اتصال أو كتابة كي لا يترك فشل البناء
    # حزمة نصف محدثة.
    layout_meta = trusted_layout_meta()

    tasks: list[tuple[str, str]] = [(f"{CDN}/pages/{n:03d}.json", f"pages/{n:03d}.json") for n in range(1, PAGES_TOTAL + 1)]
    tasks += [(f"{CDN}/fonts-woff2/{f}", f"fonts/{f}") for f in FONT_FILES]
    tasks += [(f"{CDN}/{s}", s) for s in STATIC_FILES]
    log(f"جلب {len(tasks)} ملفاً من {CDN} …")

    def one(task: tuple[str, str]) -> tuple[str, bytes]:
        url, rel = task
        blob = http_get(url)
        return rel, blob

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(one, tasks))
    log(f"اكتمل الجلب في {time.time() - t0:.1f}ث — {sum(len(b) for _, b in results) / 1e6:.1f}MB")
    downloaded = dict(results)
    actual_root = source_root(downloaded)
    if actual_root != TRUSTED_UPSTREAM_ROOT:
        fail(f"جذر المصدر لا يطابق الإصدار المدقق: {actual_root}")
    log(f"تطابقت مرساة المصدر {actual_root[:16]}…")

    # ---------------- التحققات البنيوية الإلزامية ----------------
    pages: dict[int, dict] = {}
    referenced_fonts: set[str] = set()
    surah9_page = None
    for n in range(1, PAGES_TOTAL + 1):
        data = json.loads(downloaded[f"pages/{n:03d}.json"].decode("utf-8"))
        if data.get("page") != n:
            fail(f"صفحة {n}: حقل page={data.get('page')}")
        lines = data.get("lines", [])
        if not 1 <= len(lines) <= 15:
            fail(f"صفحة {n}: عدد أسطر {len(lines)} خارج 1..15")
        nums = [l["line"] for l in lines]
        if nums != sorted(nums) or nums[0] < 1 or nums[-1] > 15:
            fail(f"صفحة {n}: ترقيم أسطر غير سليم {nums[:3]}…{nums[-3:]}")
        referenced_fonts.add(data["font"])
        for l in lines:
            for w in l["words"]:
                if not w.get("char"):
                    fail(f"صفحة {n} سطر {l['line']}: كلمة بلا محرف")
                referenced_fonts.add(w["font"])
                if w["type"] == "surah_header" and w.get("sura") == 9:
                    surah9_page = n
        pages[n] = data

    # الخطوط المشار إليها كلها موجودة على القرص
    def font_file(family: str) -> str:
        return "QCF4_QBSML.woff2" if family == "QCF4_QBSML" else f"{family}_W.woff2"

    missing = [f for f in referenced_fonts if f"fonts/{font_file(f)}" not in downloaded]
    if missing:
        fail(f"خطوط مشار إليها غير موجودة: {missing}")

    # نمط 1441هـ: 376 خمسة عشر سطر نص بلا لافتة؛ 377 لافتة ← بسملة ← نص
    t376 = [l["words"][0]["type"] for l in pages[376]["lines"]]
    if set(t376) != {"word"} or len(t376) != 15:
        fail(f"صفحة 376 ليست 15 سطر نص: {t376}")
    t377 = [l["words"][0]["type"] for l in pages[377]["lines"]][:3]
    if t377 != ["surah_header", "bismillah", "word"]:
        fail(f"صفحة 377 لا تبدأ لافتة←بسملة←نص: {t377}")

    # سورة التوبة (9) بلا بسملة بعد لافتتها
    if surah9_page is None:
        fail("لم يُعثر على لافتة سورة 9")
    seq = [w["type"] for l in pages[surah9_page]["lines"] for w in l["words"][:1]]
    if "surah_header" in seq:
        i = seq.index("surah_header")
        if i + 1 < len(seq) and seq[i + 1] == "bismillah":
            fail(f"صفحة {surah9_page}: بسملة بعد لافتة التوبة — يجب ألا توجد")

    # الصفحات القصيرة (1-2) وسطر/سطرا الختام
    log(f"صفحة 1: {len(pages[1]['lines'])} أسطر (ترقيم {pages[1]['lines'][0]['line']}..{pages[1]['lines'][-1]['line']})")
    log(f"صفحة 2: {len(pages[2]['lines'])} أسطر (ترقيم {pages[2]['lines'][0]['line']}..{pages[2]['lines'][-1]['line']})")
    log(f"صفحة 604: {len(pages[604]['lines'])} أسطر")
    log(f"لافتة سورة 9 في صفحة {surah9_page} (بلا بسملة ✓)")
    log(f"الخطوط المستخدمة فعلاً: {len(referenced_fonts)}")

    # ---------------- ملحقات مثبتة ومخرجات مشتقة ----------------
    surah_font = http_get(SURAH_FONT_URL)
    if sha256(surah_font) != TRUSTED_SURAH_FONT_SHA256:
        fail("بصمة خط أسماء السور لا تطابق النسخة المعتمدة")
    generated = {
        "extras/surah-name-v2.ttf": surah_font,
        "layout/meta.json": layout_meta,
        "surah-names.json": build_surah_names(downloaded["index.json"]),
        "verses-text.json": build_verses_text(pages),
    }
    bundle_files = {**downloaded, **generated}
    expected = expected_asset_paths()
    if set(bundle_files) != expected or len(bundle_files) != 661:
        fail("مخزون الأصول الناتج لا يطابق قائمة الإصدار المغلقة")

    # ---------------- المانيفست بالبصمات (مخطط الطبقة 1) ----------------
    entries = []
    for rel in sorted(expected):
        blob = bundle_files[rel]
        entries.append({
            "path": rel,
            "sha256": sha256(blob),
            "size": len(blob),
        })
    bundle_sha = hashlib.sha256("".join(e["sha256"] for e in entries).encode()).hexdigest()
    if bundle_sha != TRUSTED_BUNDLE_SHA256:
        fail(f"بصمة الحزمة الناتجة لا تطابق الإصدار المدقق: {bundle_sha}")

    # لا تبدأ الكتابة إلا بعد اكتمال التنزيل والتحقق من كل المراسي والبنية
    # وبصمة الحزمة النهائية. هكذا لا يفسد فشل شبكي/مصدري الحزمة المثبتة.
    for rel, blob in bundle_files.items():
        atomic_write(OUT / rel, blob)
    log("ثُبتت الملحقات والمخرجات المشتقة بعد اجتياز البصمات")

    manifest = {
        "schema_version": 2,
        "bundle": {
            "name": "mushaf-qcf4-bundle",
            "mushaf": "QCF4 Hafs — Madinah Mushaf 1441H (quran-qcf4@1.0.3)",
            "pages_total": PAGES_TOTAL,
            "pages_present": list(range(1, PAGES_TOTAL + 1)),
            "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "sha256": bundle_sha,
        },
        "files": entries,
    }
    atomic_write(
        OUT / "manifest.json",
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
    )
    log(f"manifest.json: {len(entries)} ملفاً · بصمة الحزمة {bundle_sha[:16]}…")
    log("✅ حزمة QCF4 جاهزة — الخطوة التالية: تبديل مجلد الأصول وتكييف العارض")


if __name__ == "__main__":
    main()
