import { describe, expect, it } from 'vitest'
import {
  MAX_BACKUP_BYTES,
  applyBackupStores,
  parseBackupJson,
  type BackupStorage,
} from '../src/lib/backup'
import { isWideViewport } from '../src/stores/reader'
import { advanceReadingPosition } from '../src/stores/wirds'

const readerState = {
  page: 42,
  mode: 'single',
  zoom: 1,
  bookmarks: [{ id: 'mark-1', name: 'اختبار', page: 42, createdAt: 1 }],
  theme: 'day',
}

const wirdsState = {
  readingPlan: { days: 30, startDate: '2026-08-14', position: 42 },
  readingToday: { day: '2026-08-14', startPos: 42 },
  visitedToday: [42],
  congratsDismissedDay: null,
  hifz: [],
  hifzTrack: null,
  history: { '2026-08-14': { read: true } },
  reminder: { enabled: false, time: '17:00', lastDay: null },
}

function makeBackup(
  stores: Record<string, unknown> = {
    'mushaf-reader': { state: readerState, version: 1 },
    'mushaf-wirds': { state: wirdsState, version: 2 },
  },
) {
  return JSON.stringify({
    app: 'mushaf-mubtakir',
    backupVersion: 1,
    createdAt: '2026-08-14T10:00:00.000Z',
    stores,
  })
}

describe('reading progress', () => {
  it('advances only across pages contiguous with the plan position', () => {
    expect(advanceReadingPosition(10, [10])).toBe(11)
    expect(advanceReadingPosition(10, [10, 12, 100])).toBe(11)
    expect(advanceReadingPosition(10, [10, 11, 12, 100])).toBe(13)
    expect(advanceReadingPosition(604, [604])).toBe(605)
  })
})

describe('viewport mode', () => {
  it('classifies valid wide viewports only', () => {
    expect(isWideViewport(1200, 800)).toBe(true)
    expect(isWideViewport(800, 1200)).toBe(false)
    expect(isWideViewport(1200, 0)).toBe(false)
  })
})

describe('backup import', () => {
  it('accepts the current persisted schemas', () => {
    expect(Object.keys(parseBackupJson(makeBackup())).sort()).toEqual(['mushaf-reader', 'mushaf-wirds'])
  })

  it('rejects invalid ranges, unknown stores, and oversized files', () => {
    expect(() =>
      parseBackupJson(
        makeBackup({ 'mushaf-reader': { state: { ...readerState, page: 999 }, version: 1 } }),
      ),
    ).toThrow(/لا تطابق بنيته/)
    expect(() => parseBackupJson(makeBackup({ unknown: { state: {}, version: 1 } }))).toThrow(
      /المخازن غير صالحة/,
    )
    expect(() => parseBackupJson('x'.repeat(MAX_BACKUP_BYTES + 1))).toThrow(/يتجاوز الحد/)
  })

  it('rolls back previously written stores when a later write fails', () => {
    const values = new Map([
      ['mushaf-reader', 'reader-before'],
      ['mushaf-wirds', 'wirds-before'],
    ])
    let shouldFail = true
    const storage: BackupStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (shouldFail && key === 'mushaf-wirds') {
          shouldFail = false
          throw new Error('quota')
        }
        values.set(key, value)
      },
      removeItem: (key) => {
        values.delete(key)
      },
    }

    expect(() =>
      applyBackupStores({ 'mushaf-reader': 'reader-after', 'mushaf-wirds': 'wirds-after' }, storage),
    ).toThrow(/أُعيدت البيانات السابقة/)
    expect(values.get('mushaf-reader')).toBe('reader-before')
    expect(values.get('mushaf-wirds')).toBe('wirds-before')
  })
})
