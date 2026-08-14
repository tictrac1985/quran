import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type MockLoad = (face: MockFontFace) => Promise<FontFace>

const instances: MockFontFace[] = []
let loadFace: MockLoad

class MockFontFace {
  readonly family: string
  readonly source: string
  readonly descriptors: FontFaceDescriptors | undefined
  status = 'unloaded'

  constructor(family: string, source: string, descriptors?: FontFaceDescriptors) {
    this.family = family
    this.source = source
    this.descriptors = descriptors
    instances.push(this)
  }

  load(): Promise<FontFace> {
    return loadFace(this)
  }
}

const originalFontFace = Object.getOwnPropertyDescriptor(globalThis, 'FontFace')
const originalDocumentFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
let fontSet: Pick<FontFaceSet, 'add' | 'delete'>

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(target, key, descriptor)
  else Reflect.deleteProperty(target, key)
}

beforeEach(() => {
  vi.resetModules()
  instances.length = 0
  loadFace = async (face) => {
    face.status = 'loaded'
    return face as unknown as FontFace
  }
  fontSet = {
    add: vi.fn(function (this: FontFaceSet) {
      return this
    }),
    delete: vi.fn(() => true),
  }
  Object.defineProperty(globalThis, 'FontFace', {
    configurable: true,
    writable: true,
    value: MockFontFace,
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: fontSet,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  restoreProperty(globalThis, 'FontFace', originalFontFace)
  restoreProperty(document, 'fonts', originalDocumentFonts)
})

describe('packaged mushaf font loading', () => {
  it('uses FontFace without an inline style and registers only after loading', async () => {
    let finishLoad: (() => void) | undefined
    loadFace = (face) =>
      new Promise<FontFace>((resolve) => {
        finishLoad = () => {
          face.status = 'loaded'
          resolve(face as unknown as FontFace)
        }
      })
    const createElement = vi.spyOn(document, 'createElement')
    const { ensureExtraFonts, SURAH_NAMES_FAMILY } = await import('../src/lib/fonts')

    const loading = ensureExtraFonts()

    expect(instances).toHaveLength(1)
    expect(instances[0].family).toBe(SURAH_NAMES_FAMILY)
    expect(instances[0].descriptors).toMatchObject({ display: 'block' })
    expect(fontSet.add).not.toHaveBeenCalled()
    expect(createElement).not.toHaveBeenCalledWith('style')

    finishLoad?.()
    await loading

    expect(fontSet.add).toHaveBeenCalledOnce()
    expect(fontSet.add).toHaveBeenCalledWith(instances[0])
    expect(createElement).not.toHaveBeenCalledWith('style')
  })

  it('deduplicates concurrent and completed requests for the same family', async () => {
    let finishLoad: (() => void) | undefined
    loadFace = (face) =>
      new Promise<FontFace>((resolve) => {
        finishLoad = () => {
          face.status = 'loaded'
          resolve(face as unknown as FontFace)
        }
      })
    const { ensureExtraFonts } = await import('../src/lib/fonts')

    const first = ensureExtraFonts()
    const second = ensureExtraFonts()
    expect(instances).toHaveLength(1)

    finishLoad?.()
    await Promise.all([first, second])
    await ensureExtraFonts()

    expect(instances).toHaveLength(1)
    expect(fontSet.add).toHaveBeenCalledOnce()
  })

  it('clears a failed attempt so the same family can be retried', async () => {
    let attempt = 0
    loadFace = async (face) => {
      attempt += 1
      if (attempt === 1) throw new Error('temporary font failure')
      face.status = 'loaded'
      return face as unknown as FontFace
    }
    const { ensureExtraFonts } = await import('../src/lib/fonts')

    await expect(ensureExtraFonts()).rejects.toThrow('temporary font failure')
    await expect(ensureExtraFonts()).resolves.toBeUndefined()

    expect(instances).toHaveLength(2)
    expect(fontSet.delete).toHaveBeenCalledOnce()
    expect(fontSet.add).toHaveBeenCalledOnce()
    expect(fontSet.add).toHaveBeenCalledWith(instances[1])
  })

  it('allows only the shipped QCF4 families', async () => {
    const { qcf4FontFile } = await import('../src/lib/fonts')

    expect(qcf4FontFile('QCF4_Hafs_01')).toBe('fonts/QCF4_Hafs_01_W.woff2')
    expect(qcf4FontFile('QCF4_Hafs_47')).toBe('fonts/QCF4_Hafs_47_W.woff2')
    expect(qcf4FontFile('QCF4_QBSML')).toBe('fonts/QCF4_QBSML.woff2')
    expect(() => qcf4FontFile('QCF4_Hafs_00')).toThrow('غير معتمدة')
    expect(() => qcf4FontFile('QCF4_Hafs_48')).toThrow('غير معتمدة')
    expect(() => qcf4FontFile('../foreign')).toThrow('غير معتمدة')
  })
})
