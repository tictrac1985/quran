// القارئ — أصول QCF4 (طبعة 1441هـ). التحديد بهوية "سورة:آية:موضع".
//
// الهيكل (إعادة تصميم): شبكة CSS حقيقية من ثلاث مناطق — سكة الأدوات على حافة
// البداية، والمسرح، والعتبة السفلية. كانت السكة والشريط السفلي عنصرين مطلقين
// فوق المسرح، فكان الشريط يقصّ أسفل الورقة (دائرة رقم الصفحة) وكان 100cqh
// للمسرح يحسب مساحةً مغطاة. بالشبكة صار المسرح يساوي ما يُرى منه فعلاً.
import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react'
import { LAST_PAGE, useReaderStore, type Theme } from '../../stores/reader'
import { dueReviews, planToday, useWirdsStore } from '../../stores/wirds'
import { dateKey } from '../../lib/srs'
import { prefetchPages } from '../../lib/pageCache'
import { loadVerseLocs } from '../../lib/tafsir'
import { hizbOfPage, juzOfPage, loadMeta, quarterLabel, rubOfPage } from '../../lib/meta'
import type { MushafMeta } from '../../types/mushaf'
import { useIntegrityReport } from '../Integrity/IntegrityGate'
import { MushafPage } from '../MushafPage/MushafPage'
import { IndexPanel } from '../Index/IndexPanel'
import { TafsirPanel } from '../Tafsir/TafsirPanel'
import { SearchPanel } from '../Search/SearchPanel'
import { ProgressRing, WirdPanel } from '../Wird/WirdPanel'
import {
  IconClose,
  IconFocus,
  IconHalf,
  IconIndex,
  IconMinus,
  IconMoon,
  IconNext,
  IconPlus,
  IconPrev,
  IconSeal,
  IconSearch,
  IconSingle,
  IconSpread,
  IconStar,
  IconStarFilled,
  IconSun,
} from '../icons/Icons'

const THEME_ICON: Record<Theme, typeof IconSun> = { day: IconSun, sepia: IconHalf, night: IconMoon }
const THEME_LABEL: Record<Theme, string> = { day: 'نهاري', sepia: 'سيبيا', night: 'ليلي' }
const THEME_NEXT: Record<Theme, Theme> = { day: 'sepia', sepia: 'night', night: 'day' }

const arNum = (n: number) => n.toLocaleString('ar-EG')

/** ——— التوقيع: خيط حرف المصحف ———
 * حافة كتلة الورق في المصحف المطبوع تُري القارئ موضعه من الختمة بنظرة واحدة.
 * هنا الخيط نفسه: شُرَط الأجزاء الثلاثين، وقطعة ذهبية عند موضعك، وسحبٌ ينتقل. */
function ForeEdge({ page, meta, onGo }: { page: number; meta: MushafMeta | null; onGo: (p: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [hover, setHover] = useState<{ page: number; top: number } | null>(null)

  const pageAt = (clientY: number) => {
    const el = ref.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientY - r.top) / r.height))
    return { page: Math.min(LAST_PAGE, Math.max(1, Math.round(t * (LAST_PAGE - 1)) + 1)), top: t * r.height }
  }

  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const at = pageAt(e.clientY)
    if (at) setHover(at)
    // زر الفأرة مضغوط ⇒ سحب مباشر عبر الختمة
    if (at && e.buttons === 1) onGo(at.page)
  }

  return (
    <button
      ref={ref}
      className="fore-edge"
      aria-label={`موضعك من المصحف: صفحة ${arNum(page)} من ${arNum(LAST_PAGE)} — اسحب للانتقال`}
      data-label={hover ? `صفحة ${arNum(hover.page)}` : `صفحة ${arNum(page)} من ${arNum(LAST_PAGE)}`}
      style={hover ? ({ '--label-top': `${hover.top}px` } as React.CSSProperties) : undefined}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={(e) => {
        const at = pageAt(e.clientY)
        if (at) onGo(at.page)
      }}
    >
      <span className="fore-edge-track">
        {meta?.juz.map((j) => (
          <i
            key={j.n}
            className="fore-edge-juz"
            style={{ top: `${((j.page - 1) / (LAST_PAGE - 1)) * 100}%` }}
          />
        ))}
        <span className="fore-edge-mark" style={{ top: `${((page - 1) / (LAST_PAGE - 1)) * 100}%` }} />
      </span>
    </button>
  )
}

