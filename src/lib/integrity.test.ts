import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expectedIntegrityPaths, isTrustedBundleSha256, validateManifest } from './integrity'

const SHA = 'a'.repeat(64)
const TRUSTED_SHA = 'b2e4f708e0111045d0f5a0e238ed7e139cebff2ca098e7f9603a550834ffc8f2'

function validManifest() {
  return {
    schema_version: 2,
    bundle: {
      name: 'mushaf-qcf4-bundle',
      mushaf: 'QCF4 test fixture',
      pages_total: 604,
      pages_present: Array.from({ length: 604 }, (_, index) => index + 1),
      generated_at_utc: '2026-08-14T00:00:00Z',
      sha256: SHA,
    },
    files: expectedIntegrityPaths().map((path) => ({ path, sha256: SHA, size: 1 })),
  }
}

describe('manifest integrity policy', () => {
  it('accepts only the complete 661-file inventory', () => {
    const manifest = validateManifest(validManifest())
    expect(manifest.files).toHaveLength(661)
  })

  it('rejects an empty inventory', () => {
    const empty = validManifest()
    empty.files = []
    expect(() => validateManifest(empty)).toThrow(/غير مكتملة/)
  })

  it('rejects missing, duplicate, unknown, and traversing paths', () => {
    const missing = validManifest()
    missing.files.pop()
    expect(() => validateManifest(missing)).toThrow(/غير مكتملة/)

    const duplicate = validManifest()
    duplicate.files[0] = { ...duplicate.files[1] }
    expect(() => validateManifest(duplicate)).toThrow(/مكرر/)

    const unknown = validManifest()
    unknown.files[0] = { path: 'pages/605.json', sha256: SHA, size: 1 }
    expect(() => validateManifest(unknown)).toThrow(/غير مسموح/)

    const traversal = validManifest()
    traversal.files[0] = { path: '../pages/001.json', sha256: SHA, size: 1 }
    expect(() => validateManifest(traversal)).toThrow(/غير مسموح/)
  })

  it('rejects malformed hashes and partial size metadata', () => {
    const malformed = validManifest()
    malformed.files[0].sha256 = 'not-a-sha'
    expect(() => validateManifest(malformed)).toThrow(/بصمة غير صالحة/)

    const partial = validManifest()
    const withoutSize = partial.files[0] as { path: string; sha256: string; size?: number }
    delete withoutSize.size
    expect(() => validateManifest(partial)).toThrow(/جزئية/)
  })

  it('rejects unsupported or incomplete schema metadata', () => {
    const unsupported = validManifest()
    unsupported.schema_version = 3
    expect(() => validateManifest(unsupported)).toThrow(/غير مدعوم/)

    const incomplete = validManifest()
    incomplete.bundle.pages_total = 603
    expect(() => validateManifest(incomplete)).toThrow(/بيانات وصف/)
  })

  it('pins the audited bundle independently of the manifest', () => {
    expect(isTrustedBundleSha256(TRUSTED_SHA)).toBe(true)
    expect(isTrustedBundleSha256(SHA)).toBe(false)
  })

  it('verifies the installed asset bundle byte-for-byte without changing it', () => {
    const root = resolve(process.cwd(), 'src-tauri/assets/mushaf-qcf4')
    const raw = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as unknown
    const manifest = validateManifest(raw)
    const ordered = [...manifest.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    const bundle = createHash('sha256')
      .update(ordered.map((file) => file.sha256).join(''))
      .digest('hex')
    expect(bundle).toBe(manifest.bundle.sha256)
    expect(isTrustedBundleSha256(bundle)).toBe(true)
    for (const file of ordered) {
      const bytes = readFileSync(resolve(root, file.path))
      expect(createHash('sha256').update(bytes).digest('hex'), file.path).toBe(file.sha256)
      if (file.size !== undefined) expect(bytes.byteLength, file.path).toBe(file.size)
    }
  })
})
