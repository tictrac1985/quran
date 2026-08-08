// لوحة البحث الفوري (3.3) — نتائج مرجعية فقط (سورة/آية/صفحة) احتراماً لقاعدة
// «النص العثماني للبحث لا للعرض»؛ النتيجة تُفتح مظلَّلة على صفحة المصحف نفسها.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadVersesText,
  searchVerses,
  type SearchResult,
  type VerseText,
} from '../../lib/search'
import { loadVerseLocs } from '../../lib/tafsir'
import { ensureExtraFonts, SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import { IconClose } from '../icons/Icons'

const arNum = (n: number) => n.toLocaleString('ar-EG')

/** عدّ الآيات بصيغة عربية سليمة — المفرد والمثنى وجمع القلة والكثرة */
function ayahCount(n: number): string {
  if (n === 1) return 'آية واحدة'
  if (n === 2) return 'آيتان'
  if (n <= 10) return `${arNum(n)} آيات`
  return `${arNum(n)} آية`
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
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ensureExtraFonts()
    loadVerseLocs()
      .then(setPages)
      .catch(() => {})
    loadVersesText()
      .then(setData)
      .catch((e) => setError(String(e instanceof Error ? e.message : e)))
    inputRef.current?.focus()
  }, [])

  // بحث فوري مع مهلة قصيرة — النص كله في الذاكرة فالبحث أسرع من الإدخال
  useEffect(() => {
    if (!data) return
    const t = window.setTimeout(() => setResult(searchVerses(data, query)), 120)
    return () => window.clearTimeout(t)
  }, [query, data])

  const hits = useMemo(() => result?.hits ?? [], [result])

  return (
    <div className="index-backdrop" onClick={onClose}>
      <div className="index-panel search-panel" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="index-head">
          <strong>بحث في المصحف</strong>
          <button className="index-close" onClick={onClose} title="إغلاق (Esc)" aria-label="إغلاق البحث">
            <IconClose />
          </button>
        </div>
        <input
          ref={inputRef}
          className="mark-input search-input"
          placeholder={data ? 'اكتب كلمات من الآية… (بتشكيل أو بدون)' : '… يُجهَّز فهرس البحث'}
          value={query}
          disabled={!data && !error}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && hits.length > 0) onGo(hits[0].key)
            if (e.key === 'Escape') onClose()
          }}
        />
        {error && <p className="tafsir-status tafsir-status--error">تعذر تحميل فهرس البحث: {error}</p>}
        {result && result.query.length >= 2 && (
          <p className="search-count">
            {result.total === 0
              ? 'لا نتائج — جرّب كلمات أقل أو صياغة أخرى'
              : `${ayahCount(result.total)}${result.total > hits.length ? ` — تُعرض أول ${arNum(hits.length)}` : ''}`}
          </p>
        )}
        {/* النتيجة: نص الآية أولاً وأكبر — هو ما يقرؤه الباحث ليتعرّف على مراده،
            والمرجع (السورة/الآية/الصفحة) سطر خادم تحته. كان معكوساً: المرجع
            كبيراً مفرّقاً على العرض والنص سطراً باهتاً في الذيل. */}
        <div className="index-list search-list">
          {hits.map((h) => (
            <button key={h.key} className="search-hit" onClick={() => onGo(h.key)}>
              {/* نص الآية من verses-text.json المحمي بالبصمة — نص أصول معتمد
                  نظيف (بلا فواصل)، لا كتابة يدوية */}
              <span className="search-hit-text">{data?.[h.key]?.t ?? ''}</span>
              <span className="search-hit-ref">
                <span className="search-hit-surah" style={{ fontFamily: SURAH_NAMES_FAMILY }}>
                  {surahNameText(h.surah)}
                </span>
                <span>الآية {arNum(h.ayah)}</span>
                {pages[h.key] && <span>صفحة {arNum(pages[h.key].page)}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
