// القارئ — أصول QCF4 (طبعة 1441هـ). التحديد بهوية "سورة:آية:موضع".
//
// الهيكل (إعادة تصميم): شبكة CSS حقيقية من ثلاث مناطق — سكة الأدوات على حافة
// البداية، والمسرح، والعتبة السفلية. كانت السكة والشريط السفلي عنصرين مطلقين
// فوق المسرح، فكان الشريط يقصّ أسفل الورقة (دائرة رقم الصفحة) وكان 100cqh
// للمسرح يحسب مساحةً مغطاة. بالشبكة صار المسرح يساوي ما يُرى منه فعلاً.
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
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
import { WirdPanel } from '../Wird/WirdPanel'
import { Button, Dialog, Drawer, IconButton, ProgressRing } from '../ui'
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
  IconSettings,
  IconSun,
} from '../icons/Icons'

const THEME_ICON: Record<Theme, typeof IconSun> = { day: IconSun, sepia: IconHalf, night: IconMoon }
const THEME_LABEL: Record<Theme, string> = { day: 'نهاري', sepia: 'سيبيا', night: 'ليلي' }
const THEME_NEXT: Record<Theme, Theme> = { day: 'sepia', sepia: 'night', night: 'day' }

const arNum = (n: number) => n.toLocaleString('ar-EG')

/** ——— التوقيع: خيط حرف المصحف ———
 * حافة كتلة الورق في المصحف المطبوع تُري القارئ موضعه من الختمة بنظرة واحدة.
 * هنا الخيط نفسه: شُرَط الأجزاء الثلاثين، وقطعة ذهبية عند موضعك، وسحبٌ ينتقل. */
function ForeEdge({
  page,
  meta,
  onGo,
}: {
  page: number
  meta: MushafMeta | null
  onGo: (p: number) => void
}) {
  return (
    <div className="reader-progress" data-label={`صفحة ${arNum(page)} من ${arNum(LAST_PAGE)}`}>
      <span className="reader-progress__ticks" aria-hidden="true">
        {meta?.juz.map((j) => (
          <i
            key={j.n}
            className="reader-progress__tick"
            style={{ top: `${((j.page - 1) / (LAST_PAGE - 1)) * 100}%` }}
          />
        ))}
      </span>
      <input
        className="reader-progress__range"
        type="range"
        min={1}
        max={LAST_PAGE}
        value={page}
        aria-label="الانتقال السريع بين صفحات المصحف"
        aria-valuetext={`صفحة ${arNum(page)} من ${arNum(LAST_PAGE)}`}
        onChange={(event) => onGo(Number(event.target.value))}
      />
      <span className="reader-progress__value" aria-hidden="true">
        {arNum(page)}
      </span>
    </div>
  )
}

