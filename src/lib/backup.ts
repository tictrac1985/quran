// النسخ الاحتياطي والاستعادة (6.1) — تصدير كل بيانات المستخدم في ملف .bak
// واحد مع ترويسة إصدار، واستيراده على أي جهاز. المخازن الآن localStorage
// (قرار موثق في docs/TAURI_SETUP.md) — التصدير يلتقط مفاتيحها كما هي.
import { dateKey } from './srs'
import { surahTotal } from './ayahCounts'

const APP_TAG = 'mushaf-mubtakir'
const BACKUP_VERSION = 1
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024

/** مفاتيح localStorage التي هي بيانات مستخدم (كل مخازن zustand persist) */
const STORE_KEYS = ['mushaf-reader', 'mushaf-wirds'] as const
type StoreKey = (typeof STORE_KEYS)[number]

interface BackupFile {
  app: typeof APP_TAG
  backupVersion: number
  createdAt: string
  stores: Record<string, unknown>
}

export interface BackupStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (
  value: JsonObject,
  allowed: readonly string[],
  required: readonly string[] = allowed,
) => {
  const keys = Object.keys(value)
  return keys.every((key) => allowed.includes(key)) && required.every((key) => key in value)
}

const isInt = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

const isTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 8_640_000_000_000_000

const isShortString = (value: unknown, max: number, min = 1): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max

const DATE_KEY_RX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/
const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_KEY_RX.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
const isNullableDateKey = (value: unknown): value is string | null => value === null || isDateKey(value)
const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

function isPersistEnvelope(
  value: unknown,
  version: number,
): value is { state: JsonObject; version: number } {
  return (
    isObject(value) &&
    hasExactKeys(value, ['state', 'version']) &&
    value.version === version &&
    isObject(value.state)
  )
}

function isBookmark(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['id', 'name', 'page', 'createdAt']) &&
    isShortString(value.id, 128) &&
    isShortString(value.name, 60) &&
    isInt(value.page, 1, 604) &&
    isTimestamp(value.createdAt)
  )
}

function isReaderStore(value: unknown): boolean {
  if (!isPersistEnvelope(value, 1)) return false
  const s = value.state
  return (
    hasExactKeys(s, ['page', 'mode', 'zoom', 'bookmarks', 'theme']) &&
    isInt(s.page, 1, 604) &&
    (s.mode === 'single' || s.mode === 'spread') &&
    typeof s.zoom === 'number' &&
    Number.isFinite(s.zoom) &&
    s.zoom >= 0.7 &&
    s.zoom <= 1.6 &&
    Array.isArray(s.bookmarks) &&
    s.bookmarks.length <= 5000 &&
    s.bookmarks.every(isBookmark) &&
    new Set(s.bookmarks.map((b) => (b as JsonObject).id)).size === s.bookmarks.length &&
    (s.theme === 'day' || s.theme === 'sepia' || s.theme === 'night')
  )
}

const GRADES = new Set(['excellent', 'good', 'weak'])

function isHifzItem(value: unknown): boolean {
  if (
    !isObject(value) ||
    !hasExactKeys(value, [
      'id',
      'surah',
      'from',
      'to',
      'stage',
      'dueDate',
      'lastGrade',
      'reviews',
      'createdAt',
    ]) ||
    !isShortString(value.id, 128) ||
    !isInt(value.surah, 1, 114) ||
    !isInt(value.from, 1, surahTotal(value.surah)) ||
    !isInt(value.to, value.from, surahTotal(value.surah)) ||
    !isInt(value.stage, 0, 3) ||
    !isNullableDateKey(value.dueDate) ||
    !(
      value.lastGrade === null ||
      (typeof value.lastGrade === 'string' && GRADES.has(value.lastGrade))
    ) ||
    !isInt(value.reviews, 0, 100_000) ||
    !isTimestamp(value.createdAt)
  ) {
    return false
  }
  return value.dueDate === null
    ? value.lastGrade === null && value.reviews === 0 && value.stage === 0
    : value.lastGrade !== null && value.reviews >= 1
}

