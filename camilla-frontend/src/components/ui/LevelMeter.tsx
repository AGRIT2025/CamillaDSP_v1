import { dbToPercent, levelColor } from '@/lib/camillaAPI'

interface LevelMeterProps {
  db: number
  label?: string
  vertical?: boolean
  height?: number
}

export function LevelMeter({ db, label, vertical = false, height = 80 }: LevelMeterProps) {
  const pct = dbToPercent(db)
  const color = levelColor(db)

  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-1">
        {label && <span className="text-[10px] text-[#55556a]">{label}</span>}
        <div
          className="relative w-3 rounded-sm bg-[#111118] overflow-hidden flex flex-col justify-end"
          style={{ height }}
        >
          <div
            className="w-full rounded-sm transition-all duration-75"
            style={{ height: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-[10px] text-[#55556a] tabular-nums">
          {db > -90 ? `${db.toFixed(0)}` : '-∞'}
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-4 text-[10px] text-[#55556a]">{label}</span>}
      <div className="flex-1 h-2 rounded-full bg-[#111118] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-12 text-right text-[10px] text-[#55556a] tabular-nums">
        {db > -90 ? `${db.toFixed(1)} dB` : '-∞ dB'}
      </span>
    </div>
  )
}

export function ChannelMeters({
  peaks,
  rms,
  label = 'CH',
}: {
  peaks: number[]
  rms: number[]
  label?: string
}) {
  return (
    <div className="flex gap-2">
      {peaks.map((peak, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <span className="text-[10px] text-[#55556a]">{label}{i + 1}</span>
          <div className="relative w-4 h-24 rounded bg-[#111118] overflow-hidden flex flex-col justify-end">
            {/* RMS */}
            <div
              className="w-full transition-all duration-150 opacity-50"
              style={{
                height: `${dbToPercent(rms[i] ?? -90)}%`,
                backgroundColor: levelColor(rms[i] ?? -90),
              }}
            />
            {/* Peak marker */}
            <div
              className="absolute w-full h-0.5 transition-all duration-75"
              style={{
                bottom: `${dbToPercent(peak)}%`,
                backgroundColor: levelColor(peak),
              }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-[#55556a]">
            {peak > -90 ? `${peak.toFixed(0)}` : '-∞'}
          </span>
        </div>
      ))}
    </div>
  )
}
