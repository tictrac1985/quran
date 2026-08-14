import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/assets', () => ({
  AssetFetchError: class AssetFetchError extends Error {
    constructor(
      public readonly relPath: string,
      public readonly status: number,
    ) {
      super(`HTTP ${status}: ${relPath}`)
    }
  },
  META_PATH: 'layout/meta.json',
  SURAH_NAMES_FONT_PATH: 'extras/surah-name-v2.ttf',
  assetUrl: (path: string) => `/assets/${path}`,
  fetchJson: vi.fn(),
  pageDataPath: (n: number) => `pages/${String(n).padStart(3, '0')}.json`,
  tafsirPath: (slug: string, surah: number) => `tafsir/${slug}/${surah}.json`,
}))

vi.mock('../src/lib/fonts', () => ({
  ensureQcf4Fonts: vi.fn(() => Promise.resolve()),
}))

describe('rejected promise caches', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('retries metadata after a rejected cached request', async () => {
    const assets = await import('../src/lib/assets')
    vi.mocked(assets.fetchJson)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ surahs: [], juz: [], hizb: [], rub: [] })
    const { loadMeta } = await import('../src/lib/meta')

    await expect(loadMeta()).rejects.toThrow('temporary')
    await expect(loadMeta()).resolves.toEqual({ surahs: [], juz: [], hizb: [], rub: [] })
    expect(assets.fetchJson).toHaveBeenCalledTimes(2)
  })

  it('retries a page after a rejected cached request', async () => {
    const assets = await import('../src/lib/assets')
    vi.mocked(assets.fetchJson)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ page: 7, font: 'QCF4_Hafs_01', surahs: [], lines: [] })
    const { loadPage } = await import('../src/lib/pageCache')

    await expect(loadPage(7)).rejects.toThrow('temporary')
    await expect(loadPage(7)).resolves.toMatchObject({ data: { page: 7 } })
    expect(assets.fetchJson).toHaveBeenCalledTimes(2)
  })

  it('retries tafsir failures but treats a missing asbab file as empty', async () => {
    const assets = await import('../src/lib/assets')
    vi.mocked(assets.fetchJson)
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({ '1:1': 'text' })
      .mockRejectedValueOnce(new assets.AssetFetchError('tafsir/asbab/1.json', 404, '', ''))
    const { loadTafsir } = await import('../src/lib/tafsir')

    await expect(loadTafsir('sadi', 1)).rejects.toThrow('temporary')
    await expect(loadTafsir('sadi', 1)).resolves.toEqual({ '1:1': 'text' })
    await expect(loadTafsir('asbab', 1)).resolves.toEqual({})
    expect(assets.fetchJson).toHaveBeenCalledTimes(3)
  })
})
