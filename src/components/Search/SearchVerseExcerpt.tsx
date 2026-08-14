import { useEffect, useRef, useState } from 'react'
import { loadPage } from '../../lib/pageCache'
import type { Qcf4Page } from '../../types/mushaf'

interface VerseGlyph {
  char: string
  font: string
  isEnd: boolean
}

export interface VerseGlyphLine {
  line: number
  glyphs: VerseGlyph[]
}

/**
 * يستخرج محارف الآية من صفحة QCF4 المحققة مع إبقاء ترتيب الأسطر والكلمات.
 * لا يقرأ الحقل النصي المرجعي ولا يُجري أي قصّ أو تحويل على المحارف.
 */
export function extractVerseGlyphLines(page: Qcf4Page, verseKey: string): VerseGlyphLine[] {
  return page.lines.flatMap((line) => {
    const glyphs = line.words
      .filter((word) => word.verse_key === verseKey && (word.type === 'word' || word.type === 'end'))
      .map((word) => ({
        char: word.char,
        font: word.font,
        isEnd: word.type === 'end',
      }))

    return glyphs.length > 0 ? [{ line: line.line, glyphs }] : []
  })
}

interface Props {
  page: number
  verseKey: string
}

type LoadedExcerpt =
  | { requestKey: string; kind: 'ready'; lines: VerseGlyphLine[] }
  | { requestKey: string; kind: 'unavailable' }

const validVerseKey = (key: string): boolean => /^(?:[1-9]\d{0,2}):(?:[1-9]\d{0,2})$/.test(key)

/** مقتطف زخرفي صامت؛ مرجع النتيجة المحيط به هو النص المتاح لقارئات الشاشة. */
export function SearchVerseExcerpt({ page, verseKey }: Props) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const validRequest = Number.isInteger(page) && page >= 1 && page <= 604 && validVerseKey(verseKey)
  const requestKey = `${page}/${verseKey}`
  const [shouldLoad, setShouldLoad] = useState(() => typeof IntersectionObserver === 'undefined')
  const [loaded, setLoaded] = useState<LoadedExcerpt | null>(null)

  useEffect(() => {
    if (shouldLoad || !validRequest) return
    const root = rootRef.current
    if (!root) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setShouldLoad(true)
        observer.disconnect()
      },
      {
        root: root.closest('.search-v2__results'),
        rootMargin: '160px 0px',
      },
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [shouldLoad, validRequest])

  useEffect(() => {
    if (!shouldLoad || !validRequest) return
    let cancelled = false

    loadPage(page)
      .then(({ data }) => {
        if (cancelled) return
        if (data.page !== page) {
          setLoaded({ requestKey, kind: 'unavailable' })
          return
        }
        const lines = extractVerseGlyphLines(data, verseKey)
        setLoaded(
          lines.length > 0 ? { requestKey, kind: 'ready', lines } : { requestKey, kind: 'unavailable' },
        )
      })
      .catch(() => {
        if (!cancelled) setLoaded({ requestKey, kind: 'unavailable' })
      })

    return () => {
      cancelled = true
    }
  }, [page, requestKey, shouldLoad, validRequest, verseKey])

  const current = loaded?.requestKey === requestKey ? loaded : null

  return (
    <span
      ref={rootRef}
      className={`search-excerpt${current?.kind === 'ready' ? ' search-excerpt--ready' : ''}`}
      aria-hidden="true"
      dir="rtl"
    >
      {current?.kind === 'ready' ? (
        <span className="search-excerpt__viewport">
          {current.lines.map((line) => (
            <span className="search-excerpt__line" key={line.line}>
              {line.glyphs.map((glyph, index) => (
                <span
                  className={`search-excerpt__glyph${glyph.isEnd ? ' search-excerpt__glyph--end' : ''}`}
                  style={{ fontFamily: glyph.font }}
                  key={`${line.line}:${index}`}
                >
                  {glyph.char}
                </span>
              ))}
            </span>
          ))}
        </span>
      ) : current?.kind === 'unavailable' || !validRequest ? (
        <span className="search-excerpt__state">تعذر تجهيز المقتطف المعتمد</span>
      ) : (
        <span className="search-excerpt__skeleton" />
      )}
    </span>
  )
}
