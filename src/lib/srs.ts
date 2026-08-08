// محرك التكرار المتباعد (SRS) — ورد المراجعة يُنشأ آلياً لا بيد المستخدم.
// القاعدة (الخطة v2.1 حرفياً):
//   ممتاز ← بعد 3 أيام ثم أسبوع ثم شهر (ثم يستقر على دورة شهرية)
//   ضعيف  ← اليوم التالي، ويعود لأول السلم
//   جيد   ← يبقى في درجته، بمهلة أقصر بقليل (قابلة للضبط)
// دوال نقية بلا حالة — تُختبر بمعزل عن الواجهة.

export type Grade = 'excellent' | 'good' | 'weak'

export const GRADE_LABEL: Record<Grade, string> = {
  excellent: 'ممتاز',
  good: 'جيد',
  weak: 'ضعيف',
}

/** سلم «ممتاز»: 3 أيام ثم 7 ثم 30 يوماً */
export const STAGE_INTERVALS = [3, 7, 30] as const

/** سقف التراكم: بلوغه في مستحقات المراجعة يمنع إضافة ورد حفظ جديد */
export const REVIEW_BACKLOG_LIMIT = 5

/** مفتاح يوم محلي YYYY-MM-DD (لا UTC — يوم المستخدم هو يوم جهازه) */
export function dateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** مفتاح اليوم بعد n يوماً من اليوم */
export function dateKeyAfter(n: number, from: Date = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + n)
  return dateKey(d)
}

export interface ScheduleResult {
  /** الدرجة الجديدة في السلم (0 = بداية، 3 = استقرار شهري) */
  stage: number
  /** بعد كم يوم يستحق */
  inDays: number
}

/** جدولة مراجعة بناءً على الدرجة الحالية والتقييم الذاتي */
export function schedule(stage: number, grade: Grade): ScheduleResult {
  if (grade === 'weak') return { stage: 0, inDays: 1 }
  if (grade === 'good') {
    const interval = STAGE_INTERVALS[Math.min(stage, STAGE_INTERVALS.length - 1)]
    return { stage, inDays: Math.max(2, interval - 1) }
  }
  // ممتاز: تقدّم درجة؛ الدخول الأول (stage 0) ← 3 أيام كما نصت الخطة
  const next = Math.min(stage + 1, STAGE_INTERVALS.length)
  return { stage: next, inDays: STAGE_INTERVALS[Math.min(next - 1, STAGE_INTERVALS.length - 1)] }
}
