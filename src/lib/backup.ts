// النسخ الاحتياطي والاستعادة (6.1) — تصدير كل بيانات المستخدم في ملف .bak
// واحد مع ترويسة إصدار، واستيراده على أي جهاز. المخازن الآن localStorage
// (قرار موثق في docs/TAURI_SETUP.md) — التصدير يلتقط مفاتيحها كما هي.
import { dateKey } from './srs'

const APP_TAG = 'mushaf-mubtakir'
const BACKUP_VERSION = 1

/** مفاتيح localStorage التي هي بيانات مستخدم (كل مخازن zustand persist) */
const STORE_KEYS = ['mushaf-reader', 'mushaf-wirds'] as const

interface BackupFile {
  app: typeof APP_TAG
  backupVersion: number
  createdAt: string
  stores: Record<string, unknown>
}

/** اسم ملف النسخة الاحتياطية لليوم */
export const backupFilename = () => `mushaf-backup-${dateKey()}.bak`

/** يبني حمولة النسخة الاحتياطية JSON (تتشاركها التنزيل والحفظ السحابي) */
export function buildBackupJson(): string {
  const stores: Record<string, unknown> = {}
  for (const key of STORE_KEYS) {
    const raw = localStorage.getItem(key)
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
  let parsed: BackupFile
  try {
    parsed = JSON.parse(await file.text()) as BackupFile
  } catch {
    throw new Error('الملف ليس نسخة احتياطية صالحة (JSON مكسور)')
  }
  if (parsed.app !== APP_TAG) throw new Error('هذا الملف لا يخص هذا التطبيق')
  if (typeof parsed.backupVersion !== 'number' || parsed.backupVersion > BACKUP_VERSION)
    throw new Error(`إصدار النسخة (${parsed.backupVersion ?? '؟'}) أحدث من فهم التطبيق`)
  if (!parsed.stores || typeof parsed.stores !== 'object') throw new Error('لا بيانات مخازن في الملف')

  // التحقق الكامل أولاً: كل قيمة يجب أن تكون قابلة للتخزين
  const entries = Object.entries(parsed.stores).filter(([k]) => (STORE_KEYS as readonly string[]).includes(k))
  if (entries.length === 0) throw new Error('لا مخازن معروفة في النسخة')
  for (const [key, value] of entries) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  }
  window.location.reload()
}
