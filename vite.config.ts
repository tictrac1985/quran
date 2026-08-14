import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

// جذر أصول المصحف (read-only) — يُقدَّم في التطوير عبر وسيط محلي،
// وداخل حزمة Tauri لاحقاً يُصل إليه عبر convertFileSrc (انظر src/lib/assets.ts).
// الحزمة الفعلية: mushaf-qcf4 (طبعة 1441هـ). حزمة V2 (1421هـ) باقية في
// src-tauri/assets/mushaf كنسخة احتياطية حتى اعتماد الترحيل نهائياً.
const MUSHAF_ROOT = resolve(import.meta.dirname, 'src-tauri/assets/mushaf-qcf4')
const MUSHAF_ROOT_REAL = realpathSync(MUSHAF_ROOT)

export function resolveMushafAssetPath(requestUrl: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(requestUrl.split('?')[0])
  } catch {
    return null
  }

  if (decoded.includes('\0')) return null
  const requestedPath = decoded.replace(/^[/\\]+/, '')
  const candidate = resolve(MUSHAF_ROOT_REAL, requestedPath)
  const fromRoot = relative(MUSHAF_ROOT_REAL, candidate)

  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) return null
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null

  const realCandidate = realpathSync(candidate)
  const realFromRoot = relative(MUSHAF_ROOT_REAL, realCandidate)
  if (realFromRoot === '..' || realFromRoot.startsWith(`..${sep}`) || isAbsolute(realFromRoot)) return null
  return realCandidate
}

function mushafAssetsDevServer(): Plugin {
  return {
    name: 'mushaf-assets-dev-server',
    configureServer(server) {
      server.middlewares.use('/mushaf-assets', (req, res) => {
        const filePath = resolveMushafAssetPath(req.url ?? '/')
        // حارس: لا خروج عن جذر الأصول إطلاقاً، حتى عبر symlink أو مسار sibling ذي بادئة متشابهة.
        if (!filePath) {
          res.statusCode = 404
          res.end('not found')
          return
        }
        if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json; charset=utf-8')
        else if (filePath.endsWith('.woff2')) res.setHeader('Content-Type', 'font/woff2')
        else if (filePath.endsWith('.ttf')) res.setHeader('Content-Type', 'font/ttf')
        else if (filePath.endsWith('.db')) res.setHeader('Content-Type', 'application/octet-stream')
        // no-store عمداً: فحص البصمات عند الإقلاع يجب أن يقرأ الملف الفعلي من القرص
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(filePath).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), mushafAssetsDevServer()],
  clearScreen: false,
  server: {
    // المنفذ الافتراضي الذي يتوقعه tauri.conf.json (devUrl)
    port: 1420,
    strictPort: true,
    // IPv4 صراحة: بعض المتصفحات الطرفية لا تصل إلى ::1
    host: '127.0.0.1',
  },
})
