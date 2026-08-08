// لوحة التفسير الجانبية — تنفتح عند تحديد كلمة في الصفحة (مرحلة 3.2).
// تبويبان (ابن كثير / السعدي) يُحمَّلان كسلاً ملفَ سورةٍ واحدة، اسم السورة
// يُرسم بخط surah-name-v2 (لا نص عربي يدوي لاسم سورة)، والتنقل بين آيات السورة.
import { useEffect, useState } from 'react'
import { ensureExtraFonts, SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import { loadTafsir, TAFSIR_LABEL, TAFSIR_SLUGS, type SurahTafsir, type TafsirSlug } from '../../lib/tafsir'
import { surahTotal } from '../../lib/ayahCounts'
import { IconClose, IconNext, IconPrev } from '../icons/Icons'

const arNum = (n: number) => n.toLocaleString('ar-EG')

interface Props {
  verseKey: string // «سورة:آية»
  onClose: () => void
  onNavigate: (verseKey: string) => void
}

export function TafsirPanel({ verseKey, onClose, onNavigate }: Props) {
  const [surah, ayah] = verseKey.split(':').map(Number)
  const [tab, setTab] = useState<TafsirSlug>('ibn-kathir')
  const [data, setData] = useState<Partial<Record<TafsirSlug, SurahTafsir>>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureExtraFonts()
  }, [])

  // جلب تفاسير السورة كلها (ابن كثير/السعدي/أسباب النزول)؛ تبديل التبويب فوري
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    // ملفات أسباب النزول موجودة لنحو ٥٠ سورة فقط: سورة بلا ملف = تبويب فارغ،
    // لا خطأ يُسقط بقية التبويبات
    Promise.all(
      TAFSIR_SLUGS.map((slug) =>
        loadTafsir(slug, surah)
          .then((d) => [slug, d] as const)
          .catch(() => [slug, {} as SurahTafsir] as const),
      ),
    )
      .then((pairs) => {
        if (alive) {
          setData(Object.fromEntries(pairs) as Record<TafsirSlug, SurahTafsir>)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e instanceof Error ? e.message : e))
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [surah])

  const text = data[tab]?.[verseKey]
  const emptyMsg =
    tab === 'asbab'
      ? 'لم يرد سبب نزول مُثبت لهذه الآية في المصدر المعتمد.'
      : 'لا يوجد نص تفسير لهذه الآية.'
  const total = surahTotal(surah)

  return (
    <aside className="tafsir-panel" dir="rtl" aria-label={`تفسير الآية ${verseKey}`}>
      <div className="tafsir-head">
        <span className="tafsir-surah" style={{ fontFamily: SURAH_NAMES_FAMILY }}>
          {surahNameText(surah)}
        </span>
        <div className="tafsir-ayah-nav">
          <button
            className="reader-btn icon-btn"
            disabled={ayah <= 1}
            onClick={() => onNavigate(`${surah}:${ayah - 1}`)}
            title="الآية السابقة"
            aria-label="الآية السابقة"
          >
            <IconPrev />
          </button>
          <span className="tafsir-ayah-no">الآية {arNum(ayah)}</span>
          <button
            className="reader-btn icon-btn"
            disabled={ayah >= total}
            onClick={() => onNavigate(`${surah}:${ayah + 1}`)}
            title="الآية التالية"
            aria-label="الآية التالية"
          >
            <IconNext />
          </button>
        </div>
        <button
          className="reader-btn icon-btn"
          onClick={onClose}
          title="إغلاق (Esc)"
          aria-label="إغلاق لوحة التفسير"
        >
          <IconClose />
        </button>
      </div>

      <div className="tafsir-tabs" role="tablist">
        {TAFSIR_SLUGS.map((slug) => (
          <button
            key={slug}
            role="tab"
            aria-selected={tab === slug}
            className={'tafsir-tab' + (tab === slug ? ' tafsir-tab--active' : '')}
            onClick={() => setTab(slug)}
          >
            {TAFSIR_LABEL[slug]}
          </button>
        ))}
      </div>

      <div className="tafsir-body">
        {loading && <p className="tafsir-status">… يُحمَّل التفسير</p>}
        {error && <p className="tafsir-status tafsir-status--error">تعذر تحميل التفسير: {error}</p>}
        {!loading && !error && (
          <p className="tafsir-text">{text ?? emptyMsg}</p>
        )}
      </div>
    </aside>
  )
}