function isReadingPlan(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['days', 'startDate', 'position']) &&
    isInt(value.days, 7, 360) &&
    isDateKey(value.startDate) &&
    isInt(value.position, 1, 605)
  )
}

function isReadingToday(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['day', 'startPos']) &&
    isDateKey(value.day) &&
    isInt(value.startPos, 1, 605)
  )
}

function isHifzTrack(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ['queue', 'index', 'nextAyah', 'pace'])) return false
  if (
    !Array.isArray(value.queue) ||
    value.queue.length < 1 ||
    value.queue.length > 114 ||
    !value.queue.every((n) => isInt(n, 1, 114)) ||
    new Set(value.queue).size !== value.queue.length ||
    !isInt(value.index, 0, value.queue.length - 1) ||
    !isInt(value.pace, 1, 15)
  ) {
    return false
  }
  return isInt(value.nextAyah, 1, surahTotal(value.queue[value.index] as number))
}

function isHistory(value: unknown): boolean {
  if (!isObject(value) || Object.keys(value).length > 10_000) return false
  return Object.entries(value).every(([day, marks]) => {
    if (!isDateKey(day) || !isObject(marks) || !hasExactKeys(marks, ['read', 'hifz', 'review'], []))
      return false
    return Object.values(marks).every((mark) => typeof mark === 'boolean')
  })
}

function isReminder(value: unknown): boolean {
  return (
    isObject(value) &&
    hasExactKeys(value, ['enabled', 'time', 'lastDay']) &&
    typeof value.enabled === 'boolean' &&
    typeof value.time === 'string' &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time) &&
    isNullableDateKey(value.lastDay)
  )
}

function hasValidHifz(value: JsonObject): boolean {
  if (!Array.isArray(value.hifz) || value.hifz.length > 10_000 || !value.hifz.every(isHifzItem))
    return false
  return new Set(value.hifz.map((h) => (h as JsonObject).id)).size === value.hifz.length
}

function isWirdsStore(value: unknown): boolean {
  if (!isObject(value) || !hasExactKeys(value, ['state', 'version']) || !isObject(value.state))
    return false
  const s = value.state

  // الشكل القديم الوحيد الذي تدعمه migrate في المتجر: لا نسمح إلا بالحقول
  // التي تقرؤها الهجرة فعلاً، ثم يكمّل المتجر بقية القيم الافتراضية.
  if (value.version === 0 || value.version === 1) {
    return (
      hasExactKeys(s, ['congratsDismissedDay', 'hifz', 'history']) &&
      isNullableDateKey(s.congratsDismissedDay) &&
      hasValidHifz(s) &&
      isHistory(s.history)
    )
  }
  if (value.version !== 2) return false

  return (
    hasExactKeys(s, [
      'readingPlan',
      'readingToday',
      'visitedToday',
      'congratsDismissedDay',
      'hifz',
      'hifzTrack',
      'history',
      'reminder',
    ]) &&
    (s.readingPlan === null || isReadingPlan(s.readingPlan)) &&
    isReadingToday(s.readingToday) &&
    Array.isArray(s.visitedToday) &&
    s.visitedToday.length <= 604 &&
    s.visitedToday.every((p) => isInt(p, 1, 604)) &&
    new Set(s.visitedToday).size === s.visitedToday.length &&
    isNullableDateKey(s.congratsDismissedDay) &&
    hasValidHifz(s) &&
    (s.hifzTrack === null || isHifzTrack(s.hifzTrack)) &&
    isHistory(s.history) &&
    isReminder(s.reminder)
  )
}

function validateStore(key: StoreKey, value: unknown): void {
  const valid = key === 'mushaf-reader' ? isReaderStore(value) : isWirdsStore(value)
  if (!valid) throw new Error(`بيانات المخزن ${key} لا تطابق بنيته المعتمدة`)
}

