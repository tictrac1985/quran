# التراخيص ومصادر المحتوى — المصحف المبتكر

آخر تحديث: 2026-08-06

هذا الملف يوثّق المحتوى الخارجي **المُضمَّن فعلياً** في التطبيق وشروط استخدامه.
الشيفرة نفسها ملك للمشروع؛ ما يلي يخص البيانات والخطوط المرفقة في
`src-tauri/assets/mushaf-qcf4/`.

---

## 1. حزمة المصحف QCF4 (النص والخطوط والصفحات)

المسار: `src-tauri/assets/mushaf-qcf4/` — والترخيص التفصيلي المرفق معها في
`src-tauri/assets/mushaf-qcf4/LICENSE.md` هو المرجع المعتمد.

- **بيانات JSON** (`pages/`، `index.json`، `verses.json`، `font-map.json`):
  رخصة MIT — © 2026 Mohamad Hajj Rabee.
- **الخطوط** (`fonts/QCF4_Hafs_*.woff2`، عدد 48 خطاً + خط البسملة
  `QCF4_QBSML.woff2`): **ليست** تحت MIT.
  - مبنية على مصحف المدينة (طبعة 1441هـ)، بخط المصحف للخطاط **عثمان طه**،
    إنتاج **مجمع الملك فهد لطباعة المصحف الشريف** بالمدينة المنورة.
  - تجهيز الخطوط بصيغتي WOFF2/TTF: **Ahmad ElGharib**.
  - الشروط: الاستخدام **لأغراض عرض القرآن الكريم فقط**؛ يُمنع إعادة التوزيع
    أو التعديل أو الاستخدام التجاري دون إذن صريح من أصحاب الحقوق.

## 2. خط أسماء السور

- `extras/surah-name-v2.ttf` — من مشروع **QUL (Quranic Universal Library)**
  التابع لـ Tarteel: https://qul.tarteel.ai

## 3. التفسير

المسار: `tafsir/ibn-kathir/` و`tafsir/sadi/`.

- تفسير **ابن كثير** وتفسير **السعدي** — عبر حزمة البيانات المفتوحة
  `spa5k/tafsir_api` (https://github.com/spa5k/tafsir_api)، ومصدرها الأصلي
  quran.com / QUL.
- يُعاد الجلب والبناء بسكربت `tools/build_tafsir.py`.

## 4. أسباب النزول

المسار: `tafsir/asbab/`.

- من مجموعة البيانات المفتوحة
  `mostafaahmed97/asbab-al-nuzul-dataset`
  (https://github.com/mostafaahmed97/asbab-al-nuzul-dataset)، ومصدرها كتاب
  **«صحيح أسباب النزول»** للشيخ إبراهيم محمد العلي.
- يُعاد الجلب والبناء بسكربت `tools/build_asbab.py`.

---

## ملاحظات

- سكربتات `tools/` (`fetch_qcf4.py`، `build_tafsir.py`، `build_asbab.py`، ...)
  توثّق مصدر كل أصل وطريقة إعادة جلبه من منبعه.
- أي إضافة مستقبلية لمحتوى خارجي يجب أن تُسجَّل هنا قبل دمجها.
