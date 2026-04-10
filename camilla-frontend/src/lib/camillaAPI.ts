// CamillaDSP — wrapper de la API real del backend Python (CamillaGUI)
// Rutas verificadas contra /opt/camilladsp/backend/backend/routes.py

export type EngineState = 'RUNNING' | 'PAUSED' | 'INACTIVE' | 'STARTING' | 'STALLED'

export interface StatusResponse {
  backend_version: string
  cdsp_status: EngineState
  cdsp_version: string
  processingload: number
  resamplerload: number
  bufferlevel: number
  clippedsamples: number
  rateadjust: number
  capturerate: number | null
  capturesignalrms: number[]
  capturesignalpeak: number[]
  playbacksignalrms: number[]
  playbacksignalpeak: number[]
  playback_devices: Record<string, [string, string][]>
  capture_devices: Record<string, [string, string][]>
  backends: [string[], string[]]  // [playback, capture]
}

export interface SignalLevels {
  capture_rms: number[]
  capture_peak: number[]
  playback_rms: number[]
  playback_peak: number[]
}

export type CamillaConfig = Record<string, unknown>

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  const text = await res.text()
  if (!text) return undefined as T
  // El backend Python a veces devuelve booleanos en formato Python (no JSON válido)
  if (text === 'True')  return true  as unknown as T
  if (text === 'False') return false as unknown as T
  try {
    const parsed = JSON.parse(text)
    // Algunos endpoints devuelven JSON doblemente codificado (string que contiene JSON)
    // Ejemplo: "[]" en lugar de [] — hay que descodificar una vez más.
    if (typeof parsed === 'string') {
      try { return JSON.parse(parsed) as T } catch { /* no era JSON anidado */ }
    }
    return parsed as T
  } catch {
    return text as unknown as T
  }
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`)
  const text = await res.text()
  if (!text) return undefined as T
  try { return JSON.parse(text) } catch { return text as unknown as T }
}

export const camillaAPI = {
  // ─── Estado completo (una sola llamada para todo) ──────────────────────────
  getStatus: () => apiGet<StatusResponse>('/api/status'),

  // ─── Configuración ────────────────────────────────────────────────────────
  getConfig:      () => apiGet<CamillaConfig>('/api/getconfig'),
  setConfig:      (config: CamillaConfig) => apiPost<void>('/api/setconfig', config),
  getStartConfig: () => apiGet<CamillaConfig>('/api/getstartconfig'),
  validateConfig: (config: CamillaConfig) =>
    apiPost<{ result: string; error?: string }>('/api/validateconfig', config),
  configToYml:    (config: CamillaConfig) => apiPost<string>('/api/configtoyml', config),
  ymlToJson:      (yml: string) => apiPost<CamillaConfig>('/api/ymltojson', yml),

  // ─── Control del engine ───────────────────────────────────────────────────
  stop: () => apiPost<void>('/api/stop'),

  // ─── Volumen y parámetros ─────────────────────────────────────────────────
  getVolume:   () => apiGet<number>('/api/getparam/volume'),
  setVolume:   (db: number) => apiPost<void>('/api/setparam/volume', db),
  getMute:     () => apiGet<boolean>('/api/getparam/mute'),
  setMute:     (muted: boolean) => apiPost<void>('/api/setparam/mute', muted),

  // Faders auxiliares por índice (0=Main, 1-4=Aux1-4)
  getFaderVolume: (idx: number) => apiGet<number>(`/api/getparamindex/fadervolume/${idx}`),
  setFaderVolume: (idx: number, db: number) => apiPost<void>(`/api/setparamindex/fadervolume/${idx}`, db),
  getFaderMute:   (idx: number) => apiGet<boolean>(`/api/getparamindex/fadermute/${idx}`),
  setFaderMute:   (idx: number, muted: boolean) => apiPost<void>(`/api/setparamindex/fadermute/${idx}`, muted),
  getAllFaderVolumes: () => apiGet<number[]>('/api/getlistparam/fadervolume'),
  getAllFaderMutes:   () => apiGet<boolean[]>('/api/getlistparam/fadermute'),

  // ─── Archivos de configuración ────────────────────────────────────────────
  listConfigs:     () => apiGet<string[]>('/api/storedconfigs'),
  listCoeffs:      () => apiGet<string[]>('/api/storedcoeffs'),
  getActiveConfig: () => apiGet<string>('/api/getactiveconfigfilename'),
  setActiveConfig: (name: string) => apiPost<void>('/api/setactiveconfigfile', name),
  getConfigFile:   () => apiGet<string>('/api/getconfigfile'),
  saveConfigFile:  (content: string) => apiPost<void>('/api/saveconfigfile', content),
  deleteConfigs:   (names: string[]) => apiPost<void>('/api/deleteconfigs', names),

  // ─── Dispositivos de audio ────────────────────────────────────────────────
  getBackends: () => apiGet<[string[], string[]]>('/api/backends'),
  getCaptureDevices:  (backend: string) =>
    apiGet<[string, string][]>(`/api/capturedevices/${backend}`),
  getPlaybackDevices: (backend: string) =>
    apiGet<[string, string][]>(`/api/playbackdevices/${backend}`),

  // ─── GUI config ───────────────────────────────────────────────────────────
  getGuiConfig: () => apiGet<Record<string, unknown>>('/api/guiconfig'),
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDb(value: number, decimals = 1): string {
  if (typeof value !== 'number' || isNaN(value)) return '— dB'
  if (value === -Infinity || value < -150) return '-∞ dB'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)} dB`
}

export function dbToPercent(db: number, minDb = -90, maxDb = 0): number {
  if (db <= minDb) return 0
  if (db >= maxDb) return 100
  return ((db - minDb) / (maxDb - minDb)) * 100
}

export function levelColor(db: number): string {
  if (db >= -3)  return '#ef4444'
  if (db >= -12) return '#eab308'
  return '#22c55e'
}

// Normalizar estado del engine (el backend usa mayúsculas)
export function normalizeState(raw: string | null): EngineState | null {
  if (!raw) return null
  const upper = raw.toUpperCase()
  const valid: EngineState[] = ['RUNNING', 'PAUSED', 'INACTIVE', 'STARTING', 'STALLED']
  return valid.includes(upper as EngineState) ? (upper as EngineState) : null
}
