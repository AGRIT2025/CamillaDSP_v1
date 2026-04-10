import type { EngineState } from '@/lib/camillaAPI'

const stateConfig: Record<EngineState, { label: string; color: string; dot: string }> = {
  RUNNING:  { label: 'Running',  color: 'text-[#22c55e]', dot: 'bg-[#22c55e]' },
  PAUSED:   { label: 'Paused',   color: 'text-[#eab308]', dot: 'bg-[#eab308]' },
  STARTING: { label: 'Starting', color: 'text-[#6366f1]', dot: 'bg-[#6366f1]' },
  INACTIVE: { label: 'Inactive', color: 'text-[#55556a]', dot: 'bg-[#55556a]' },
  STALLED:  { label: 'Stalled',  color: 'text-[#ef4444]', dot: 'bg-[#ef4444]' },
}

export function StatusBadge({ state }: { state: EngineState | null }) {
  if (!state) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#55556a]" />
        <span className="text-sm text-[#55556a]">Disconnected</span>
      </div>
    )
  }

  const cfg = stateConfig[state]
  return (
    <div className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full animate-pulse ${cfg.dot}`} />
      <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}
