// طقم الأيقونات — نظام واحد: شبكة ٢٤، سُمك ١٫٦، أطراف دائرية، currentColor.
// سبب وجوده: الواجهة كانت تستعمل محارف يونيكود (☰ ⌕ ▢ ⛶) كأيقونات، وهي تُرسم
// بخط النظام فيختلف وزنها ومقاسها بين الأجهزة وتظهر كنص متروك لا كأداة.
// كل أيقونة هنا مرسومة يدوياً على نفس الشبكة فتبدو أسرة واحدة.
import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

function Ic({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...p}
    >
      {children}
    </svg>
  )
}

/** السحابة مع سهم صاعد: النسخة تُحفظ في مجلد المزامنة فترتفع */
export const IconCloud = (p: P) => (
  <Ic {...p}>
    <path d="M17.5 18.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.4 12.4 3.5 3.5 0 0 0 6.5 18.5Z" />
    <path d="M12 12.5v6M9.6 14.9 12 12.5l2.4 2.4" />
  </Ic>
)

/** تصدير إلى القرص: سهم نازل إلى صينية — النسخة تخرج من التطبيق إلى ملف */
export const IconDownload = (p: P) => (
  <Ic {...p}>
    <path d="M12 4v9.5M8.7 10.7 12 14l3.3-3.3" />
    <path d="M4.5 15.5v2.8a2.2 2.2 0 0 0 2.2 2.2h10.6a2.2 2.2 0 0 0 2.2-2.2v-2.8" />
  </Ic>
)

/** استيراد من القرص: سهم صاعد من صينية — النسخة تعود من ملف إلى التطبيق */
export const IconUpload = (p: P) => (
  <Ic {...p}>
    <path d="M12 14V4.5M8.7 7.8 12 4.5l3.3 3.3" />
    <path d="M4.5 15.5v2.8a2.2 2.2 0 0 0 2.2 2.2h10.6a2.2 2.2 0 0 0 2.2-2.2v-2.8" />
  </Ic>
)

/** الفهرس: مداخل معلَّمة بنقاط وأمامها أرقام صفحاتها — قائمة محتويات لا قائمة أوامر */
export const IconIndex = (p: P) => (
  <Ic {...p}>
    <circle cx="18.6" cy="7" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="18.6" cy="12" r="1.25" fill="currentColor" stroke="none" />
    <circle cx="18.6" cy="17" r="1.25" fill="currentColor" stroke="none" />
    <path d="M14.6 7H5.4M14.6 12H5.4M14.6 17H9" />
  </Ic>
)

export const IconSearch = (p: P) => (
  <Ic {...p}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="M15.8 15.8 20 20" />
  </Ic>
)

/** نجمة خماسية بنسبة ذهبية للنصف القطري الداخلي (0.382) — أطرافها ممتلئة لا شوكية */
const STAR = 'M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.62l-5.1 2.68.98-5.68L3.75 9.6l5.7-.83z'

export const IconStar = (p: P) => (
  <Ic {...p}>
    <path d={STAR} />
  </Ic>
)

export const IconStarFilled = (p: P) => (
  <Ic {...p}>
    <path d={STAR} fill="currentColor" />
  </Ic>
)

/** نهاري: شمس */
export const IconSun = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </Ic>
)

/** سيبيا: قرص نصفه مصمت — حرارة الورق بين النهاري والليلي */
export const IconHalf = (p: P) => (
  <Ic {...p}>
    <circle cx="12" cy="12" r="7.4" />
    <path d="M12 4.6a7.4 7.4 0 0 0 0 14.8z" fill="currentColor" stroke="none" />
  </Ic>
)

/** ليلي: هلال */
export const IconMoon = (p: P) => (
  <Ic {...p}>
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
  </Ic>
)

/** صفحتان متقابلتان */
export const IconSpread = (p: P) => (
  <Ic {...p}>
    <path d="M12 6.4c-1.8-1.2-3.7-1.8-6-1.8v12c2.3 0 4.2.6 6 1.8 1.8-1.2 3.7-1.8 6-1.8v-12c-2.3 0-4.2.6-6 1.8z" />
    <path d="M12 6.4v12" />
  </Ic>
)

/** صفحة واحدة */
export const IconSingle = (p: P) => (
  <Ic {...p}>
    <rect x="6.5" y="4.5" width="11" height="15" rx="1.4" />
  </Ic>
)

/** وضع التركيز: أربع زوايا تتسع */
export const IconFocus = (p: P) => (
  <Ic {...p}>
    <path d="M4 9V5.6C4 4.7 4.7 4 5.6 4H9M15 4h3.4c.9 0 1.6.7 1.6 1.6V9M20 15v3.4c0 .9-.7 1.6-1.6 1.6H15M9 20H5.6C4.7 20 4 19.3 4 18.4V15" />
  </Ic>
)

