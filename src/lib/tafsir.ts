// تحميل التفاسير كسلاً: ملف السورة الواحدة يُجلب عند أول طلب ثم يُخزَّن في
// الذاكرة لبقية الجلسة. الملفات خارج بصمات الإقلاع عمداً (انظر build_tafsir.py).
import { AssetFetchError, fetchJson, tafsirPath } from './assets'

export type TafsirSlug = 'ibn-kathir' | 'sadi' | 'asbab'

export const TAFSIR_LABEL: Record<TafsirSlug, string> = {
  'ibn-kathir': 'ابن كثير',
  sadi: 'السعدي',
  asbab: 'أسباب النزول',
}

export const TAFSIR_SLUGS = Object.keys(TAFSIR_LABEL) as TafsirSlug[]

/** «سورة:آية» ← موضعها (صفحتها) — من أصل verses.json الرسمي */
export type VerseLoc = { page: number }
let verseLocCache: Promise<Record<string, VerseLoc>> | null = null
export function loadVerseLocs(): Promise<Record<string, VerseLoc>> {
  if (verseLocCache) return verseLocCache
  const request = fetchJson<Record<string, VerseLoc>>('verses.json')
  const cached = request.catch((error: unknown) => {
    if (verseLocCache === cached) verseLocCache = null
    throw error
  })
  verseLocCache = cached
  return cached
}

/** «سورة:آية» ← نص التفسير */
export type SurahTafsir = Record<string, string>

const cache = new Map<string, Promise<SurahTafsir>>()

export function loadTafsir(slug: TafsirSlug, surah: number): Promise<SurahTafsir> {
  const key = `${slug}/${surah}`
  let p = cache.get(key)
  if (!p) {
    const request = fetchJson<SurahTafsir>(tafsirPath(slug, surah))
    const cached = request.catch((error: unknown) => {
      // غياب ملف أسباب النزول لسورة ما حالة صحيحة في الحزمة، لا خطأ تحميل.
      if (slug === 'asbab' && error instanceof AssetFetchError && error.status === 404) return {}
      if (cache.get(key) === cached) cache.delete(key)
      throw error
    })
    p = cached
    cache.set(key, p)
  }
  return p
}
