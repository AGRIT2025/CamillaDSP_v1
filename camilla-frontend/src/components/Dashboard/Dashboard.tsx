import { useEngineStatus } from '@/hooks/useWebSocket'
import { camillaAPI, formatDb } from '@/lib/camillaAPI'
import { Card, StatCard } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ChannelMeters } from '@/components/ui/LevelMeter'

export function Dashboard() {
  const status = useEngineStatus(200)

  const capPeaks = status.signalLevels?.capture_peak ?? []
  const capRms   = status.signalLevels?.capture_rms   ?? []
  const pbPeaks  = status.signalLevels?.playback_peak ?? []
  const pbRms    = status.signalLevels?.playback_rms  ?? []

  const handleResetClipped = async () => {
    await camillaAPI.resetClippedSamples()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Estado principal */}
      <div className="flex items-center justify-between">
        <StatusBadge state={status.state} />
        {!status.connected && (
          <span className="text-xs text-[#ef4444]">Engine no disponible</span>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="CPU Load"
          value={status.processingLoad.toFixed(1)}
          unit="%"
          warning={status.processingLoad > 80}
        />
        <StatCard
          label="Capture Rate"
          value={(status.captureRate / 1000).toFixed(1)}
          unit="kHz"
        />
        <StatCard
          label="Buffer Level"
          value={status.bufferLevel}
          unit="chunks"
        />
        <StatCard
          label="Clipped"
          value={status.clippedSamples}
          warning={status.clippedSamples > 0}
        />
      </div>

      {/* Niveles de señal */}
      <div className="grid grid-cols-2 gap-4">
        <Card title="Capture Levels">
          {capPeaks.length === 0 ? (
            <span className="text-sm text-[#55556a]">Sin señal</span>
          ) : (
            <ChannelMeters peaks={capPeaks} rms={capRms} label="IN" />
          )}
        </Card>
        <Card title="Playback Levels">
          {pbPeaks.length === 0 ? (
            <span className="text-sm text-[#55556a]">Sin señal</span>
          ) : (
            <ChannelMeters peaks={pbPeaks} rms={pbRms} label="OUT" />
          )}
        </Card>
      </div>

      {/* Volumen actual */}
      <Card title="Master Volume">
        <div className="flex items-center gap-4">
          <span className="text-3xl font-bold tabular-nums text-[#f0f0ff]">
            {formatDb(status.volume)}
          </span>
          <span
            className={`text-sm px-2 py-1 rounded-md ${
              status.mute
                ? 'bg-[#ef444420] text-[#ef4444]'
                : 'bg-[#22c55e20] text-[#22c55e]'
            }`}
          >
            {status.mute ? 'MUTED' : 'LIVE'}
          </span>
        </div>
      </Card>

      {/* Reset clipped */}
      {status.clippedSamples > 0 && (
        <button
          onClick={handleResetClipped}
          className="text-xs text-[#ef4444] hover:text-[#f87171] underline self-start"
        >
          Reset clipped samples counter
        </button>
      )}
    </div>
  )
}
