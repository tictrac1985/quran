import { describe, expect, it } from 'vitest'
import { resolveMushafAssetPath } from './vite.config'

describe('mushaf development asset boundary', () => {
  it('resolves a real asset inside the protected root', () => {
    expect(resolveMushafAssetPath('/manifest.json')).toMatch(/manifest\.json$/)
  })

  it.each([
    '/../package.json',
    '/%2e%2e/package.json',
    '/pages/../../../../package.json',
    '/%E0%A4%A',
    '/missing.json',
  ])('rejects an unsafe or unavailable path: %s', (path) => {
    expect(resolveMushafAssetPath(path)).toBeNull()
  })
})
