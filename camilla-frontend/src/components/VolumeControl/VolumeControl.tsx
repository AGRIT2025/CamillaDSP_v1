import { useState, useEffect, useCallback } from 'react'
import { camillaAPI, formatDb } from '@/lib/camillaAPI'
import { Card } from '@/components/ui/Card'

const MIN_DB = -80
const MAX_DB = 20

function dbToSlider(db: number) {
  return Math.round(((db - MIN_DB) / (MAX_DB - MIN_DB)) * 1000)
}

function sliderToDb(val: number) {
  return (val / 1000) * (MAX_DB - MIN_DB) + MIN_DB
}

interface FaderProps {
  label: string
  volume: number
  mute: boolean
  onVolumeChange: (db: number) => void
  onMuteToggle: () => void
}

function Fader({ label, volume, mute, onVolumeChange, onMuteToggle }: FaderProps) {
  const sliderVal = dbToSlider(Math.max(MIN_DB, Math.min(MAX_DB, volume)))

  return (
    <div className="flex flex-col items-center gap-3 w-20">
      <span className="text-xs text-[#8888aa] font-medium uppercase tracking-wider">
        {label}
      </span>

      {/* Slider vertical */}
      <div className="relative h-40 flex items-center justify-center">
        <input
          type="range"
          min={0}
          max={1000}
          value={sliderVal}
          onChange={(e) => onVolumeChange(sliderToDb(Number(e.target.value)))}
          className="appearance-none cursor-pointer"
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
            width: '6px',
            height: '160px',
            background: `linear-gradient(to top, #6366f1 ${sliderVal / 10}%, #1e1e28 ${sliderVal / 10}%)`,
            borderRadius: '3px',
            outline: 'none',
          }}
        />
      </div>

      {/* Valor dB */}
      <span className="text-sm font-semibold tabular-nums text-[#f0f0ff]">
        {formatDb(volume, 1)}
      </span>

      {/* Botón mute */}
      <button
        onClick={onMuteToggle}
        className={`w-14 py-1 rounded-md text-xs font-semibold transition-colors ${
          mute
            ? 'bg-[#ef444430] text-[#ef4444] border border-[#ef4444]'
            : 'bg-[#1e1e28] text-[#8888aa] border border-[#2a2a38] hover:border-[#6366f1]'
        }`}
      >
        {mute ? 'MUTED' : 'MUTE'}
      </button>
    </div>
  )
}

export function VolumeControl() {
  const [faders, setFaders] = useState({
    main:  { volume: 0, mute: false },
    aux1:  { volume: 0, mute: false },
    aux2:  { volume: 0, mute: false },
    aux3:  { volume: 0, mute: false },
    aux4:  { volume: 0, mute: false },
  })
  const [hasFaders, setHasFaders] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [volume, mute] = await Promise.all([
        camillaAPI.getVolume(),
        camillaAPI.getMute(),
      ])
      setFaders(prev => ({ ...prev, main: { volume, mute } }))

      try {
        const f = await camillaAPI.getFaders()
        setFaders({
          main: { volume: f.main.volume, mute: f.main.mute },
          aux1: { volume: f.aux1.volume, mute: f.aux1.mute },
          aux2: { volume: f.aux2.volume, mute: f.aux2.mute },
          aux3: { volume: f.aux3.volume, mute: f.aux3.mute },
          aux4: { volume: f.aux4.volume, mute: f.aux4.mute },
        })
        setHasFaders(true)
      } catch {
        setHasFaders(false)
      }
    } catch {
      // sin conexión
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 1000)
    return () => clearInterval(id)
  }, [refresh])

  const setVolume = async (fader: number, db: number) => {
    await camillaAPI.setFaderVolume(fader, db)
    await refresh()
  }

  const toggleMute = async (fader: number) => {
    await camillaAPI.toggleFaderMute(fader)
    await refresh()
  }

  const faderList = hasFaders
    ? [
        { key: 0, label: 'Main',  ...faders.main },
        { key: 1, label: 'Aux 1', ...faders.aux1 },
        { key: 2, label: 'Aux 2', ...faders.aux2 },
        { key: 3, label: 'Aux 3', ...faders.aux3 },
        { key: 4, label: 'Aux 4', ...faders.aux4 },
      ]
    : [{ key: 0, label: 'Main', ...faders.main }]

  return (
    <Card title="Volume & Faders">
      <div className="flex gap-6 justify-center flex-wrap">
        {faderList.map((f) => (
          <Fader
            key={f.key}
            label={f.label}
            volume={f.volume}
            mute={f.mute}
            onVolumeChange={(db) => setVolume(f.key, db)}
            onMuteToggle={() => toggleMute(f.key)}
          />
        ))}
      </div>

      {/* Entrada manual de valor dB */}
      <div className="mt-4 flex items-center gap-2 border-t border-[#2a2a38] pt-4">
        <span className="text-xs text-[#55556a]">Set master volume:</span>
        <input
          type="number"
          min={MIN_DB}
          max={MAX_DB}
          step={0.5}
          defaultValue={0}
          onBlur={(e) => setVolume(0, Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setVolume(0, Number((e.target as HTMLInputElement).value))
          }}
          className="w-20 bg-[#111118] border border-[#2a2a38] rounded-md px-2 py-1 text-sm text-[#f0f0ff] focus:outline-none focus:border-[#6366f1]"
        />
        <span className="text-xs text-[#55556a]">dB</span>
      </div>
    </Card>
  )
}
