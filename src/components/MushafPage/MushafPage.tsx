// صفحة المصحف — أصول QCF4 (طبعة 1441هـ): بنية الأسطر تأتي جاهزة في ملف الصفحة
// (surah_header / bismillah / word / end) بترقيمها المطبوع، والمحارف من char
// (مجال PUA) فقط — لا نص عربي يُعرض إطلاقاً. الضبط: space-between للأسطر
// الممتلئة، وتوسيط للافتة والبسملة وسطر خاتمة السورة كما في المطبوع.
// الأثاث: إطار مزدوج + ترويسة (سورة بمحرفها الرسمي + جزء الصفحة) + تذييل برقم
// مشرقي؛ صفحتا الافتتاح (1-2) بلا أثاث كما في طبعة المدينة.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { SURAH_NAMES_FAMILY, surahNameText } from '../../lib/fonts'
import { useReaderStore } from '../../stores/reader'
import { getCachedPage, loadPage } from '../../lib/pageCache'
import {
  loadCanonicalBasmala,
  type CanonicalBasmalaGlyph,
} from '../../lib/canonicalBasmala'
import { juzLabel, juzOfPage, loadMeta } from '../../lib/meta'
import { surahTotal } from '../../lib/ayahCounts'
import type { Qcf4Line, Qcf4Page } from '../../types/mushaf'
import { WordSpan } from '../WordSpan/WordSpan'

/** معيّن ماسي يتوسط زوايا القاعدة الذهبية — SVG خالص، لون الثيم عبر currentColor */
function CornerOrnament({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="7" y="7" width="10" height="10" transform="rotate(45 12 12)"
        fill="var(--paper)" stroke="currentColor" strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  )
}

/** هل يحوي السطر خاتمة سورة (آخر آياتها)؟ ⇒ يُوسَّط كما في المطبوع */
function lineEndsSurah(line: Qcf4Line): boolean {
  for (const w of line.words) {
    if (!w.verse_key) continue
    const [s, v] = w.verse_key.split(':').map(Number)
    if (Number.isFinite(s) && Number.isFinite(v) && v === surahTotal(s)) return true
  }
  return false
}

interface MushafPageProps {
  pageNumber: number
  selectedWordId: string | null
  onSelectWord?: (id: string, verseKey: string) => void
}

