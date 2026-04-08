import { useState, useEffect, useCallback } from 'react'
import { camillaAPI, type CamillaConfig } from '@/lib/camillaAPI'
import { Card } from '@/components/ui/Card'

const BACKENDS = ['Alsa', 'Pulseaudio', 'Pipewire', 'Jack']

type DeviceSection = 'capture' | 'playback'

export function Devices() {
  const [config, setConfig] = useState<CamillaConfig | null>(null)
  const [captureDevices, setCaptureDevices] = useState<string[]>([])
  const [playbackDevices, setPlaybackDevices] = useState<string[]>([])
  const [supportedTypes, setSupportedTypes] = useState<{ capture: string[]; playback: string[] }>({
    capture: [],
    playback: [],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      const [cfg, types] = await Promise.all([
        camillaAPI.getConfig(),
        camillaAPI.getSupportedDeviceTypes(),
      ])
      setConfig(cfg)
      setSupportedTypes(types)
    } catch {
      setMessage('No se puede conectar al engine')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const loadDevices = async (section: DeviceSection, backend: string) => {
    try {
      if (section === 'capture') {
        const devs = await camillaAPI.getAvailableCaptureDevices(backend)
        setCaptureDevices(devs.map((d) => d.name))
      } else {
        const devs = await camillaAPI.getAvailablePlaybackDevices(backend)
        setPlaybackDevices(devs.map((d) => d.name))
      }
    } catch {
      if (section === 'capture') setCaptureDevices([])
      else setPlaybackDevices([])
    }
  }

  const updateDeviceField = (section: DeviceSection, field: string, value: string) => {
    if (!config) return
    const devices = (config.devices as Record<string, Record<string, unknown>>) ?? {}
    setConfig({
      ...config,
      devices: {
        ...devices,
        [section]: {
          ...(devices[section] ?? {}),
          [field]: value,
        },
      },
    })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    setMessage('')
    try {
      const validation = await camillaAPI.validateConfig(config)
      if (validation.result !== 'Ok') {
        setMessage(`Error de validación: ${validation.error ?? validation.result}`)
        return
      }
      await camillaAPI.setConfig(config)
      setMessage('Configuración aplicada')
    } catch (e) {
      setMessage(`Error: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  const devices = (config?.devices as Record<string, Record<string, unknown>>) ?? {}

  if (loading) {
    return <div className="text-sm text-[#55556a]">Cargando dispositivos...</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <DevicePanel
        title="Capture Device"
        section="capture"
        device={devices.capture ?? {}}
        availableDevices={captureDevices}
        supportedTypes={supportedTypes.capture}
        backends={BACKENDS}
        onBackendChange={(b) => loadDevices('capture', b)}
        onFieldChange={(f, v) => updateDeviceField('capture', f, v)}
      />
      <DevicePanel
        title="Playback Device"
        section="playback"
        device={devices.playback ?? {}}
        availableDevices={playbackDevices}
        supportedTypes={supportedTypes.playback}
        backends={BACKENDS}
        onBackendChange={(b) => loadDevices('playback', b)}
        onFieldChange={(f, v) => updateDeviceField('playback', f, v)}
      />

      {message && (
        <div
          className={`text-sm px-3 py-2 rounded-lg ${
            message.startsWith('Error')
              ? 'bg-[#ef444420] text-[#ef4444]'
              : 'bg-[#22c55e20] text-[#22c55e]'
          }`}
        >
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="self-start px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {saving ? 'Aplicando...' : 'Apply Configuration'}
      </button>
    </div>
  )
}

interface DevicePanelProps {
  title: string
  section: DeviceSection
  device: Record<string, unknown>
  availableDevices: string[]
  supportedTypes: string[]
  backends: string[]
  onBackendChange: (backend: string) => void
  onFieldChange: (field: string, value: string) => void
}

function DevicePanel({
  title,
  device,
  availableDevices,
  supportedTypes,
  backends,
  onBackendChange,
  onFieldChange,
}: DevicePanelProps) {
  const [selectedBackend, setSelectedBackend] = useState(backends[0])

  const handleBackendChange = (b: string) => {
    setSelectedBackend(b)
    onBackendChange(b)
  }

  const SAMPLE_RATES = ['44100', '48000', '88200', '96000', '176400', '192000']
  const BIT_DEPTHS = ['16', '24', '32', 'FLOAT32LE', 'FLOAT64LE']

  return (
    <Card title={title}>
      <div className="grid grid-cols-2 gap-4">
        {/* Backend */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#55556a]">Backend</label>
          <select
            value={selectedBackend}
            onChange={(e) => handleBackendChange(e.target.value)}
            className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
          >
            {backends.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Tipo */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#55556a]">Type</label>
          <select
            value={(device.type as string) ?? ''}
            onChange={(e) => onFieldChange('type', e.target.value)}
            className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
          >
            <option value="">-- Select type --</option>
            {supportedTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Dispositivo */}
        <div className="col-span-2 flex flex-col gap-1">
          <label className="text-xs text-[#55556a]">Device</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={(device.device as string) ?? ''}
              onChange={(e) => onFieldChange('device', e.target.value)}
              placeholder="e.g. hw:0,0"
              className="flex-1 bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
            />
            {availableDevices.length > 0 && (
              <select
                onChange={(e) => { if (e.target.value) onFieldChange('device', e.target.value) }}
                className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
              >
                <option value="">Browse...</option>
                {availableDevices.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Sample rate */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#55556a]">Sample Rate</label>
          <select
            value={(device.samplerate as number)?.toString() ?? '48000'}
            onChange={(e) => onFieldChange('samplerate', e.target.value)}
            className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
          >
            {SAMPLE_RATES.map((r) => (
              <option key={r} value={r}>{(Number(r) / 1000).toFixed(1)} kHz</option>
            ))}
          </select>
        </div>

        {/* Bit depth */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#55556a]">Format</label>
          <select
            value={(device.format as string) ?? ''}
            onChange={(e) => onFieldChange('format', e.target.value)}
            className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
          >
            <option value="">Auto</option>
            {BIT_DEPTHS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Channels */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[#55556a]">Channels</label>
          <input
            type="number"
            min={1}
            max={32}
            value={(device.channels as number) ?? 2}
            onChange={(e) => onFieldChange('channels', e.target.value)}
            className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
          />
        </div>
      </div>
    </Card>
  )
}
