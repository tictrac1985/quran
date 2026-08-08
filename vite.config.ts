import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'

// جذر أصول المصحف (read-only) — يُقدَّم في التطوير عبر وسيط محلي،
// وداخل حزمة Tauri لاحقاً يُصل إليه عبر convertFileSrc (انظر src/lib/assets.ts).
// الحزمة الفعلية: mushaf-qcf4 (طبعة 1441هـ). حزمة V2 (1421هـ) باقية في
// src-tauri/assets/mushaf كنسخة احتياطية حتى اعتماد الترحيل نهائياً.
const MUSHAF_ROOT = resolve(__dirname, 'src-tauri/assets/mushaf-qcf4')

function mushafAssetsDevServer(): Plugin {
  return {
    name: 'mushaf-assets-dev-server',
    configureServer(server) {
      server.middlewares.use('/mushaf-assets', (req, res) => {
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
        const filePath = normalize(join(MUSHAF_ROOT, urlPath))
        // حارس: لا خروج عن جذر الأصول إطلاقاً
        if (!filePath.startsWith(MUSHAF_ROOT) || !existsSync(filePath) || !statSync(filePath).isFile()) {
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
