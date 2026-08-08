import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { initAssets } from './lib/assets'
import './index.css'

// جذر الأصول يُحسم قبل أول رسم (في سطح المكتب يُبنى على مجلد موارد الحزمة)
initAssets()
  .catch((e) => console.error('تعذر حسم جذر الأصول:', e))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    )
  })
