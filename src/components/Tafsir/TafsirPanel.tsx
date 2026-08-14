// لوحة التفسير الجانبية — تنفتح عند تحديد كلمة في الصفحة (مرحلة 3.2).
// تبويبان (ابن كثير / السعدي) يُحمَّلان كسلاً ملفَ سورةٍ واحدة، اسم السورة
// يُرسم بخط surah-name-v2 (لا نص عربي يدوي لاسم سورة)، والتنقل بين آيات السورة.
import { useEffect, useState } from 'react'
import { ensureExtraFonts, SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import {
  loadTafsir,
  TAFSIR_LABEL,
  TAFSIR_SLUGS,
  type SurahTafsir,
  type TafsirSlug,
} from '../../lib/tafsir'
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
  const [data, setData] = useState<Partial<Record<TafsirSlug, { surah: number; verses: SurahTafsir }>>>(
    {},
  )
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const requestKey = `${tab}/${surah}`

  useEffect(() => {
    ensureExtraFonts()
  }, [])

  // لا نجلب إلا المصدر المفتوح. كان فتح آية واحدة يحمّل المصادر الثلاثة كاملة
  // (عدة ميغابايت في السور الطويلة) حتى لو لم يفتح المستخدم تبويباتها.
  useEffect(() => {
    if (data[tab]?.surah === surah) return
    let alive = true
    let retryTimer: number | undefined

    const request = async () => {
      try {
        return await loadTafsir(tab, surah)
      } catch {
        // محاولة واحدة قصيرة للفشل العابر. loadTafsir يحذف الوعد المرفوض من
        // مخبئه، لذلك هذه محاولة شبكة/قراءة حقيقية وليست إعادة للوعد نفسه.
        await new Promise<void>((resolve) => {
          retryTimer = window.setTimeout(resolve, 250)
        })
        if (!alive) return null
        return loadTafsir(tab, surah)
      }
    }

    request()
      .then((verses) => {
        if (alive) {
          if (verses) setData((current) => ({ ...current, [tab]: { surah, verses } }))
          setFailure((current) => (current?.key === requestKey ? null : current))
        }
      })
      .catch((e) => {
        if (alive) {
          setFailure({ key: requestKey, message: String(e instanceof Error ? e.message : e) })
        }
      })
    return () => {
      alive = false
      if (retryTimer !== undefined) window.clearTimeout(retryTimer)
    }
  }, [surah, tab, data, requestKey])

  const currentData = data[tab]
  const error = failure?.key === requestKey ? failure.message : null
  const loading = currentData?.surah !== surah && error === null
  const text = currentData?.surah === surah ? currentData.verses[verseKey] : undefined
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
            onClick={() => {
              setFailure(null)
              setTab(slug)
            }}
          >
            {TAFSIR_LABEL[slug]}
          </button>
        ))}
      </div>

      <div className="tafsir-body">
        {loading && <p className="tafsir-status">… يُحمَّل التفسير</p>}
        {error && <p className="tafsir-status tafsir-status--error">تعذر تحميل التفسير: {error}</p>}
        {!loading && !error && <p className="tafsir-text">{text ?? emptyMsg}</p>}
      </div>
    </aside>
  )
}
