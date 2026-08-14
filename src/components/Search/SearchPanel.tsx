import { useEffect, useMemo, useState } from 'react'
import { loadVersesText, searchVerses, type SearchResult, type VerseText } from '../../lib/search'
import { loadVerseLocs } from '../../lib/tafsir'
import { ensureExtraFonts, SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import { IconChevron, IconSearch } from '../icons/Icons'
import { Dialog } from '../ui'
import { SearchVerseExcerpt } from './SearchVerseExcerpt'

const arNum = (n: number) => n.toLocaleString('ar-EG')

function ayahCount(n: number): string {
  if (n === 1) return 'نتيجة واحدة'
  if (n === 2) return 'نتيجتان'
  if (n <= 10) return `${arNum(n)} نتائج`
  return `${arNum(n)} نتيجة`
}

interface Props {
  onGo: (verseKey: string) => void
  onClose: () => void
}

export function SearchPanel({ onGo, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [data, setData] = useState<Record<string, VerseText> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<Record<string, { page: number }>>({})
  const [pagesFailed, setPagesFailed] = useState(false)

  useEffect(() => {
    void ensureExtraFonts()
    loadVerseLocs()
      .then(setPages)
      .catch(() => setPagesFailed(true))
    loadVersesText()
      .then(setData)
      .catch((reason) => setError(String(reason instanceof Error ? reason.message : reason)))
  }, [])

  useEffect(() => {
    if (!data) return
    const timer = window.setTimeout(() => setResult(searchVerses(data, query)), 140)
    return () => window.clearTimeout(timer)
  }, [query, data])

  const hits = useMemo(() => result?.hits ?? [], [result])
  const locatedHits = useMemo(
    () => hits.map((hit) => ({ ...hit, page: pages[hit.key]?.page ?? null })),
    [hits, pages],
  )
  const hasQuery = (result?.query.length ?? 0) >= 2

  return (
    <Dialog
      title="البحث في المصحف"
      description="اكتب حرفين أو أكثر؛ تُعرض المقتطفات بمحارف صفحات المصحف المعتمدة."
      onClose={onClose}
      className="search-v2"
    >
      <div className="search-v2__field">
        <IconSearch aria-hidden="true" />
        <label className="ui-sr-only" htmlFor="mushaf-search-input">
          كلمات البحث
        </label>
        <input
          id="mushaf-search-input"
          data-autofocus
          type="search"
          autoComplete="off"
          placeholder={data ? 'ابحث بكلمات من الآية…' : 'جارٍ تجهيز فهرس البحث…'}
          value={query}
          disabled={!data && !error}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && locatedHits.length > 0) onGo(locatedHits[0].key)
          }}
        />
        {query && (
          <button
            type="button"
            className="search-v2__clear"
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
          >
            ×
          </button>
        )}
      </div>

      <div className="search-v2__summary" aria-live="polite">
        {error ? (
          <span className="ui-error">تعذر تحميل فهرس البحث.</span>
        ) : pagesFailed ? (
          <span className="ui-error">تعذر تحديد صفحات المقتطفات؛ ما زال الانتقال متاحًا.</span>
        ) : hasQuery ? (
          result?.total === 0 ? (
            'لا نتائج؛ جرّب كلمات أقل أو صياغة أخرى.'
          ) : (
            `${ayahCount(result?.total ?? 0)}${(result?.total ?? 0) > hits.length ? `، تُعرض أول ${arNum(hits.length)}` : ''}`
          )
        ) : (
          'المقتطفات المعروضة هي محارف QCF الأصلية من الصفحات المحققة فقط.'
        )}
      </div>

      <div className="search-v2__results" aria-label="نتائج البحث">
        {locatedHits.map((hit) => {
          return (
            <button
              type="button"
              key={hit.key}
              className="search-v2__result"
              onClick={() => onGo(hit.key)}
              aria-label={`انتقل إلى السورة رقم ${arNum(hit.surah)}، الآية ${arNum(hit.ayah)}${hit.page ? `، الصفحة ${arNum(hit.page)}` : ''}`}
            >
              <span className="search-v2__surah-wrap">
                <span className="ui-sr-only">سورة رقم {arNum(hit.surah)}</span>
                <span
                  className="search-v2__surah"
                  aria-hidden="true"
                  style={{ fontFamily: SURAH_NAMES_FAMILY }}
                >
                  {surahNameText(hit.surah)}
                </span>
              </span>
              <span className="search-v2__reference">
                <strong>الآية {arNum(hit.ayah)}</strong>
                <span>{hit.page ? `صفحة ${arNum(hit.page)}` : 'يُحدَّد موضع الصفحة عند الفتح'}</span>
              </span>
              {hit.page ? (
                <SearchVerseExcerpt page={hit.page} verseKey={hit.key} />
              ) : (
                <span className="search-excerpt" aria-hidden="true">
                  <span className="search-excerpt__skeleton" />
                </span>
              )}
              <span className="search-v2__go">
                عرض الموضع <IconChevron />
              </span>
            </button>
          )
        })}
      </div>
    </Dialog>
  )
}
