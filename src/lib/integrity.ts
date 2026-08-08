// الطبقة 1 من نظام سلامة النص: فحص بصمات SHA-256 لكل أصل عند كل إقلاع.
// الخوارزمية مطابقة حرفياً لما يولّده tools/fetch_assets.py:
//   بصمة الحزمة = sha256(تسلسل بصمات hex للملفات مرتبة تصاعدياً بالمسار)
// أي ملف مختلف ⇒ إيقاف العرض وإنذار واضح (لا صفحة متأثرة تُعرض أبداً).

import { assetUrl, fetchJson, MANIFEST_PATH } from './assets'
import type { Manifest, ManifestFile } from '../types/mushaf'

export interface FailedFile {
  path: string
  expected: string
  actual: string
}

export interface IntegrityReport {
  total: number
  verified: number
  failed: FailedFile[]
  /** بصمة الحزمة كما في المانيفست */
  bundleSha256: string
  /** المانيفست متسق ذاتياً (بصمة الحزمة المعاد حسابها من قائمته تطابق المعلنة) */
  manifestSelfOk: boolean
  /** كل الملفات على القرص تطابق المانيفست */
  filesOk: boolean
  durationMs: number
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** نفس ترتيب البناء في خط الأصول: sorted(OUT.rglob) أي تصاعدي أبجدي بالمسار */
const byPath = (a: ManifestFile, b: ManifestFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)

const CONCURRENCY = 8

export async function verifyBundle(
  onProgress?: (done: number, total: number) => void,
): Promise<IntegrityReport> {
  const t0 = performance.now()
  const manifest = await fetchJson<Manifest>(MANIFEST_PATH)
  const files = [...manifest.files].sort(byPath)

  // 1) المانيفست متسق ذاتياً؟ (بصمة الحزمة المعلنة = المعاد حسابها من القائمة)
  const joinedDeclared = files.map((f) => f.sha256).join('')
  const recomputed = await sha256Hex(new TextEncoder().encode(joinedDeclared).buffer as ArrayBuffer)
  const manifestSelfOk = recomputed === manifest.bundle.sha256

  // 2) بصمة كل ملف على القرص مقابل المانيفست — بلا أي استثناء.
  // تعثر شبكي عابر لا يُسقط الفحص: محاولة ثانية بعد 300ms قبل إعلان الفشل.
  const failed: FailedFile[] = []
  let done = 0
  let cursor = 0
  async function fetchWithRetry(path: string): Promise<Response> {
    try {
      return await fetch(assetUrl(path), { cache: 'no-store' })
    } catch (e) {
      await new Promise((r) => setTimeout(r, 300))
      return fetch(assetUrl(path), { cache: 'no-store' })
    }
  }
  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const f = files[cursor++]
      try {
        const res = await fetchWithRetry(f.path)
        if (!res.ok) {
          failed.push({ path: f.path, expected: f.sha256, actual: `HTTP ${res.status}` })
        } else {
          const hex = await sha256Hex(await res.arrayBuffer())
          if (hex !== f.sha256) failed.push({ path: f.path, expected: f.sha256, actual: hex })
        }
      } catch (e) {
        failed.push({ path: f.path, expected: f.sha256, actual: `خطأ قراءة: ${e}` })
      }
      done += 1
      onProgress?.(done, files.length)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  return {
    total: files.length,
    verified: done - failed.length,
    failed,
    bundleSha256: manifest.bundle.sha256,
    manifestSelfOk,
    filesOk: failed.length === 0,
    durationMs: performance.now() - t0,
  }
}
