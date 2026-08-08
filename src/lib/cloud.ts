// النسخ الاحتياطي السحابي (9) — حفظ مباشر في مجلدات مزامنة OneDrive و
// Google Drive لسطح المكتب؛ خدمة السحابة نفسها ترفع الملف، فيستعيده
// المستخدم على أي جهاز. يعمل سطح المكتب فقط — في المتصفح يبقى تنزيل
// الملف واستيراده هو الطريق. بلا OAuth وبلا اتصال من التطبيق نفسه.
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from './assets'

export interface CloudTarget {
  provider: 'onedrive' | 'gdrive'
  label: string
  folder: string
}

/** المجلدات السحابية المتوفرة على الجهاز — مصفوفة فارغة في المتصفح */
export async function listCloudTargets(): Promise<CloudTarget[]> {
  if (!isTauri()) return []
  return invoke<CloudTarget[]>('cloud_targets')
}

/** يحفظ النسخة في مجلد المزامنة ويعيد مسارها الكامل */
export async function saveBackupToCloud(
  provider: string,
  filename: string,
  contents: string,
): Promise<string> {
  return invoke<string>('save_backup_to_cloud', { provider, filename, contents })
}

/** حوار «حفظ باسم» الأصلي — يعيد المسار الذي اختاره المستخدم أو null إن ألغى */
export async function pickBackupSavePath(defaultFilename: string): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  return save({
    defaultPath: defaultFilename,
    filters: [{ name: 'نسخة احتياطية', extensions: ['bak'] }],
  })
}

/** يكتب النسخة في المسار الذي اختاره المستخدم ويعيده */
export async function saveBackupToPath(path: string, contents: string): Promise<string> {
  return invoke<string>('save_backup_to_path', { path, contents })
}
