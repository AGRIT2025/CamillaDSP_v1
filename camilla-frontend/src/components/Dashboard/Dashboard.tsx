import { useEngineStatus } from '@/hooks/useWebSocket'
import { camillaAPI, formatDb } from '@/lib/camillaAPI'
import { Card, StatCard } from '@/components/ui/Card'
import { ChannelMeters } from '@/components/ui/LevelMeter'

// ─── Tarjeta de latencia ──────────────────────────────────────────────────────

function latencyColor(ms: number) {
  if (ms <= 0)   return { text: 'text-[#55556a]', bar: 'bg-[#55556a]', label: '—' }
  if (ms < 20)   return { text: 'text-[#22c55e]', bar: 'bg-[#22c55e]', label: 'Excelente' }
  if (ms < 50)   return { text: 'text-[#22c55e]', bar: 'bg-[#22c55e]', label: 'Buena' }
  if (ms < 100)  return { text: 'text-[#eab308]', bar: 'bg-[#eab308]', label: 'Moderada' }
  return           { text: 'text-[#ef4444]', bar: 'bg-[#ef4444]', label: 'Alta' }
}

function LatencyCard({ ms, bufferLevel }: { ms: number; bufferLevel: number }) {
  const { text, bar, label } = latencyColor(ms)
  // Barra de progreso: 0 ms = vacío, 200 ms = lleno
  const pct = Math.min(100, (ms / 200) * 100)

  return (
    <Card title="Latency">
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className={`text-3xl font-bold tabular-nums ${ms > 0 ? text : 'text-[#55556a]'}`}>
            {ms > 0 ? ms.toFixed(1) : '—'}
          </span>
          {ms > 0 && <span className="text-sm text-[#8888aa]">ms</span>}
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-md ${
            ms <= 0   ? 'bg-[#1e1e28] text-[#55556a]' :
            ms < 50   ? 'bg-[#22c55e20] text-[#22c55e]' :
            ms < 100  ? 'bg-[#eab30820] text-[#eab308]' :
                        'bg-[#ef444420] text-[#ef4444]'
          }`}>
            {label}
          </span>
        </div>

        {/* Barra visual */}
        <div className="h-1.5 bg-[#1e1e28] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-[#55556a]">
          <span>Buffer: {bufferLevel} smp</span>
          <span>0 · 50 · 100 · 200 ms</span>
        </div>
      </div>
    </Card>
  )
}

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
          value={status.clippedDelta > 0 ? `+${status.clippedDelta}` : status.clippedSamples}
          warning={status.clippedDelta > 0}
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

      {/* Volumen master + Latencia */}
      <div className="grid grid-cols-2 gap-4">
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

        <LatencyCard ms={status.latencyMs} bufferLevel={status.bufferLevel} />
      </div>

      {status.clippedDelta > 0 && (
        <button
          onClick={() => camillaAPI.setVolume(status.volume - 1)}
          className="text-xs text-[#ef4444] hover:text-[#f87171] underline self-start"
        >
          ⚠ {status.clippedDelta} muestras recortadas ahora — bajar volumen
        </button>
      )}
    </div>
  )
}
