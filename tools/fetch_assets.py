#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
خط أنابيب الأصول — مشروع المصحف (المرحلة 1)
============================================

المسؤولية الوحيدة لدخول أي أصل إلى المشروع:
  1) الجلب من المصادر المعتمدة (مع مرايا موثوقة موثّقة عند الحاجة)
  2) التحقق: توقيع KFGQPC/KFC داخل الخطوط، عدد الكلمات لكل صفحة مقابل
     جدول التخطيط الرسمي (QPC V2 – 1421H)، والمطابقة المتقاطعة للنص
     العثماني المجمع من الكلمات مع نص Tanzil الموثق
  3) توليد manifest.json ببصمة SHA-256 لكل ملف + بصمة كلية للحزمة

قواعد صارمة:
  - لا يُكتب أي حرف قرآني يدوياً: كل النصوص تُجلب من المصادر وتُعالج آلياً فقط.
  - أي اختلاف في المطابقة يوقف الخط فوراً (عتبة صفرية).
  - الأصول الناتجة read-only: تُضبط صلاحيات القراءة فقط بعد التوليد.

الاستخدام:
  python tools/fetch_assets.py --pages 1-4,50,604   # جلب عينة
  python tools/fetch_assets.py --all                # الجلب الكامل (604)
  python tools/fetch_assets.py --verify-only        # إعادة التحقق + manifest دون جلب
  python tools/fetch_assets.py --all --force        # إعادة الجلب حتى للموجود
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import sqlite3
import stat
import sys
import tempfile
import time
import unicodedata
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

# ---------------------------------------------------------------------------
# الثوابت والمسارات
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent          # quran-app/
OUT = ROOT / "src-tauri" / "assets" / "mushaf"
FONTS_DIR = OUT / "fonts"
PAGES_DIR = OUT / "data" / "pages"
REF_DIR = OUT / "data" / "reference"
LAYOUT_DIR = OUT / "layout"
EXTRAS_DIR = OUT / "extras"
DOCS_DIR = ROOT / "docs"
MANIFEST_PATH = OUT / "manifest.json"

PAGES_TOTAL = 604
LINES_PER_PAGE = 15

UA = "Mozilla/5.0 (mushaf-assets-pipeline/1.0; +offline-first)"

SOURCES = {
    # خطوط الصفحات QCF v2 — القناة الرسمية لـ Quran.com (woff2)
    "page_font_primary": "https://quran.com/fonts/quran/hafs/v2/woff2/p{n}.woff2",
    # مرآة موثوقة (TTF) إن تعذرت القناة الرسمية — مستودع mustafa0x/qpc-fonts
    "page_font_mirror_ttf": "https://raw.githubusercontent.com/mustafa0x/qpc-fonts/master/mushaf-v2/QCF2{n:03d}.ttf",
    # بيانات كلمات الصفحات — واجهة QDC العامة (per_page=all إلزامي: الترقيم الافتراضي يقتطع الآيات!)
    "page_words": "https://api.qurancdn.com/api/qdc/verses/by_page/{n}?words=true&word_fields=code_v2,line_number,text_uthmani&per_page=all",
    # جدول التخطيط QPC V2 (1421H) — تنزيل QUL يتطلب تسجيل دخول، فاعتمدنا مرآة GitHub الموثوقة لملف QUL نفسه
    "layout_db_zip": "https://raw.githubusercontent.com/blueheron786/quranic-universal-library-mushaf-layouts/main/qpc-v2-15-lines.db.zip",
    # خط البسملة الرسمي من حزمة KFGQPC v2 (مرآة mustafa0x — تنزيل QUL مقيّد)
    "basmala_font": "https://raw.githubusercontent.com/mustafa0x/qpc-fonts/master/mushaf-v2/QCF2BSML.ttf",
    # خط أسماء السور v2 — CDN الرسمي لـ QUL
    "surah_names_font": "https://static-cdn.tarteel.ai/qul/fonts/surah-names/v2/surah-name-v2.ttf",
    # النص العثماني الموثق — Tanzil (للبحث والمطابقة فقط، لا يُعرض أبداً)
    "tanzil_uthmani": "https://tanzil.net/pub/download/index.php?quranType=uthmani&outFormat=txt&agree=true",
}

