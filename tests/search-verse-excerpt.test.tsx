import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extractVerseGlyphLines, SearchVerseExcerpt } from '../src/components/Search/SearchVerseExcerpt'
import type { Qcf4Page } from '../src/types/mushaf'

const { loadPageMock } = vi.hoisted(() => ({ loadPageMock: vi.fn() }))

vi.mock('../src/lib/pageCache', () => ({ loadPage: loadPageMock }))

const firstGlyph = String.fromCodePoint(0xe001)
const endGlyph = String.fromCodePoint(0xe002)
const otherGlyph = String.fromCodePoint(0xe003)
const quarterGlyph = String.fromCodePoint(0xe004)

const page: Qcf4Page = {
  page: 7,
  font: 'QCF4_Hafs_01',
  surahs: [],
  lines: [
    {
      line: 1,
      words: [
        {
          code: 0xe001,
          char: firstGlyph,
          font: 'QCF4_Hafs_01',
          text: 'DERIVED_TEXT_MUST_NOT_RENDER',
          type: 'word',
          verse_key: '2:3',
          position: 1,
        },
        {
          code: 0xe002,
          char: endGlyph,
          font: 'QCF4_Hafs_02',
          text: 'DERIVED_END_MUST_NOT_RENDER',
          type: 'end',
          verse_key: '2:3',
          position: 2,
        },
        {
          code: 0xe003,
          char: otherGlyph,
          font: 'QCF4_Hafs_01',
          text: 'OTHER_VERSE_MUST_NOT_RENDER',
          type: 'word',
          verse_key: '2:4',
          position: 1,
        },
        {
          code: 0xe004,
          char: quarterGlyph,
          font: 'QCF4_Hafs_03',
          text: 'QUARTER_TEXT_MUST_NOT_RENDER',
          type: 'quarter',
          verse_key: '2:3',
        },
      ],
    },
  ],
}

describe('verified search verse excerpt', () => {
  beforeEach(() => loadPageMock.mockReset())

  it('extracts only the matching original glyphs and their own fonts', () => {
    const lines = extractVerseGlyphLines(page, '2:3')

    expect(lines).toEqual([
      {
        line: 1,
        glyphs: [
          { char: firstGlyph, font: 'QCF4_Hafs_01', isEnd: false },
          { char: endGlyph, font: 'QCF4_Hafs_02', isEnd: true },
        ],
      },
    ])
    expect(JSON.stringify(lines)).not.toContain('DERIVED_TEXT')
    expect(JSON.stringify(lines)).not.toContain(otherGlyph)
    expect(JSON.stringify(lines)).not.toContain(quarterGlyph)
  })

  it('loads the verified page path and renders one span per unmodified glyph', async () => {
    loadPageMock.mockResolvedValue({ data: page })
    const { container } = render(<SearchVerseExcerpt page={7} verseKey="2:3" />)

    await waitFor(() =>
      expect(container.querySelector('.search-excerpt')).toHaveClass('search-excerpt--ready'),
    )

    expect(loadPageMock).toHaveBeenCalledTimes(1)
    expect(loadPageMock).toHaveBeenCalledWith(7)
    const glyphs = [...container.querySelectorAll<HTMLElement>('.search-excerpt__glyph')]
    expect(glyphs).toHaveLength(2)
    expect(glyphs.map((glyph) => glyph.textContent)).toEqual([firstGlyph, endGlyph])
    expect(glyphs.map((glyph) => glyph.style.fontFamily)).toEqual(['QCF4_Hafs_01', 'QCF4_Hafs_02'])
    expect(container).not.toHaveTextContent('DERIVED_TEXT_MUST_NOT_RENDER')
    expect(container).not.toHaveTextContent(otherGlyph)
    expect(container).not.toHaveTextContent(quarterGlyph)
  })

  it('fails closed when the verified page has no glyph with the requested key', async () => {
    loadPageMock.mockResolvedValue({
      data: {
        ...page,
        lines: [
          {
            line: 1,
            words: [page.lines[0].words[2]],
          },
        ],
      },
    })
    const { container } = render(<SearchVerseExcerpt page={7} verseKey="2:3" />)

    await waitFor(() => expect(container).toHaveTextContent('تعذر تجهيز المقتطف المعتمد'))
    expect(container).not.toHaveTextContent(firstGlyph)
  })
})
