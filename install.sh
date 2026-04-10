#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  CamillaDSP Modern GUI — Instalador para Linux                  ║
# ║  Versión 2.0 — Compatible con CamillaDSP v4.x                  ║
# ║                                                                  ║
# ║  Arquitecturas:                                                  ║
# ║    x86_64   — PC / servidor Ubuntu/Debian                       ║
# ║    aarch64  — TV box moderno, Raspberry Pi 4/5, ARM 64-bit      ║
# ║    armv7    — TV box antiguo, Raspberry Pi 2/3, ARM 32-bit      ║
# ║    armv6    — Raspberry Pi Zero                                  ║
# ║                                                                  ║
# ║  Distribuciones: Ubuntu 22.04+, Debian 12+, Arch Linux          ║
# ║  Backends de audio: ALSA, PipeWire, PulseAudio (auto-detect)   ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'

log()    { echo -e "${GREEN}✓${NC} $*"; }
info()   { echo -e "${BLUE}→${NC} $*"; }
warn()   { echo -e "${YELLOW}⚠${NC} $*"; }
error()  { echo -e "${RED}✗${NC} $*" >&2; }
header() { echo -e "\n${BOLD}${CYAN}$*${NC}"; echo "$(printf '─%.0s' {1..60})"; }

# ─── Configuración ────────────────────────────────────────────────────────────
# Versión de CamillaDSP a instalar. Si se pasa "--latest" como argumento,
# se consulta la GitHub API para obtener la versión más reciente.
CAMILLA_VERSION="v4.1.3"
INSTALL_DIR="/opt/camilladsp"
BIN_DIR="/usr/local/bin"
CONFIG_DIR="/etc/camilladsp"
SYSTEMD_DIR="/etc/systemd/system"
LIMITS_FILE="/etc/security/limits.d/camilladsp-audio.conf"
GUI_BACKEND_REPO="https://github.com/HEnquist/camillagui-backend/archive/refs/heads/master.tar.gz"

# ─── 0. Parsear argumentos opcionales ─────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --latest)
      info "Consultando última versión disponible en GitHub..."
      LATEST=$(curl -fsSL "https://api.github.com/repos/HEnquist/camilladsp/releases/latest" \
               | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
      if [[ -n "$LATEST" ]]; then
        CAMILLA_VERSION="$LATEST"
        log "Versión seleccionada automáticamente: ${CAMILLA_VERSION}"
      else
        warn "No se pudo obtener la versión más reciente. Usando: ${CAMILLA_VERSION}"
      fi
      ;;
    --version=*)
      CAMILLA_VERSION="${arg#--version=}"
      log "Versión especificada manualmente: ${CAMILLA_VERSION}"
      ;;
  esac
done

GITHUB_RELEASES="https://github.com/HEnquist/camilladsp/releases/download/${CAMILLA_VERSION}"

# ─── 1. Verificar root ────────────────────────────────────────────────────────
header "CamillaDSP Modern GUI ${CAMILLA_VERSION} — Instalador"

if [[ $EUID -ne 0 ]]; then
  error "Este instalador debe ejecutarse como root."
  echo "  Usa: sudo bash install.sh"
  exit 1
fi

# Determinar el usuario real que invocó sudo
REAL_USER="${SUDO_USER:-}"
if [[ -z "$REAL_USER" ]]; then
  REAL_USER=$(logname 2>/dev/null || true)
fi
if [[ -z "$REAL_USER" ]] || [[ "$REAL_USER" == "root" ]]; then
  error "Ejecuta como un usuario normal con sudo, no directamente como root."
  echo "  Ejemplo: sudo bash install.sh"
  exit 1
fi

REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)
log "Instalando para el usuario: ${BOLD}${REAL_USER}${NC} (home: ${REAL_HOME})"

# ─── 2. Detectar distribución ─────────────────────────────────────────────────
header "Detectando entorno del sistema"

if [[ ! -f /etc/os-release ]]; then
  error "No se puede leer /etc/os-release — distribución no soportada."
  exit 1
fi

source /etc/os-release
DISTRO_ID="${ID:-unknown}"
DISTRO_LIKE="${ID_LIKE:-}"
DISTRO_VERSION="${VERSION_ID:-0}"

