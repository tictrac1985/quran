// حالة الأوراد (مرحلة 4 — التصميم الثاني: «رحلتي»).
//
// ورد القراءة = ختمة بخطة زمنية: يختار المستخدم مدة (٣٠/٦٠/٩٠/١٨٠ يوماً)
// فيُحسب نصيب اليوم آلياً، و«موضع الختمة» يتقدم مع كل صفحة يتجاوزها.
// الخطة مرنة: يوم فائت يُعاد توزيع الباقي على الأيام المتبقية تلقائياً.
//
// ورد الحفظ = مسار موجَّه: التطبيق يقترح مقطع اليوم بنفسه (الفاتحة ثم
// قصار السور صاعداً، أو ترتيب المصحف، أو سورة مختارة) ويقطّعها بالوتيرة
// المختارة — لا إدخال يدوي إلا لمن أراد نطاقاً مخصصاً. التأكيد بتقييم ذاتي.
//
// ورد المراجعة = آلي بالكامل (lib/srs) — لا يُنشئه المستخدم.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  dateKey,
  dateKeyAfter,
  schedule,
  REVIEW_BACKLOG_LIMIT,
  type Grade,
} from '../lib/srs'
import { surahTotal } from '../lib/ayahCounts'

const LAST_PAGE = 604

/** عنصر حفظ مجدول للمراجعة (من المسار أو نطاق مخصص) */
export interface HifzItem {
  id: string
  surah: number
  from: number
  to: number
  stage: number
  dueDate: string | null
  lastGrade: Grade | null
  reviews: number
  createdAt: number
}

/** خطة الختمة: position = أول صفحة لم تُقرأ بعد (٦٠٥ = ختمة تامة) */
export interface ReadingPlan {
  days: number
  startDate: string
  position: number
}

/** مسار الحفظ الموجَّه */
export interface HifzTrack {
  /** قائمة السور بترتيب المسار */
  queue: number[]
  /** السورة الحالية في القائمة */
  index: number
  /** أول آية لم تُحفظ بعد في السورة الحالية */
  nextAyah: number
  /** وتيرة الحفظ: آيات في المقطع */
  pace: number
}

export type TrackMode = 'easy' | 'order' | 'custom'

interface DayMarks {
  read?: boolean
  hifz?: boolean
  review?: boolean
}

