// أنواع بيانات المصحف — حزمة QCF4 (طبعة 1441هـ، quran-qcf4@1.0.3).
// القاعدة المحسومة: لا يُعرض أي نص عربي من هذه البيانات؛ العرض = char (رموز PUA) فقط.
// حقل text مرجع للمطابقة والبحث فقط، لا يُعرض أبداً.

/** كلمة واحدة في سطر QCF4 */
export interface Qcf4Word {
  /** نقطة الترميز PUA الرقمية (مرادف char) */
  code: number
  /** محرف الـGlyph (مجال PUA) — هذا وحده ما يُعرض */
  char: string
  /** عائلة الخط الحاملة للمحرف (مثل QCF4_Hafs_29 أو QCF4_QBSML) */
  font: string
  /** النص المرجعي — لا يُعرض أبداً */
  text: string
  /** word = كلمة · end = علامة نهاية آية · quarter = علامة ربع · أثاث الصفحة */
  type: 'word' | 'end' | 'quarter' | 'bismillah' | 'surah_header'
  verse_key?: string
  sura?: number
  position?: number | null
}

/** سطر واحد في صفحة QCF4 — نوعه من نوع أول كلماته */
export interface Qcf4Line {
  line: number
  words: Qcf4Word[]
}

export interface Qcf4SurahRef {
  id: number
  name: string
  name_arabic: string
  verse_start: number
  verse_end: number
}

/** صفحة كاملة: خطها الأساسي + السور المارة بها + أسطرها الجاهزة */
export interface Qcf4Page {
  page: number
  font: string
  surahs: Qcf4SurahRef[]
  lines: Qcf4Line[]
}

/** مدخل واحد في البيانات الوصفية المشتقة (layout/meta.json) */
export interface MetaEntry {
  n: number
  page: number
}

/** بدايات السور/الأجزاء/الأحزاب/الأرباع — مشتقة عبر tools/build_meta.py */
export interface MushafMeta {
  surahs: MetaEntry[]
  juz: MetaEntry[]
  hizb: MetaEntry[]
  rub: MetaEntry[]
}

export interface ManifestFile {
  path: string
  sha256: string
  size: number
}

export interface Manifest {
  bundle: {
    name: string
    mushaf: string
    pages_total: number
    pages_present: number[]
    generated_at_utc: string
    sha256: string
  }
  files: ManifestFile[]
}