/** تحليل النسخة والتحقق الكامل منها دون أي كتابة إلى تخزين المستخدم. */
export function parseBackupJson(contents: string): Partial<Record<StoreKey, string>> {
  if (new TextEncoder().encode(contents).byteLength > MAX_BACKUP_BYTES)
    throw new Error('حجم النسخة الاحتياطية يتجاوز الحد المسموح (5 MB)')

  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new Error('الملف ليس نسخة احتياطية صالحة (JSON مكسور)')
  }
  if (!isObject(parsed) || !hasExactKeys(parsed, ['app', 'backupVersion', 'createdAt', 'stores']))
    throw new Error('بنية ملف النسخة الاحتياطية غير معروفة')
  if (parsed.app !== APP_TAG) throw new Error('هذا الملف لا يخص هذا التطبيق')
  if (parsed.backupVersion !== BACKUP_VERSION)
    throw new Error(`إصدار النسخة (${String(parsed.backupVersion ?? '؟')}) غير مدعوم`)
  if (!isIsoTimestamp(parsed.createdAt)) {
    throw new Error('تاريخ إنشاء النسخة غير صالح')
  }
  if (!isObject(parsed.stores) || !hasExactKeys(parsed.stores, STORE_KEYS, []))
    throw new Error('بيانات المخازن غير صالحة')

  const entries = Object.entries(parsed.stores) as [StoreKey, unknown][]
  if (entries.length === 0) throw new Error('لا مخازن معروفة في النسخة')
  const serialized: Partial<Record<StoreKey, string>> = {}
  for (const [key, value] of entries) {
    validateStore(key, value)
    serialized[key] = JSON.stringify(value)
  }
  return serialized
}

/** كتابة كل المخازن كوحدة واحدة قدر الإمكان، مع استعادة اللقطة السابقة عند الفشل. */
export function applyBackupStores(
  stores: Partial<Record<StoreKey, string>>,
  storage: BackupStorage = localStorage,
): void {
  const entries = Object.entries(stores) as [StoreKey, string][]
  const before = new Map(entries.map(([key]) => [key, storage.getItem(key)] as const))
  try {
    for (const [key, value] of entries) storage.setItem(key, value)
  } catch (error) {
    let rollbackFailed = false
    for (const [key, previous] of before) {
      try {
        if (previous === null) storage.removeItem(key)
        else storage.setItem(key, previous)
      } catch {
        rollbackFailed = true
      }
    }
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      rollbackFailed
        ? `فشل حفظ النسخة وتعذر استعادة بعض البيانات السابقة: ${reason}`
        : `فشل حفظ النسخة؛ أُعيدت البيانات السابقة دون تغيير: ${reason}`,
    )
  }
}

/** اسم فريد وقابل للفرز؛ يمنع استبدال أكثر من نسخة أُنشئت في اليوم نفسه دون قصد. */
export const backupFilename = () => {
  const time = new Date().toTimeString().slice(0, 8).replaceAll(':', '-')
  return `mushaf-backup-${dateKey()}-${time}.bak`
}

/** يبني حمولة النسخة الاحتياطية JSON (تتشاركها التنزيل والحفظ السحابي) */
export function buildBackupJson(storage: Pick<BackupStorage, 'getItem'> = localStorage): string {
  const stores: Record<string, unknown> = {}
  for (const key of STORE_KEYS) {
    const raw = storage.getItem(key)
    if (raw !== null) {
      try {
        stores[key] = JSON.parse(raw)
      } catch {
        stores[key] = raw
      }
    }
  }
  const backup: BackupFile = {
    app: APP_TAG,
    backupVersion: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    stores,
  }
  return JSON.stringify(backup, null, 2)
}

/** يبني ملف النسخة وينزّله في المتصفح */
export function exportBackup(): void {
  const blob = new Blob([buildBackupJson()], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = backupFilename()
  a.click()
  URL.revokeObjectURL(a.href)
}

/**
 * يتحقق من ملف .bak ويستورد مخازنه ثم يعيد تحميل التطبيق.
 * يرمي رسالة عربية واضحة عند أي خلل (لا يمس البيانات الحالية قبل التحقق الكامل).
 */
export async function importBackup(file: File): Promise<void> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('حجم النسخة الاحتياطية يتجاوز الحد المسموح (5 MB)')
  const stores = parseBackupJson(await file.text())
  applyBackupStores(stores)
  window.location.reload()
}
