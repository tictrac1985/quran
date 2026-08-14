// البيانات الوصفية المشتقة (layout/meta.json) + تسميات عربية لواجهة القارئ.
// الملف يُحمَّل مرة واحدة للجلسة؛ بدايات السور/الأجزاء/الأحزاب/الأرباع من خط الأصول.
import { fetchJson, META_PATH } from './assets'
import type { MushafMeta } from '../types/mushaf'

let metaCache: Promise<MushafMeta> | null = null
export function loadMeta(): Promise<MushafMeta> {
  if (metaCache) return metaCache
  const request = fetchJson<MushafMeta>(META_PATH)
  const cached = request.catch((error: unknown) => {
    if (metaCache === cached) metaCache = null
    throw error
  })
  metaCache = cached
  return cached
}

// أسماء تراتيب الأجزاء — نص واجهة (كروم)، ليس نصاً قرآنياً
const JUZ_ORDINALS = [
  'الأول',
  'الثاني',
  'الثالث',
  'الرابع',
  'الخامس',
  'السادس',
  'السابع',
  'الثامن',
  'التاسع',
  'العاشر',
  'الحادي عشر',
  'الثاني عشر',
  'الثالث عشر',
  'الرابع عشر',
  'الخامس عشر',
  'السادس عشر',
  'السابع عشر',
  'الثامن عشر',
  'التاسع عشر',
  'العشرون',
  'الحادي والعشرون',
  'الثاني والعشرون',
  'الثالث والعشرون',
  'الرابع والعشرون',
  'الخامس والعشرون',
  'السادس والعشرون',
  'السابع والعشرون',
  'الثامن والعشرون',
  'التاسع والعشرون',
  'الثلاثون',
] as const

/** «الجزء السابع» مثلاً؛ سلسلة فارغة خارج 1..30 */
export const juzLabel = (n: number): string => (n >= 1 && n <= 30 ? `الجزء ${JUZ_ORDINALS[n - 1]}` : '')

/** الجزء الذي تقع فيه الصفحة: أكبر جزء بدايته ≤ الصفحة */
export const juzOfPage = (meta: MushafMeta, page: number): number => {
  let j = 1
  for (const e of meta.juz) if (e.page <= page) j = e.n
  return j
}

/** قاعدة عامة: أكبر مدخل من نوعه بدايته ≤ الصفحة */
const entryOfPage = (entries: MushafMeta['juz'], page: number): number => {
  let n = 1
  for (const e of entries) if (e.page <= page) n = e.n
  return n
}

export const hizbOfPage = (meta: MushafMeta, page: number): number => entryOfPage(meta.hizb, page)
export const rubOfPage = (meta: MushafMeta, page: number): number => entryOfPage(meta.rub, page)

// موضع الربع داخل حزبه (1..4) — نص واجهة (كروم) وليس نصاً قرآنياً
const QUARTER_LABELS = ['الربع', 'النصف', 'ثلاثة الأرباع', 'تمام الحزب'] as const

/** «النصف» مثلاً: موضع ربع الحزب الجاري داخل حزبه */
export const quarterLabel = (rub: number): string => QUARTER_LABELS[(rub - 1) % 4]