interface WirdsState {
  readingPlan: ReadingPlan | null
  /** لقطة بداية اليوم — يُحسب منها نصيب اليوم وتقدمه */
  readingToday: { day: string; startPos: number }
  /** صفحات زُيرت اليوم (للعرض الحر) */
  visitedToday: number[]
  congratsDismissedDay: string | null
  hifz: HifzItem[]
  hifzTrack: HifzTrack | null
  history: Record<string, DayMarks>
  /** تذكير يومي (إشعار متصفح مؤقتاً؛ نظامي كامل مع Tauri) */
  reminder: { enabled: boolean; time: string; lastDay: string | null }
  // — القراءة —
  setPlan: (days: number) => void
  stopPlan: () => void
  resetPosition: (p: number) => void
  recordPageVisit: (page: number) => void
  dismissCongrats: () => void
  // — الحفظ —
  startTrack: (mode: TrackMode, pace: number, customSurah?: number) => void
  stopTrack: () => void
  setPace: (pace: number) => void
  /** تأكيد مقطع اليوم بتقييم ذاتي: يدخل المراجعة ويتقدم المسار */
  confirmSlice: (grade: Grade) => void
  /** نطاق مخصص يدوي (يبقى متاحاً) */
  addHifz: (surah: number, from: number, to: number, total: number) => string | null
  grade: (id: string, grade: Grade) => void
  removeHifz: (id: string) => void
  // — التذكير —
  setReminder: (enabled: boolean, time: string) => void
  markRemindedToday: () => void
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/** فرق الأيام بين مفتاحَي YYYY-MM-DD (b − a) */
export const dayDiff = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/** ترتيب «المسار الميسّر»: الفاتحة ثم قصار السور من الناس صاعداً إلى النبأ */
const EASY_QUEUE = [1, ...Array.from({ length: 37 }, (_, i) => 114 - i)]

export const trackQueue = (mode: TrackMode, customSurah = 2): number[] =>
  mode === 'easy'
    ? EASY_QUEUE
    : mode === 'order'
      ? Array.from({ length: 114 }, (_, i) => i + 1)
      : [Math.min(114, Math.max(1, customSurah))]

/** نصيب اليوم من خطة قائمة: هدف ثابت طوال اليوم، مرن بين الأيام */
export function planToday(plan: ReadingPlan, startPos: number, today: string) {
  const elapsed = Math.max(0, dayDiff(plan.startDate, today))
  const daysLeft = Math.max(1, plan.days - elapsed)
  const remaining = Math.max(0, LAST_PAGE + 1 - startPos)
  const perDay = Math.max(1, Math.ceil(remaining / daysLeft))
  const targetEnd = Math.min(LAST_PAGE, startPos + perDay - 1)
  return {
    perDay,
    daysLeft,
    remaining,
    targetEnd,
    done: plan.position > targetEnd || plan.position > LAST_PAGE,
    expectedEnd: dateKeyAfter(Math.ceil(Math.max(0, LAST_PAGE + 1 - plan.position) / perDay)),
  }
}

/** مقطع الحفظ الحالي من المسار (فارغ = المسار مكتمل) */
export function currentSlice(track: HifzTrack | null): { surah: number; from: number; to: number } | null {
  if (!track) return null
  const surah = track.queue[track.index]
  if (surah === undefined) return null
  const from = track.nextAyah
  const to = Math.min(surahTotal(surah), from + track.pace - 1)
  return { surah, from, to }
}

export const useWirdsStore = create<WirdsState>()(
  persist(
    (set, get) => ({
      readingPlan: null,
      readingToday: { day: dateKey(), startPos: 1 },
      visitedToday: [],
      congratsDismissedDay: null,
      hifz: [],
      hifzTrack: null,
      history: {},
      reminder: { enabled: false, time: '17:00', lastDay: null },

      setReminder: (enabled, time) => set((s) => ({ reminder: { ...s.reminder, enabled, time } })),

      markRemindedToday: () => set((s) => ({ reminder: { ...s.reminder, lastDay: dateKey() } })),

      setPlan: (days) =>
        set((s) => ({
          readingPlan: {
            days: Math.min(360, Math.max(7, Math.round(days))),
            startDate: dateKey(),
            // خطة جديدة تكمل من موضع القديمة إن وُجدت
            position: s.readingPlan?.position ?? 1,
          },
          readingToday: { day: dateKey(), startPos: s.readingPlan?.position ?? 1 },
        })),

      stopPlan: () => set({ readingPlan: null }),

      resetPosition: (p) =>
        set((s) =>
          s.readingPlan
            ? {
                readingPlan: { ...s.readingPlan, position: Math.min(LAST_PAGE + 1, Math.max(1, Math.round(p))) },
                readingToday: { day: dateKey(), startPos: Math.min(LAST_PAGE + 1, Math.max(1, Math.round(p))) },
              }
            : {},
        ),

      recordPageVisit: (page) => {
        const today = dateKey()
        const s = get()
        const sameDay = s.readingToday.day === today
        const visitedToday = sameDay ? s.visitedToday : []
        const startPos = sameDay ? s.readingToday.startPos : (s.readingPlan?.position ?? page)
        const visits = visitedToday.includes(page) ? visitedToday : [...visitedToday, page]
        // موضع الختمة يتقدم مع كل صفحة يتجاوزها القارئ
        let plan = s.readingPlan
        if (plan && page >= plan.position && plan.position <= LAST_PAGE) {
          plan = { ...plan, position: Math.min(LAST_PAGE + 1, page + 1) }
        }
        set({
          readingPlan: plan,
          readingToday: { day: today, startPos },
          visitedToday: visits,
          history: { ...s.history, [today]: { ...s.history[today], read: true } },
        })
      },

      dismissCongrats: () => set({ congratsDismissedDay: dateKey() }),

      startTrack: (mode, pace, customSurah) =>
        set({
          hifzTrack: { queue: trackQueue(mode, customSurah), index: 0, nextAyah: 1, pace },
        }),

      stopTrack: () => set({ hifzTrack: null }),

      setPace: (pace) =>
        set((s) => (s.hifzTrack ? { hifzTrack: { ...s.hifzTrack, pace: Math.min(15, Math.max(1, pace)) } } : {})),

      confirmSlice: (grade) => {
        const s = get()
        const t = s.hifzTrack
        const slice = currentSlice(t)
        if (!t || !slice) return
        const sch = schedule(0, grade)
        const item: HifzItem = {
          id: newId(),
          surah: slice.surah,
          from: slice.from,
          to: slice.to,
          stage: sch.stage,
          dueDate: dateKeyAfter(sch.inDays),
          lastGrade: grade,
          reviews: 1,
          createdAt: Date.now(),
        }
        const nextAyah = slice.to + 1
        let track: HifzTrack | null
        if (nextAyah <= surahTotal(slice.surah)) track = { ...t, nextAyah }
        else if (t.index + 1 < t.queue.length) track = { ...t, index: t.index + 1, nextAyah: 1 }
        else track = null // اكتمل المسار كله 🎉
        const today = dateKey()
        set({
          hifz: [...s.hifz, item],
          hifzTrack: track,
          history: { ...s.history, [today]: { ...s.history[today], hifz: true } },
        })
      },

      addHifz: (surah, from, to, total) => {
        const s = get()
        const due = dueReviews(s.hifz)
        if (due.length >= REVIEW_BACKLOG_LIMIT)
          return `لديك ${due.length} عناصر مراجعة مستحقة — أتممها أولاً ثم أضف حفظاً جديداً`
        if (!(surah >= 1 && surah <= 114)) return 'سورة غير صحيحة'
        if (!(from >= 1 && to <= total && from <= to)) return `نطاق الآيات غير صحيح (1 – ${total})`
        set({
          hifz: [
            ...s.hifz,
            {
              id: newId(),
              surah,
              from,
              to,
              stage: 0,
              dueDate: null,
              lastGrade: null,
              reviews: 0,
              createdAt: Date.now(),
            },
          ],
        })
        return null
      },

      grade: (id, grade) => {
        const s = get()
        const today = dateKey()
        const wasDue = s.hifz.find((h) => h.id === id)?.dueDate != null
        const hifz = s.hifz.map((h) => {
          if (h.id !== id) return h
          const sch = schedule(h.stage, grade)
          return {
            ...h,
            stage: sch.stage,
            dueDate: dateKeyAfter(sch.inDays),
            lastGrade: grade,
            reviews: h.reviews + 1,
          }
        })
        set({
          hifz,
          history: {
            ...s.history,
            [today]: { ...s.history[today], [wasDue ? 'review' : 'hifz']: true },
          },
        })
      },

      removeHifz: (id) => set({ hifz: get().hifz.filter((h) => h.id !== id) }),
    }),
    {
      name: 'mushaf-wirds',
      version: 2,
      // من v1: نحتفظ بالمحفوظات والسجل ونهمل عداد القراءة القديم (صار خطة)
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as WirdsState
        const old = (persisted ?? {}) as Partial<WirdsState>
        return {
          readingPlan: null,
          readingToday: { day: dateKey(), startPos: 1 },
          visitedToday: [],
          congratsDismissedDay: old.congratsDismissedDay ?? null,
          hifz: old.hifz ?? [],
          hifzTrack: null,
          history: old.history ?? {},
        } as unknown as WirdsState
      },
    },
  ),
)

/** مستحقات المراجعة اليوم (أو المتأخرة): مرتبة بالأقدم استحقاقاً */
export const dueReviews = (hifz: HifzItem[]): HifzItem[] => {
  const today = dateKey()
  return hifz
    .filter((h) => h.dueDate !== null && h.dueDate <= today)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
}

/** عناصر بانتظار تأكيد الحفظ الأول (نطاقات مخصصة) */
export const pendingHifz = (hifz: HifzItem[]): HifzItem[] => hifz.filter((h) => h.dueDate === null)

/** مراجعات مجدولة مستقبلاً */
export const upcomingReviews = (hifz: HifzItem[]): HifzItem[] => {
  const today = dateKey()
  return hifz
    .filter((h) => h.dueDate !== null && h.dueDate > today)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
}
