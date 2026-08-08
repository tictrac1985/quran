// بوابة سلامة النص — الطبقة 1 تعمل عند كل إقلاع قبل أي عرض:
// أخضر ⇒ يُفتح القارئ. أي اختلاف ⇒ إيقاف كامل وإنذار واضح، لا صفحة تُعرض أبداً.
//
// هذه أول شاشة يراها المستخدم في كل تشغيل، وكانت صفحة Tailwind خاماً (رمادي/أحمر)
// لا تعرف ثيم التطبيق ولا خطوطه. صارت افتتاحية التطبيق: غرفة مظلمة، واسم المصحف
// بخط النسخ، وخيط ذهبي واحد يمتلئ بينما تُطابَق بصمات الأصول.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { verifyBundle, type IntegrityReport } from '../../lib/integrity'
import { IconStop } from '../icons/Icons'

const IntegrityContext = createContext<IntegrityReport | null>(null)

const arNum = (n: number) => n.toLocaleString('ar-EG')

/** تقرير فحص الإقلاع — متاح لكل الواجهة بعد اجتياز البوابة */
export function useIntegrityReport(): IntegrityReport | null {
  return useContext(IntegrityContext)
}

type GateState =
  | { kind: 'checking'; done: number; total: number }
  | { kind: 'ok'; report: IntegrityReport }
  | { kind: 'fail'; report: IntegrityReport | null; error?: string }

export function IntegrityGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking', done: 0, total: 0 })

  useEffect(() => {
    let cancelled = false
    verifyBundle((done, total) => {
      if (!cancelled) setState({ kind: 'checking', done, total })
    })
      .then((report) => {
        if (cancelled) return
        const pass = report.manifestSelfOk && report.filesOk
        setState(pass ? { kind: 'ok', report } : { kind: 'fail', report })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ kind: 'fail', report: null, error: String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.kind === 'checking') {
    const pct = state.total ? Math.round((state.done / state.total) * 100) : 0
    return (
      <div className="boot" dir="rtl">
        <h1 className="boot-mark">ورتل القرآن</h1>
        <div className="boot-rule" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="boot-rule-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="boot-note">تُطابَق بصمات أصول المصحف قبل عرض أي حرف</p>
        {state.total > 0 && (
          <p className="boot-count">
            {arNum(state.done)} من {arNum(state.total)}
          </p>
        )}
      </div>
    )
  }

  if (state.kind === 'fail') {
    const failed = state.report?.failed ?? []
    return (
      <div className="boot boot--fail" dir="rtl">
        <span className="boot-icon">
          <IconStop />
        </span>
        <h1 className="boot-mark">أُوقف العرض — فحص السلامة لم يجتز</h1>
        <p className="boot-note">
          {state.error
            ? `تعذر إتمام الفحص: ${state.error}`
            : state.report && !state.report.manifestSelfOk
              ? 'بصمة حزمة المانيفست لا تطابق محتواه — يُحتمل عبث بملف الفهرس نفسه.'
              : `${arNum(failed.length)} من الملفات لا تطابق بصمتها المعتمدة.`}
        </p>
        {failed.length > 0 && (
          <ul className="boot-files" dir="ltr">
            {failed.slice(0, 20).map((f) => (
              <li key={f.path}>
                {f.path} — expected {f.expected.slice(0, 12)}… got {f.actual.slice(0, 12)}…
              </li>
            ))}
            {failed.length > 20 && <li dir="rtl">…و{arNum(failed.length - 20)} ملفاً آخر</li>}
          </ul>
        )}
        <p className="boot-note">أعد تشغيل خط الأصول (tools/fetch_qcf4.py) لاستعادة الحزمة السليمة.</p>
      </div>
    )
  }

  return <IntegrityContext.Provider value={state.report}>{children}</IntegrityContext.Provider>
}
