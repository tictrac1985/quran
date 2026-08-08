// نقطة الوصول الوحيدة لأصول المصحف الثابتة — حزمة QCF4 (طبعة 1441هـ).
// التطوير (المتصفح): وسيط Vite يقدّم src-tauri/assets/mushaf-qcf4 تحت /mushaf-assets.
// سطح المكتب (Tauri): بروتوكول mushaf:// مخصص يقرأ من مجلد موارد الحزمة —
// يُحسم الجذر مرة واحدة في initAssets() قبل أول رسم (main.tsx).
import { convertFileSrc, invoke } from '@tauri-apps/api/core'

const DEV_PREFIX = '/mushaf-assets'

/** هل نعمل داخل نافذة Tauri (سطح المكتب)؟ */
export const isTauri = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let tauriBase: string | null = null

/** يُستدعى مرة واحدة قبل التركيب: يحسم جذر الأصول في وضع سطح المكتب */
export async function initAssets(): Promise<void> {
  if (!isTauri()) return
  const dir = await invoke<string>('asset_base')
  tauriBase = convertFileSrc(dir, 'mushaf')
}

/** رابط أصل ثابت بمساره النسبي داخل مجلد mushaf */
export function assetUrl(relPath: string): string {
  return tauriBase ? `${tauriBase}/${relPath}` : `${DEV_PREFIX}/${relPath}`
}

/** جلب JSON لأصل ثابت مع خطأ واضح عند الفشل */
export async function fetchJson<T>(relPath: string): Promise<T> {
  const url = assetUrl(relPath)
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`تعذر تحميل الأصل ${relPath} (HTTP ${res.status}) [${body}] من ${url.slice(0, 160)}`)
  }
  return (await res.json()) as T
}

export const MANIFEST_PATH = 'manifest.json'
export const META_PATH = 'layout/meta.json'
export const SURAH_NAMES_FONT_PATH = 'extras/surah-name-v2.ttf'
/** صفحات QCF4 مرقّمة بثلاث خانات (001..604) */
export const pageDataPath = (n: number) => `pages/${String(n).padStart(3, '0')}.json`
/** ملف تفسير سورة كاملة: tafsir/{slug}/{1..114}.json — «سورة:آية» ← نص */
export const tafsirPath = (slug: string, surah: number) => `tafsir/${slug}/${surah}.json`
