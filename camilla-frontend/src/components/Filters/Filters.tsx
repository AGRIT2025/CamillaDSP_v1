import { useState, useEffect, useCallback } from 'react'
import { camillaAPI, type CamillaConfig } from '@/lib/camillaAPI'
import { Card } from '@/components/ui/Card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

type FilterType = 'Biquad' | 'Conv' | 'Gain' | 'Delay' | 'Dither'

type BiquadSubtype =
  | 'Peaking' | 'Highpass' | 'Lowpass' | 'Highshelf' | 'Lowshelf'
  | 'Notch' | 'Allpass' | 'Bandpass' | 'LinkwitzTransform'

interface BiquadParams {
  type: BiquadSubtype
  freq?: number
  q?: number
  gain?: number
  slope?: number
}

interface Filter {
  type: FilterType
  parameters?: BiquadParams | Record<string, unknown>
}

// ─── Respuesta en frecuencia (biquad simplificado) ────────────────────────────

function computeResponse(params: BiquadParams, sampleRate = 48000): { freq: number; db: number }[] {
  const points: { freq: number; db: number }[] = []
  const freqs = Array.from({ length: 100 }, (_, i) =>
    20 * Math.pow(10, (i / 99) * Math.log10(20000 / 20))
  )

  for (const f of freqs) {
    const omega = (2 * Math.PI * f) / sampleRate
    const cos_w = Math.cos(omega)
    const sin_w = Math.sin(omega)

    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0

    const freq = params.freq ?? 1000
    const q = params.q ?? 0.707
    const gain = params.gain ?? 0
    const A = Math.pow(10, gain / 40)
    const w0 = (2 * Math.PI * freq) / sampleRate
    const alpha = Math.sin(w0) / (2 * q)

    switch (params.type) {
      case 'Peaking':
        b0 = 1 + alpha * A; b1 = -2 * Math.cos(w0); b2 = 1 - alpha * A
        a0 = 1 + alpha / A; a1 = -2 * Math.cos(w0); a2 = 1 - alpha / A
        break
      case 'Highpass':
        b0 = (1 + Math.cos(w0)) / 2; b1 = -(1 + Math.cos(w0)); b2 = (1 + Math.cos(w0)) / 2
        a0 = 1 + alpha; a1 = -2 * Math.cos(w0); a2 = 1 - alpha
        break
      case 'Lowpass':
        b0 = (1 - Math.cos(w0)) / 2; b1 = 1 - Math.cos(w0); b2 = (1 - Math.cos(w0)) / 2
        a0 = 1 + alpha; a1 = -2 * Math.cos(w0); a2 = 1 - alpha
        break
      case 'Highshelf':
        b0 = A * ((A + 1) + (A - 1) * cos_w + 2 * Math.sqrt(A) * alpha)
        b1 = -2 * A * ((A - 1) + (A + 1) * cos_w)
        b2 = A * ((A + 1) + (A - 1) * cos_w - 2 * Math.sqrt(A) * alpha)
        a0 = (A + 1) - (A - 1) * cos_w + 2 * Math.sqrt(A) * alpha
        a1 = 2 * ((A - 1) - (A + 1) * cos_w)
        a2 = (A + 1) - (A - 1) * cos_w - 2 * Math.sqrt(A) * alpha
        break
      case 'Lowshelf':
        b0 = A * ((A + 1) - (A - 1) * cos_w + 2 * Math.sqrt(A) * alpha)
        b1 = 2 * A * ((A - 1) - (A + 1) * cos_w)
        b2 = A * ((A + 1) - (A - 1) * cos_w - 2 * Math.sqrt(A) * alpha)
        a0 = (A + 1) + (A - 1) * cos_w + 2 * Math.sqrt(A) * alpha
        a1 = -2 * ((A - 1) + (A + 1) * cos_w)
        a2 = (A + 1) + (A - 1) * cos_w - 2 * Math.sqrt(A) * alpha
        break
      default:
        break
    }

    const re = b0 + b1 * cos_w + b2 * (2 * cos_w * cos_w - 1)
    const im = b1 * sin_w + b2 * 2 * cos_w * sin_w
    const re_a = a0 + a1 * cos_w + a2 * (2 * cos_w * cos_w - 1)
    const im_a = a1 * sin_w + a2 * 2 * cos_w * sin_w

    const mag = Math.sqrt(re * re + im * im) / Math.sqrt(re_a * re_a + im_a * im_a)
    const db = 20 * Math.log10(mag === 0 ? 1e-10 : mag)
    points.push({ freq: Math.round(f), db: parseFloat(db.toFixed(2)) })
  }

  return points
}

// ─── Componente principal ──────────────────────────────────────────────────────

