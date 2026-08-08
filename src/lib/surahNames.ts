// أسماء السور العربية (نص واجهة للقوائم) — مشتقة آلياً من أصول الصفحات
// المعتمدة (name_arabic في بيانات QCF4) ومحمية ببصمات المانيفست.
import { fetchJson } from './assets'

export interface SurahName {
  n: number
  name: string
}

let cache: Promise<SurahName[]> | null = null
export const loadSurahNames = () => (cache ??= fetchJson<SurahName[]>('surah-names.json'))
