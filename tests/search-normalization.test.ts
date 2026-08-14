import { describe, expect, it } from 'vitest'
import { normalizeArabic } from '../src/lib/search'

describe('Arabic search normalization', () => {
  it('preserves the established normalization ranges after the lint-safe regex rewrite', () => {
    expect(normalizeArabic('بِسْمِ اللَّهِ')).toBe('بسم الله')
    expect(normalizeArabic('آإأٱةى')).toBe('ااااهي')

    const chars = Array.from({ length: 0x06fb - 0x0600 + 1 }, (_, i) => String.fromCodePoint(0x0600 + i))
    // مرجع عددي للتعبير السابق حرفياً؛ لا يعتمد على التعبير الجديد موضع الاختبار.
    const wasRemoved = (char: string) => {
      const cp = char.codePointAt(0) ?? 0
      return (
        (cp >= 0x064b && cp <= 0x0652) ||
        cp === 0x0670 ||
        cp === 0x0640 ||
        (cp >= 0x06d6 && cp <= 0x06ed) ||
        (cp >= 0x06ea && cp <= 0x06fb)
      )
    }
    const oldNormalized = (value: string) =>
      [...value.normalize('NFKC')]
        .filter((char) => !wasRemoved(char))
        .join('')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[^ء-غف-ي٠-٩\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    for (const char of chars) expect(normalizeArabic(char)).toBe(oldNormalized(char))
  })
})
