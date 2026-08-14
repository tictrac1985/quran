// طبقة سلامة أصول المصحف. لا يُسمح للواجهة بالعمل قبل اجتياز:
// 1) مخطط المانيفست، 2) قائمة الأصول المغلقة، 3) مرساة الثقة المضمّنة،
// 4) بصمة كل ملف. لا تتضمن هذه الطبقة أي نص قرآني ولا تعدّله.
import { assetUrl, MANIFEST_PATH } from './assets'

export interface FailedFile {
  path: string
  expected: string
  actual: string
}

export interface IntegrityReport {
  total: number
  verified: number
  failed: FailedFile[]
  bundleSha256: string
  manifestSchemaOk: boolean
  inventoryOk: boolean
  manifestSelfOk: boolean
  bundleTrusted: boolean
  filesOk: boolean
  durationMs: number
}

interface ValidatedManifestFile {
  path: string
  sha256: string
  size?: number
}

interface ValidatedManifest {
  bundle: { sha256: string }
  files: ValidatedManifestFile[]
}

const SHA256_RE = /^[0-9a-f]{64}$/
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_ASSET_BYTES = 8 * 1024 * 1024
const CONCURRENCY = 8

/**
 * مرساة ثقة مستقلة عن manifest.json. إضافة بصمة جديدة قرار إصدار مقصود بعد
 * تدقيق الحزمة، وليست خطوة آلية في مولّد الأصول.
 *
 * هذا يحمي من استبدال الأصول/المانيفست بعد بناء التطبيق. لا يغني عن توقيع
 * حزمة التثبيت بمفتاح إصدار خارجي؛ من يستطيع إعادة بناء التطبيق يستطيع تغيير
 * هذه القائمة أيضاً.
 */
const TRUSTED_BUNDLE_SHA256 = new Set([
  'b2e4f708e0111045d0f5a0e238ed7e139cebff2ca098e7f9603a550834ffc8f2',
])

function expectedPaths(): Set<string> {
  const paths = new Set([
    'LICENSE.md',
    'README.md',
    'extras/surah-name-v2.ttf',
    'font-map.json',
    'index.json',
    'layout/meta.json',
    'surah-names.json',
    'verses-text.json',
    'verses.json',
  ])
  for (let page = 1; page <= 604; page += 1) {
    paths.add(`pages/${String(page).padStart(3, '0')}.json`)
  }
  for (let font = 1; font <= 47; font += 1) {
    paths.add(`fonts/QCF4_Hafs_${String(font).padStart(2, '0')}_W.woff2`)
  }
  paths.add('fonts/QCF4_QBSML.woff2')
  return paths
}

const EXPECTED_PATHS = expectedPaths()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSafeRelativePath(path: string): boolean {
  if (!path || path.length > 160 || path.includes('\\') || path.startsWith('/') || path.includes('\0'))
    return false
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')
}

export function validateManifest(raw: unknown): ValidatedManifest {
  if (!isRecord(raw) || !isRecord(raw.bundle) || !Array.isArray(raw.files)) {
    throw new Error('مخطط manifest.json غير صالح')
  }
  const bundleSha = raw.bundle.sha256
  if (typeof bundleSha !== 'string' || !SHA256_RE.test(bundleSha)) {
    throw new Error('بصمة الحزمة في manifest.json غير صالحة')
  }
  const schemaVersion = raw.schema_version
  const legacyManifest = schemaVersion === undefined
  if (!legacyManifest && schemaVersion !== 2) {
    throw new Error(`إصدار مخطط manifest.json غير مدعوم: ${String(schemaVersion)}`)
  }
  if (legacyManifest && !TRUSTED_BUNDLE_SHA256.has(bundleSha)) {
    throw new Error('مانيفست قديم غير مرتبط بحزمة معتمدة')
  }
  if (!legacyManifest) {
    const pages = raw.bundle.pages_present
    const expectedPages = Array.from({ length: 604 }, (_, index) => index + 1)
    if (
      raw.bundle.name !== 'mushaf-qcf4-bundle' ||
      typeof raw.bundle.mushaf !== 'string' ||
      raw.bundle.mushaf.length === 0 ||
      raw.bundle.pages_total !== 604 ||
      !Array.isArray(pages) ||
      pages.length !== 604 ||
      pages.some((page, index) => page !== expectedPages[index]) ||
      typeof raw.bundle.generated_at_utc !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(raw.bundle.generated_at_utc)
    ) {
      throw new Error('بيانات وصف حزمة manifest.json غير صالحة')
    }
  }
  if (raw.files.length !== EXPECTED_PATHS.size || raw.files.length === 0) {
    throw new Error(
      `قائمة الأصول غير مكتملة: المتوقع ${EXPECTED_PATHS.size} ملفاً، الموجود ${raw.files.length}`,
    )
  }

  const seen = new Set<string>()
  const files: ValidatedManifestFile[] = raw.files.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      throw new Error(`مدخل المانيفست رقم ${index + 1} غير صالح`)
    }
    if (!isSafeRelativePath(entry.path) || !EXPECTED_PATHS.has(entry.path)) {
      throw new Error(`مسار أصل غير مسموح في المانيفست: ${entry.path}`)
    }
    if (seen.has(entry.path)) throw new Error(`مسار مكرر في المانيفست: ${entry.path}`)
    if (!SHA256_RE.test(entry.sha256)) throw new Error(`بصمة غير صالحة للأصل: ${entry.path}`)
    seen.add(entry.path)

    if (entry.size !== undefined) {
      if (
        !Number.isSafeInteger(entry.size) ||
        (entry.size as number) <= 0 ||
        (entry.size as number) > MAX_ASSET_BYTES
      ) {
        throw new Error(`حجم غير صالح للأصل: ${entry.path}`)
      }
      return { path: entry.path, sha256: entry.sha256, size: entry.size as number }
    }
    return { path: entry.path, sha256: entry.sha256 }
  })

  for (const path of EXPECTED_PATHS) {
    if (!seen.has(path)) throw new Error(`أصل إلزامي مفقود من المانيفست: ${path}`)
  }
  const withSize = files.filter((file) => file.size !== undefined).length
  if (withSize !== 0 && withSize !== files.length) {
    throw new Error('حقول الحجم في المانيفست جزئية؛ يجب وجودها لكل الأصول أو عدمها كلها')
  }
  if (!legacyManifest && withSize !== files.length) {
    throw new Error('مخطط manifest.json الإصدار 2 يتطلب حجم كل أصل')
  }

  return { bundle: { sha256: bundleSha }, files }
}

