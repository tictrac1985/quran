# إعداد بيئة بناء Tauri — تمّ التغليف فعلاً (2026-08-08)

هذه الوثيقة كانت تسجّل تأجيل بناء سطح المكتب؛ **التغليف أُنجز** وهذه هي
الحالة النهائية المعتمدة.

## المتطلبات

1. **Rust:** `winget install Rustlang.Rustup` ثم `rustup default stable`
2. **أدوات بناء MSVC:** «Build Tools لـ Visual Studio 2022» مع حمل عمل
   «تطوير سطح المكتب بـ C++» (WebView2 مثبت مسبقاً على Windows 10/11).
3. **الأصول:** `python tools/fetch_qcf4.py` (تُنزَّل إلى `src-tauri/assets/`
   ولا تدخل المستودع).
4. **الأيقونات:** `python tools/make_icon.py` ثم
   `npx tauri icon src-tauri/icons/icon-src.png` (مستثناة من المستودع — تُولَّد).

## البناء

- التطوير في المتصفح: `npm run dev` (الأصول تُقدَّم عبر وسيط Vite —
  انظر `vite.config.ts`).
- تطبيق سطح المكتب: `npm run tauri build` — ينتج مثبّت NSIS عربياً
  (installMode currentUser) في `src-tauri/target/release/bundle/nsis/`.
- النسخة المحمولة: `quran-app.exe` من `target/release/` مع مجلد `assets/`
  بجواره — تعمل بلا تنصيب.

## قرارات البنية المحسومة

- **وصول الأصول:** بروتوكول مخصص `mushaf://` (`src-tauri/src/lib.rs`) يقدّم
  ملفات `assets/mushaf-qcf4` من مجلد الموارد. اختُصر الطريق إليه بعد أن
  تعطّل بروتوكول `asset://` المدمج بسبب بادئة `\\?\` في مسار ويندوز
  (os error 123) — المعالج المخصص يجرد البادئة ويتحقق من الجذر بنفسه.
- **النسخ السحابي:** بلا OAuth — تُكتب النسخة في مجلد مزامنة OneDrive /
  Google Drive المكتشف من النظام، وخدمة السحابة ترفعها.
- **التصدير المحلي:** حوار «حفظ باسم» أصلي عبر `tauri-plugin-dialog` +
  أمر `save_backup_to_path` (تنزيل blob صامت داخل WebView2).
- **مخازن البيانات:** localStorage (zustand persist) — تعمل في WebView2
  كما في المتصفح بلا أي تعديل، وهي أساس الاستئناف التلقائي.
