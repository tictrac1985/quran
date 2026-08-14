// الكلمة الواحدة: span مستقل برمز Glyph (char من مجال PUA) — أساس التظليل
// والنقر و(لاحقاً) التلميح بالمعنى. لا يُعرض أي نص عربي حرفي إطلاقاً.
// علامة نهاية الآية (type "end") تُميَّز بصنف mushaf-word--end (ذهبي المطبوع).
//
// التظليل: كان أصفر Tailwind ثابتاً (bg-amber-300) لا يعرف الثيم، فيبهت على ورق
// السيبيا ويصرخ على الورق الليلي. صار أصنافاً في index.css مشتقة من ذهب علامات
// الآيات نفسه (--marker) فيتبدل مع الثيم تلقائياً.

interface WordSpanProps {
  /** معرف الكلمة "سورة:آية:موضع" — هوية التحديد */
  id: string
  /** محرف الـGlyph المعروض (word.char) */
  glyph: string
  verseKey: string
  /** علامة نهاية آية؟ (تُلوَّن بالذهبي) */
  isEnd: boolean
  fontFamily: string
  selected: boolean
  /** تظليل نتيجة بحث (آية كاملة): نبض ثلاث مرات ليُقصد النظر إلى موضعها */
  hit?: boolean
  onSelect?: (id: string, verseKey: string) => void
}

export function WordSpan({
  id,
  glyph,
  verseKey,
  isEnd,
  fontFamily,
  selected,
  hit,
  onSelect,
}: WordSpanProps) {
  const [surah, ayah] = verseKey.split(':')
  const interactive = Boolean(onSelect)
  const activate = () => onSelect?.(id, verseKey)
  return (
    <span
      className={
        'mushaf-word' +
        (isEnd ? ' mushaf-word--end' : '') +
        (hit ? ' mushaf-word--hit' : selected ? ' mushaf-word--sel' : '')
      }
      style={{ fontFamily }}
      data-word-id={id}
      data-verse={verseKey}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-label={interactive ? `فتح تفسير كلمة من السورة ${surah}، الآية ${ayah}` : undefined}
      onClick={activate}
      onKeyDown={(event) => {
        if (!interactive || (event.key !== 'Enter' && event.key !== ' ')) return
        event.preventDefault()
        activate()
      }}
    >
      {glyph}
    </span>
  )
}
