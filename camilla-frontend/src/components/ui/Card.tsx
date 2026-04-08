import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  titleExtra?: ReactNode
}

export function Card({ children, className = '', title, titleExtra }: CardProps) {
  return (
    <div
      className={`rounded-xl border bg-[#16161e] border-[#2a2a38] ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a38]">
          <span className="text-sm font-medium text-[#8888aa] uppercase tracking-wider">
            {title}
          </span>
          {titleExtra}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}

export function StatCard({
  label,
  value,
  unit,
  warning,
}: {
  label: string
  value: string | number
  unit?: string
  warning?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-[#111118] border border-[#2a2a38] p-3">
      <span className="text-xs text-[#55556a] uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-semibold tabular-nums ${warning ? 'text-[#ef4444]' : 'text-[#f0f0ff]'}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-[#55556a]">{unit}</span>}
      </div>
    </div>
  )
}
