import { useEffect, useState } from 'react'
import { juzLabel, loadMeta } from '../../lib/meta'
import { ensureExtraFonts, SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import { LAST_PAGE, useReaderStore } from '../../stores/reader'
import type { MetaEntry, MushafMeta } from '../../types/mushaf'
import { IconChevron, IconStarFilled, IconClose } from '../icons/Icons'
import { Drawer, IconButton, TabPanel, Tabs } from '../ui'

type Tab = 'surahs' | 'juz' | 'hizb' | 'pages' | 'marks'

const TABS = [
  { id: 'surahs', label: 'السور' },
  { id: 'juz', label: 'الأجزاء' },
  { id: 'hizb', label: 'الأحزاب' },
  { id: 'pages', label: 'الصفحات' },
  { id: 'marks', label: 'الإشارات' },
] as const

const TABS_ID = 'mushaf-index'
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

  useEffect(() => {
    let cancelled = false
    Promise.all([loadMeta(), ensureExtraFonts()])
      .then(([value]) => {
        if (!cancelled) setMeta(value)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const isCurrent = (entries: MetaEntry[], index: number) =>
    currentPage >= entries[index].page &&
    (index + 1 >= entries.length || currentPage < entries[index + 1].page)

  const go = (page: number) => {
    onGo(page)
    onClose()
  }

  const entryList = (entries: MetaEntry[], label: (n: number) => string, glyph: boolean) => (
    <div className="index-v2__list">
      {entries.map((entry, index) => {
        const current = isCurrent(entries, index)
        return (
          <button
            type="button"
            key={entry.n}
            className="index-v2__item"
            data-current={current || undefined}
            aria-current={current ? 'page' : undefined}
            onClick={() => go(entry.page)}
          >
            <span className="index-v2__number">{arNum(entry.n)}</span>
            {glyph ? (
              <>
                <span className="ui-sr-only">سورة رقم {arNum(entry.n)}</span>
                <span
                  className="index-v2__surah"
                  aria-hidden="true"
                  style={{ fontFamily: SURAH_NAMES_FAMILY }}
                >
                  {surahNameText(entry.n)}
                </span>
              </>
            ) : (
              <span className="index-v2__label">{label(entry.n)}</span>
            )}
            <span className="index-v2__page">صفحة {arNum(entry.page)}</span>
            <IconChevron aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )

  let content
  if (tab === 'marks') {
    content =
      bookmarks.length === 0 ? (
        <div className="ui-empty-state">
          <IconStarFilled />
          <h3>لم تحفظ إشارات بعد</h3>
          <p>احفظ موضعك من زر النجمة، وسيظهر هنا للعودة إليه بسرعة.</p>
        </div>
      ) : (
        <div className="index-v2__list">
          {bookmarks.map((bookmark) => (
            <div
              className="index-v2__bookmark"
              data-current={bookmark.page === currentPage || undefined}
              key={bookmark.id}
            >
              <button
                type="button"
                className="index-v2__bookmark-main"
                onClick={() => go(bookmark.page)}
              >
                <span className="index-v2__number index-v2__number--star">
                  <IconStarFilled />
                </span>
                <span className="index-v2__label">{bookmark.name}</span>
                <span className="index-v2__page">صفحة {arNum(bookmark.page)}</span>
              </button>
              <IconButton
                label={`حذف الإشارة ${bookmark.name}`}
                icon={<IconClose />}
                variant="danger"
                onClick={() => removeBookmark(bookmark.id)}
              />
            </div>
          ))}
        </div>
      )
  } else if (!meta) {
    content = (
      <div className="ui-loading" role="status">
        <span /> جارٍ تجهيز الفهرس
      </div>
    )
  } else if (tab === 'surahs') {
    content = entryList(meta.surahs, () => '', true)
  } else if (tab === 'juz') {
    content = entryList(meta.juz, juzLabel, false)
  } else if (tab === 'hizb') {
    content = entryList(meta.hizb, (n) => `الحزب ${arNum(n)}`, false)
  } else {
    content = (
      <div className="index-v2__pages">
        {Array.from({ length: LAST_PAGE }, (_, index) => index + 1).map((page) => (
          <button
            type="button"
            key={page}
            className="index-v2__page-button"
            data-current={page === currentPage || undefined}
            aria-current={page === currentPage ? 'page' : undefined}
            aria-label={`صفحة ${arNum(page)}`}
            onClick={() => go(page)}
          >
            {arNum(page)}
          </button>
        ))}
      </div>
    )
  }

  return (
    <Drawer
      title="فهرس المصحف"
      description={`موضعك الحالي: صفحة ${arNum(currentPage)}`}
      onClose={onClose}
      size="lg"
      className="index-v2"
    >
      <Tabs items={TABS} value={tab} onChange={setTab} label="أقسام الفهرس" idBase={TABS_ID} />
      <TabPanel idBase={TABS_ID} tabId={tab} className="index-v2__panel">
        {content}
      </TabPanel>
    </Drawer>
  )
}
