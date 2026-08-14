import { useEffect, useId, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from '../icons/Icons'
import { cx, IconButton } from './Controls'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface OverlayFrameProps {
  children: ReactNode
  onClose: () => void
  className?: string
  panelClassName?: string
  labelledBy: string
  describedBy?: string
  kind: 'dialog' | 'drawer'
  side?: 'start' | 'end'
}

function OverlayFrame({
  children,
  onClose,
  className,
  panelClassName,
  labelledBy,
  describedBy,
  kind,
  side = 'start',
}: OverlayFrameProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const appRoot = document.getElementById('root')
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden')
    appRoot?.setAttribute('inert', '')
    appRoot?.setAttribute('aria-hidden', 'true')

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current
      const preferred = panel?.querySelector<HTMLElement>('[data-autofocus], [autofocus]')
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE)
      ;(preferred ?? first ?? panel)?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const candidates = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0,
      )
      if (candidates.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = candidates[0]
      const last = candidates[candidates.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKeyDown, true)
      appRoot?.removeAttribute('inert')
      if (previousAriaHidden === null || previousAriaHidden === undefined)
        appRoot?.removeAttribute('aria-hidden')
      else appRoot?.setAttribute('aria-hidden', previousAriaHidden)
      previousFocus?.focus()
    }
  }, [])

  const content = (
    <div className={cx('ui-overlay', `ui-overlay--${kind}`, className)} data-side={side}>
      <button
        type="button"
        className="ui-overlay__dismiss"
        aria-label="إغلاق النافذة"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={cx('ui-overlay__panel', `ui-${kind}`, panelClassName)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  )

  return createPortal(content, document.body)
}

interface OverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
  initialFocus?: 'panel'
}

function OverlayContent({
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel = 'إغلاق',
  titleId,
  descriptionId,
}: OverlayProps & { titleId: string; descriptionId: string }) {
  return (
    <>
      <header className="ui-overlay__header">
        <div className="ui-overlay__heading">
          <h2 id={titleId} className="ui-overlay__title">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="ui-overlay__description">
              {description}
            </p>
          )}
        </div>
        <IconButton label={closeLabel} icon={<IconClose />} onClick={onClose} />
      </header>
      <div className="ui-overlay__body">{children}</div>
      {footer && <footer className="ui-overlay__footer">{footer}</footer>}
    </>
  )
}

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel,
  className,
}: OverlayProps) {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <OverlayFrame
      kind="dialog"
      onClose={onClose}
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
      panelClassName={className}
    >
      <OverlayContent
        title={title}
        description={description}
        onClose={onClose}
        footer={footer}
        closeLabel={closeLabel}
        titleId={titleId}
        descriptionId={descriptionId}
      >
        {children}
      </OverlayContent>
    </OverlayFrame>
  )
}

interface DrawerProps extends OverlayProps {
  side?: 'start' | 'end'
  size?: 'sm' | 'md' | 'lg'
}

export function Drawer({
  title,
  description,
  onClose,
  children,
  footer,
  closeLabel,
  className,
  side = 'start',
  size = 'md',
}: DrawerProps) {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <OverlayFrame
      kind="drawer"
      side={side}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={description ? descriptionId : undefined}
      panelClassName={cx(`ui-drawer--${size}`, className)}
    >
      <OverlayContent
        title={title}
        description={description}
        onClose={onClose}
        footer={footer}
        closeLabel={closeLabel}
        titleId={titleId}
        descriptionId={descriptionId}
      >
        {children}
      </OverlayContent>
    </OverlayFrame>
  )
}