export const IconClose = (p: P) => (
  <Ic {...p}>
    <path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6" />
  </Ic>
)

/** سهم نحو بداية السطر (يمين في RTL) — الصفحة السابقة */
export const IconPrev = (p: P) => (
  <Ic {...p}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Ic>
)

/** سهم نحو نهاية السطر (يسار في RTL) — الصفحة التالية */
export const IconNext = (p: P) => (
  <Ic {...p}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Ic>
)

export const IconPlus = (p: P) => (
  <Ic {...p}>
    <path d="M12 6v12M6 12h12" />
  </Ic>
)

export const IconMinus = (p: P) => (
  <Ic {...p}>
    <path d="M6 12h12" />
  </Ic>
)

/** بصمة السلامة: درع بعلامة صح */
export const IconSeal = (p: P) => (
  <Ic {...p}>
    <path d="M12 3.5l6.5 2.4v5.3c0 4-2.7 7.6-6.5 9-3.8-1.4-6.5-5-6.5-9V5.9z" />
    <path d="M9.2 11.9l2 2 3.6-3.9" />
  </Ic>
)

/** قراءة الورد: مصحف مفتوح */
export const IconBookOpen = (p: P) => (
  <Ic {...p}>
    <path d="M12 7c-1.7-1.1-3.6-1.7-5.8-1.7-.7 0-1.2.5-1.2 1.2v9.3c0 .7.5 1.2 1.2 1.2 2.2 0 4.1.6 5.8 1.7 1.7-1.1 3.6-1.7 5.8-1.7.7 0 1.2-.5 1.2-1.2V6.5c0-.7-.5-1.2-1.2-1.2-2.2 0-4.1.6-5.8 1.7z" />
    <path d="M12 7v11.7" />
  </Ic>
)

/** الحفظ: نبتة تنمو */
export const IconSprout = (p: P) => (
  <Ic {...p}>
    <path d="M12 20v-6.5" />
    <path d="M12 13.5C12 10.7 9.8 8.5 7 8.5c0 2.8 2.2 5 5 5z" />
    <path d="M12 13.5c0-3.3 2.7-6 6-6 0 3.3-2.7 6-6 6z" />
  </Ic>
)

/** المراجعة: دورة متكررة */
export const IconCycle = (p: P) => (
  <Ic {...p}>
    <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9.4" />
    <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 14.6" />
    <path d="M20 5.2v4.2h-4.2M4 18.8v-4.2h4.2" />
  </Ic>
)

/** المواظبة: شعلة */
export const IconFlame = (p: P) => (
  <Ic {...p}>
    <path d="M12 3.5s4.8 3.6 4.8 8.2a4.8 4.8 0 1 1-9.6 0c0-1.7.8-3 1.7-4 .2 1 .8 1.8 1.6 1.8 1 0 1.5-.9 1.5-2.2 0-1.3-.5-2.5-1-3.8z" />
  </Ic>
)

/** شجرة الحفظ: شبكة السور */
export const IconGrid = (p: P) => (
  <Ic {...p}>
    <rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
    <rect x="13.5" y="4.5" width="6" height="6" rx="1.2" />
    <rect x="4.5" y="13.5" width="6" height="6" rx="1.2" />
    <rect x="13.5" y="13.5" width="6" height="6" rx="1.2" />
  </Ic>
)

/** النسخ الاحتياطي: صندوق محفوظات */
export const IconArchive = (p: P) => (
  <Ic {...p}>
    <rect x="4" y="4.8" width="16" height="4" rx="1.2" />
    <path d="M5.4 8.8v9c0 .8.6 1.4 1.4 1.4h10.4c.8 0 1.4-.6 1.4-1.4v-9" />
    <path d="M10 12.6h4" />
  </Ic>
)

/** التذكير: جرس */
export const IconBell = (p: P) => (
  <Ic {...p}>
    <path d="M18 16.5H6l1.2-2v-3.9a4.8 4.8 0 0 1 9.6 0V14.5z" />
    <path d="M10.3 19.2a1.9 1.9 0 0 0 3.4 0" />
  </Ic>
)

/** خطأ/إيقاف: مثمّن تحذير */
export const IconStop = (p: P) => (
  <Ic {...p}>
    <path d="M8.4 3.6h7.2L20.4 8.4v7.2l-4.8 4.8H8.4l-4.8-4.8V8.4z" />
    <path d="M12 8v4.6M12 16.1v.1" />
  </Ic>
)