/** واجهة اختبار/تدقيق نقية؛ تعيد نسخة كي لا يمكن تعديل المخزون الداخلي. */
export function expectedIntegrityPaths(): string[] {
  return [...EXPECTED_PATHS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export function isTrustedBundleSha256(sha256: string): boolean {
  return TRUSTED_BUNDLE_SHA256.has(sha256)
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchWithRetry(path: string): Promise<Response> {
  try {
    return await fetch(assetUrl(path), { cache: 'no-store', credentials: 'omit' })
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 300))
    return fetch(assetUrl(path), { cache: 'no-store', credentials: 'omit' })
  }
}

async function readResponseLimited(response: Response, maximum: number): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new Error('الحجم المعلن يتجاوز الحد الآمن')
  }
  if (!response.body) {
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength > maximum) throw new Error('الحجم يتجاوز الحد الآمن')
    return bytes
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximum) {
        await reader.cancel('response too large')
        throw new Error('الحجم يتجاوز الحد الآمن')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined.buffer
}

async function loadManifest(): Promise<ValidatedManifest> {
  const response = await fetch(assetUrl(MANIFEST_PATH), { cache: 'no-store', credentials: 'omit' })
  if (!response.ok) throw new Error(`تعذر تحميل manifest.json (HTTP ${response.status})`)
  const bytes = await readResponseLimited(response, MAX_MANIFEST_BYTES)
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch {
    throw new Error('manifest.json ليس JSON/UTF-8 صالحاً')
  }
  return validateManifest(raw)
}

export async function verifyBundle(
  onProgress?: (done: number, total: number) => void,
): Promise<IntegrityReport> {
  const t0 = performance.now()
  const manifest = await loadManifest()
  const files = [...manifest.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const joinedDeclared = files.map((file) => file.sha256).join('')
  const recomputed = await sha256Hex(new TextEncoder().encode(joinedDeclared).buffer as ArrayBuffer)
  const manifestSelfOk = recomputed === manifest.bundle.sha256
  const bundleTrusted = isTrustedBundleSha256(manifest.bundle.sha256)

  const failed: FailedFile[] = []
  let done = 0
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < files.length) {
      const file = files[cursor++]
      try {
        const response = await fetchWithRetry(file.path)
        if (!response.ok) {
          failed.push({ path: file.path, expected: file.sha256, actual: `HTTP ${response.status}` })
        } else {
          const bytes = await readResponseLimited(response, MAX_ASSET_BYTES)
          if (file.size !== undefined && bytes.byteLength !== file.size) {
            failed.push({
              path: file.path,
              expected: `${file.size} bytes`,
              actual: `${bytes.byteLength} bytes`,
            })
          } else {
            const actual = await sha256Hex(bytes)
            if (actual !== file.sha256) failed.push({ path: file.path, expected: file.sha256, actual })
          }
        }
      } catch (error) {
        failed.push({ path: file.path, expected: file.sha256, actual: `خطأ قراءة: ${String(error)}` })
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
    manifestSchemaOk: true,
    inventoryOk: true,
    manifestSelfOk,
    bundleTrusted,
    filesOk: failed.length === 0,
    durationMs: performance.now() - t0,
  }
}
