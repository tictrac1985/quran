// فهرس المصحف — سور / أجزاء / أحزاب / صفحات.
// أسماء السور تُعرض بمحارف surah-name-v2 (ligature) — لا نص عربي يدوي لاسم سورة؛
// تسميات الأجزاء والأحزاب نص واجهة (كروم) وليست نصاً قرآنياً.
import { useEffect, useState } from 'react'
import { juzLabel, loadMeta } from '../../lib/meta'
import { ensureExtraFonts, SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import { LAST_PAGE, useReaderStore } from '../../stores/reader'
import type { MetaEntry, MushafMeta } from '../../types/mushaf'
import { IconClose, IconStarFilled } from '../icons/Icons'

type Tab = 'surahs' | 'juz' | 'hizb' | 'pages' | 'marks'

const TABS: { id: Tab; label: string }[] = [
  { id: 'surahs', label: 'السور' },
  { id: 'juz', label: 'الأجزاء' },
  { id: 'hizb', label: 'الأحزاب' },
  { id: 'pages', label: 'الصفحات' },
  { id: 'marks', label: 'الإشارات' },
]

const arNum = (n: number) => n.toLocaleString('ar-EG')

interface IndexPanelProps {
  currentPage: number
  onGo: (page: number) => void
  onClose: () => void
}

export function IndexPanel({ currentPage, onGo, onClose }: IndexPanelProps) {
  const [meta, setMeta] = useState<MushafMeta | null>(null)
  const [tab, setTab] = useState<Tab>('surahs')
  const { bookmarks, removeBookmark } = useReaderStore()

  // الميتا + خط أسماء السور معاً قبل أول رسم — لا محرف يظهر قبل خطه
  useEffect(() => {
    let cancelled = false
    Promise.all([loadMeta(), ensureExtraFonts()])
      .then(([m]) => {
        if (!cancelled) setMeta(m)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // المدخل الحاوي للصفحة الحالية: بدايته ≤ الحالية < بداية الذي يليه
  const isCurrent = (entries: MetaEntry[], i: number) =>
    currentPage >= entries[i].page &&
    (i + 1 >= entries.length || currentPage < entries[i + 1].page)

  const entryList = (entries: MetaEntry[], label: (n: number) => string, glyph: boolean) => (
    <div className="index-list">
      {entries.map((e, i) => (
        <button
          key={e.n}
          className={'index-item' + (isCurrent(entries, i) ? ' index-item--current' : '')}
          onClick={() => onGo(e.page)}
        >
          <span className="index-badge">{arNum(e.n)}</span>
          {glyph ? (
            <span className="index-name" style={{ fontFamily: SURAH_NAMES_FAMILY }}>
              {surahNameText(e.n)}
            </span>
          ) : (
            <span className="index-text">{label(e.n)}</span>
          )}
          <span className="index-page">{arNum(e.page)}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="index-backdrop" onClick={onClose}>
      <div className="index-panel" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="index-head">
          <strong>فهرس المصحف</strong>
          <button className="index-close" onClick={onClose} aria-label="إغلاق الفهرس">
            <IconClose />
          </button>
        </div>
        <div className="index-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={'index-tab' + (tab === t.id ? ' index-tab--active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'marks' ? (
          <div className="index-list">
            {bookmarks.length === 0 ? (
              <p className="index-loading">
                لا إشارات بعد.
                <br />
                احفظ موضعك من زر النجمة في سكة الأدوات، وستجده هنا.
              </p>
            ) : (
              bookmarks.map((b) => (
                <div
                  key={b.id}
                  className={
                    'index-item index-mark' + (b.page === currentPage ? ' index-item--current' : '')
                  }
                >
                  <button className="index-mark-go" onClick={() => onGo(b.page)}>
                    <span className="index-badge">
                      <IconStarFilled />
                    </span>
                    <span className="index-text">{b.name}</span>
                    <span className="index-page">{arNum(b.page)}</span>
                  </button>
                  <button
                    className="index-mark-del"
                    onClick={() => removeBookmark(b.id)}
                    title="حذف الإشارة"
                    aria-label={`حذف الإشارة ${b.name}`}
                  >
                    <IconClose />
                  </button>
                </div>
              ))
            )}
          </div>
        ) : !meta ? (
          <div className="index-list">
            <p className="index-loading">…</p>
          </div>
        ) : tab === 'surahs' ? (
          entryList(meta.surahs, () => '', true)
        ) : tab === 'juz' ? (
          entryList(meta.juz, juzLabel, false)
        ) : tab === 'hizb' ? (
          entryList(meta.hizb, (n) => `الحزب ${arNum(n)}`, false)
        ) : (
          <div className="index-list index-pages">
            {Array.from({ length: LAST_PAGE }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                className={'index-pageno' + (p === currentPage ? ' index-item--current' : '')}
                onClick={() => onGo(p)}
              >
                {arNum(p)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