PKG_MANAGER=""
if command -v apt-get &>/dev/null; then
  if [[ "$DISTRO_ID" == "ubuntu" ]] || [[ "$DISTRO_ID" == "debian" ]] || \
     [[ "$DISTRO_LIKE" == *"debian"* ]] || [[ "$DISTRO_LIKE" == *"ubuntu"* ]]; then
    PKG_MANAGER="apt"
    log "Distribución: ${PRETTY_NAME:-Ubuntu/Debian}"
  fi
fi

if [[ -z "$PKG_MANAGER" ]] && command -v pacman &>/dev/null; then
  if [[ "$DISTRO_ID" == "arch" ]] || [[ "$DISTRO_LIKE" == *"arch"* ]]; then
    PKG_MANAGER="pacman"
    log "Distribución: Arch Linux"
  fi
fi

if [[ -z "$PKG_MANAGER" ]]; then
  error "Distribución no soportada: ${DISTRO_ID}"
  echo "  Soportadas: Ubuntu 22.04+, Debian 12+, Arch Linux (y derivados)"
  exit 1
fi

# ─── 3. Detectar arquitectura ─────────────────────────────────────────────────
ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64)
    ARCH="amd64"
    ARCH_DISPLAY="x86_64 (PC / servidor)"
    HAS_BACKEND_VARIANTS=true
    ;;
  aarch64|arm64)
    ARCH="aarch64"
    ARCH_DISPLAY="ARM 64-bit (TV box moderno / Raspberry Pi 4/5)"
    HAS_BACKEND_VARIANTS=true
    ;;
  armv7l)
    ARCH="armv7"
    ARCH_DISPLAY="ARM v7 (TV box antiguo / Raspberry Pi 2/3)"
    HAS_BACKEND_VARIANTS=false
    ;;
  armv6l)
    ARCH="armv6"
    ARCH_DISPLAY="ARM v6 (Raspberry Pi Zero)"
    HAS_BACKEND_VARIANTS=false
    ;;
  *)
    error "Arquitectura no soportada: ${ARCH_RAW}"
    echo "  Soportadas: x86_64, aarch64, armv7l, armv6l"
    exit 1
    ;;
esac
log "Arquitectura: ${ARCH_DISPLAY}"

# ─── 4. Detectar backend de audio activo ─────────────────────────────────────
AUDIO_BACKEND="alsa"
BACKEND_SUFFIX=""

detect_audio_backend() {
  # PipeWire: prioridad máxima si está corriendo
  if pgrep -x pipewire &>/dev/null 2>&1; then
    AUDIO_BACKEND="pipewire"
    BACKEND_SUFFIX="-pipewire"
    log "Backend de audio detectado: PipeWire"
    return
  fi
  # Verificar también como servicio de usuario
  if sudo -u "$REAL_USER" systemctl --user is-active --quiet pipewire 2>/dev/null; then
    AUDIO_BACKEND="pipewire"
    BACKEND_SUFFIX="-pipewire"
    log "Backend de audio detectado: PipeWire (servicio de usuario)"
    return
  fi

  # PulseAudio
  if pgrep -x pulseaudio &>/dev/null 2>&1; then
    AUDIO_BACKEND="pulseaudio"
    BACKEND_SUFFIX="-pulseaudio"
    log "Backend de audio detectado: PulseAudio"
    return
  fi
  if sudo -u "$REAL_USER" systemctl --user is-active --quiet pulseaudio 2>/dev/null; then
    AUDIO_BACKEND="pulseaudio"
    BACKEND_SUFFIX="-pulseaudio"
    log "Backend de audio detectado: PulseAudio (servicio de usuario)"
    return
  fi

  # Fallback: ALSA puro
  log "Backend de audio: ALSA (base)"
}

if [[ "$HAS_BACKEND_VARIANTS" == "true" ]]; then
  detect_audio_backend
else
  warn "${ARCH_DISPLAY}: solo disponible la variante ALSA"
fi

# Construir nombre exacto del binario según lo que publica Henrik en GitHub releases:
#   x86_64  → camilladsp-linux[-pipewire|-pulseaudio]-amd64.tar.gz
#   aarch64 → camilladsp-linux[-pipewire|-pulseaudio]-aarch64.tar.gz
#   armv7   → camilladsp-linux-armv7.tar.gz
#   armv6   → camilladsp-linux-armv6.tar.gz
if [[ "$HAS_BACKEND_VARIANTS" == "true" ]]; then
  BINARY_NAME="camilladsp-linux${BACKEND_SUFFIX}-${ARCH}.tar.gz"