export function Filters() {
  const [config, setConfig] = useState<CamillaConfig | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      const cfg = await camillaAPI.getConfig()
      setConfig(cfg)
    } catch {
      setMessage('Sin conexión al engine')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const filters = (config?.filters as Record<string, Filter>) ?? {}
  const filterNames = Object.keys(filters)

  const selectedFilter = selected ? filters[selected] : null
  const isBiquad = selectedFilter?.type === 'Biquad'
  const biquadParams = isBiquad ? (selectedFilter.parameters as BiquadParams) : null

  const responseData = biquadParams ? computeResponse(biquadParams) : []

  const updateFilterParam = (param: string, value: string | number) => {
    if (!config || !selected) return
    const updatedFilters = {
      ...(config.filters as Record<string, Filter>),
      [selected]: {
        ...filters[selected],
        parameters: {
          ...(filters[selected].parameters ?? {}),
          [param]: value,
        },
      },
    }
    setConfig({ ...config, filters: updatedFilters })
  }

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      const validation = await camillaAPI.validateConfig(config)
      if (validation.result !== 'Ok') {
        setMessage(`Validación: ${validation.error ?? validation.result}`)
        return
      }
      await camillaAPI.setConfig(config)
      setMessage('Filtros aplicados')
    } catch (e) {
      setMessage(`Error: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex gap-4">
      {/* Lista de filtros */}
      <div className="w-48 flex flex-col gap-2">
        <span className="text-xs text-[#55556a] uppercase tracking-wider">Filters</span>
        {filterNames.length === 0 ? (
          <span className="text-xs text-[#55556a]">Sin filtros configurados</span>
        ) : (
          filterNames.map((name) => (
            <button
              key={name}
              onClick={() => setSelected(name)}
              className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selected === name
                  ? 'bg-[#6366f130] text-[#6366f1] border border-[#6366f1]'
                  : 'bg-[#16161e] text-[#8888aa] border border-[#2a2a38] hover:border-[#3a3a50]'
              }`}
            >
              <div className="font-medium truncate">{name}</div>
              <div className="text-[10px] opacity-60">{filters[name].type}</div>
            </button>
          ))
        )}
      </div>

      {/* Editor del filtro seleccionado */}
      <div className="flex-1 flex flex-col gap-4">
        {!selected ? (
          <div className="flex items-center justify-center h-40 text-[#55556a] text-sm">
            Selecciona un filtro para editar
          </div>
        ) : (
          <>
            <Card title={selected}>
              {isBiquad && biquadParams ? (
                <BiquadEditor params={biquadParams} onChange={updateFilterParam} />
              ) : (
                <div className="text-sm text-[#55556a]">
                  Tipo: {selectedFilter?.type} — edición avanzada no disponible en esta vista
                </div>
              )}
            </Card>

            {/* Curva de respuesta */}
            {responseData.length > 0 && (
              <Card title="Frequency Response">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={responseData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a38" />
                    <XAxis
                      dataKey="freq"
                      scale="log"
                      domain={[20, 20000]}
                      tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : `${v}`}
                      stroke="#55556a"
                      tick={{ fontSize: 10, fill: '#55556a' }}
                    />
                    <YAxis
                      domain={[-24, 24]}
                      tickFormatter={(v) => `${v}dB`}
                      stroke="#55556a"
                      tick={{ fontSize: 10, fill: '#55556a' }}
                    />
                    <Tooltip
                      contentStyle={{ background: '#16161e', border: '1px solid #2a2a38', borderRadius: '8px', color: '#f0f0ff', fontSize: 12 }}
                      formatter={(v) => [`${Number(v).toFixed(1)} dB`, 'Gain']}
                      labelFormatter={(f) => `${f} Hz`}
                    />
                    <Line
                      type="monotone"
                      dataKey="db"
                      stroke="#6366f1"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>
            )}
          </>
        )}

        {message && (
          <div className={`text-sm px-3 py-2 rounded-lg ${message.startsWith('Error') || message.startsWith('Validación') ? 'bg-[#ef444420] text-[#ef4444]' : 'bg-[#22c55e20] text-[#22c55e]'}`}>
            {message}
          </div>
        )}

        {selected && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Aplicando...' : 'Apply Filters'}
          </button>
        )}
      </div>
    </div>
  )
}

function BiquadEditor({
  params,
  onChange,
}: {
  params: BiquadParams
  onChange: (param: string, value: string | number) => void
}) {
  const SUBTYPES: BiquadSubtype[] = [
    'Peaking', 'Highpass', 'Lowpass', 'Highshelf', 'Lowshelf', 'Notch', 'Allpass', 'Bandpass',
  ]

  const showGain = ['Peaking', 'Highshelf', 'Lowshelf'].includes(params.type)
  const showSlope = ['Highshelf', 'Lowshelf'].includes(params.type)

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 flex flex-col gap-1">
        <label className="text-xs text-[#55556a]">Subtype</label>
        <select
          value={params.type}
          onChange={(e) => onChange('type', e.target.value)}
          className="bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1.5 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
        >
          {SUBTYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <ParamInput
        label="Frequency (Hz)"
        value={params.freq ?? 1000}
        min={20} max={20000} step={1}
        onChange={(v) => onChange('freq', v)}
      />
      <ParamInput
        label="Q"
        value={params.q ?? 0.707}
        min={0.1} max={10} step={0.01}
        onChange={(v) => onChange('q', v)}
      />
      {showGain && (
        <ParamInput
          label="Gain (dB)"
          value={params.gain ?? 0}
          min={-30} max={30} step={0.1}
          onChange={(v) => onChange('gain', v)}
        />
      )}
      {showSlope && (
        <ParamInput
          label="Slope (dB/oct)"
          value={params.slope ?? 6}
          min={1} max={12} step={1}
          onChange={(v) => onChange('slope', v)}
        />
      )}
    </div>
  )
}

function ParamInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#55556a]">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-[#6366f1]"
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
        />
      </div>
    </div>
  )
}
