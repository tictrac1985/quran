import { loadPage } from './pageCache'
import type { Qcf4Page } from '../types/mushaf'

const CANONICAL_PAGE = 1
const CANONICAL_VERSE_KEY = '1:1'
const CANONICAL_FONT = 'QCF4_Hafs_01'
const CANONICAL_POSITIONS = [1, 2, 3, 4] as const

export interface CanonicalBasmalaGlyph {
  char: string
  font: string
  position: number
}

/**
 * يستخرج كلمات البسملة الأربع من آية الفاتحة الأولى كما هي في أصل QCF4.
 * لا يستخدم text ولا ينسخ محارف PUA في الكود؛ وأي نقص أو ترتيب غير متوقع يفشل مغلقًا.
 */
export function extractCanonicalBasmala(
  page: Qcf4Page,
): ReadonlyArray<CanonicalBasmalaGlyph> | null {
  if (page.page !== CANONICAL_PAGE) return null

  const words = page.lines.flatMap((line) =>
    line.words.filter((word) => word.type === 'word' && word.verse_key === CANONICAL_VERSE_KEY),
  )

  if (words.length !== CANONICAL_POSITIONS.length) return null

  const glyphs: CanonicalBasmalaGlyph[] = []
  for (let index = 0; index < CANONICAL_POSITIONS.length; index += 1) {
    const word = words[index]
    const position = CANONICAL_POSITIONS[index]
    if (
      word.position !== position ||
      Array.from(word.char).length !== 1 ||
      word.font !== CANONICAL_FONT
    ) {
      return null
    }
    glyphs.push({ char: word.char, font: word.font, position })
  }

  return glyphs
}

let canonicalPromise: Promise<ReadonlyArray<CanonicalBasmalaGlyph>> | null = null

/** يحمّل الأصل القرآني مرة واحدة، ويتيح إعادة المحاولة إن تعذر أو فشل التحقق. */
export function loadCanonicalBasmala(): Promise<ReadonlyArray<CanonicalBasmalaGlyph>> {
  if (canonicalPromise) return canonicalPromise

  const pending = loadPage(CANONICAL_PAGE)
    .then(({ data }) => {
      const glyphs = extractCanonicalBasmala(data)
      if (!glyphs) throw new Error('تعذر التحقق من محارف البسملة المعتمدة')
      return glyphs
    })
    .catch((error: unknown) => {
      if (canonicalPromise === pending) canonicalPromise = null
      throw error
    })

  canonicalPromise = pending
  return pending
}
