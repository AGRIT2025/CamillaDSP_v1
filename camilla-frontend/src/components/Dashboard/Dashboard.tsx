import { useEngineStatus } from '@/hooks/useWebSocket'
import { camillaAPI, formatDb } from '@/lib/camillaAPI'
import { Card, StatCard } from '@/components/ui/Card'
import { ChannelMeters } from '@/components/ui/LevelMeter'

const STATE_CONFIG = {
  RUNNING:  { label: 'Running',  color: 'text-[#22c55e]', dot: 'bg-[#22c55e]' },
  PAUSED:   { label: 'Paused',   color: 'text-[#eab308]', dot: 'bg-[#eab308]' },
  STARTING: { label: 'Starting', color: 'text-[#6366f1]', dot: 'bg-[#6366f1]' },
  INACTIVE: { label: 'Inactive', color: 'text-[#55556a]', dot: 'bg-[#55556a]' },
  STALLED:  { label: 'Stalled',  color: 'text-[#ef4444]', dot: 'bg-[#ef4444]' },
}

export function Dashboard() {
  const status = useEngineStatus(300)

  const cfg = status.state ? STATE_CONFIG[status.state] : null

  return (
    <div className="flex flex-col gap-4">
      {/* Estado */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {cfg ? (
            <>
              <span className={`w-2 h-2 rounded-full animate-pulse ${cfg.dot}`} />
              <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-[#55556a]" />
              <span className="text-sm text-[#55556a]">Disconnected</span>
            </>
          )}
        </div>
        {!status.connected && (
          <span className="text-xs text-[#ef4444]">Engine no disponible</span>
        )}
        {status.connected && status.raw && (
          <span className="text-xs text-[#55556a]">
            CamillaDSP {status.raw.cdsp_version} · Backend {status.raw.backend_version}
          </span>
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
          value={status.captureRate > 0 ? (status.captureRate / 1000).toFixed(1) : '—'}
          unit={status.captureRate > 0 ? 'kHz' : ''}
        />
        <StatCard
          label="Buffer Level"
          value={status.bufferLevel}
          unit="smp"
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
          {status.capturePeak.length === 0 ? (
            <span className="text-sm text-[#55556a]">Sin señal</span>
          ) : (
            <ChannelMeters peaks={status.capturePeak} rms={status.captureRms} label="IN" />
          )}
        </Card>
        <Card title="Playback Levels">
          {status.playbackPeak.length === 0 ? (
            <span className="text-sm text-[#55556a]">Sin señal</span>
          ) : (
            <ChannelMeters peaks={status.playbackPeak} rms={status.playbackRms} label="OUT" />
          )}
        </Card>
      </div>

      {/* Volumen master */}
      <Card title="Master Volume">
        <div className="flex items-center gap-4">
          <span className="text-3xl font-bold tabular-nums text-[#f0f0ff]">
            {formatDb(status.volume)}
          </span>
          <span className={`text-sm px-2 py-1 rounded-md ${
            status.mute
              ? 'bg-[#ef444420] text-[#ef4444]'
              : 'bg-[#22c55e20] text-[#22c55e]'
          }`}>
            {status.mute ? 'MUTED' : 'LIVE'}
          </span>
        </div>
      </Card>

      {status.clippedSamples > 0 && (
        <button
          onClick={() => camillaAPI.setVolume(status.volume - 1)}
          className="text-xs text-[#ef4444] hover:text-[#f87171] underline self-start"
        >
          ⚠ {status.clippedSamples} muestras recortadas — bajar volumen
        </button>
      )}
    </div>
  )
}
