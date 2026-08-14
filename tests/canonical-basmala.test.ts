import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Qcf4Page, Qcf4Word } from '../src/types/mushaf'

const makeWord = (overrides: Partial<Qcf4Word>): Qcf4Word => ({
  code: 0,
  char: 'x',
  font: 'QCF4_Hafs_01',
  text: 'مرجع لا يُعرض',
  type: 'word',
  verse_key: '1:1',
  position: 1,
  ...overrides,
})

const makeCanonicalPage = (): Qcf4Page => ({
  page: 1,
  font: 'QCF4_Hafs_01',
  surahs: [],
  lines: [
    {
      line: 2,
      words: [
        makeWord({ char: 'a', position: 1 }),
        makeWord({ char: 'b', position: 2 }),
        makeWord({ char: 'c', position: 3 }),
        makeWord({ char: 'd', position: 4 }),
        makeWord({ char: 'e', position: 5, type: 'end' }),
        makeWord({ char: 'z', position: 1, verse_key: '2:1' }),
      ],
    },
  ],
})

afterEach(() => {
  vi.doUnmock('../src/lib/pageCache')
  vi.resetModules()
})

describe('canonical bismillah glyphs', () => {
  it('extracts the exact ordered char/font/position fields from bundled page 001', async () => {
    const page = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src-tauri/assets/mushaf-qcf4/pages/001.json'),
        'utf8',
      ),
    ) as Qcf4Page
    const expected = page.lines
      .flatMap((line) => line.words)
      .filter((word) => word.type === 'word' && word.verse_key === '1:1')
      .map(({ char, font, position }) => ({ char, font, position }))
    const { extractCanonicalBasmala } = await import('../src/lib/canonicalBasmala')

    expect(expected.map(({ position }) => position)).toEqual([1, 2, 3, 4])
    expect(extractCanonicalBasmala(page)).toEqual(expected)
  })

  it('preserves the four verified glyphs and their own fonts in canonical order', async () => {
    const { extractCanonicalBasmala } = await import('../src/lib/canonicalBasmala')

    expect(extractCanonicalBasmala(makeCanonicalPage())).toEqual([
      { char: 'a', font: 'QCF4_Hafs_01', position: 1 },
      { char: 'b', font: 'QCF4_Hafs_01', position: 2 },
      { char: 'c', font: 'QCF4_Hafs_01', position: 3 },
      { char: 'd', font: 'QCF4_Hafs_01', position: 4 },
    ])
  })

  it('fails closed for a non-canonical page, a missing word, or altered ordering', async () => {
    const { extractCanonicalBasmala } = await import('../src/lib/canonicalBasmala')
    const wrongPage = makeCanonicalPage()
    wrongPage.page = 2
    expect(extractCanonicalBasmala(wrongPage)).toBeNull()

    const missing = makeCanonicalPage()
    missing.lines[0].words = missing.lines[0].words.filter((word) => word.position !== 3)
    expect(extractCanonicalBasmala(missing)).toBeNull()

    const reordered = makeCanonicalPage()
    ;[reordered.lines[0].words[1], reordered.lines[0].words[2]] = [
      reordered.lines[0].words[2],
      reordered.lines[0].words[1],
    ]
    expect(extractCanonicalBasmala(reordered)).toBeNull()

    const wrongFont = makeCanonicalPage()
    wrongFont.lines[0].words[0].font = 'untrusted-font'
    expect(extractCanonicalBasmala(wrongFont)).toBeNull()

    const multipleCharacters = makeCanonicalPage()
    multipleCharacters.lines[0].words[0].char = 'ab'
    expect(extractCanonicalBasmala(multipleCharacters)).toBeNull()
  })

  it('loads page one once and returns only the validated canonical glyphs', async () => {
    const loadPage = vi.fn().mockResolvedValue({ data: makeCanonicalPage() })
    vi.doMock('../src/lib/pageCache', () => ({ loadPage }))
    const { loadCanonicalBasmala } = await import('../src/lib/canonicalBasmala')

    const first = await loadCanonicalBasmala()
    const second = await loadCanonicalBasmala()

    expect(loadPage).toHaveBeenCalledTimes(1)
    expect(loadPage).toHaveBeenCalledWith(1)
    expect(second).toBe(first)
  })

  it('rejects invalid source data instead of displaying a partial bismillah', async () => {
    const page = makeCanonicalPage()
    page.lines[0].words = page.lines[0].words.filter((word) => word.position !== 4)
    vi.doMock('../src/lib/pageCache', () => ({ loadPage: vi.fn().mockResolvedValue({ data: page }) }))
    const { loadCanonicalBasmala } = await import('../src/lib/canonicalBasmala')

    await expect(loadCanonicalBasmala()).rejects.toThrow('تعذر التحقق')
  })
})
