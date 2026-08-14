// بحث المصحف الفوري (3.3) — دون اتصال، بلا خادم.
// المصدر: verses-text.json (عثماني + مُطبَّع) المولَّد من أصول الصفحات نفسها.
// قاعدة الخطة: النص العثماني للبحث والمطابقة فقط — لا يُعرض للمستخدم أبداً؛
// النتيجة تُعرض كمرجع (سورة/آية/صفحة) وتُفتح مظلَّلة على صفحة المصحف.
import { fetchJson } from './assets'

export interface VerseText {
  /** النص العثماني */
  t: string
  /** المُطبَّع: بلا تشكيل، موحَّد الألف/الهمزات/التاء المربوطة/الألف المقصورة */
  n: string
}

let cache: Promise<Record<string, VerseText>> | null = null
export function loadVersesText(): Promise<Record<string, VerseText>> {
  if (cache) return cache
  const request = fetchJson<Record<string, VerseText>>('verses-text.json')
  const cached = request.catch((error: unknown) => {
    if (cache === cached) cache = null
    throw error
  })
  cache = cached
  return cached
}

/** نفس تطبيع build_tafsir.py حرفياً — أي اختلاف يكسر التطابق */
export function normalizeArabic(s: string): string {
  let out = s.normalize('NFKC')
  // النطاقات نفسها في build_tafsir.py، مكتوبة بنقاط الترميز لئلا تبدو محارف
  // الضبط المجمعة كأنها أحرف مستقلة مضللة؛ النتيجة الحرفية لا تتغير.
  out = out.replace(/[\u064B-\u0652\u0670\u0640]|[\u06D6-\u06ED]|[\u06EA-\u06FB]/gu, '')
  out = out
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
  out = out.replace(/[^ء-غف-ي٠-٩\s]/g, ' ')
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * المفتاح الفضفاض — جسر بين الرسم العثماني والإملاء المعتاد.
 *
 * المشكلة: عمود التطبيع `n` مبنيّ على الرسم العثماني كما ورد في الأصل، وفيه
 * الألف الخنجرية مكتوبةً ألفاً تامة، والهمزة الممدودة مفكوكةً «ءا»، وبعض
 * الكلمات موصولة. فما يكتبه المستخدم بإملائه المعتاد لا يطابقه أبداً:
 *
 *   المستخدم يكتب   الفهرس يحوي     النتائج قبل الإصلاح
 *   الصلاة          الصلواه         صفر في المصحف كله
 *   الزكاة          الزكواه         صفر
 *   الحياة الدنيا   الحيواه الدنيا  صفر (٦٤ آية غير قابلة للوصول)
 *   آمنوا           ءامنوا          صفر
 *   يا أيها         ياايها          صفر
 *   الرحمن          الرحمن (٢٥) + الرحمان (٢٣)  ← ٢٥ فقط، والباقي يختفي صامتاً
 *   هذا             هذا (١٨٢) + هاذا (٣٧)
 *   لكن             لكن (٤٥) + لاكن (١٢٧)
 *
 * الحل: مفتاح ثانٍ تُحذف منه الألف والهمزة والفراغات من الطرفين معاً، فتتساوى
 * الرسمتان. يُستعمل مكمِّلاً لا بديلاً: المطابقة الحرفية تُرتَّب أولاً ثم
 * تُلحق بها المطابقات الفضفاضة، فلا تُفقد دقة ولا تُفقد آية.
 */
export function looseKey(normalized: string): string {
  return (
    normalized
      // «ءا» ← «آ» المفكوكة في الأصل: ءامنوا ⇦ آمنوا
      .replace(/ءا/g, 'ا')
      // ألف خنجرية فوق الواو كُتبت ألفاً تامة: الصلواة/الزكواة/الحيواة ⇦ الصلاة…
      // القيد (\S) يمنع مسّ واو أول الكلمة (والله، واحد) فتبقى كما هي
      .replace(/(\S)وا/g, '$1ا')
      // إسقاط الألف والهمزة: يسوّي الرحمن/الرحمان، هذا/هاذا، لكن/لاكن
      .replace(/[اء]/g, '')
      // الفراغات تبقى — إسقاطها كان يلصق الكلمات فيولّد مطابقات كاذبة
      // («الصلاة» كانت تطابق «مخلصًا له الدين»). التسامح مع الكلمات الموصولة
      // في الأصل (ياايها) يأتي من \s* في الاستعلام لا من حذف الفراغ هنا.
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * أقصر استعلام فضفاض مقبول (حروفه بلا فراغات).
 * قيس على البيانات: عند ٣ يلتقط «لكن» ١٣١ آية فيها «ولٰكن» بلا ضجيج يُذكر،
 * وعند ٤ تضيع كلها. وفي مصحف، ضياع آية أسوأ من ظهور آية زائدة قريبة —
 * فالمطابقات الحرفية مرتَّبة أولاً والعدد معروض، والقارئ يميّز بنظرة.
 */
const MIN_LOOSE = 3

export interface SearchHit {
  /** «سورة:آية» */
  key: string
  surah: number
  ayah: number
}

export interface SearchResult {
  hits: SearchHit[]
  /** عدد المطابقات الكلي قبل القص */
  total: number
  query: string
}

const MAX_HITS = 200

/** فهرس المفاتيح الفضفاضة — يُبنى مرة واحدة عند أول بحث ويُخبّأ */
let looseIndex: { keys: string[]; loose: string[] } | null = null
function ensureLooseIndex(data: Record<string, VerseText>) {
  if (looseIndex) return looseIndex
  const keys = Object.keys(data)
  looseIndex = { keys, loose: keys.map((k) => looseKey(data[k].n)) }
  return looseIndex
}

/**
 * مطابِق الاستعلام الفضفاض: كلماتٌ يفصل بينها `\s*` فيقبل الموصول والمفصول.
 * يعود null إن كان الاستعلام أقصر من الحد أو خالياً بعد الإسقاط.
 */
function looseMatcher(lq: string): RegExp | null {
  const words = lq.split(' ').filter(Boolean)
  if (words.join('').length < MIN_LOOSE) return null
  return new RegExp(words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'))
}

const toHit = (key: string): SearchHit => {
  const [surah, ayah] = key.split(':').map(Number)
  return { key, surah, ayah }
}

/**
 * بحث غفل: يطبيع المدخل فتعمل الاستعلامات بتشكيل أو بدون، ويطابق التسلسل.
 * مرحلتان: المطابقة الحرفية أولاً (دقيقة، مرتَّبة أولاً)، ثم المطابقة الفضفاضة
 * (انظر looseKey) تلتقط ما اختلف رسمه العثماني عن إملاء المستخدم.
 */
export function searchVerses(data: Record<string, VerseText>, rawQuery: string): SearchResult {
  const q = normalizeArabic(rawQuery)
  if (q.length < 2) return { hits: [], total: 0, query: q }

  const exact: string[] = []
  const seen = new Set<string>()
  for (const key of Object.keys(data)) {
    if (data[key].n.includes(q)) {
      exact.push(key)
      seen.add(key)
    }
  }

  const lq = looseKey(q)
  const loose: string[] = []
  // \s* بين كلمات الاستعلام: يطابق الموصول في الأصل («ياايها») والمفصول معاً
  const rx = looseMatcher(lq)
  if (rx) {
    const idx = ensureLooseIndex(data)
    for (let i = 0; i < idx.keys.length; i++) {
      if (!seen.has(idx.keys[i]) && rx.test(idx.loose[i])) loose.push(idx.keys[i])
    }
  }

  const ordered = [...exact, ...loose]
  return { hits: ordered.slice(0, MAX_HITS).map(toHit), total: ordered.length, query: q }
}