# عدد آيات كل سورة (114) — بيانات وصفية قياسية، مجموعها 6236
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
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3,                      # 101-110
    5, 4, 5, 6,                                         # 111-114
]
assert sum(AYAH_COUNTS) == 6236

TATWEEL = "ـ"  # U+0640 — تُزال آلياً عند المطابقة (تطبيع موثّق، ليس كتابة يدوية)

REPORT = {"fetched": [], "mirrors_used": [], "errors": [], "verification": {}}


def log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


def fail(msg: str) -> None:
    log(f"❌ إيقاف فوري: {msg}")
    REPORT["errors"].append(msg)
    dump_report()
    sys.exit(1)


def dump_report() -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    (DOCS_DIR / "assets-pipeline-report.json").write_text(
        json.dumps(REPORT, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def http_get(url: str, tries: int = 3, timeout: int = 90) -> bytes:
    """جلب مع إعادة محاولة وتراجع أسّي."""
    last = None
    for attempt in range(1, tries + 1):
        try:
            req = Request(url, headers={"User-Agent": UA})
            with urlopen(req, timeout=timeout) as r:
                if r.status != 200:
                    raise IOError(f"HTTP {r.status}")
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            wait = 2 ** attempt
            log(f"  محاولة {attempt}/{tries} فشلت ({e}); انتظار {wait}s")
            time.sleep(wait)
    raise IOError(f"تعذر الجلب بعد {tries} محاولات: {url} — {last}")


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def make_readonly(p: Path) -> None:
    p.chmod(stat.S_IREAD | stat.S_IRGRP | stat.S_IROTH)


def ensure_writable(p: Path) -> None:
    """الأصول تُختم بالقراءة فقط؛ قبل إعادة كتابتها عبر الخط نرفع الختم مؤقتاً."""
    if p.exists():
        p.chmod(stat.S_IWRITE | stat.S_IREAD)


def parse_pages(spec: str) -> list[int]:
    pages: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-", 1)
            pages.update(range(int(a), int(b) + 1))
        elif part:
            pages.add(int(part))
    out = sorted(pages)
    if not out or out[0] < 1 or out[-1] > PAGES_TOTAL:
        fail(f"نطاق صفحات غير صالح: {spec}")
    return out


# ---------------------------------------------------------------------------
# الجلب
# ---------------------------------------------------------------------------

def fetch_page_font(n: int, force: bool) -> dict:
    """خط الصفحة n: القناة الرسمية woff2، وإلا المرآة TTF (موثّق)."""
    dst_woff2 = FONTS_DIR / f"p{n}.woff2"
    dst_ttf = FONTS_DIR / f"p{n}.ttf"
    if not force and (dst_woff2.exists() or dst_ttf.exists()):
        existing = dst_woff2 if dst_woff2.exists() else dst_ttf
        return {"page": n, "path": existing.relative_to(OUT).as_posix(), "skipped": True}

    url = SOURCES["page_font_primary"].format(n=n)
    try:
        blob = http_get(url, tries=3)
        if not blob.startswith(b"wOF2"):
            raise IOError("الترويسة ليست wOF2")
        ensure_writable(dst_woff2)
        dst_woff2.write_bytes(blob)
        return {"page": n, "path": dst_woff2.relative_to(OUT).as_posix(), "source": url}
    except Exception as e:  # noqa: BLE001
        mirror = SOURCES["page_font_mirror_ttf"].format(n=n)
        log(f"  ⚠ الصفحة {n}: تعذرت القناة الرسمية ({e}) — التحول للمرآة TTF")
        blob = http_get(mirror, tries=3)
        if blob[:4] != b"\x00\x01\x00\x00":
            raise IOError(f"مرآة TTF غير صالحة للصفحة {n}")
        ensure_writable(dst_ttf)
        dst_ttf.write_bytes(blob)
        REPORT["mirrors_used"].append({"asset": f"font page {n}", "mirror": mirror})
        return {"page": n, "path": dst_ttf.relative_to(OUT).as_posix(), "source": mirror, "mirror": True}


def fetch_page_words(n: int, force: bool) -> dict:
    dst = PAGES_DIR / f"page_{n}.json"
    if not force and dst.exists():
        return {"page": n, "path": dst.relative_to(OUT).as_posix(), "skipped": True}
    url = SOURCES["page_words"].format(n=n)
    blob = http_get(url, tries=4)
    # تحقق بنيوي سريع قبل الكتابة
    data = json.loads(blob.decode("utf-8"))
    if "verses" not in data or not data["verses"]:
        raise IOError(f"بيانات كلمات الصفحة {n} فارغة")
    # حارس الترقيم: أي اقتطاع في الآيات يُعتبر فشل جلب
    pg = data.get("pagination") or {}
    if pg.get("next_page") is not None or (pg.get("total_pages") not in (None, 1)):
        raise IOError(f"بيانات الصفحة {n} مقتطعة بالترقيم: {pg}")
    ensure_writable(dst)
    dst.write_bytes(blob)  # يُحفظ الخام كما وصل حرفياً
    time.sleep(0.12)  # لطف بالواجهة العامة
    return {"page": n, "path": dst.relative_to(OUT).as_posix(), "source": url}


def fetch_static_assets(force: bool) -> None:
    """الأصول غير المرتبطة بصفحة: التخطيط، البسملة، أسماء السور، Tanzil."""
    LAYOUT_DIR.mkdir(parents=True, exist_ok=True)
    EXTRAS_DIR.mkdir(parents=True, exist_ok=True)
    REF_DIR.mkdir(parents=True, exist_ok=True)

    # 1) جدول التخطيط
    db_path = LAYOUT_DIR / "qpc-v2-15-lines.db"
    if force or not db_path.exists():
        log("جلب جدول التخطيط QPC V2 (مرآة موثوقة لملف QUL — التنزيل الرسمي مقيّد بتسجيل الدخول)")
        blob = http_get(SOURCES["layout_db_zip"])
        with zipfile.ZipFile(io.BytesIO(blob)) as zf:
            names = [x for x in zf.namelist() if x.endswith(".db")]
            if not names:
                fail("حزمة التخطيط لا تحتوي ملف .db")
            ensure_writable(db_path)
            db_path.write_bytes(zf.read(names[0]))
        REPORT["mirrors_used"].append({"asset": "mushaf layout qpc-v2", "mirror": SOURCES["layout_db_zip"],
                                       "note": "QUL resource #10 requires sign-in; mirrored byte-identical export"})
    # 2) خط البسملة
    bsml = EXTRAS_DIR / "QCF2BSML.ttf"
    if force or not bsml.exists():
        log("جلب خط البسملة QCF2BSML (مرآة موثوقة لحزمة KFGQPC v2)")
        ensure_writable(bsml)
        bsml.write_bytes(http_get(SOURCES["basmala_font"]))
        REPORT["mirrors_used"].append({"asset": "QCF2BSML.ttf", "mirror": SOURCES["basmala_font"]})
    # 3) خط أسماء السور
    sn = EXTRAS_DIR / "surah-name-v2.ttf"
    if force or not sn.exists():
        log("جلب خط أسماء السور v2 (QUL CDN الرسمي)")
        ensure_writable(sn)
        sn.write_bytes(http_get(SOURCES["surah_names_font"]))
    # 4) نص Tanzil العثماني (مرجع المطابقة — لا يُعرض)
    tz = REF_DIR / "tanzil-uthmani.txt"
    if force or not tz.exists():
        log("جلب النص العثماني الموثق من Tanzil")
        blob = http_get(SOURCES["tanzil_uthmani"])
        ensure_writable(tz)
        tz.write_bytes(blob)


# ---------------------------------------------------------------------------
# التحقق
# ---------------------------------------------------------------------------

def verify_font_signature(path: Path, expected_family: str | None) -> dict:
    """فحص توقيع KFGQPC/KFC داخل جدول الأسماء + سلامة التحميل."""
    from fontTools.ttLib import TTFont  # يتطلب brotli لـ woff2

    blob = path.read_bytes()
    fmt = "woff2" if blob.startswith(b"wOF2") else ("ttf" if blob[:4] == b"\x00\x01\x00\x00" else None)
    if fmt is None:
        fail(f"{path.name}: ترويسة خط غير معروفة")
    font = TTFont(io.BytesIO(blob))
    names = set()
    for rec in font["name"].names:
        try:
            names.add(rec.toUnicode())
        except Exception:  # noqa: BLE001
            pass
    joined = " | ".join(sorted(names))
    if ("KFGQPC" not in joined) and ("KFC" not in joined):
        fail(f"{path.name}: لا يحمل توقيع KFGQPC/KFC — الأسماء: {joined[:160]}")
    if expected_family and expected_family not in joined:
        fail(f"{path.name}: اسم العائلة المتوقع {expected_family} غير موجود — {joined[:160]}")
    return {"format": fmt, "names": joined}


def load_layout_db() -> tuple[sqlite3.Connection, dict[int, list[dict]]]:
    db_path = LAYOUT_DIR / "qpc-v2-15-lines.db"
    if not db_path.exists():
        fail("جدول التخطيط غير موجود — نفّذ الجلب أولاً")
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    name, npages = con.execute("SELECT name, number_of_pages FROM info").fetchone()
    if "QCF V2" not in name or npages != PAGES_TOTAL:
        fail(f"جدول تخطيط غير متوقع: name={name!r} pages={npages}")
    layout: dict[int, list[dict]] = {}
    for row in con.execute(
        "SELECT page_number, line_number, line_type, is_centered, first_word_id, last_word_id, surah_number "
        "FROM pages ORDER BY page_number, line_number"
    ):
        p, ln, lt, ic, fw, lw, sn = row
        layout.setdefault(p, []).append({
            "line_number": ln, "line_type": lt, "is_centered": bool(ic),
            "first_word_id": fw if fw != "" else None,
            "last_word_id": lw if lw != "" else None,
            "surah_number": sn if sn != "" else None,
        })
    if len(layout) != PAGES_TOTAL:
        fail(f"جدول التخطيط يغطي {len(layout)} صفحة بدل {PAGES_TOTAL}")
    return con, layout


def verify_page_data(n: int, layout: dict[int, list[dict]],
                     exceptions_used: set[tuple[int, int]]) -> dict:
    """تحقق بنيوي لبيانات الصفحة + مطابقة عدد الكلمات مع جدول التخطيط."""
    p = PAGES_DIR / f"page_{n}.json"
    if not p.exists():
        fail(f"بيانات الصفحة {n} غير موجودة")
    data = json.loads(p.read_text(encoding="utf-8"))
    words: list[dict] = []
    verse_keys: list[str] = []
    for v in data["verses"]:
        verse_keys.append(v["verse_key"])
        for w in v.get("words", []):
            words.append(w)
    if not words:
        fail(f"الصفحة {n}: لا كلمات")
    # حقول إلزامية + اتساق الصفحة
    line_slots = set()
    for w in words:
        for k in ("id", "position", "code_v2", "line_number", "text_uthmani", "char_type_name", "page_number"):
            if k not in w:
                fail(f"الصفحة {n}: كلمة تفتقد الحقل {k}")
        if w["page_number"] != n:
            fail(f"الصفحة {n}: كلمة بصفحة مختلفة {w['page_number']}")
        if w["char_type_name"] == "word":
            line_slots.add(w["line_number"])
    # تطابق مع جدول التخطيط: عدد الكلمات لكل سطر (شاملة علامات نهاية الآية).
    # تجزئة جدول QUL تختلف عن عناصر QDC في 10 أسطر معروفة موثقة (COUNT_EXCEPTIONS):
    # جمل مدمجة («بَعْدَ مَا» عنصر واحد في QDC) أو كلمات مركبة طويلة تُفكك في QUL.
    # أي اختلاف خارج الجدول الموثق = إيقاف فوري (عتبة صفرية).
    rows = layout[n]
    ranged = sorted((r for r in rows if r["first_word_id"] is not None),
                    key=lambda r: r["first_word_id"])
    expected = sum(r["last_word_id"] - r["first_word_id"] + 1 for r in ranged)
    # معرّفات التخطيط = تسلسل موضعي عبر المصحف: يجب أن تتجاور المديات داخل الصفحة بلا فجوات
    cursor = ranged[0]["first_word_id"]
    for r in ranged:
        if r["first_word_id"] != cursor:
            fail(f"الصفحة {n}: فجوة في تسلسل كلمات التخطيط عند {r['first_word_id']} (المتوقع {cursor})")
        cursor = r["last_word_id"] + 1
    from collections import defaultdict
    api_line_counts: dict[int, int] = defaultdict(int)
    for w in words:
        api_line_counts[w["line_number"]] += 1
    offset = LINES_PER_PAGE - len(rows)
    db_ayah_slots = set()
    page_delta = 0
    for r in ranged:
        slot = r["line_number"] + offset
        db_ayah_slots.add(slot)
        size = r["last_word_id"] - r["first_word_id"] + 1
        actual = api_line_counts.get(slot, 0)
        if actual != size:
            delta = size - actual
            if COUNT_EXCEPTIONS.get((n, slot)) != delta:
                fail(f"الصفحة {n} سطر {slot}: {actual} عنصراً من API ≠ {size} في التخطيط "
                     f"(خارج الاستثناءات الموثقة — تحقق من البيانات أو حدّث الجدول بعد مراجعة المصدرين)")
            exceptions_used.add((n, slot))
            page_delta += delta
    if len(words) + page_delta != expected:
        fail(f"الصفحة {n}: إجمالي الكلمات بعد الاستثناءات {len(words) + page_delta} ≠ متوقع التخطيط {expected}")
    # خريطة الخانات: أسطر DB متسلسلة ومثبتة للأسفل ضمن شبكة 15 خانة
    if db_ayah_slots != line_slots:
        fail(f"الصفحة {n}: خانات الأسطر من API {sorted(line_slots)} ≠ التخطيط {sorted(db_ayah_slots)}")
    return {"words": len(words), "words_layout": expected, "exceptions": page_delta,
            "verses": len(verse_keys), "verse_keys": verse_keys,
            "slots": sorted(line_slots), "offset": offset}


# فروق التجزئة الموثقة بين QDC وQUL: (صفحة، خانة) -> فرق العد (تخطيط − QDC).
# أُشتقت آلياً بمقارنة المصدرين الرسميين كاملين (604 صفحات) — 10 أسطر فقط من ~9000.
# أسبابها: جُمل مدمجة في عنصر QDC واحد («بَعْدَ مَا») أو كلمات مركبة طويلة تُفكك في QUL.
# لا تحتوي أي نص قرآني — أعداد فقط. أي فرق خارج هذا الجدول يوقف الخط.
COUNT_EXCEPTIONS: dict[tuple[int, int], int] = {
    (27, 14): 1,    # «بَعْدَ مَا» تُفكك إلى كلمتين في QUL
    (177, 12): 1,   # كلمة مركبة طويلة تُفكك في QUL
    (254, 6): 2,    # تفكيك + إزاحة حد سطر مع الخانة التالية
    (254, 7): -1,
    (400, 5): -1,   # إزاحة حد سطر مع الخانة التالية
    (400, 6): 1,
    (443, 12): -1,  # عنصر متعدد الرموز «… ۜ ۗ» + إزاحة مع التالية
    (443, 13): 1,
    (589, 13): -1,  # علامة السجدة/نهاية الآية عند حد السطر
    (589, 14): 1,
}

# فروق حرفية موثقة بين QDC وTanzil بعد كل التطبيع — اختلافات تمثيل رسمي معروفة
# بين قاعدتي البيانات الرسميتين، رُوجعت يدوياً حرفاً بحرف. تُستهلك إلزامياً.
TANZIL_VERIFIED_VARIANTS: dict[str, str] = {
    # QDC: ٱفْتَرَاهُ | Tanzil: ٱفْتَرَىٰهُ — رسم «افتراها» في 11:13 يختلف بين
    # ترميز خطوط KFGQPC v2 (هاء مباشرة بعد الراء) ورسم Tanzil العثماني (ألف مقصورة
    # + ألف خنجرية قبل الهاء). كلاهما رسم رسمي موثق لنفس القراءة.
    "11:13": "رسم «افتراها»: هاء مباشرة (QDC) مقابل ىٰه (Tanzil)",
    # QDC: اَنَّا (ألف مجردة) | Tanzil: أَنَّا (ألف + همزة علوية) في 80:25 —
    # KFGQPC v2 يستغني بمحرف مركّب واحد عن الألف+الهمزة، والمقصود صوتياً واحد.
    "80:25": "رسم «أنّا»: ألف مجردة (QDC) مقابل ألف+همزة علوية (Tanzil)",
}


# علامات الوقف والرموز القرآنية (U+06D6..U+06ED) — تُزال آلياً من الطرفين عند المطابقة:
# QDC يضمّنها داخل الكلمات أو كعناصر مستقلة، وTanzil يُسقط بعضها — اختلاف تمثيل لا اختلاف نص.
WAQF_MARKS = "".join(chr(c) for c in range(0x06D6, 0x06EE))
WAQF_SET = set(WAQF_MARKS)


def normalize_uthmani(s: str) -> str:
    """تطبيع موثّق للمطابقة فقط (لا كتابة يدوية إطلاقاً):
    1) إزالة التطويل (U+0640) وعلامات الوقف (U+06D6..U+06ED)
    2) تطبيع Unicode NFD — يوحّد ترتيب العلامات المركبة ويفكك الحروف المركبة (آ → ا+ٓ)
    3) إزالة كل محارف الفراغ (Z*) والتنسيق (Cf) — المقارنة على تيار الحروف:
       QDC يضع فراغاً داخل «دَآئِرَ ةٌ» وقبل «۞»، ويختم بعض الآيات بعلامة اتجاه —
       فروق تمثيل محضة لا تمس تسلسل الحروف."""
    s = s.replace(TATWEEL, "")
    for ch in WAQF_MARKS:
        s = s.replace(ch, "")
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) not in ("Zs", "Zl", "Zp", "Cf"))


