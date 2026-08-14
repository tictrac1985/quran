import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractVerseGlyphLines } from '../src/components/Search/SearchVerseExcerpt'
import type { Qcf4Page } from '../src/types/mushaf'

interface VerseLocation {
  page: number
}

const assetRoot = resolve(process.cwd(), 'src-tauri/assets/mushaf-qcf4')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('verified search glyph integration', () => {
  it('finds every verse key on its declared page and preserves every word/end char and font', () => {
    const locations = readJson<Record<string, VerseLocation>>(resolve(assetRoot, 'verses.json'))
    const keysByPage = new Map<number, string[]>()

    for (const [key, location] of Object.entries(locations)) {
      const keys = keysByPage.get(location.page) ?? []
      keys.push(key)
      keysByPage.set(location.page, keys)
    }

    const missing: string[] = []
    const mismatched: string[] = []
    const missingEnd: string[] = []

    for (const [pageNumber, keys] of keysByPage) {
      const page = readJson<Qcf4Page>(
        resolve(assetRoot, 'pages', `${String(pageNumber).padStart(3, '0')}.json`),
      )

      for (const key of keys) {
        const expected = page.lines
          .flatMap((line) => line.words)
          .filter((word) => word.verse_key === key && (word.type === 'word' || word.type === 'end'))
        const actual = extractVerseGlyphLines(page, key).flatMap((line) => line.glyphs)

        if (actual.length === 0) {
          missing.push(key)
          continue
        }
        if (!expected.some((word) => word.type === 'end')) missingEnd.push(key)
        if (
          actual.length !== expected.length ||
          actual.some(
            (glyph, index) =>
              glyph.char !== expected[index].char ||
              glyph.font !== expected[index].font ||
              glyph.isEnd !== (expected[index].type === 'end'),
          )
        ) {
          mismatched.push(key)
        }
      }
    }

    expect(Object.keys(locations)).toHaveLength(6236)
    expect(keysByPage.size).toBe(604)
    expect(missing).toEqual([])
    expect(missingEnd).toEqual([])
    expect(mismatched).toEqual([])
  })
})
