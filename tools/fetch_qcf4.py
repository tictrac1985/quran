#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""جلب أصول QCF4 — مصحف المدينة طبعة 1441هـ (التنضيد الحديث) — من حزمة quran-qcf4.

المصدر: npm/quran-qcf4 عبر jsdelivr (بيانات MIT؛ الخطوط مرخّصة لعرض المصحف —
انظر LICENSE.md داخل الحزمة). يبني src-tauri/assets/mushaf-qcf4 كاملة:
  pages/{1..604}.json · fonts/*.woff2 · index/verses/font-map · extras · layout/meta.json
ثم تحققات بنيوية إلزامية، ثم manifest.json ببصمات SHA-256 بنفس مخطط الطبقة 1:
  بصمة الحزمة = sha256(تسلسل بصمات hex للملفات مرتبة تصاعدياً بالمسار)

لا يمس حزمة V2 الحالية — التبديل خطوة لاحقة بعد نجاح هذا السكربت.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

CDN = "https://cdn.jsdelivr.net/npm/quran-qcf4@1.0.3"
ROOT = Path(__file__).resolve().parent.parent
OLD = ROOT / "src-tauri" / "assets" / "mushaf"
OUT = ROOT / "src-tauri" / "assets" / "mushaf-qcf4"
PAGES_TOTAL = 604

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
                return res.read()
        except Exception as e:  # noqa: BLE001 — نعيد المحاولة مهما كان الخطأ الشبكي
            last = e
            time.sleep(0.4 * attempt)
    fail(f"تعذر الجلب بعد {tries} محاولات: {url} — {last}")
    raise AssertionError  # لا يُReached


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "pages").mkdir(exist_ok=True)
    (OUT / "fonts").mkdir(exist_ok=True)

    tasks: list[tuple[str, str]] = [(f"{CDN}/pages/{n:03d}.json", f"pages/{n:03d}.json") for n in range(1, PAGES_TOTAL + 1)]
    tasks += [(f"{CDN}/fonts-woff2/{f}", f"fonts/{f}") for f in FONT_FILES]
    tasks += [(f"{CDN}/{s}", s) for s in STATIC_FILES]
    log(f"جلب {len(tasks)} ملفاً من {CDN} …")

    def one(task: tuple[str, str]) -> tuple[str, bytes]:
        url, rel = task
        blob = http_get(url)
        target = OUT / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
        return rel, blob

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(one, tasks))
    log(f"اكتمل الجلب في {time.time() - t0:.1f}ث — {sum(len(b) for _, b in results) / 1e6:.1f}MB")

    # ---------------- التحققات البنيوية الإلزامية ----------------
    pages: dict[int, dict] = {}
    referenced_fonts: set[str] = set()
    surah9_page = None
    for n in range(1, PAGES_TOTAL + 1):
        data = json.loads((OUT / f"pages/{n:03d}.json").read_text(encoding="utf-8"))
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

    missing = [f for f in referenced_fonts if not (OUT / "fonts" / font_file(f)).exists()]
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

    # ---------------- إضافات موروثة من حزمة V2 (ما زالت صالحة) ----------------
    for src_rel, dst_rel in [
        ("extras/surah-name-v2.ttf", "extras/surah-name-v2.ttf"),  # أثاث الترويسة والفهرس
        ("layout/meta.json", "layout/meta.json"),                  # بدايات السور/الأجزاء — نفس الترقيم الصفحي
    ]:
        src = OLD / src_rel
        if not src.exists():
            fail(f"أصل موروث مفقود: {src}")
        dst = OUT / dst_rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    log("نُسخت الإضافات الموروثة (أسماء السور + meta.json)")

    # ---------------- المانيفست بالبصمات (مخطط الطبقة 1) ----------------
    all_files = sorted(p for p in OUT.rglob("*") if p.is_file() and p.name != "manifest.json")
    entries = []
    for p in all_files:
        blob = p.read_bytes()
        entries.append({
            "path": p.relative_to(OUT).as_posix(),
            "sha256": hashlib.sha256(blob).hexdigest(),
            "size": len(blob),
        })
    entries.sort(key=lambda e: e["path"])
    bundle_sha = hashlib.sha256("".join(e["sha256"] for e in entries).encode()).hexdigest()
    manifest = {
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
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"manifest.json: {len(entries)} ملفاً · بصمة الحزمة {bundle_sha[:16]}…")
    log("✅ حزمة QCF4 جاهزة — الخطوة التالية: تبديل مجلد الأصول وتكييف العارض")


if __name__ == "__main__":
    main()
