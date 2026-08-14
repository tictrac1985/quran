import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('protected mushaf display contract', () => {
  it('renders the bismillah from the verified canonical extractor rather than hard-coded glyphs', () => {
    const mushafPage = source('src/components/MushafPage/MushafPage.tsx')
    const canonical = source('src/lib/canonicalBasmala.ts')

    expect(mushafPage).toContain('loadCanonicalBasmala()')
    expect(mushafPage).toContain('{glyph.char}')
    expect(mushafPage).toContain('fontFamily: glyph.font')
    expect(canonical).toContain("word.verse_key === CANONICAL_VERSE_KEY")
    expect(canonical).toContain("word.type === 'word'")
    expect(canonical).toContain('char: word.char')
    expect(canonical).toContain('font: word.font')
    expect(canonical).not.toMatch(/[\uE000-\uF8FF]/u)
    expect(canonical).not.toMatch(/word\.(?:text|code)/)
  })

  it('passes only verified QCF glyphs into WordSpan', () => {
    const mushafPage = source('src/components/MushafPage/MushafPage.tsx')

    expect(mushafPage).toContain('glyph={w.char}')
    expect(mushafPage).not.toMatch(/glyph=\{w\.(?:text|t|n)\}/)
  })

  it('does not render the derived search corpus as Quran text', () => {
    const searchPanel = source('src/components/Search/SearchPanel.tsx')
    const excerpt = source('src/components/Search/SearchVerseExcerpt.tsx')

    expect(searchPanel).not.toMatch(/data\s*\[\s*hit\.key\s*\][\s\S]{0,20}\.t/)
    expect(searchPanel).toContain('onGo(hit.key)')
    expect(excerpt).toContain('char: word.char')
    expect(excerpt).toContain('font: word.font')
    expect(excerpt).not.toMatch(/word\.(?:text|code)/)
    expect(excerpt).not.toMatch(/(?:slice|substring)\s*\(/)
  })

  it('clips complete verified glyph spans visually instead of truncating their source', () => {
    const modernCss = source('src/styles/modern-ui.css')

    expect(modernCss).toMatch(/\.search-excerpt\s*\{[\s\S]*?overflow:\s*hidden/)
    expect(modernCss).toMatch(/\.search-excerpt__line\s*\{[\s\S]*?text-overflow:\s*clip/)
  })

  it('keeps protected mushaf styles isolated from the redesign layer', () => {
    const protectedCss = source('src/components/MushafPage/mushaf.css')
    const globalCss = source('src/index.css')
    const modernCss = source('src/styles/modern-ui.css')

    expect(protectedCss).toContain('.mushaf-sheet')
    expect(protectedCss).toContain('.mushaf-word')
    expect(globalCss).not.toMatch(/^\.mushaf-(?:sheet|page|line|word)/m)
    expect(modernCss).not.toMatch(/^\.mushaf-(?:sheet|page|line|word)/m)
  })
})
