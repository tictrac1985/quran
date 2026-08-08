// إحصاءات الرحلة (4.3) — دوال نقية: سلسلة الأيام + شجرة الحفظ (114 سورة).
// السلسلة: أيام متواصلة فيها أي إنجاز (قراءة/حفظ/مراجعة). يوم غير مكتمل
// اليوم لا يكسر السلسلة — تُحسب حتى أمس، وتكتمل بإنجاز اليوم.
import { dateKey, dateKeyAfter } from './srs'
import { dayDiff, type HifzItem } from '../stores/wirds'
import { surahTotal } from './ayahCounts'

export interface DayMarks {
  read?: boolean
  hifz?: boolean
  review?: boolean
}

const marked = (m: DayMarks | undefined): boolean => !!(m && (m.read || m.hifz || m.review))

const prevDay = (d: string): string => dateKeyAfter(-1, new Date(`${d}T00:00:00`))

export interface Streak {
  /** السلسلة الحالية (تشمل اليوم إن أُنجز) */
  current: number
  longest: number
  /** هل أُنجز شيء اليوم بعد؟ */
  todayDone: boolean
}

export function calcStreak(history: Record<string, DayMarks>, today: string = dateKey()): Streak {
  const daySet = new Set(Object.entries(history).filter(([, m]) => marked(m)).map(([d]) => d))
  const todayDone = daySet.has(today)
  let current = 0
  let cursor = todayDone ? today : prevDay(today)
  while (daySet.has(cursor)) {
    current += 1
    cursor = prevDay(cursor)
  }
  const sorted = [...daySet].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    run = prev !== null && dayDiff(prev, d) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = d
  }
  return { current, longest, todayDone }
}

/** درجة إتقان سورة: 0 لا شيء، 1 بدأ، 2 أتم الحفظ، 3 أتقن (مراجعات متقدمة) */
export type Mastery = 0 | 1 | 2 | 3

export interface SurahTreeCell {
  n: number
  /** نسبة الآيات المؤكَّدة (0..1) */
  coverage: number
  mastery: Mastery
}

export function surahTree(hifz: HifzItem[]): SurahTreeCell[] {
  return Array.from({ length: 114 }, (_, i) => {
    const n = i + 1
    const items = hifz.filter((h) => h.surah === n && h.dueDate !== null)
    const ayahs = items.reduce((acc, h) => acc + (h.to - h.from + 1), 0)
    const coverage = Math.min(1, ayahs / surahTotal(n))
    let mastery: Mastery = 0
    if (coverage >= 1) mastery = items.every((h) => h.stage >= 2) ? 3 : 2
    else if (coverage > 0) mastery = 1
    return { n, coverage, mastery }
  })
}

/** آخر 7 أيام مع علاماتها — صف نقطة الأسبوع */
export function weekDots(history: Record<string, DayMarks>, today: string = dateKey()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = dateKeyAfter(i - 6, new Date(`${today}T00:00:00`))
    const m = history[d] ?? {}
    return { day: d, read: !!m.read, hifz: !!m.hifz, review: !!m.review, isToday: d === today }
  })
}