else
  BINARY_NAME="camilladsp-linux-${ARCH}.tar.gz"
fi
DOWNLOAD_URL="${GITHUB_RELEASES}/${BINARY_NAME}"

echo ""
echo -e "  Versión:      ${BOLD}${CAMILLA_VERSION}${NC}"
echo -e "  Arquitectura: ${BOLD}${ARCH_DISPLAY}${NC}"
echo -e "  Audio:        ${BOLD}${AUDIO_BACKEND}${NC}"
echo -e "  Binario:      ${BOLD}${BINARY_NAME}${NC}"
echo ""

# ─── 5. Instalar dependencias del sistema ─────────────────────────────────────
header "Instalando dependencias del sistema"

install_apt() {
  apt-get update -qq

  # Paquetes base siempre requeridos
  local PKGS=(curl tar git python3 python3-pip python3-venv)

  # ALSA: el nombre del paquete cambió en Ubuntu 24.04 / Debian 13
  # Ubuntu 22.04 / Debian 12: libasound2
  # Ubuntu 24.04 / Debian 13: libasound2t64
  local UBUNTU_MAJOR=0
  if [[ "$DISTRO_ID" == "ubuntu" ]]; then
    UBUNTU_MAJOR=$(echo "$DISTRO_VERSION" | cut -d. -f1)
  fi

  local DEBIAN_MAJOR=0
  if [[ "$DISTRO_ID" == "debian" ]]; then
    DEBIAN_MAJOR=$(echo "$DISTRO_VERSION" | cut -d. -f1)
  fi

  if [[ "$UBUNTU_MAJOR" -ge 24 ]] || [[ "$DEBIAN_MAJOR" -ge 13 ]]; then
    PKGS+=(libasound2t64)
  else
    PKGS+=(libasound2)
  fi

  # Librerías adicionales por backend de audio
  if [[ "$AUDIO_BACKEND" == "pipewire" ]]; then
    PKGS+=(libpipewire-0.3-0)
  elif [[ "$AUDIO_BACKEND" == "pulseaudio" ]]; then
    PKGS+=(libpulse0)
  fi

  apt-get install -y "${PKGS[@]}" 2>&1 | grep -E "^(Setting up|Preparing|Get:|Err:)" || true
  log "Dependencias instaladas"
}

install_pacman() {
  local PKGS=(curl tar git python python-pip alsa-lib)

  if [[ "$AUDIO_BACKEND" == "pipewire" ]]; then
    PKGS+=(pipewire)
  elif [[ "$AUDIO_BACKEND" == "pulseaudio" ]]; then
    PKGS+=(libpulse)
  fi

  pacman -Sy --noconfirm --needed "${PKGS[@]}" 2>&1 | grep -E "^(installing|upgrading|:: Proceed)" || true
  log "Dependencias instaladas"
}

[[ "$PKG_MANAGER" == "apt" ]]    && install_apt
[[ "$PKG_MANAGER" == "pacman" ]] && install_pacman

