// CamillaDSP WebSocket API — wrapper completo de todos los comandos
// El backend Python (puerto 5005) hace de proxy hacia el engine Rust (puerto 1234)

export type EngineState = 'Running' | 'Paused' | 'Inactive' | 'Starting' | 'Stalled'

export type StopReason =
  | 'None'
  | 'Done'
  | 'CaptureError'
  | 'PlaybackError'
  | 'CaptureFormatChange'
  | 'PlaybackFormatChange'

export interface SignalLevels {
  capture_rms: number[]
  capture_peak: number[]
  playback_rms: number[]
  playback_peak: number[]
}

export interface FaderState {
  volume: number
  mute: boolean
}

export interface Faders {
  main: FaderState
  aux1: FaderState
  aux2: FaderState
  aux3: FaderState
  aux4: FaderState
}

export interface DeviceInfo {
  name: string
}

export type CamillaConfig = Record<string, unknown>

export type WsCommandResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: string }

// ─── Conexión WebSocket con el backend Python ────────────────────────────────

const API_BASE = '/api'

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`)
  return res.json()
}

// ─── Estado del engine ────────────────────────────────────────────────────────

export const camillaAPI = {
  // Estado general
  getVersion: () => apiGet<string>('/camilla/version'),
  getState: () => apiGet<EngineState>('/camilla/state'),
  getStopReason: () => apiGet<StopReason>('/camilla/stopreason'),

  // Métricas en tiempo real
  getProcessingLoad: () => apiGet<number>('/camilla/processingload'),
  getResamplerLoad: () => apiGet<number>('/camilla/resamplerload'),
  getCaptureRate: () => apiGet<number>('/camilla/capturerate'),
  getBufferLevel: () => apiGet<number>('/camilla/bufferlevel'),
  getClippedSamples: () => apiGet<number>('/camilla/clippedsamples'),
  resetClippedSamples: () => apiPost<void>('/camilla/clippedsamples/reset'),
  getRateAdjust: () => apiGet<number>('/camilla/rateadjust'),
  getSignalRange: () => apiGet<number>('/camilla/signalrange'),

  // Niveles de señal
  getSignalLevels: () => apiGet<SignalLevels>('/camilla/signallevels'),
  getCaptureSignalPeak: () => apiGet<number[]>('/camilla/capturesignalpeak'),
  getCaptureSignalRms: () => apiGet<number[]>('/camilla/capturesignalrms'),
  getPlaybackSignalPeak: () => apiGet<number[]>('/camilla/playbacksignalpeak'),
  getPlaybackSignalRms: () => apiGet<number[]>('/camilla/playbacksignalrms'),

  // Control de volumen — fader principal
  getVolume: () => apiGet<number>('/camilla/volume'),
  setVolume: (db: number) => apiPost<void>('/camilla/volume', db),
  adjustVolume: (db: number) => apiPost<void>('/camilla/volume/adjust', db),
  getMute: () => apiGet<boolean>('/camilla/mute'),
  setMute: (muted: boolean) => apiPost<void>('/camilla/mute', muted),
  toggleMute: () => apiPost<void>('/camilla/mute/toggle'),

  // Faders auxiliares (0=Main, 1-4=Aux1-4)
  getFaders: () => apiGet<Faders>('/camilla/faders'),
  getFaderVolume: (fader: number) => apiGet<number>(`/camilla/fader/${fader}/volume`),
  setFaderVolume: (fader: number, db: number) =>
    apiPost<void>(`/camilla/fader/${fader}/volume`, db),
  getFaderMute: (fader: number) => apiGet<boolean>(`/camilla/fader/${fader}/mute`),
  setFaderMute: (fader: number, muted: boolean) =>
    apiPost<void>(`/camilla/fader/${fader}/mute`, muted),
  toggleFaderMute: (fader: number) => apiPost<void>(`/camilla/fader/${fader}/mute/toggle`),

  // Configuración
  getConfig: () => apiGet<CamillaConfig>('/camilla/config'),
  setConfig: (config: CamillaConfig) => apiPost<void>('/camilla/config', config),
  getConfigFilePath: () => apiGet<string>('/camilla/configfilepath'),
  setConfigFilePath: (path: string) => apiPost<void>('/camilla/configfilepath', path),
  reloadConfig: () => apiPost<void>('/camilla/reload'),
  validateConfig: (config: CamillaConfig) =>
    apiPost<{ result: string; error?: string }>('/camilla/config/validate', config),

  // Control del engine
  stop: () => apiPost<void>('/camilla/stop'),

  // Dispositivos de audio disponibles
  getAvailableCaptureDevices: (backend?: string) =>
    apiGet<DeviceInfo[]>(
      `/camilla/devices/capture${backend ? `?backend=${backend}` : ''}`
    ),
  getAvailablePlaybackDevices: (backend?: string) =>
    apiGet<DeviceInfo[]>(
      `/camilla/devices/playback${backend ? `?backend=${backend}` : ''}`
    ),
  getSupportedDeviceTypes: () =>
    apiGet<{ capture: string[]; playback: string[] }>('/camilla/supporteddevicetypes'),

  // Gestión de archivos de configuración (backend Python)
  listConfigs: () => apiGet<string[]>('/config/files'),
  uploadConfig: (name: string, config: CamillaConfig) =>
    apiPost<void>(`/config/file/${encodeURIComponent(name)}`, config),
  deleteConfig: (name: string) =>
    fetch(`${API_BASE}/config/file/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  activateConfig: (name: string) =>
    apiPost<void>(`/config/activate/${encodeURIComponent(name)}`),

  // Coeficientes FIR
  listCoeffFiles: () => apiGet<string[]>('/coeff/files'),
}

// ─── Helper: formatear dB con signo ──────────────────────────────────────────

export function formatDb(value: number, decimals = 1): string {
  if (value === -Infinity || value < -150) return '-∞ dB'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)} dB`
}

// ─── Helper: dB → porcentaje para barras de nivel (rango -90 a 0 dB) ─────────

export function dbToPercent(db: number, minDb = -90, maxDb = 0): number {
  if (db <= minDb) return 0
  if (db >= maxDb) return 100
  return ((db - minDb) / (maxDb - minDb)) * 100
}

// ─── Helper: color de nivel por dB ────────────────────────────────────────────

export function levelColor(db: number): string {
  if (db >= -3) return '#ef4444'   // rojo — clipping
  if (db >= -12) return '#eab308'  // amarillo — alto
  return '#22c55e'                 // verde — normal
}
