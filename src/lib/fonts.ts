// إدارة خطوط العرض — حزمة QCF4 (طبعة 1441هـ): 47 خطاً مجمّعاً (QCF4_Hafs_XX)
// + خط الزخارف (QCF4_QBSML) + خط أسماء السور v2 لأثاث الترويسة والفهرس.
//
// لماذا الانتظار إلزامي؟ رموز char محارف في مجال الاستخدام الخاص (PUA) —
// أي عرض لحظي بخط احتياطي يُظهر مربعات فارغة أو حروفاً مشوهة، وهذا غير مقبول
// في نص المصحف ولو لإطار واحد. لذا font-display: block + FontFace.load.

import { assetUrl, SURAH_NAMES_FONT_PATH } from './assets'

const registered = new Map<string, FontFace>()
const loading = new Map<string, Promise<void>>()

/** تحميل عائلة مرة واحدة مع السماح بالمحاولة مجدداً إن فشل التحميل السابق. */
function loadFace(family: string, url: string, format: string): Promise<void> {
  if (registered.has(family)) return Promise.resolve()
  const hit = loading.get(family)
  if (hit) return hit

  // Tauri يضيف nonce إلى style-src في البناء النهائي، لذلك تُحظر عناصر <style>
  // الديناميكية حتى مع unsafe-inline. واجهة FontFace تحمّل الأصل عبر font-src مباشرة
  // ولا تُضعف CSP أو تسمح بعرض محرف QCF قبل اكتمال خطه.
  const face = new FontFace(
    family,
    `url(${JSON.stringify(url)}) format(${JSON.stringify(format)})`,
    { display: 'block' },
  )
  const cached = face
    .load()
    .then((loaded) => {
      document.fonts.add(loaded)
      registered.set(family, loaded)
    })
    .catch((error: unknown) => {
      document.fonts.delete(face)
      throw error
    })
    .finally(() => {
      if (loading.get(family) === cached) loading.delete(family)
    })
  loading.set(family, cached)
  return cached
}

export const SURAH_NAMES_FAMILY = 'surah-name-v2'

/**
 * اسم السورة في خط surah-name-v2: ميزة liga مسجلة في GSUB تحت سكربت latn فقط،
 * فنكتب "surah003" (حروف لاتينية صريحة + رقم من 3 خانات) ليختار المشكّل latn
 * وتشتغل الرباطة فتنتج محرف الإطار المزخرف كاملاً.
 */
export const surahNameText = (n: number) => `surah${String(n).padStart(3, '0')}`

const QCF4_HAFS_FAMILY = /^QCF4_Hafs_(?:0[1-9]|[1-3][0-9]|4[0-7])$/

/** ملف الخط لكل عائلة QCF4: خط الزخارف QBSML بلا لاحقة _W */
export const qcf4FontFile = (family: string): string => {
  if (family === 'QCF4_QBSML') return 'fonts/QCF4_QBSML.woff2'
  if (!QCF4_HAFS_FAMILY.test(family)) throw new Error(`عائلة خط مصحف غير معتمدة: ${family}`)
  return `fonts/${family}_W.woff2`
}

/**
 * يسجّل ويحمّل كل عائلات الخطوط التي تطلبها صفحة (خطها الأساسي + خطوط كلماتها
 * كالبسملة من QCF4_Hafs_01 واللافتات من QCF4_QBSML). يجب أن يكتمل قبل أول رسم.
 */
export async function ensureQcf4Fonts(families: Iterable<string>): Promise<void> {
  const fams = [...new Set(families)]
  await Promise.all([
    ...fams.map((f) => loadFace(f, assetUrl(qcf4FontFile(f)), 'woff2')),
    // خط أسماء السور: أثاث الترويسة جزء من رسم الصفحة — يُحمَّل معها دائماً
    loadFace(SURAH_NAMES_FAMILY, assetUrl(SURAH_NAMES_FONT_PATH), 'truetype'),
  ])
}

/** أثاث الفهرس والترويسة: خط أسماء السور فقط */
export async function ensureExtraFonts(): Promise<void> {
  await loadFace(SURAH_NAMES_FAMILY, assetUrl(SURAH_NAMES_FONT_PATH), 'truetype')
}
