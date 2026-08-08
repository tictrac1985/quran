// مخبأ الصفحات: جلب مسبق للجيران + إعادة استخدام فورية عند التقليب.
// الهدف: تقليب بلا وميض تحميل — البيانات والخطوط جاهزة قبل الوصول للصفحة.
// حزمة QCF4: الخطوط تُشتق من ملف الصفحة نفسه (حقل font + خطوط الكلمات).
import { fetchJson, pageDataPath } from './assets'
import { ensureQcf4Fonts } from './fonts'
import type { Qcf4Page } from '../types/mushaf'

export interface PageBundle {
  data: Qcf4Page
}

// سقف المخبأ: صفحة JSON صغيرة؛ الخطوط المجمّعة تُحمَّل مرة كل ~13 صفحة
const CACHE_LIMIT = 40
const cache = new Map<number, PageBundle>()
const pending = new Map<number, Promise<PageBundle>>()

export function loadPage(n: number): Promise<PageBundle> {
  const hit = cache.get(n)
  if (hit) {
    // LRU: إعادة الإدراج تحدّث حداثته
    cache.delete(n)
    cache.set(n, hit)
    return Promise.resolve(hit)
  }
  const p = pending.get(n)
  if (p) return p
  const promise = fetchJson<Qcf4Page>(pageDataPath(n))
    .then(async (data) => {
      // كل عائلة يذكرها محرف في الصفحة يجب أن تكتمل قبل الرسم (بلا مربعات أبداً)
      const families = new Set<string>([data.font])
      for (const line of data.lines) for (const w of line.words) families.add(w.font)
      await ensureQcf4Fonts(families)
      return { data } satisfies PageBundle
    })
    .then((bundle) => {
      cache.set(n, bundle)
      pending.delete(n)
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value
        if (oldest !== undefined) cache.delete(oldest)
      }
      return bundle
    })
  pending.set(n, promise)
  return promise
}

/** قراءة تزامنية: القيمة إن كانت جاهزة وإلا null — مفتاح التقليب بلا وميض */
export const getCachedPage = (n: number): PageBundle | null => cache.get(n) ?? null

/** جلب مسبق صامت لصفحات الجوار (يُتجاهل ما هو خارج 1..604) */
export const prefetchPages = (ns: number[]): void => {
  for (const n of ns) {
    if (n >= 1 && n <= 604) loadPage(n).catch(() => {})
  }
}
