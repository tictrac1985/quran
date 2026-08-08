// لوحة الأوراد — التصميم الثاني «رحلتي»: بطاقة يوم واحدة تجمع الثلاثة
// (قراءة الختمة / مقطع الحفظ / مستحقات المراجعة)، وتبويب خطط للضبط.
// المبدأ: لا عدادات مجردة — كل بطاقة تقول ماذا تفعل الآن بالضبط.
import { useEffect, useState, type FormEvent } from 'react'
import {
  currentSlice,
  dueReviews,
  pendingHifz,
  planToday,
  upcomingReviews,
  useWirdsStore,
  type HifzItem,
} from '../../stores/wirds'
import { dateKey, GRADE_LABEL, REVIEW_BACKLOG_LIMIT, type Grade } from '../../lib/srs'
import { calcStreak, surahTree, weekDots } from '../../lib/stats'
import { exportBackup, importBackup, buildBackupJson, backupFilename } from '../../lib/backup'
import { saveBackupToCloud, pickBackupSavePath, saveBackupToPath } from '../../lib/cloud'
import { isTauri } from '../../lib/assets'
import { IconCloud, IconDownload, IconUpload } from '../icons/Icons'
import { loadSurahNames, type SurahName } from '../../lib/surahNames'
import { loadVerseLocs } from '../../lib/tafsir'
import { surahTotal } from '../../lib/ayahCounts'
import {
  IconArchive,
  IconBell,
  IconBookOpen,
  IconClose,
  IconCycle,
  IconFlame,
  IconGrid,
  IconSeal,
  IconSprout,
} from '../icons/Icons'

const arNum = (n: number) => n.toLocaleString('ar-EG')
const GRADES: Grade[] = ['excellent', 'good', 'weak']

type Tab = 'today' | 'plans' | 'review' | 'stats'
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'اليوم' },
  { id: 'plans', label: 'الخطط' },
  { id: 'review', label: 'المراجعة' },
  { id: 'stats', label: 'إحصائيات' },
]

const PLAN_DURATIONS = [30, 60, 90, 180]
const PACES = [3, 5, 7, 10]

