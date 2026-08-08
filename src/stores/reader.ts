// حالة القارئ — تنقل + وضع العرض (صفحة واحدة / صفحتان متقابلتان) + زوم.
// 2.4: إشارات مسمّاة + استكمال آخر قراءة — تُحفظ محلياً (localStorage) عبر
// persist؛ الترقية إلى SQLite/Tauri لاحقاً (docs/TAURI_SETUP.md).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const LAST_PAGE = 604

export type ViewMode = 'single' | 'spread'

export type Theme = 'day' | 'sepia' | 'night'

/** إشارة مرجعية مسمّاة على صفحة */
export interface Bookmark {
  id: string
  name: string
  page: number
  createdAt: number
}

interface ReaderState {
  page: number
  mode: ViewMode
  /** زوم التطبيق نفسه (لا زوم المتصفح): مضاعف على مقاس الورقة */
  zoom: number
  bookmarks: Bookmark[]
  /** الثيم — يُحفظ؛ التركيز حالة جلسة لا تُحفظ */
  theme: Theme
  focus: boolean
  setPage: (n: number) => void
  nextPage: () => void
  prevPage: () => void
  toggleMode: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  addBookmark: (name: string) => void
  removeBookmark: (id: string) => void
  cycleTheme: () => void
  toggleFocus: () => void
}

const clamp = (n: number) => Math.min(LAST_PAGE, Math.max(1, Math.round(n)))
const clampZoom = (z: number) => Math.min(1.6, Math.max(0.7, Math.round(z * 100) / 100))

// مرساة الصفحتين فردية دائماً: اليمين فردي واليسار زوجي (يمين+1) — كالمصحف المفتوح
const anchorOdd = (n: number) => Math.min(LAST_PAGE - 1, Math.max(1, n % 2 === 1 ? n : n - 1))

// الصفحة الابتدائية من رابط الاستعلام (?page=50) — ربط عميق وقابلية فحص آلية
const initialPage = (() => {
  const raw = new URLSearchParams(window.location.search).get('page')
  const n = raw ? Number.parseInt(raw, 10) : NaN
  return Number.isFinite(n) ? clamp(n) : 1
})()

// الشاشات العريضة تفتح على صفحتين متقابلتين، والضيقة على صفحة واحدة
const wideEnough = () => window.innerWidth / window.innerHeight > 1.25
const initialMode: ViewMode = wideEnough() ? 'spread' : 'single'

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

const THEME_NEXT: Record<Theme, Theme> = { day: 'sepia', sepia: 'night', night: 'day' }

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      page: initialPage,
      mode: initialMode,
      zoom: 1,
      bookmarks: [],
      theme: 'day',
      focus: false,
      setPage: (n) => set((s) => ({ page: s.mode === 'spread' ? anchorOdd(clamp(n)) : clamp(n) })),
      nextPage: () =>
        set((s) => ({ page: s.mode === 'spread' ? anchorOdd(s.page + 2) : clamp(s.page + 1) })),
      prevPage: () =>
        set((s) => ({ page: s.mode === 'spread' ? anchorOdd(s.page - 2) : clamp(s.page - 1) })),
      toggleMode: () =>
        set((s) => ({
          mode: s.mode === 'spread' ? 'single' : 'spread',
          page: s.mode === 'spread' ? s.page : anchorOdd(s.page),
        })),
      zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom + 0.1) })),
      zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom - 0.1) })),
      resetZoom: () => set({ zoom: 1 }),
      addBookmark: (name) =>
        set((s) => ({
          bookmarks: [
            ...s.bookmarks,
            { id: newId(), name: name.trim(), page: s.page, createdAt: Date.now() },
          ],
        })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
      cycleTheme: () => set((s) => ({ theme: THEME_NEXT[s.theme] })),
      toggleFocus: () => set((s) => ({ focus: !s.focus })),
    }),
    {
      name: 'mushaf-reader',
      version: 1,
      // استكمال آخر قراءة + تفضيلات العرض + الإشارات + الثيم — التركيز لا يُحفظ
      partialize: (s) => ({
        page: s.page,
        mode: s.mode,
        zoom: s.zoom,
        bookmarks: s.bookmarks,
        theme: s.theme,
      }),
      // الدمج يحسم تعارضين كان القارئ يعالجهما بمؤثرات بعد التركيب:
      // 1) ?page= يجب أن يتقدم على الموضع المحفوظ — والـpersist يكتب فوقه.
      //    (كان يُعاد تطبيقه في useEffect فتومض الصفحة المحفوظة أولاً.)
      // 2) نافذة ضيقة مع وضع «صفحتين» محفوظ من جلسة عريضة = صفحتان مقصوصتان.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ReaderState>
        const mode: ViewMode = p.mode === 'spread' && !wideEnough() ? 'single' : (p.mode ?? current.mode)
        const raw = new URLSearchParams(window.location.search).get('page')
        const fromUrl = raw ? Number.parseInt(raw, 10) : NaN
        const page = clamp(Number.isFinite(fromUrl) ? fromUrl : (p.page ?? current.page))
        return { ...current, ...p, mode, page: mode === 'spread' ? anchorOdd(page) : page }
      },
    },
  ),
)