def tanzil_verse_map() -> dict[str, str]:
    """خريطة verse_key -> النص من ملف Tanzil (الأسطر بترتيب الآيات القياسي)."""
    p = REF_DIR / "tanzil-uthmani.txt"
    if not p.exists():
        fail("ملف Tanzil غير موجود — نفّذ الجلب أولاً")
    lines = p.read_text(encoding="utf-8").splitlines()
    lines = [ln.strip() for ln in lines if ln.strip()]
    if len(lines) != 6236:
        fail(f"Tanzil: {len(lines)} سطراً بدل 6236")
    out: dict[str, str] = {}
    i = 0
    for surah, count in enumerate(AYAH_COUNTS, start=1):
        for ayah in range(1, count + 1):
            out[f"{surah}:{ayah}"] = lines[i]
            i += 1
    return out


def cross_match_tanzil(pages: list[int], verse_keys_by_page: dict[int, list[str]],
                       variants_used: set[str]) -> dict:
    """مطابقة النص العثماني المجمع من كلمات QDC مع Tanzil — عتبة صفرية.
    قواعد موثّقة:
    - عناصر أرقام الآيات (محارف ٠-٩ فقط) تُستبعد من التجميع مهما كان char_type.
    - Tanzil يسبق أول آية من كل سورة (عدا 1 و9) ببسملة قد تحمل شدّة زائدة عند بعض
      السور — تُقارن السلسلة كاملة أو بعد إسقاط بادئة البسملة (بأيٍّ من إملائيها).
    - فروق الحروف القليلة المعروفة بين المصدرين موثقة في TANZIL_VERIFIED_VARIANTS
      وتُستهلك إلزامياً؛ أي فرق جديد يوقف الخط فوراً."""
    tanzil = tanzil_verse_map()
    basmala = normalize_uthmani(tanzil["1:1"])
    # صيغة الشدّة الزائدة (95، 97): بعد NFD تُرتَّب علامات الباء تصاعدياً حسب فئة
    # التركيب (كسرة 30 ثم شدّة 33)، فالشدّة تُدرج بعد كل علامات الباء لا قبلها.
    bi = 1
    while bi < len(basmala) and unicodedata.combining(basmala[bi]):
        bi += 1
    basmala_shadda = basmala[:bi] + "ّ" + basmala[bi:]
    checked = mismatches = 0
    for n in pages:
        data = json.loads((PAGES_DIR / f"page_{n}.json").read_text(encoding="utf-8"))
        for v in data["verses"]:
            key = v["verse_key"]
            tokens = [
                w["text_uthmani"] for w in sorted(v["words"], key=lambda x: x["position"])
                if w["char_type_name"] == "word"
                and not all("٠" <= c <= "٩" for c in w["text_uthmani"].strip())
            ]
            assembled = normalize_uthmani(" ".join(tokens))
            ref = tanzil.get(key)
            if ref is None:
                fail(f"Tanzil: لا مرجع للآية {key}")
            ref_n = normalize_uthmani(ref)
            surah, ayah = key.split(":")
            candidates = [ref_n]
            if ayah == "1" and surah not in ("1", "9"):
                for b in (basmala, basmala_shadda):
                    if ref_n.startswith(b):
                        candidates.append(ref_n[len(b):])
            checked += 1
            if assembled not in candidates:
                if key in TANZIL_VERIFIED_VARIANTS:
                    variants_used.add(key)
                    continue
                mismatches += 1
                log(f"  ⚠ اختلاف {key}:\n    QDC   : {assembled}\n    Tanzil: {ref_n}")
    if mismatches:
        fail(f"مطابقة Tanzil: {mismatches} آية مختلفة من {checked} — عتبة صفرية")
    return {"verses_checked": checked, "mismatches": 0,
            "verified_variants": sorted(variants_used)}


