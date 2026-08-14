import { forwardRef, useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  leadingIcon?: ReactNode
  trailingIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-button', `ui-button--${variant}`, `ui-button--${size}`, className)}
      {...props}
    >
      {leadingIcon && (
        <span className="ui-button__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <span className="ui-button__label">{children}</span>
      {trailingIcon && (
        <span className="ui-button__icon" aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </button>
  )
})

interface TooltipProps extends HTMLAttributes<HTMLSpanElement> {
  label: string
  side?: 'start' | 'end' | 'top' | 'bottom'
  children: ReactNode
}

export function Tooltip({ label, side = 'end', className, children, ...props }: TooltipProps) {
  const id = useId()
  return (
    <span
      className={cx('ui-tooltip', className)}
      data-side={side}
      aria-describedby={id}
      {...props}
    >
      {children}
      <span id={id} className="ui-tooltip__bubble" role="tooltip">
        {label}
      </span>
    </span>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  icon: ReactNode
  variant?: ButtonVariant
  size?: ButtonSize
  tooltip?: boolean
  tooltipSide?: TooltipProps['side']
  active?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    variant = 'ghost',
    size = 'md',
    tooltip = false,
    tooltipSide = 'end',
    active = false,
    className,
    type = 'button',
    ...props
  },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-active={active || undefined}
      className={cx(
        'ui-icon-button',
        `ui-icon-button--${variant}`,
        `ui-icon-button--${size}`,
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )

  return tooltip ? (
    <Tooltip label={label} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  )
})
