import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './Controls'

export interface TabOption<T extends string> {
  id: T
  label: ReactNode
  badge?: ReactNode
}

interface TabsProps<T extends string> {
  items: readonly TabOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
  idBase?: string
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
  idBase,
}: TabsProps<T>) {
  const generatedId = useId()
  const base = idBase ?? generatedId
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1)
    else if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return
    event.preventDefault()
    next = (next + items.length) % items.length
    onChange(items[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div className={cx('ui-tabs', className)} role="tablist" aria-label={label}>
      {items.map((item, index) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            ref={(node) => {
              refs.current[index] = node
            }}
            type="button"
            id={`${base}-tab-${item.id}`}
            role="tab"
            aria-selected={selected}
            aria-controls={`${base}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className="ui-tabs__tab"
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span>{item.label}</span>
            {item.badge !== undefined && <span className="ui-tabs__badge">{item.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}

interface TabPanelProps {
  idBase: string
  tabId: string
  children: ReactNode
  className?: string
}

export function TabPanel({ idBase, tabId, children, className }: TabPanelProps) {
  return (
    <div
      id={`${idBase}-panel-${tabId}`}
      role="tabpanel"
      aria-labelledby={`${idBase}-tab-${tabId}`}
      tabIndex={0}
      className={cx('ui-tab-panel', className)}
    >
      {children}
    </div>
  )
}