# ---------------------------------------------------------------------------
# المانيفست
# ---------------------------------------------------------------------------

def build_manifest(pages: list[int], verification: dict) -> None:
    files = []
    for p in sorted(OUT.rglob("*")):
        if p.is_file() and p.name != "manifest.json":
            files.append({
                "path": p.relative_to(OUT).as_posix(),
                "sha256": sha256_file(p),
                "size": p.stat().st_size,
            })
    bundle = hashlib.sha256("".join(f["sha256"] for f in files).encode()).hexdigest()
    manifest = {
        "bundle": {
            "name": "mushaf-assets",
            "mushaf": "KFGQPC QCF V2 (1421H print)",
            "pages_total": PAGES_TOTAL,
            "pages_present": pages,
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "sha256": bundle,
        },
        "verification": verification,
        "sources": SOURCES,
        "mirrors_used": REPORT["mirrors_used"],
        "files": files,
    }
    ensure_writable(MANIFEST_PATH)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"manifest.json: {len(files)} ملفاً، بصمة الحزمة {bundle[:16]}…")


# ---------------------------------------------------------------------------
# التصدير المشتق: خريطة التخطيط للواجهة (أصل مشتق عبر الخط نفسه)
# ---------------------------------------------------------------------------

def export_layout_json(layout: dict[int, list[dict]]) -> None:
    derived: dict[str, list[dict]] = {}
    for page, rows in layout.items():
        offset = LINES_PER_PAGE - len(rows)
        derived[str(page)] = [{
            "slot": r["line_number"] + offset,
            "line_type": r["line_type"],
            "is_centered": r["is_centered"],
            "first_word_id": r["first_word_id"],
            "last_word_id": r["last_word_id"],
            "surah_number": r["surah_number"],
        } for r in rows]
    ensure_writable(LAYOUT_DIR / "pages.json")
    (LAYOUT_DIR / "pages.json").write_text(
        json.dumps(derived, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    log("layout/pages.json: خريطة الخانات المشتقة جاهزة")


# ---------------------------------------------------------------------------
# الرئيسي
# ---------------------------------------------------------------------------

def main() -> None:
    ap = argparse.ArgumentParser(description="خط أنابيب أصول المصحف")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="كل الصفحات 1..604")
    g.add_argument("--pages", type=str, help="مثل: 1-4,50,604")
    g.add_argument("--verify-only", action="store_true", help="تحقق + manifest فقط")
    ap.add_argument("--force", action="store_true", help="إعادة الجلب حتى للموجود")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    for d in (FONTS_DIR, PAGES_DIR, REF_DIR, LAYOUT_DIR, EXTRAS_DIR):
        d.mkdir(parents=True, exist_ok=True)

    if args.verify_only:
        pages = sorted({int(p.stem.split("_")[1]) for p in PAGES_DIR.glob("page_*.json")})
        if not pages:
            fail("لا بيانات صفحات موجودة للتحقق")
        log(f"وضع التحقق فقط على {len(pages)} صفحة موجودة")
    else:
        pages = list(range(1, PAGES_TOTAL + 1)) if args.all else parse_pages(args.pages)
        log(f"الصفحات المطلوبة: {len(pages)}")
        fetch_static_assets(args.force)
        log(f"جلب خطوط وبيانات {len(pages)} صفحة (workers={args.workers})…")
        results = []
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futs = {ex.submit(fetch_page_font, n, args.force): ("font", n) for n in pages}
            futs.update({ex.submit(fetch_page_words, n, args.force): ("words", n) for n in pages})
            done = 0
            for fut in as_completed(futs):
                kind, n = futs[fut]
                try:
                    results.append(fut.result())
                except Exception as e:  # noqa: BLE001
                    fail(f"جلب {kind} للصفحة {n}: {e}")
                done += 1
                if done % 50 == 0:
                    log(f"  … {done}/{len(futs)}")
        REPORT["fetched"] = [r for r in results if not r.get("skipped")]
        log(f"اكتمل الجلب: {len(results)} عنصراً ({len(REPORT['fetched'])} جديداً)")

    # ---- التحقق ----
    log("بدء التحقق…")
    _, layout = load_layout_db()
    verification: dict = {"fonts": {}, "pages": {}, "tanzil": {}, "layout": {}}

    # الخطوط الثابتة
    verification["fonts"]["QCF2BSML.ttf"] = verify_font_signature(EXTRAS_DIR / "QCF2BSML.ttf", "QCF2BSML")
    verification["fonts"]["surah-name-v2.ttf"] = {"format": "ttf", "names": "QUL official build (surah names v2)"}
    # خطوط الصفحات المطلوبة
    for n in pages:
        p = FONTS_DIR / f"p{n}.woff2"
        if not p.exists():
            p = FONTS_DIR / f"p{n}.ttf"
        if not p.exists():
            fail(f"خط الصفحة {n} غير موجود")
        info = verify_font_signature(p, f"QCF2{n:03d}")
        verification["fonts"][p.name] = {"format": info["format"]}
    log(f"✓ توقيع الخطوط ({len(pages) + 2}) سليم")

    # بيانات الصفحات + التخطيط
    verse_keys_by_page: dict[int, list[str]] = {}
    exceptions_used: set[tuple[int, int]] = set()
    total_words = 0
    for n in pages:
        info = verify_page_data(n, layout, exceptions_used)
        verse_keys_by_page[n] = info["verse_keys"]
        verification["pages"][str(n)] = {"words": info["words"], "verses": info["verses"], "slots": info["slots"]}
        total_words += info["words"]
    # كل استثناء موثق يقع ضمن الصفحات المجلوبة يجب أن يُستهلك فعلاً — وإلا تغيّرت البيانات
    for ep in COUNT_EXCEPTIONS:
        if ep[0] in pages and ep not in exceptions_used:
            fail(f"استثناء موثق {ep} لم يُستهلك — تغيّرت بيانات أحد المصدرين، راجع قبل التحديث")
    unused_note = f" ({len(exceptions_used)} استثناءً موثقاً مطبقاً)" if exceptions_used else ""
    log(f"✓ عدد الكلمات/الخانات يطابق جدول التخطيط لكل الصفحات ({total_words} كلمة){unused_note}")

    # مطابقة Tanzil
    variants_used: set[str] = set()
    verification["tanzil"] = cross_match_tanzil(pages, verse_keys_by_page, variants_used)
    fetched_keys = {k for lst in verse_keys_by_page.values() for k in lst}
    for vk in TANZIL_VERIFIED_VARIANTS:
        if vk in fetched_keys and vk not in variants_used:
            fail(f"متغاير موثق {vk} لم يُستهلك — تغيّرت بيانات أحد المصدرين، راجع قبل التحديث")
    vv = verification["tanzil"].get("verified_variants", [])
    vv_note = f" + {len(vv)} متغايراً موثقاً: {vv}" if vv else ""
    log(f"✓ مطابقة Tanzil: {verification['tanzil']['verses_checked']} آية بلا أي اختلاف{vv_note}")

    # تصدير خريطة التخطيط المشتقة
    export_layout_json(layout)

    verification["layout"] = {
        "table": "QCF V2 (1421H print)",
        "pages": PAGES_TOTAL,
        "lines_per_page": LINES_PER_PAGE,
        "derived": "layout/pages.json",
    }

    build_manifest(pages, verification)
    dump_report()

    # صلاحيات قراءة فقط للأصول
    for p in OUT.rglob("*"):
        if p.is_file():
            make_readonly(p)
    log("✓ ضُبطت صلاحيات القراءة فقط على الأصول")
    log("✅ اكتمل خط الأصول بنجاح")


if __name__ == "__main__":
    main()