function NavAction({
  label,
  shortLabel,
  icon,
  active = false,
  pressed,
  onClick,
  className,
}: {
  label: string
  shortLabel: string
  icon: ReactNode
  active?: boolean
  pressed?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      className={['reader-nav-action', className].filter(Boolean).join(' ')}
      data-active={active || undefined}
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="reader-nav-action__icon">{icon}</span>
      <span className="reader-nav-action__label">{shortLabel}</span>
      <span className="reader-nav-action__tooltip" role="tooltip">
        {label}
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
  const [selected, setSelected] = useState<{ id: string; verseKey: string; quiet?: boolean } | null>(
    null,
  )
  const [jumpValue, setJumpValue] = useState('')
  const [indexOpen, setIndexOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [wirdOpen, setWirdOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  // الميتا (سور/أجزاء/أحزاب/أرباع) — لمؤشر الموضع وشُرَط خيط الحرف
  const [meta, setMeta] = useState<MushafMeta | null>(null)
  const {
    readingPlan,
    readingToday,
    visitedToday,
    congratsDismissedDay,
    recordPageVisit,
    dismissCongrats,
  } = useWirdsStore()
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
      const overlayOpen = indexOpen || searchOpen || wirdOpen || markOpen || toolsOpen
      if (overlayOpen) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest('input, textarea, select, button, [contenteditable="true"], [role="tab"]'))
        return
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
  }, [
    nextPage,
    prevPage,
    focus,
    indexOpen,
    markOpen,
    toggleFocus,
    selected,
    searchOpen,
    wirdOpen,
    toolsOpen,
  ])

  // الثيم يُطبَّق على جذر المستند فتتبدل متغيرات CSS وحدها
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // الميتا تُحمَّل مرة واحدة — مؤشر الموضع وشُرَط الأجزاء على خيط الحرف
  useEffect(() => {
    loadMeta()
      .then(setMeta)
      .catch(() => {})
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
  const idleNow = idle && !indexOpen && !markOpen && !searchOpen && !wirdOpen && !toolsOpen
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
        'reader-shell' +
        (focus ? ' reader-shell--focus' : '') +
        (tafsirOpen ? ' reader-shell--aside' : '') +
        (idleNow ? ' reader-shell--idle' : '')
      }
      dir="rtl"
    >
      {!focus && (
        <aside className="reader-rail-v2" aria-label="أدوات القارئ">
          <div className="reader-rail-v2__brand" aria-label="ورتّل القرآن">
            <span aria-hidden="true">و</span>
          </div>
          <nav className="reader-rail-v2__actions" aria-label="التنقل الرئيسي">
            <NavAction
              label="فهرس المصحف"
              shortLabel="الفهرس"
              icon={<IconIndex />}
              active={indexOpen}
              onClick={() => setIndexOpen(true)}
            />
            <NavAction
              label="بحث في المصحف (Ctrl+F)"
              shortLabel="البحث"
              icon={<IconSearch />}
              active={searchOpen}
              onClick={() => setSearchOpen(true)}
            />
            <NavAction
              label={wirdLabel}
              shortLabel="رحلتي"
              icon={<ProgressRing value={ringRatio} size={24} />}
              active={wirdOpen}
              onClick={() => setWirdOpen(true)}
            />
            <NavAction
              label={currentMark ? `إزالة الإشارة ${currentMark.name}` : 'حفظ إشارة في هذا الموضع'}
              shortLabel="إشارة"
              icon={currentMark ? <IconStarFilled /> : <IconStar />}
              active={!!currentMark}
              pressed={!!currentMark}
              onClick={() =>
                currentMark ? removeBookmark(currentMark.id) : (setMarkName(''), setMarkOpen(true))
              }
            />
          </nav>

          <ForeEdge page={page} meta={meta} onGo={goPage} />

          <nav
            className="reader-rail-v2__actions reader-rail-v2__actions--secondary"
            aria-label="إعدادات العرض السريعة"
          >
            <NavAction
              label={`الإضاءة الحالية ${THEME_LABEL[theme]}، انتقل إلى ${THEME_LABEL[THEME_NEXT[theme]]}`}
              shortLabel="الإضاءة"
              icon={<ThemeIcon />}
              onClick={cycleTheme}
            />
            <NavAction
              label={spread ? 'عرض صفحة واحدة' : 'عرض صفحتين متقابلتين'}
              shortLabel="العرض"
              icon={spread ? <IconSingle /> : <IconSpread />}
              onClick={toggleMode}
            />
            <NavAction
              label="وضع التركيز"
              shortLabel="تركيز"
              icon={<IconFocus />}
              onClick={toggleFocus}
            />
          </nav>
        </aside>
      )}

      <section className="reader-stage-shell" aria-label="صفحات المصحف">
        <main ref={stageRef} className="reader-stage-v2">
          {spread ? (
            <div className="mushaf-spread" dir="rtl">
              <MushafPage
                key={page}
                pageNumber={page}
                selectedWordId={selected?.id ?? null}
                onSelectWord={onSelectWord}
              />
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
            <IconButton
              className="reader-flip reader-flip--prev"
              label="الصفحة السابقة"
              icon={<IconPrev />}
              onClick={prevPage}
              disabled={atFirst}
            />
            <IconButton
              className="reader-flip reader-flip--next"
              label="الصفحة التالية"
              icon={<IconNext />}
              onClick={nextPage}
              disabled={atLast}
            />
          </>
        )}

        {focus && (
          <IconButton
            className="reader-focus-exit"
            label="الخروج من وضع التركيز (Esc)"
            icon={<IconClose />}
            onClick={toggleFocus}
          />
        )}

        {showCongrats && !wirdOpen && (
          <div className="reader-toast" role="status">
            <IconSeal />
            <span>أتممت نصيب اليوم من ختمتك — بارك الله فيك</span>
            <IconButton label="إغلاق التهنئة" icon={<IconClose />} onClick={dismissCongrats} />
          </div>
        )}
      </section>

      {tafsirOpen && (
        <TafsirPanel
          verseKey={selected!.verseKey}
          onClose={() => setSelected(null)}
          onNavigate={onTafsirNavigate}
        />
      )}

      {!focus && (
        <footer className="reader-statusbar">
          <button type="button" className="reader-location" onClick={() => setIndexOpen(true)}>
            <span className="reader-location__eyebrow">الموضع الحالي</span>
            <span className="reader-location__value">
              {meta ? (
                <>
                  الجزء {arNum(juzOfPage(meta, page))}
                  <i>•</i>
                  الحزب {arNum(hizbOfPage(meta, page))}
                  <i>•</i>
                  {quarterLabel(rubOfPage(meta, page))}
                </>
              ) : (
                'جارٍ تحديد الموضع…'
              )}
            </span>
          </button>

          <div
            className="reader-page-status"
            aria-label={`الصفحة ${arNum(page)} من ${arNum(LAST_PAGE)}`}
          >
            <strong>{spread ? `${arNum(page)}–${arNum(page + 1)}` : arNum(page)}</strong>
            <span>/ {arNum(LAST_PAGE)}</span>
          </div>

          <div className="reader-statusbar__tools">
            {report && (
              <span className="reader-integrity" title={`بصمة الحزمة ${report.bundleSha256}`}>
                <IconSeal /> {arNum(report.verified)} ملفاً موثّقاً
              </span>
            )}
            <form className="reader-jump" onSubmit={onJump}>
              <label className="ui-sr-only" htmlFor="reader-page-jump">
                الانتقال إلى صفحة
              </label>
              <input
                id="reader-page-jump"
                type="number"
                inputMode="numeric"
                min={1}
                max={LAST_PAGE}
                placeholder="اذهب إلى صفحة"
                value={jumpValue}
                onChange={(event) => setJumpValue(event.target.value)}
              />
            </form>
            <div className="reader-zoom" role="group" aria-label="تكبير الصفحة">
              <IconButton
                label="تصغير الصفحة"
                icon={<IconMinus />}
                onClick={zoomOut}
                disabled={zoom <= 0.7}
              />
              <Button variant="ghost" size="sm" onClick={resetZoom} title="إعادة المقاس الأصلي">
                {arNum(Math.round(zoom * 100))}٪
              </Button>
              <IconButton
                label="تكبير الصفحة"
                icon={<IconPlus />}
                onClick={zoomIn}
                disabled={zoom >= 1.6}
              />
            </div>
          </div>
        </footer>
      )}

      {!focus && (
        <nav className="reader-mobile-nav" aria-label="التنقل الرئيسي">
          <NavAction
            label="فهرس المصحف"
            shortLabel="الفهرس"
            icon={<IconIndex />}
            active={indexOpen}
            onClick={() => setIndexOpen(true)}
          />
          <NavAction
            label="البحث في المصحف"
            shortLabel="البحث"
            icon={<IconSearch />}
            active={searchOpen}
            onClick={() => setSearchOpen(true)}
          />
          <NavAction
            label={wirdLabel}
            shortLabel="رحلتي"
            icon={<ProgressRing value={ringRatio} size={23} />}
            active={wirdOpen}
            onClick={() => setWirdOpen(true)}
          />
          <NavAction
            label={currentMark ? `إزالة الإشارة ${currentMark.name}` : 'حفظ إشارة هنا'}
            shortLabel="إشارة"
            icon={currentMark ? <IconStarFilled /> : <IconStar />}
            active={!!currentMark}
            pressed={!!currentMark}
            onClick={() =>
              currentMark ? removeBookmark(currentMark.id) : (setMarkName(''), setMarkOpen(true))
            }
          />
          <NavAction
            label="إعدادات العرض"
            shortLabel="العرض"
            icon={<IconSettings />}
            active={toolsOpen}
            onClick={() => setToolsOpen(true)}
          />
        </nav>
      )}

      {searchOpen && <SearchPanel onGo={onSearchGo} onClose={() => setSearchOpen(false)} />}
      {wirdOpen && (
        <WirdPanel
          onClose={() => setWirdOpen(false)}
          onGoPage={(next) => {
            setWirdOpen(false)
            setPage(next)
          }}
        />
      )}
      {indexOpen && <IndexPanel currentPage={page} onGo={setPage} onClose={() => setIndexOpen(false)} />}

      {markOpen && (
        <Dialog
          title={`إشارة مرجعية — صفحة ${arNum(page)}`}
          description="امنح هذا الموضع اسماً واضحاً لتعود إليه بسرعة."
          onClose={() => setMarkOpen(false)}
          className="reader-bookmark-dialog"
        >
          <form
            className="reader-bookmark-form"
            onSubmit={(event) => {
              event.preventDefault()
              addBookmark(markName || `صفحة ${page}`)
              setMarkOpen(false)
            }}
          >
            <label htmlFor="bookmark-name">اسم الإشارة</label>
            <input
              id="bookmark-name"
              data-autofocus
              placeholder="مثال: ورد الفجر"
              value={markName}
              onChange={(event) => setMarkName(event.target.value)}
              maxLength={60}
            />
            <div className="reader-bookmark-form__actions">
              <Button type="submit" variant="primary" leadingIcon={<IconStar />}>
                حفظ الإشارة
              </Button>
              <Button onClick={() => setMarkOpen(false)}>إلغاء</Button>
            </div>
          </form>
        </Dialog>
      )}

      {toolsOpen && (
        <Drawer
          title="إعدادات العرض"
          description="اضبط القراءة من دون تغيير محتوى الصفحة."
          onClose={() => setToolsOpen(false)}
          size="sm"
        >
          <div className="reader-settings">
            <section className="reader-settings__section">
              <h3>الإضاءة</h3>
              <div className="reader-settings__choices">
                {(['day', 'sepia', 'night'] as Theme[]).map((value) => (
                  <Button
                    key={value}
                    variant={theme === value ? 'primary' : 'secondary'}
                    aria-pressed={theme === value}
                    onClick={() => {
                      let guard = 0
                      while (useReaderStore.getState().theme !== value && guard++ < 3)
                        useReaderStore.getState().cycleTheme()
                    }}
                  >
                    {THEME_LABEL[value]}
                  </Button>
                ))}
              </div>
            </section>
            <section className="reader-settings__section">
              <h3>طريقة العرض</h3>
              <Button
                className="reader-settings__wide-button"
                leadingIcon={spread ? <IconSingle /> : <IconSpread />}
                onClick={toggleMode}
              >
                {spread ? 'التحويل إلى صفحة واحدة' : 'التحويل إلى صفحتين متقابلتين'}
              </Button>
            </section>
            <section className="reader-settings__section">
              <h3>حجم الصفحة</h3>
              <div className="reader-settings__zoom">
                <IconButton
                  label="تصغير الصفحة"
                  icon={<IconMinus />}
                  onClick={zoomOut}
                  disabled={zoom <= 0.7}
                />
                <strong>{arNum(Math.round(zoom * 100))}٪</strong>
                <IconButton
                  label="تكبير الصفحة"
                  icon={<IconPlus />}
                  onClick={zoomIn}
                  disabled={zoom >= 1.6}
                />
              </div>
              <Button variant="ghost" onClick={resetZoom}>
                استعادة الحجم الأصلي
              </Button>
            </section>
            <section className="reader-settings__section">
              <h3>القراءة الهادئة</h3>
              <Button
                className="reader-settings__wide-button"
                leadingIcon={<IconFocus />}
                onClick={() => {
                  setToolsOpen(false)
                  toggleFocus()
                }}
              >
                الدخول إلى وضع التركيز
              </Button>
            </section>
          </div>
        </Drawer>
      )}
    </div>
  )
}
