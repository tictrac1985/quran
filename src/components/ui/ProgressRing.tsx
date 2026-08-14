interface ProgressRingProps {
  value: number
  size?: number
  label?: string
  className?: string
}

export function ProgressRing({ value, size = 24, label, className }: ProgressRingProps) {
  const ratio = Math.max(0, Math.min(1, value))
  const stroke = Math.max(2, size * 0.105)
  const radius = size / 2 - stroke
  const circumference = 2 * Math.PI * radius
  return (
    <svg
      className={['ui-progress-ring', className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        className="ui-progress-ring__track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
      />
      <circle
        className="ui-progress-ring__value"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
      />
    </svg>
  )
}