# Verificar Python 3.9+
PYTHON_BIN=$(command -v python3)
PYTHON_VERSION=$("$PYTHON_BIN" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [[ "$PYTHON_MAJOR" -lt 3 ]] || ([[ "$PYTHON_MAJOR" -eq 3 ]] && [[ "$PYTHON_MINOR" -lt 9 ]]); then
  error "Python 3.9+ requerido. Encontrado: Python ${PYTHON_VERSION}"
  exit 1
fi
log "Python ${PYTHON_VERSION} ✓"

# Verificar git (necesario para instalar pycamilladsp desde GitHub)
if ! command -v git &>/dev/null; then
  error "git no encontrado. Es necesario para instalar pycamilladsp."
  exit 1
fi
log "git $(git --version | awk '{print $3}') ✓"

# ─── 6. Configurar permisos de audio en tiempo real ──────────────────────────
header "Configurando permisos de audio en tiempo real"

# Crear grupo realtime si no existe
if ! getent group realtime &>/dev/null; then
  groupadd --system realtime
  log "Grupo 'realtime' creado"
else
  log "Grupo 'realtime' ya existe"
fi

# Agregar usuario a grupos audio y realtime
for GROUP in audio realtime; do
  if id -nG "$REAL_USER" | grep -qw "$GROUP"; then
    log "Usuario ${REAL_USER} ya está en el grupo '${GROUP}'"
  else
    usermod -aG "$GROUP" "$REAL_USER"
    log "Usuario ${REAL_USER} agregado al grupo '${GROUP}'"
  fi
done

# Configurar límites de tiempo real
cat > "$LIMITS_FILE" << 'LIMITS'
# CamillaDSP — Límites de audio en tiempo real
# Permite procesar audio con prioridad RT sin ser root
@audio    -  rtprio   99
@audio    -  memlock  unlimited
@audio    -  nice     -19

@realtime -  rtprio   99
@realtime -  memlock  unlimited
LIMITS
log "Límites RT configurados en ${LIMITS_FILE}"

# ─── 7. Descargar e instalar CamillaDSP engine ────────────────────────────────
header "Descargando CamillaDSP ${CAMILLA_VERSION}"

TMP_DIR=$(mktemp -d)
trap "rm -rf ${TMP_DIR}" EXIT

info "Descargando: ${DOWNLOAD_URL}"
if ! curl -fsSL --progress-bar -o "${TMP_DIR}/${BINARY_NAME}" "$DOWNLOAD_URL"; then
  error "No se pudo descargar el binario de CamillaDSP."
  echo ""
  echo "  Posibles causas:"
  echo "  1. Sin conexión a internet"
  echo "  2. La versión ${CAMILLA_VERSION} no existe en GitHub"
  echo "  3. El nombre del binario no coincide para esta arquitectura"
  echo ""
  echo "  Binarios disponibles en:"
  echo "  https://github.com/HEnquist/camilladsp/releases/tag/${CAMILLA_VERSION}"
  exit 1
fi

tar -xzf "${TMP_DIR}/${BINARY_NAME}" -C "$TMP_DIR"

# Verificar que el binario existe dentro del tar
if [[ ! -f "${TMP_DIR}/camilladsp" ]]; then
  error "El tar no contiene el binario 'camilladsp'. Contenido del archivo:"
  tar -tzf "${TMP_DIR}/${BINARY_NAME}" >&2
  exit 1
fi

install -m 755 "${TMP_DIR}/camilladsp" "${BIN_DIR}/camilladsp"

# Verificar que el binario funciona
INSTALLED_VERSION=$("${BIN_DIR}/camilladsp" --version 2>&1 | head -1 || true)
log "CamillaDSP instalado: ${INSTALLED_VERSION}"

# ─── 8. Instalar backend Python de CamillaGUI ─────────────────────────────────
header "Instalando CamillaGUI Backend (Python)"

mkdir -p "${INSTALL_DIR}"

# Hacer backup de configs existentes antes de sobreescribir el backend
if [[ -d "${INSTALL_DIR}/backend" ]]; then
  BACKUP_CONFIGS="${INSTALL_DIR}/config-backup-$(date +%Y%m%d%H%M%S)"
  if [[ -d "${CONFIG_DIR}/configs" ]]; then
    mkdir -p "$BACKUP_CONFIGS"
    cp -r "${CONFIG_DIR}/configs" "${BACKUP_CONFIGS}/"
    warn "Configs de audio respaldadas en: ${BACKUP_CONFIGS}"
  fi
  rm -rf "${INSTALL_DIR}/backend"
fi

info "Descargando CamillaGUI Backend desde GitHub..."
if ! curl -fsSL --progress-bar -o "${TMP_DIR}/camillagui-backend.tar.gz" "$GUI_BACKEND_REPO"; then
  error "No se pudo descargar el backend de CamillaGUI."
  exit 1
fi

tar -xzf "${TMP_DIR}/camillagui-backend.tar.gz" -C "$TMP_DIR"
BACKEND_SRC=$(find "$TMP_DIR" -maxdepth 1 -name "camillagui-backend-*" -type d | head -1)

if [[ -z "$BACKEND_SRC" ]]; then
  error "No se encontró el directorio del backend después de descomprimir."
  exit 1
fi

mkdir -p "${INSTALL_DIR}/backend"
cp -r "${BACKEND_SRC}/"* "${INSTALL_DIR}/backend/"
log "Backend copiado a ${INSTALL_DIR}/backend/"

# Crear virtualenv
info "Creando entorno virtual Python..."
"$PYTHON_BIN" -m venv "${INSTALL_DIR}/backend/venv"
"${INSTALL_DIR}/backend/venv/bin/pip" install --quiet --upgrade pip

# Instalar dependencias base del backend (aiohttp y pyyaml siempre presentes)
info "Instalando dependencias Python..."
"${INSTALL_DIR}/backend/venv/bin/pip" install --quiet aiohttp pyyaml

# NOTA IMPORTANTE: pycamilladsp y pycamilladsp-plot NO están en PyPI.
# El `pip install -r requirements.txt` del backend fallará porque busca estos
# paquetes en PyPI y no los encuentra. Hay que instalarlos directamente desde
# el repositorio de GitHub del autor.
info "Instalando pycamilladsp desde GitHub (no está en PyPI)..."
"${INSTALL_DIR}/backend/venv/bin/pip" install --quiet \
  "camilladsp @ git+https://github.com/HEnquist/pycamilladsp.git" \
  "camilladsp-plot @ git+https://github.com/HEnquist/pycamilladsp-plot.git"

log "Backend Python instalado"

# ─── 9. Instalar frontend compilado ───────────────────────────────────────────
header "Instalando CamillaDSP Modern GUI (Frontend)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIST="${SCRIPT_DIR}/camilla-frontend/dist"

if [[ ! -d "$FRONTEND_DIST" ]]; then
  error "Frontend compilado no encontrado en: ${FRONTEND_DIST}"
  echo ""
  echo "  El frontend debe compilarse antes de instalar:"
  echo "    cd camilla-frontend"
  echo "    npm install"
  echo "    npm run build"
  echo ""
  echo "  O usa build.sh para compilar y empaquetar todo:"
  echo "    bash build.sh"
  exit 1
fi

if [[ ! -f "${FRONTEND_DIST}/index.html" ]]; then
  error "El directorio dist/ existe pero no contiene index.html. ¿Build incompleto?"
  exit 1
fi

mkdir -p "${INSTALL_DIR}/backend/build"
cp -r "${FRONTEND_DIST}/"* "${INSTALL_DIR}/backend/build/"
log "Frontend instalado en ${INSTALL_DIR}/backend/build/"

# ─── 10. Crear configuración inicial ──────────────────────────────────────────
header "Creando configuración"

mkdir -p "${CONFIG_DIR}/configs" "${CONFIG_DIR}/coeffs"

# ── camillagui.yml — configuración del backend Python ──
# IMPORTANTE: la versión 4.x del backend valida al arrancar que TODOS estos
# campos estén presentes. Si falta alguno lanza KeyError y el servicio cae.
cat > "${CONFIG_DIR}/camillagui.yml" << GUICONFIG
---
# Configuración del backend CamillaGUI v4.x
# NO eliminar ningún campo aunque sea null — son todos requeridos.

camilla_host: "localhost"
camilla_port: 1234
bind_address: "0.0.0.0"
port: 5005

# SSL — dejar en null para HTTP sin cifrado (uso local)
ssl_certificate: null
ssl_private_key: null

# Archivo de configuración de la interfaz gráfica
gui_config_file: null

# Directorios de trabajo
config_dir: "${CONFIG_DIR}/configs"
coeff_dir: "${CONFIG_DIR}/coeffs"

# Config que el engine carga al iniciar
default_config: "${CONFIG_DIR}/configs/default.yml"

# Estado persistente del engine (volumen, mute, etc.)
statefile_path: "${CONFIG_DIR}/statefile.yml"

# Log — null usa journald (recomendado con systemd)
log_file: null

# Hooks opcionales al cambiar la config activa
on_set_active_config: null
on_get_active_config: null

# Filtrar tipos de dispositivo en la UI (null = mostrar todos)
supported_capture_types: null
supported_playback_types: null
GUICONFIG

# Crear statefile vacío con los permisos correctos
touch "${CONFIG_DIR}/statefile.yml"
log "camillagui.yml creado"

# ── default.yml — configuración inicial de CamillaDSP ──
# Solo se crea si no existe — no sobreescribir configs del usuario.
if [[ ! -f "${CONFIG_DIR}/configs/default.yml" ]]; then
  cat > "${CONFIG_DIR}/configs/default.yml" << 'DEFAULTCFG'
---
# Configuración inicial de CamillaDSP v4.x
#
# IMPORTANTE para editar dispositivos de audio:
#   aplay -l       → listar dispositivos de playback
#   arecord -l     → listar dispositivos de captura
#   aplay -L       → nombres largos de dispositivos ALSA
#
# Formato del campo device: "hw:CARD,DEVICE"
# Ejemplos: "hw:0,0"  "hw:PCH,0"  "hw:USB,0"
#
# Formatos de audio válidos en v4.x (siempre con guión bajo):
#   S16_LE, S24_LE, S24_3LE, S32_LE, FLOAT32LE, FLOAT64LE

devices:
  samplerate: 48000
  chunksize: 1024
  enable_rate_adjust: true
  capture:
    type: Alsa
    channels: 2
    device: "hw:0,0"
    format: S32_LE
  playback:
    type: Alsa
    channels: 2
    device: "hw:0,0"
    format: S32_LE

filters:
  # Filtro de ganancia nula — solo para que el pipeline no quede vacío
  pass_through:
    type: Gain
    parameters:
      gain: 0
      inverted: false

mixers: {}

# Pipeline v4.x: "channels" es un array (no "channel" entero como en v3.x)
pipeline:
  - type: Filter
    channels: [0, 1]
    names:
      - pass_through
DEFAULTCFG
  log "Configuración inicial de audio creada"
else
  log "Configuración de audio existente mantenida (no sobreescrita)"
fi

# ─── 11. Configurar servicios systemd ─────────────────────────────────────────
header "Configurando servicios systemd"

# ── camilladsp-engine.service ──
cat > "${SYSTEMD_DIR}/camilladsp-engine.service" << ENGINESVC
[Unit]
Description=CamillaDSP Audio Processing Engine v4.x
Documentation=https://github.com/HEnquist/camilladsp
After=sound.target
Wants=sound.target

[Service]
Type=simple
User=${REAL_USER}
Group=audio
SupplementaryGroups=realtime

# Prioridad de tiempo real para procesamiento de audio
Nice=-10
IOSchedulingClass=realtime
IOSchedulingPriority=0
LimitRTPRIO=99
LimitMEMLOCK=infinity

# -p: puerto WebSocket interno (solo localhost)
# -w: archivo de config que carga al inicio (el statefile guarda cambios en caliente)
ExecStart=${BIN_DIR}/camilladsp -p 1234 -w ${CONFIG_DIR}/configs/default.yml
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=camilladsp-engine

[Install]
WantedBy=multi-user.target
ENGINESVC

# ── camilladsp-gui.service ──
cat > "${SYSTEMD_DIR}/camilladsp-gui.service" << GUISVC
[Unit]
Description=CamillaDSP GUI Backend (Python/aiohttp)
Documentation=https://github.com/HEnquist/camillagui-backend
After=network.target camilladsp-engine.service
Wants=camilladsp-engine.service

[Service]
Type=simple
User=${REAL_USER}
WorkingDirectory=${INSTALL_DIR}/backend
Environment=PYTHONUNBUFFERED=1

# El backend sirve la GUI en http://HOST:5005/
# Acceso: http://localhost:5005/ → redirige automáticamente a /gui/index.html
ExecStart=${INSTALL_DIR}/backend/venv/bin/python main.py -c ${CONFIG_DIR}/camillagui.yml
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=camilladsp-gui

[Install]
WantedBy=multi-user.target
GUISVC

systemctl daemon-reload
systemctl enable camilladsp-engine.service camilladsp-gui.service
log "Servicios systemd habilitados"

# ─── 12. Corregir permisos de archivos instalados ─────────────────────────────
# El instalador corre como root pero los servicios corren como $REAL_USER.
# Todos los archivos que el servicio necesita leer/escribir deben pertenecerle.
chown -R "${REAL_USER}:${REAL_USER}" "${INSTALL_DIR}/backend/build"
chown -R "${REAL_USER}:${REAL_USER}" "${CONFIG_DIR}"
chmod -R 755 "${INSTALL_DIR}/backend/build"
chmod 644 "${CONFIG_DIR}/camillagui.yml"
chmod 644 "${CONFIG_DIR}/configs/default.yml" 2>/dev/null || true
chmod 600 "${CONFIG_DIR}/statefile.yml"
log "Permisos de archivos corregidos"

# ─── 13. Iniciar servicios ────────────────────────────────────────────────────
header "Iniciando servicios"

if systemctl start camilladsp-engine.service 2>/dev/null; then
  sleep 1
  ENGINE_STATUS=$(systemctl is-active camilladsp-engine.service 2>/dev/null || echo "unknown")
  if [[ "$ENGINE_STATUS" == "active" ]]; then
    log "Engine iniciado (${ENGINE_STATUS})"
  else
    warn "Engine en estado: ${ENGINE_STATUS}"
    warn "Puede ser normal si el dispositivo de audio aún no está configurado."
    warn "Edita ${CONFIG_DIR}/configs/default.yml con tu dispositivo de audio."
  fi
else
  warn "Engine no pudo iniciarse — configura el dispositivo de audio primero."
  warn "Edita ${CONFIG_DIR}/configs/default.yml y ejecuta:"
  warn "  sudo systemctl start camilladsp-engine"
fi

if systemctl start camilladsp-gui.service 2>/dev/null; then
  sleep 2
  GUI_STATUS=$(systemctl is-active camilladsp-gui.service 2>/dev/null || echo "unknown")
  if [[ "$GUI_STATUS" == "active" ]]; then
    log "GUI Backend iniciado (${GUI_STATUS})"
  else
    warn "GUI Backend en estado: ${GUI_STATUS}"
    warn "Ver logs: journalctl -u camilladsp-gui -n 20"
  fi
else
  warn "GUI Backend no pudo iniciarse."
  warn "Ver logs: journalctl -u camilladsp-gui -n 20"
fi

# ─── 14. Resumen final ────────────────────────────────────────────────────────
header "Instalación completada"

echo ""
echo -e "  ${BOLD}CamillaDSP ${CAMILLA_VERSION}${NC} instalado para ${ARCH_DISPLAY}"
echo -e "  Backend de audio: ${BOLD}${AUDIO_BACKEND}${NC}"
echo ""
echo -e "  ${BOLD}Accede a la GUI en:${NC}"
echo -e "  ${CYAN}http://localhost:5005/${NC}"
echo ""
echo -e "  ${BOLD}Archivos instalados:${NC}"
echo -e "  Engine:    ${BIN_DIR}/camilladsp"
echo -e "  Backend:   ${INSTALL_DIR}/backend/"
echo -e "  Frontend:  ${INSTALL_DIR}/backend/build/"
echo -e "  Config:    ${CONFIG_DIR}/"
echo ""
echo -e "  ${BOLD}Próximos pasos:${NC}"
echo -e "  1. Listar dispositivos de audio disponibles:"
echo -e "     ${CYAN}aplay -l && arecord -l${NC}"
echo -e "  2. Editar la configuración de audio:"
echo -e "     ${CYAN}sudo nano ${CONFIG_DIR}/configs/default.yml${NC}"
echo -e "  3. Reiniciar el engine para aplicar cambios:"
echo -e "     ${CYAN}sudo systemctl restart camilladsp-engine${NC}"
echo ""
echo -e "  ${BOLD}Comandos de administración:${NC}"
echo -e "  Logs del engine:  ${CYAN}journalctl -u camilladsp-engine -f${NC}"
echo -e "  Logs de la GUI:   ${CYAN}journalctl -u camilladsp-gui -f${NC}"
echo -e "  Estado:           ${CYAN}systemctl status camilladsp-engine camilladsp-gui${NC}"
echo ""

# Advertencia sobre grupos de usuario
NEEDS_RELOGIN=false
for GROUP in audio realtime; do
  if ! id -nG "$REAL_USER" | grep -qw "$GROUP"; then
    NEEDS_RELOGIN=true
  fi
done
# Siempre advertir ya que los grupos se acaban de modificar en esta sesión
echo -e "  ${YELLOW}IMPORTANTE:${NC} Cierra sesión y vuelve a entrar para que los cambios"
echo -e "  de grupo (audio, realtime) tomen efecto en tu sesión actual."
echo ""
echo -e "${GREEN}${BOLD}CamillaDSP Modern GUI instalado correctamente.${NC}"
echo ""