/** حلقة تقدم SVG خفيفة — لا مكتبات رسوم */
export function ProgressRing({ ratio, size = 20 }: { ratio: number; size?: number }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="wird-ring" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="wird-ring-bg" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="wird-ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, Math.max(0, ratio)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}

function GradeRow({ onGrade }: { onGrade: (g: Grade) => void }) {
  return (
    <div className="wird-grades">
      {GRADES.map((g) => (
        <button key={g} className={`reader-btn wird-grade wird-grade--${g}`} onClick={() => onGrade(g)}>
          {GRADE_LABEL[g]}
        </button>
      ))}
    </div>
  )
}

function sliceText(names: SurahName[], s: number, from: number, to: number): string {
  const name = names.find((x) => x.n === s)?.name ?? `سورة ${s}`
  return `سورة ${name} ${arNum(from)}–${arNum(to)}`
}

interface Props {
  onClose: () => void
  /** القفز إلى صفحة في المصحف (ابدأ القراءة / افتح المقطع) */
  onGoPage: (page: number) => void
}

export function WirdPanel({ onClose, onGoPage }: Props) {
  const s = useWirdsStore()
  const [tab, setTab] = useState<Tab>('today')
  const [names, setNames] = useState<SurahName[]>([])
  const [locs, setLocs] = useState<Record<string, { page: number }>>({})
  const [customSurah, setCustomSurah] = useState(2)
  const [pace, setPace] = useState(5)
  const [resetVal, setResetVal] = useState('')
  const [mSurah, setMSurah] = useState(1)
  const [mFrom, setMFrom] = useState('1')
  const [mTo, setMTo] = useState('7')
  const [formError, setFormError] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [backupOk, setBackupOk] = useState<string | null>(null)

  useEffect(() => {
    loadSurahNames().then(setNames).catch(() => {})
    loadVerseLocs().then(setLocs).catch(() => {})
  }, [])

  const today = dateKey()
  const plan = s.readingPlan
  const pt = plan ? planToday(plan, s.readingToday.startPos, today) : null
  const slice = currentSlice(s.hifzTrack)
  const due = dueReviews(s.hifz)
  const pending = pendingHifz(s.hifz)
  const upcoming = upcomingReviews(s.hifz)
  const backlog = due.length >= REVIEW_BACKLOG_LIMIT

  const goVerse = (surah: number, ayah: number) => {
    const p = locs[`${surah}:${ayah}`]?.page
    if (p) onGoPage(p)
  }

  const onAddManual = (e: FormEvent) => {
    e.preventDefault()
    setFormError(s.addHifz(mSurah, Number.parseInt(mFrom, 10), Number.parseInt(mTo, 10), surahTotal(mSurah)))
  }

  return (
    <div className="index-backdrop" onClick={onClose}>
      <div className="index-panel wird-panel" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="index-head">
          <strong>رحلتي مع القرآن</strong>
          <button className="index-close" onClick={onClose} title="إغلاق (Esc)" aria-label="إغلاق رحلتي">
            <IconClose />
          </button>
        </div>

        <div className="index-tabs wird-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={'index-tab' + (tab === t.id ? ' index-tab--active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.id === 'review' && due.length > 0 ? ` (${arNum(due.length)})` : ''}
            </button>
          ))}
        </div>

        <div className="wird-body">
          {tab === 'today' && (
            <div className="wird-today">
              {/* ——— بطاقة القراءة ——— */}
              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconBookOpen /> قراءة اليوم
                </h3>
                {plan && pt ? (
                  pt.done ? (
                    <p className="wird-done">
                      <IconSeal /> ورد اليوم تام — بارك الله فيك
                    </p>
                  ) : (
                    <>
                      <p className="wird-big">
                        اقرأ حتى صفحة <strong>{arNum(pt.targetEnd)}</strong>
                      </p>
                      <p className="wird-sub">
                        أنت عند صفحة {arNum(plan.position)} — بقي {arNum(Math.max(0, pt.targetEnd - plan.position + 1))} صفحات
                      </p>
                      <button
                        className="reader-btn reader-btn--primary wird-cta"
                        onClick={() => onGoPage(plan.position)}
                      >
                        تابع القراءة من صفحة {arNum(plan.position)}
                      </button>
                    </>
                  )
                ) : (
                  <>
                    <p className="wird-sub">
                      {s.visitedToday.length > 0
                        ? `قرأت اليوم ${arNum(s.visitedToday.length)} صفحة — قراءة حرة بلا خطة`
                        : 'لا خطة قراءة بعد — أنشئ ختمة بمدة تناسبك'}
                    </p>
                    <button className="reader-btn reader-btn--primary wird-cta" onClick={() => setTab('plans')}>
                      أنشئ خطة ختمة
                    </button>
                  </>
                )}
              </section>

              {/* ——— بطاقة الحفظ ——— */}
              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconSprout /> حفظ اليوم
                </h3>
                {slice ? (
                  backlog ? (
                    <p className="wird-error">أنجز مستحقات المراجعة ({arNum(due.length)}) أولاً، ثم أكمل الحفظ</p>
                  ) : (
                    <>
                      <p className="wird-big">{sliceText(names, slice.surah, slice.from, slice.to)}</p>
                      <button
                        className="reader-btn reader-btn--primary wird-cta"
                        onClick={() => goVerse(slice.surah, slice.from)}
                      >
                        افتحها في المصحف
                      </button>
                      <p className="wird-sub">أتقنتها؟ قيّم نفسك — التقييم يجدول مراجعتها آلياً:</p>
                      <GradeRow onGrade={(g) => s.confirmSlice(g)} />
                    </>
                  )
                ) : s.hifzTrack ? (
                  <p className="wird-done">
                    <IconSeal /> اكتمل مسارك — ما شاء الله
                  </p>
                ) : (
                  <>
                    <p className="wird-sub">لا مسار حفظ بعد — دع التطبيق يقترح عليك مقطع كل يوم بنفسه</p>
                    <button className="reader-btn reader-btn--primary wird-cta" onClick={() => setTab('plans')}>
                      ابدأ مسار الحفظ
                    </button>
                  </>
                )}
                {pending.length > 0 && (
                  <div className="wird-pending">
                    <p className="wird-sub">نطاقات مخصصة بانتظار تأكيد الحفظ:</p>
                    {pending.map((h) => (
                      <div key={h.id} className="wird-mini">
                        <span>{sliceText(names, h.surah, h.from, h.to)}</span>
                        <GradeRow onGrade={(g) => s.grade(h.id, g)} />
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ——— بطاقة المراجعة ——— */}
              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconCycle /> مراجعة اليوم
                </h3>
                {due.length === 0 ? (
                  <p className="wird-sub">
                    لا مستحقات — {upcoming.length > 0 ? `أقرب مراجعة ${upcoming[0].dueDate}` : 'تُنشأ تلقائياً من تقييمات الحفظ'}
                  </p>
                ) : (
                  due.map((h) => (
                    <div key={h.id} className="wird-mini wird-mini--due">
                      <span>{sliceText(names, h.surah, h.from, h.to)}</span>
                      <span className="wird-sub">مستحقة منذ {h.dueDate}</span>
                      <button
                        className="reader-btn reader-btn--primary wird-cta"
                        onClick={() => goVerse(h.surah, h.from)}
                      >
                        راجعها في المصحف
                      </button>
                      <GradeRow onGrade={(g) => s.grade(h.id, g)} />
                    </div>
                  ))
                )}
              </section>
            </div>
          )}

          {tab === 'plans' && (
            <div className="wird-plans">
              <section>
                <h3 className="wird-sec">خطة الختمة</h3>
                {plan && pt ? (
                  <>
                    <p className="wird-sub">
                      ختمة في {arNum(plan.days)} يوماً — موضعك صفحة {arNum(plan.position)} من {arNum(604)}
                      {plan.position <= 604 && (
                        <>
                          {' '}· بقي {arNum(604 - plan.position + 1)} صفحة · نصيب اليوم {arNum(pt.perDay)} صفحات
                          {' '}· تُنهي بحلول {pt.expectedEnd} بإذن الله
                        </>
                      )}
                    </p>
                    <div className="wird-trackbar">
                      <div className="wird-trackbar-fill" style={{ width: `${((plan.position - 1) / 604) * 100}%` }} />
                    </div>
                    <div className="wird-range">
                      <label>
                        تصحيح الموضع إلى صفحة
                        <input className="reader-btn wird-num" type="number" min={1} max={605} value={resetVal} onChange={(e) => setResetVal(e.target.value)} />
                      </label>
                      <button className="reader-btn" disabled={!resetVal} onClick={() => { s.resetPosition(Number(resetVal)); setResetVal('') }}>
                        ضبط
                      </button>
                      <button className="reader-btn" onClick={s.stopPlan}>إيقاف الخطة</button>
                    </div>
                  </>
                ) : (
                  <p className="wird-sub">اختر مدة ختمتك — التطبيق يوزع الصفحات على أيامك ويتابع موضعك:</p>
                )}
                <div className="wird-goal">
                  {PLAN_DURATIONS.map((d) => (
                    <button
                      key={d}
                      className={'reader-btn' + (plan?.days === d ? ' wird-goal--active' : '')}
                      onClick={() => s.setPlan(d)}
                    >
                      {arNum(d)} يوماً
                    </button>
                  ))}
                </div>
                <p className="wird-hint">٣٠ يوماً ≈ جزءاً يومياً · الخطة مرنة: يوم فائت يُعاد توزيعه تلقائياً</p>
              </section>

              <section>
                <h3 className="wird-sec">مسار الحفظ</h3>
                {s.hifzTrack ? (
                  <>
                    <p className="wird-sub">
                      {s.hifzTrack.queue.length > 1
                        ? s.hifzTrack.queue[1] === 114
                          ? 'المسار الميسّر (الفاتحة ثم قصار السور صاعداً)'
                          : 'ترتيب المصحف'
                        : `سورة ${names.find((x) => x.n === s.hifzTrack!.queue[0])?.name ?? s.hifzTrack.queue[0]}`}
                      {' '}— السورة {arNum(s.hifzTrack.index + 1)} من {arNum(s.hifzTrack.queue.length)} · {arNum(s.hifzTrack.pace)} آيات للمقطع
                    </p>
                    <div className="wird-goal">
                      <span className="wird-sub">الوتيرة:</span>
                      {PACES.map((p) => (
                        <button key={p} className={'reader-btn' + (s.hifzTrack!.pace === p ? ' wird-goal--active' : '')} onClick={() => s.setPace(p)}>
                          {arNum(p)}
                        </button>
                      ))}
                      <button className="reader-btn" onClick={s.stopTrack}>إيقاف المسار</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="wird-modes">
                      <button className="wird-mode" onClick={() => s.startTrack('easy', pace)}>
                        <strong>المسار الميسّر ★</strong>
                        <span>الفاتحة ثم قصار السور من الناس صاعداً — بدايات سريعة ممتعة</span>
                      </button>
                      <button className="wird-mode" onClick={() => s.startTrack('order', pace)}>
                        <strong>ترتيب المصحف</strong>
                        <span>من الفاتحة إلى الناس بالترتيب — مشروع الختم الكامل</span>
                      </button>
                      <div className="wird-mode wird-mode--custom">
                        <strong>سورة أختارها</strong>
                        <div className="wird-range">
                          <select className="reader-btn wird-select" value={customSurah} onChange={(e) => setCustomSurah(Number(e.target.value))}>
                            {names.map((n) => (
                              <option key={n.n} value={n.n}>{arNum(n.n)}. {n.name}</option>
                            ))}
                          </select>
                          <button className="reader-btn" onClick={() => s.startTrack('custom', pace, customSurah)}>ابدأ</button>
                        </div>
                      </div>
                    </div>
                    <div className="wird-goal">
                      <span className="wird-sub">وتيرة المقطع:</span>
                      {PACES.map((p) => (
                        <button key={p} className={'reader-btn' + (pace === p ? ' wird-goal--active' : '')} onClick={() => setPace(p)}>
                          {arNum(p)} آيات
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section>
                <h3 className="wird-sec">نطاق مخصص (يدوي)</h3>
                <form className="wird-form" onSubmit={onAddManual}>
                  <select className="reader-btn wird-select" value={mSurah} onChange={(e) => setMSurah(Number(e.target.value))}>
                    {names.map((n) => (
                      <option key={n.n} value={n.n}>{arNum(n.n)}. {n.name}</option>
                    ))}
                  </select>
                  <div className="wird-range">
                    <label>من آية<input className="reader-btn wird-num" type="number" min={1} max={surahTotal(mSurah)} value={mFrom} onChange={(e) => setMFrom(e.target.value)} /></label>
                    <label>إلى آية<input className="reader-btn wird-num" type="number" min={1} max={surahTotal(mSurah)} value={mTo} onChange={(e) => setMTo(e.target.value)} /></label>
                    <button type="submit" className="reader-btn">إضافة</button>
                  </div>
                  {formError && <p className="wird-error">{formError}</p>}
                </form>
              </section>
            </div>
          )}

          {tab === 'stats' && (
            <div className="wird-stats">
              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconFlame /> سلسلة المواظبة
                </h3>
                {(() => {
                  const st = calcStreak(s.history, today)
                  return (
                    <>
                      <p className="wird-big">
                        <strong>{arNum(st.current)}</strong> {st.current === 1 ? 'يوم' : 'أيام'} متواصلة
                        {st.todayDone ? ' — واليوم تام' : ' — واليوم لم يُنجز بعد'}
                      </p>
                      <p className="wird-sub">أطول سلسلة: {arNum(st.longest)} · أي إنجاز (قراءة/حفظ/مراجعة) يحفظها</p>
                    </>
                  )
                })()}
                <div className="week-dots">
                  {weekDots(s.history, today).map((d) => (
                    <div key={d.day} className={'week-day' + (d.isToday ? ' week-day--today' : '')} title={d.day}>
                      <span className="week-day-label">{d.isToday ? 'اليوم' : d.day.slice(8)}</span>
                      <span className="week-marks">
                        <i className={'week-dot week-dot--read' + (d.read ? ' on' : '')} />
                        <i className={'week-dot week-dot--hifz' + (d.hifz ? ' on' : '')} />
                        <i className={'week-dot week-dot--review' + (d.review ? ' on' : '')} />
                      </span>
                    </div>
                  ))}
                </div>
                {/* مفتاح الألوان بنفس نقاط الأسبوع لا بمحرف ● محايد اللون */}
                <p className="wird-hint wird-legend">
                  <i className="week-dot week-dot--read on" /> قراءة
                  <i className="week-dot week-dot--hifz on" /> حفظ
                  <i className="week-dot week-dot--review on" /> مراجعة
                </p>
              </section>

              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconGrid /> شجرة الحفظ — ١١٤ سورة
                </h3>
                <div className="tree-grid">
                  {surahTree(s.hifz).map((c) => (
                    <button
                      key={c.n}
                      className={`tree-cell tree-cell--${c.mastery}`}
                      title={`${names.find((x) => x.n === c.n)?.name ?? c.n} — ${c.coverage > 0 ? `${Math.round(c.coverage * 100)}٪ محفوظ` : 'لم يبدأ'}`}
                      onClick={() => goVerse(c.n, 1)}
                    >
                      {arNum(c.n)}
                    </button>
                  ))}
                </div>
                <p className="wird-hint">
                  <i className="tree-key tree-cell--1" /> بدأ · <i className="tree-key tree-cell--2" /> أتم الحفظ · <i className="tree-key tree-cell--3" /> أتقن — انقر سورة لفتحها
                </p>
              </section>

              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconArchive /> النسخ الاحتياطي
                </h3>
                <p className="wird-sub">كل تقدمك (إشاراتك وخطتك ومحفوظاتك وسجل أيامك) في ملف واحد</p>
                <div className="wird-range wird-backup-row">
                  <button
                    className="reader-btn icon-btn"
                    title="تصدير نسخة — تختار مكان الحفظ"
                    onClick={async () => {
                      setBackupError(null)
                      setBackupOk(null)
                      // سطح المكتب: حوار «حفظ باسم» أصلي يحدد فيه المستخدم مكان النسخة
                      if (isTauri()) {
                        try {
                          const path = await pickBackupSavePath(backupFilename())
                          if (!path) return // ألغى المستخدم الحوار
                          const saved = await saveBackupToPath(path, buildBackupJson())
                          setBackupOk(`حُفظت النسخة ✓\n${saved}`)
                        } catch (err) {
                          setBackupError(err instanceof Error ? err.message : String(err))
                        }
                      } else {
                        exportBackup()
                      }
                    }}
                  >
                    <IconDownload />
                  </button>
                  <label className="reader-btn icon-btn" role="button" title="استيراد نسخة من ملف">
                    <IconUpload />
                    <input
                      type="file"
                      accept=".bak,application/json"
                      hidden
                      onChange={async (e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (!f) return
                        try {
                          await importBackup(f)
                        } catch (err) {
                          setBackupError(err instanceof Error ? err.message : String(err))
                        }
                      }}
                    />
                  </label>
                  {isTauri() &&
                    (
                      [
                        { provider: 'onedrive', label: 'OneDrive' },
                        { provider: 'gdrive', label: 'Google Drive' },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.provider}
                        className="reader-btn icon-btn"
                        title={`حفظ النسخة في ${c.label} — تُرفع تلقائياً`}
                        onClick={async () => {
                          setBackupError(null)
                          setBackupOk(null)
                          try {
                            const path = await saveBackupToCloud(
                              c.provider,
                              backupFilename(),
                              buildBackupJson(),
                            )
                            setBackupOk(`حُفظت النسخة في ${c.label} — تُرفع تلقائياً ✓\n${path}`)
                          } catch (err) {
                            setBackupError(err instanceof Error ? err.message : String(err))
                          }
                        }}
                      >
                        <IconCloud />
                      </button>
                    ))}
                </div>
                {isTauri() && (
                  <p className="wird-hint">السحابية تُحفظ في مجلد المزامنة وتُرفع تلقائياً — على الجهاز الآخر: نزّلها ثم «استيراد نسخة»</p>
                )}
                {backupOk && <p className="wird-ok">{backupOk}</p>}
                {backupError && <p className="wird-error">{backupError}</p>}
              </section>

              <section className="wird-card wird-today-card">
                <h3 className="wird-card-title">
                  <IconBell /> التذكير اليومي
                </h3>
                <div className="wird-range">
                  <label className="wird-switch">
                    <input
                      type="checkbox"
                      checked={s.reminder.enabled}
                      onChange={async (e) => {
                        if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
                          await Notification.requestPermission()
                        }
                        s.setReminder(e.target.checked, s.reminder.time)
                      }}
                    />
                    ذكّرني في
                  </label>
                  <input
                    className="reader-btn"
                    type="time"
                    value={s.reminder.time}
                    onChange={(e) => s.setReminder(s.reminder.enabled, e.target.value)}
                  />
                </div>
                <p className="wird-hint">
                  {typeof Notification !== 'undefined' && Notification.permission === 'denied'
                    ? 'الإشعارات محظورة من المتصفح — فعّلها من إعدادات الموقع'
                    : 'يصلك إشعار إن حان الوقت ولم تُنجز وردك بعد (يعمل والتطبيق مفتوح؛ نظامي كامل مع نسخة سطح المكتب)'}
                </p>
              </section>
            </div>
          )}

          {tab === 'review' && (
            <div className="wird-review">
              {due.length === 0 && upcoming.length === 0 && s.hifz.length === 0 ? (
                <p className="wird-hint wird-empty">لا عناصر بعد — ابدأ مسار الحفظ وستجد مراجعاتك هنا تلقائياً</p>
              ) : (
                <>
                  {due.length > 0 && (
                    <section>
                      <h3 className="wird-sec">مستحقة الآن</h3>
                      {due.map((h) => (
                        <div key={h.id} className="wird-card wird-card--due">
                          <span className="wird-item-title">{sliceText(names, h.surah, h.from, h.to)}</span>
                          <span className="wird-sub">مستحقة منذ {h.dueDate}</span>
                          <GradeRow onGrade={(g) => s.grade(h.id, g)} />
                        </div>
                      ))}
                    </section>
                  )}
                  {upcoming.length > 0 && (
                    <section>
                      <h3 className="wird-sec">قادمة</h3>
                      {upcoming.map((h: HifzItem) => (
                        <div key={h.id} className="wird-card wird-card--muted">
                          <span className="wird-item-title">{sliceText(names, h.surah, h.from, h.to)}</span>
                          <span className="wird-sub">{h.dueDate} · آخر تقييم {h.lastGrade ? GRADE_LABEL[h.lastGrade] : '—'}</span>
                          <button
                            className="reader-btn icon-btn wird-remove"
                            onClick={() => s.removeHifz(h.id)}
                            title="حذف"
                            aria-label="حذف عنصر المراجعة"
                          >
                            <IconClose />
                          </button>
                        </div>
                      ))}
                    </section>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
