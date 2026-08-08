// إدارة خطوط العرض — حزمة QCF4 (طبعة 1441هـ): 47 خطاً مجمّعاً (QCF4_Hafs_XX)
// + خط الزخارف (QCF4_QBSML) + خط أسماء السور v2 لأثاث الترويسة والفهرس.
//
// لماذا الانتظار إلزامي؟ رموز char محارف في مجال الاستخدام الخاص (PUA) —
// أي عرض لحظي بخط احتياطي يُظهر مربعات فارغة أو حروفاً مشوهة، وهذا غير مقبول
// في نص المصحف ولو لإطار واحد. لذا font-display: block + document.fonts.load.

import { assetUrl, SURAH_NAMES_FONT_PATH } from './assets'

const injected = new Set<string>()

function injectFace(family: string, url: string, format: string): void {
  if (injected.has(family)) return
  injected.add(family)
  const style = document.createElement('style')
  style.dataset.mushafFont = family
  style.textContent =
    `@font-face{font-family:'${family}';src:url('${url}') format('${format}');font-display:block;}`
  document.head.appendChild(style)
}

export const SURAH_NAMES_FAMILY = 'surah-name-v2'

/**
 * اسم السورة في خط surah-name-v2: ميزة liga مسجلة في GSUB تحت سكربت latn فقط،
 * فنكتب "surah003" (حروف لاتينية صريحة + رقم من 3 خانات) ليختار المشكّل latn
 * وتشتغل الرباطة فتنتج محرف الإطار المزخرف كاملاً.
 */
export const surahNameText = (n: number) => `surah${String(n).padStart(3, '0')}`

/** ملف الخط لكل عائلة QCF4: خط الزخارف QBSML بلا لاحقة _W */
export const qcf4FontFile = (family: string): string =>
  family === 'QCF4_QBSML' ? 'fonts/QCF4_QBSML.woff2' : `fonts/${family}_W.woff2`

/**
 * يحقن ويحمّل كل عائلات الخطوط التي تطلبها صفحة (خطها الأساسي + خطوط كلماتها
 * كالبسملة من QCF4_Hafs_01 واللافتات من QCF4_QBSML). يجب أن يكتمل قبل أول رسم.
 */
export async function ensureQcf4Fonts(families: Iterable<string>): Promise<void> {
  const fams = [...new Set(families)]
  for (const fam of fams) injectFace(fam, assetUrl(qcf4FontFile(fam)), 'woff2')
  // خط أسماء السور: أثاث الترويسة جزء من رسم الصفحة — يُحمَّل معها دائماً
  injectFace(SURAH_NAMES_FAMILY, assetUrl(SURAH_NAMES_FONT_PATH), 'truetype')
  await Promise.all([
    ...fams.map((f) => document.fonts.load(`16px '${f}'`)),
    document.fonts.load(`16px '${SURAH_NAMES_FAMILY}'`),
  ])
}

/** أثاث الفهرس والترويسة: خط أسماء السور فقط */
export async function ensureExtraFonts(): Promise<void> {
  injectFace(SURAH_NAMES_FAMILY, assetUrl(SURAH_NAMES_FONT_PATH), 'truetype')
  await document.fonts.load(`16px '${SURAH_NAMES_FAMILY}'`)
}