export function Reader() {
  const {
    page,
    mode,
    zoom,
    bookmarks,
    theme,
    focus,
    setPage,
    nextPage,
    prevPage,
    toggleMode,
    zoomIn,
    zoomOut,
    resetZoom,
    addBookmark,
    removeBookmark,
    cycleTheme,
    toggleFocus,
  } = useReaderStore()
  const report = useIntegrityReport()
  // quiet: تحديد من نتيجة بحث — يظلّل الآية كاملة بلا فتح لوحة التفسير
  const [selected, setSelected] = useState<{ id: string; verseKey: string; quiet?: boolean } | null>(null)
  const [jumpValue, setJumpValue] = useState('')
  const [indexOpen, setIndexOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [wirdOpen, setWirdOpen] = useState(false)
  // الميتا (سور/أجزاء/أحزاب/أرباع) — لمؤشر الموضع وشُرَط خيط الحرف
  const [meta, setMeta] = useState<MushafMeta | null>(null)
  const { readingPlan, readingToday, visitedToday, congratsDismissedDay, recordPageVisit, dismissCongrats } =
    useWirdsStore()
  // حلقة الزر: تقدم نصيب اليوم من الخطة؛ بلا خطة = حلقة كاملة بمجرد قراءة صفحة
  const planProgressToday = readingPlan ? planToday(readingPlan, readingToday.startPos, dateKey()) : null
  const ringRatio = planProgressToday
    ? Math.min(1, (readingPlan!.position - readingToday.startPos) / planProgressToday.perDay)
    : visitedToday.length > 0
      ? 1
      : 0
  const [markOpen, setMarkOpen] = useState(false)
  const [markName, setMarkName] = useState('')
  const [idle, setIdle] = useState(false)
  const spread = mode === 'spread'
  const currentMark = bookmarks.find((b) => b.page === page)
  const ThemeIcon = THEME_ICON[theme]

  // RTL: «التالي» في اتجاه اليسار. Ctrl+F/Ctrl+K يفتحان البحث.
  // Esc يغلق الأحدث ظهوراً: البحث ثم لوحة التفسير ثم وضع التركيز
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowLeft') nextPage()
      else if (e.key === 'ArrowRight') prevPage()
      else if (e.key === 'Escape') {
        if (searchOpen) setSearchOpen(false)
        else if (wirdOpen) setWirdOpen(false)
        else if (selected) setSelected(null)
        else if (focus && !indexOpen && !markOpen) toggleFocus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextPage, prevPage, focus, indexOpen, markOpen, toggleFocus, selected, searchOpen, wirdOpen])

  // الثيم يُطبَّق على جذر المستند فتتبدل متغيرات CSS وحدها
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // الميتا تُحمَّل مرة واحدة — مؤشر الموضع وشُرَط الأجزاء على خيط الحرف
  useEffect(() => {
    loadMeta().then(setMeta).catch(() => {})
  }, [])

  // سكون القارئ: السكة والعتبة تخفتان (لا تختفيان) بعد ٤ ثوانٍ بلا نشاط.
  // pointermove كان يوقظ عند كل حركة فأرة مهما دقّت؛ الآن عتبة مسافة ٦ بكسل
  // حتى لا ترتجف الواجهة مع رعشة اليد على الفأرة.
  useEffect(() => {
    let timer = 0
    let lx = 0
    let ly = 0
    const sleep = () => setIdle(true)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(sleep, 4000)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) < 6) return
      lx = e.clientX
      ly = e.clientY
      wake()
    }
    wake()
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerdown', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  // راية تخطٍّ: نتيجة البحث تُضبط ثم تقلب الصفحة — بلاها كان مؤثر إعادة الضبط
  // يمسح التحديد فور قلب الصفحة، فلا يظهر التظليل أبداً خارج الصفحة الحالية
  const skipSelectionClear = useRef(false)
  useEffect(() => {
    if (skipSelectionClear.current) {
      skipSelectionClear.current = false
      return
    }
    setSelected(null)
  }, [page, mode])

  // تقليب بعجلة الفأرة: دفعها للأمام (لأعلى) يقدّم للتالي، وسحبها للخلف
  // (لأسفل) يرجع للصفحة السابقة. عند تكبير الصفحة فوق مقاس المسرح يُترك
  // التمرير الطبيعي يعمل بدل التقليب
  const stageRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    let acc = 0
    let lastFlip = 0
    const onWheel = (e: WheelEvent) => {
      if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) return
      e.preventDefault()
      const now = Date.now()
      if (now - lastFlip > 400) acc = 0
      acc += e.deltaY
      if (Math.abs(acc) >= 60) {
        if (acc > 0) prevPage()
        else nextPage()
        acc = 0
        lastFlip = now
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [nextPage, prevPage])

  // الجلب المسبق للجوار: التقليب التالي يجد الصفحة جاهزة بلا وميض
  useEffect(() => {
    prefetchPages(spread ? [page + 2, page + 3, page - 1, page - 2] : [page + 1, page - 1])
  }, [page, spread])

  // ورد القراءة: الصفحة تُحسب بعد مكوث ثانيتين عليها. بلا المهلة كان التقليب
  // السريع بحثاً عن موضع يحسب عشرات الصفحات «مقروءة» فيكذب عداد الختمة.
  useEffect(() => {
    const t = window.setTimeout(() => {
      recordPageVisit(page)
      if (spread && page < LAST_PAGE) recordPageVisit(page + 1)
    }, 2000)
    return () => window.clearTimeout(t)
  }, [page, spread, recordPageVisit])

  // التذكير اليومي (مؤقت بإشعارات المتصفح؛ نظامي كامل مع Tauri): يفحص كل
  // دقيقة — إن حان الوقت ولم يُنجز الورد ولم يُذكَّر اليوم، أشعرَ به
  const reminder = useWirdsStore((s) => s.reminder)
  useEffect(() => {
    if (!reminder.enabled || typeof Notification === 'undefined') return
    const tick = () => {
      if (Notification.permission !== 'granted') return
      const now = new Date()
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const s = useWirdsStore.getState()
      if (hhmm < s.reminder.time || s.reminder.lastDay === dateKey()) return
      const pt = s.readingPlan ? planToday(s.readingPlan, s.readingToday.startPos, dateKey()) : null
      const allDone = (pt ? pt.done : s.visitedToday.length > 0) && dueReviews(s.hifz).length === 0
      if (allDone) return
      new Notification('وردك بانتظارك', { body: 'حان وقت رحلتك اليومية مع القرآن — آية تُثبّت القلب' })
      s.markRemindedToday()
    }
    tick()
    const t = window.setInterval(tick, 60_000)
    return () => window.clearInterval(t)
  }, [reminder.enabled, reminder.time, reminder.lastDay])

  const onSelectWord = (id: string, verseKey: string) =>
    setSelected((cur) => (cur?.id === id ? null : { id, verseKey }))

  // فتح نتيجة بحث: تظليل الآية كلها (علامة :v) بلا لوحة تفسير، وقلب الصفحة عند
  // اللزوم مع حماية التحديد من مؤثر إعادة الضبط (الراية أعلاه)
  const onSearchGo = (verseKey: string) => {
    setSearchOpen(false)
    loadVerseLocs()
      .then((locs) => {
        const p = locs[verseKey]?.page
        const needTurn = p !== undefined && (spread ? p !== page && p !== page + 1 : p !== page)
        if (needTurn) skipSelectionClear.current = true
        setSelected({ id: `${verseKey}:v`, verseKey, quiet: true })
        if (needTurn) setPage(p)
      })
      .catch(() => {})
  }
  // تنقل لوحة التفسير بين الآيات: يظلّل أول كلمة، ويقلب الصفحة إن خرجت الآية
  // عن المعروض حالياً (بنفس حماية الراية من مؤثر إعادة الضبط)
  const onTafsirNavigate = (verseKey: string) => {
    loadVerseLocs()
      .then((locs) => {
        const p = locs[verseKey]?.page
        const needTurn = p !== undefined && (spread ? p !== page && p !== page + 1 : p !== page)
        if (needTurn) skipSelectionClear.current = true
        setSelected({ id: `${verseKey}:1`, verseKey })
        if (needTurn) setPage(p)
      })
      .catch(() => {})
  }

  const onJump = (e: FormEvent) => {
    e.preventDefault()
    const n = Number.parseInt(jumpValue, 10)
    if (Number.isFinite(n)) setPage(n)
    setJumpValue('')
  }

  const goPage = useCallback((p: number) => setPage(p), [setPage])

  const atFirst = page <= 1
  const atLast = spread ? page >= LAST_PAGE - 1 : page >= LAST_PAGE
  const tafsirOpen = selected !== null && !selected.quiet
  const idleNow = idle && !indexOpen && !markOpen && !searchOpen && !wirdOpen
  const readDone = planProgressToday?.done ?? false
  const showCongrats = readDone && congratsDismissedDay !== dateKey()

  const wirdLabel = planProgressToday
    ? `رحلتي — اقرأ اليوم حتى صفحة ${arNum(planProgressToday.targetEnd)}${readDone ? ' (تام)' : ''}`
    : visitedToday.length > 0
      ? `رحلتي — قرأت اليوم ${arNum(visitedToday.length)} صفحة`
      : 'رحلتي — خطط القراءة والحفظ والمراجعة'

  return (
    <div
      className={
        'app-shell' +
        (focus ? ' app-shell--focus' : '') +
        (tafsirOpen ? ' app-shell--aside' : '') +
        (idleNow ? ' chrome--idle' : '')
      }
    >
      {!focus && (
        <nav className="reader-rail" aria-label="أدوات المصحف">
          <div className="rail-group">
            <button
              className={'rail-btn' + (indexOpen ? ' rail-btn--active' : '')}
              data-label="فهرس المصحف"
              aria-label="فهرس المصحف"
              onClick={() => setIndexOpen(true)}
            >
              <IconIndex />
            </button>
            <button
              className="rail-btn"
              data-label="بحث في المصحف (Ctrl+F)"
              aria-label="بحث في المصحف"
              onClick={() => setSearchOpen(true)}
            >
              <IconSearch />
            </button>
          </div>

          <div className="rail-sep" />

          <div className="rail-group">
            <button
              className="rail-btn"
              data-label={wirdLabel}
              aria-label={wirdLabel}
              onClick={() => setWirdOpen(true)}
            >
              <ProgressRing ratio={ringRatio} size={20} />
            </button>
            <button
              className={'rail-btn' + (currentMark ? ' rail-btn--active' : '')}
              data-label={currentMark ? `إزالة الإشارة «${currentMark.name}»` : 'حفظ إشارة هنا'}
              aria-label={currentMark ? `إزالة الإشارة ${currentMark.name}` : 'حفظ إشارة هنا'}
              aria-pressed={!!currentMark}
              onClick={() =>
                currentMark ? removeBookmark(currentMark.id) : (setMarkName(''), setMarkOpen(true))
              }
            >
              {currentMark ? <IconStarFilled /> : <IconStar />}
            </button>
          </div>

          <div className="rail-sep" />

          <div className="rail-group">
            <button
              className="rail-btn"
              data-label={`السراج: ${THEME_LABEL[theme]} — انتقل إلى ${THEME_LABEL[THEME_NEXT[theme]]}`}
              aria-label={`تغيير الإضاءة، الحالية ${THEME_LABEL[theme]}`}
              onClick={cycleTheme}
            >
              <ThemeIcon />
            </button>
            <button
              className="rail-btn"
              data-label={spread ? 'عرض صفحة واحدة' : 'عرض صفحتين متقابلتين'}
              aria-label={spread ? 'عرض صفحة واحدة' : 'عرض صفحتين متقابلتين'}
              onClick={toggleMode}
            >
              {spread ? <IconSingle /> : <IconSpread />}
            </button>
            <button
              className="rail-btn"
              data-label="وضع التركيز — إخفاء الأدوات (Esc للخروج)"
              aria-label="وضع التركيز"
              onClick={toggleFocus}
            >
              <IconFocus />
            </button>
          </div>

          <ForeEdge page={page} meta={meta} onGo={goPage} />
        </nav>
      )}

      <div className="stage-frame">
        <main ref={stageRef} className="reader-stage">
          {spread ? (
            <div className="mushaf-spread" dir="rtl">
              <MushafPage
                key={page}
                pageNumber={page}
                selectedWordId={selected?.id ?? null}
                onSelectWord={onSelectWord}
              />
              {/* طيّة المجلّد: الصفحتان تلتقيان على خيط واحد كمصحف مفتوح */}
              <span className="mushaf-gutter" aria-hidden="true" />
              <MushafPage
                key={page + 1}
                pageNumber={page + 1}
                selectedWordId={selected?.id ?? null}
                onSelectWord={onSelectWord}
              />
            </div>
          ) : (
            <MushafPage
              key={page}
              pageNumber={page}
              selectedWordId={selected?.id ?? null}
              onSelectWord={onSelectWord}
            />
          )}
        </main>

        {!focus && (
          <>
            <button
              className="flip-btn flip-btn--prev"
              onClick={prevPage}
              disabled={atFirst}
              data-label="الصفحة السابقة"
              aria-label="الصفحة السابقة"
            >
              <IconPrev />
            </button>
            <button
              className="flip-btn flip-btn--next"
              onClick={nextPage}
              disabled={atLast}
              data-label="الصفحة التالية"
              aria-label="الصفحة التالية"
            >
              <IconNext />
            </button>
          </>
        )}

        {focus && (
          <button className="focus-exit" onClick={toggleFocus} aria-label="الخروج من وضع التركيز (Esc)">
            <IconClose />
          </button>
        )}

        {showCongrats && !wirdOpen && (
          <div className="wird-toast" dir="rtl" role="status">
            <IconSeal />
            <span>أتممت نصيب اليوم من ختمتك — بارك الله فيك</span>
            <button className="reader-btn icon-btn" onClick={dismissCongrats} aria-label="إغلاق التهنئة">
              <IconClose />
            </button>
          </div>
        )}
      </div>

      {tafsirOpen && (
        <TafsirPanel
          verseKey={selected!.verseKey}
          onClose={() => setSelected(null)}
          onNavigate={onTafsirNavigate}
        />
      )}

      {!focus && (
        <footer className="reader-ledge">
          <div className="ledge-side">
            <button
              className="ledge-place"
              onClick={() => setIndexOpen(true)}
              title="موضعك في الأجزاء والأحزاب — انقر لفتح الفهرس"
            >
              {meta ? (
                <>
                  الجزء {arNum(juzOfPage(meta, page))}
                  <em>·</em>
                  الحزب {arNum(hizbOfPage(meta, page))}
                  <em>·</em>
                  {quarterLabel(rubOfPage(meta, page))}
                </>
              ) : (
                '…'
              )}
            </button>
            <span className="ledge-rule" />
            <span className="ledge-page">
              <b>{spread ? `${arNum(page)}–${arNum(page + 1)}` : arNum(page)}</b>
              <span>من {arNum(LAST_PAGE)}</span>
            </span>
          </div>

          <div className="ledge-side">
            {report && (
              <span className="ledge-seal" title={`بصمة الحزمة ${report.bundleSha256}`}>
                <IconSeal />
                {arNum(report.verified)} ملفاً مطابقاً
              </span>
            )}
            <span className="ledge-rule" />
            <form onSubmit={onJump}>
              <input
                className="ledge-jump"
                type="number"
                min={1}
                max={LAST_PAGE}
                placeholder="اذهب…"
                aria-label="الانتقال إلى صفحة"
                value={jumpValue}
                onChange={(e) => setJumpValue(e.target.value)}
              />
            </form>
            <div className="ledge-zoom">
              <button onClick={zoomOut} disabled={zoom <= 0.7} aria-label="تصغير الصفحة" title="تصغير">
                <IconMinus />
              </button>
              <button className="ledge-zoom-val" onClick={resetZoom} title="إعادة المقاس الأصلي">
                {arNum(Math.round(zoom * 100))}٪
              </button>
              <button onClick={zoomIn} disabled={zoom >= 1.6} aria-label="تكبير الصفحة" title="تكبير">
                <IconPlus />
              </button>
            </div>
          </div>
        </footer>
      )}

      {searchOpen && <SearchPanel onGo={onSearchGo} onClose={() => setSearchOpen(false)} />}

      {wirdOpen && (
        <WirdPanel
          onClose={() => setWirdOpen(false)}
          onGoPage={(p) => {
            setWirdOpen(false)
            setPage(p)
          }}
        />
      )}

      {indexOpen && (
        <IndexPanel
          currentPage={page}
          onGo={(p) => {
            setPage(p)
            setIndexOpen(false)
          }}
          onClose={() => setIndexOpen(false)}
        />
      )}

      {markOpen && (
        <div className="index-backdrop index-backdrop--center" onClick={() => setMarkOpen(false)}>
          <div className="mark-card" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <strong className="mark-title">إشارة مرجعية — صفحة {arNum(page)}</strong>
            <form
              className="mark-form"
              onSubmit={(e) => {
                e.preventDefault()
                addBookmark(markName || `صفحة ${page}`)
                setMarkOpen(false)
              }}
            >
              <input
                autoFocus
                className="mark-input"
                placeholder="سمِّ الإشارة… (مثل: ورد الفجر)"
                value={markName}
                onChange={(e) => setMarkName(e.target.value)}
                maxLength={60}
              />
              <div className="mark-actions">
                <button type="submit" className="reader-btn reader-btn--primary">
                  احفظ الإشارة
                </button>
                <button type="button" className="reader-btn" onClick={() => setMarkOpen(false)}>
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
