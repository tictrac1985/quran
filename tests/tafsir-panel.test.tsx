// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TafsirPanel } from '../src/components/Tafsir/TafsirPanel'

const { loadTafsir } = vi.hoisted(() => ({ loadTafsir: vi.fn() }))

vi.mock('../src/lib/fonts', () => ({
  SURAH_NAMES_FAMILY: 'surah-name-v2',
  ensureExtraFonts: vi.fn(() => Promise.resolve()),
  surahNameText: (n: number) => `surah${String(n).padStart(3, '0')}`,
}))

vi.mock('../src/lib/tafsir', () => ({
  TAFSIR_LABEL: { 'ibn-kathir': 'ابن كثير', sadi: 'السعدي', asbab: 'أسباب النزول' },
  TAFSIR_SLUGS: ['ibn-kathir', 'sadi', 'asbab'],
  loadTafsir,
}))

describe('TafsirPanel loading', () => {
  beforeEach(() => {
    loadTafsir.mockReset()
    loadTafsir.mockImplementation((slug: string) => Promise.resolve({ '2:1': `text-${slug}` }))
  })

  it('loads only the active source, then loads another source on demand', async () => {
    render(<TafsirPanel verseKey="2:1" onClose={() => {}} onNavigate={() => {}} />)

    await screen.findByText('text-ibn-kathir')
    expect(loadTafsir).toHaveBeenCalledTimes(1)
    expect(loadTafsir).toHaveBeenLastCalledWith('ibn-kathir', 2)

    fireEvent.click(screen.getByRole('tab', { name: 'السعدي' }))
    await screen.findByText('text-sadi')
    expect(loadTafsir).toHaveBeenCalledTimes(2)
    expect(loadTafsir).toHaveBeenLastCalledWith('sadi', 2)

    fireEvent.click(screen.getByRole('tab', { name: 'ابن كثير' }))
    await waitFor(() => expect(screen.getByText('text-ibn-kathir')).toBeTruthy())
    expect(loadTafsir).toHaveBeenCalledTimes(2)
  })
})