export function MushafPage({ pageNumber, selectedWordId, onSelectWord }: MushafPageProps) {
  const [page, setPage] = useState<Qcf4Page | null>(null)
  const [juz, setJuz] = useState<number | null>(null)
  const [canonicalBasmala, setCanonicalBasmala] = useState<
    ReadonlyArray<CanonicalBasmalaGlyph> | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const zoom = useReaderStore((s) => s.zoom)
  const sheetRef = useRef<HTMLDivElement>(null)

  // توضيح موضع النتيجة داخل الصفحة: تمرير سلس إلى الآية المحددة إن خرجت عن
  // مرمى النظر (زوم مرتفع)، بلا إزعاج إن كانت ظاهرة أصلاً
  useEffect(() => {
    if (!selectedWordId) return
    const t = window.setTimeout(() => {
      const root = sheetRef.current
      if (!root) return
      const el = selectedWordId.endsWith(':v')
        ? root.querySelector(`[data-verse="${selectedWordId.slice(0, -2)}"]`)
        : root.querySelector(`[data-word-id="${CSS.escape(selectedWordId)}"]`)
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }, 60)
    return () => window.clearTimeout(t)
  }, [selectedWordId])

  useEffect(() => {
    let cancelled = false
    const cached = getCachedPage(pageNumber)
    // مع المخبأ لا وميض: نُبقي الصفحة السابقة حتى تُطبق الجديدة في نفس الإطار
    if (!cached) {
      setPage(null)
      setJuz(null)
      setCanonicalBasmala(null)
    }
    setError(null)
    Promise.all([loadMeta(), cached ? Promise.resolve(cached) : loadPage(pageNumber)])
      .then(async ([meta, bundle]) => {
        const hasBasmala = bundle.data.lines.some((line) => line.words[0]?.type === 'bismillah')
        const basmala = hasBasmala ? await loadCanonicalBasmala() : null
        if (cancelled) return
        setJuz(juzOfPage(meta, pageNumber))
        setCanonicalBasmala(basmala)
        setPage(bundle.data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [pageNumber])

  // جسم الشبكة (الحالات الثلاث: خطأ / انتظار / رسم)
  let body: ReactNode
  if (error) {
    body = (
      <div className="mushaf-page mushaf-page--state mushaf-page--error">
        <p>تعذر عرض الصفحة {pageNumber}</p>
        <p className="mushaf-state-detail" dir="ltr">{error}</p>
      </div>
    )
  } else if (!page) {
    body = (
      <div className="mushaf-page mushaf-page--state mushaf-page--loading">
        <p>…</p>
      </div>
    )
  } else {
    // الصفحات الناقصة (1-2: ثمانية أسطر) تُوسَّط عمودياً كما في المطبوع
    const shortPage = page.lines.length < 15
    // صفحتا الافتتاح: الأسطر الثمانية تشغل ٨/١٥ من الشبكة، والباقي فراغ متساوٍ
    // فوقها وتحتها. في المطبوع هذا الفراغ ليس فراغاً بل هامش لوحةٍ مُذهَّبة
    // تحيط بالنص. نرسم القاعدة نفسها هنا (أثاث لا نص) فيصير الفراغ مقصوداً.
    const panelInset = ((15 - page.lines.length) / 30) * 100

    body = (
      <div
        className={'mushaf-page' + (shortPage ? ' mushaf-page--short' : '')}
        dir="rtl"
        data-page={pageNumber}
      >
        {shortPage && (
          <span
            className="mushaf-opening-panel"
            style={{ insetBlock: `calc(${panelInset}% - 2.6cqw)` }}
            aria-hidden="true"
          />
        )}
        {page.lines.map((line) => {
          const head = line.words[0]

          if (head.type === 'surah_header') {
            // اللافتة محرف زخرفي واحد جاهز من خط QBSML — تشكيلة المطبوع نفسها
            return (
              <div key={line.line} className="mushaf-line mushaf-line--centered">
                <span className="mushaf-surah-header">
                  {line.words.map((w, i) => (
                    <span key={i} className="mushaf-surah-frame" style={{ fontFamily: w.font }}>
                      {w.char}
                    </span>
                  ))}
                </span>
              </div>
            )
          }

          if (head.type === 'bismillah') {
            return (
              <div key={line.line} className="mushaf-line mushaf-line--centered">
                {(canonicalBasmala ?? []).map((glyph) => (
                  <span
                    key={glyph.position}
                    className="mushaf-basmala"
                    style={{ fontFamily: glyph.font }}
                  >
                    {glyph.char}
                  </span>
                ))}
              </div>
            )
          }

          // صفحتا الافتتاح (1-2): كل الأسطر موسّطة كما في المطبوع
          const centered = pageNumber <= 2 || lineEndsSurah(line)
          return (
            <div
              key={line.line}
              className={
                'mushaf-line ' + (centered ? 'mushaf-line--centered' : 'mushaf-line--justified')
              }
            >
              {line.words.map((w) => {
                const id = `${w.verse_key ?? 'z'}:${w.position ?? 0}`
                // «…:v» علامة تظليل الآية كلها (من نتائج البحث) — :v مستحيلة
                // كموضع كلمة فلا تصطدم بأي معرف حقيقي
                const wholeVerse =
                  selectedWordId?.endsWith(':v') === true &&
                  (w.verse_key ?? '') === selectedWordId.slice(0, -2)
                return (
                  <WordSpan
                    key={id}
                    id={id}
                    glyph={w.char}
                    verseKey={w.verse_key ?? ''}
                    isEnd={w.type === 'end'}
                    fontFamily={w.font}
                    selected={selectedWordId === id || wholeVerse}
                    hit={wholeVerse}
                    onSelect={w.verse_key ? onSelectWord : undefined}
                  />
                )
              })}
            </div>
          )
        })}
      </div>
    )
  }

  // صفحتا الافتتاح بلا أثاث (ترويسة/رقم) كما في طبعة المدينة
  const furniture = pageNumber > 2 && page !== null && juz !== null

  return (
    <div
      ref={sheetRef}
      className="mushaf-sheet"
      dir="rtl"
      data-page={pageNumber}
      style={{ '--zoom': zoom } as CSSProperties}
    >
      <div className="mushaf-sheet-inner">
        <CornerOrnament className="mushaf-corner mushaf-corner--tl" />
        <CornerOrnament className="mushaf-corner mushaf-corner--tr" />
        <CornerOrnament className="mushaf-corner mushaf-corner--bl" />
        <CornerOrnament className="mushaf-corner mushaf-corner--br" />
        {furniture && (
          <div className="mushaf-header">
            <span className="mushaf-header-surah" style={{ fontFamily: SURAH_NAMES_FAMILY }}>
              {surahNameText(page?.surahs[0]?.id ?? 0)}
            </span>
            <span className="mushaf-header-juz">{juzLabel(juz ?? 0)}</span>
          </div>
        )}
        <div className={'mushaf-grid-wrap' + (furniture ? '' : ' mushaf-grid-wrap--full')}>
          {body}
        </div>
        {furniture && (
          <div className="mushaf-footer">
            <span className="mushaf-pageno">{pageNumber.toLocaleString('ar-EG')}</span>
          </div>
        )}
      </div>
    </div>
  )
}
