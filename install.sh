#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  CamillaDSP Modern GUI — Instalador para Linux                  ║
# ║  Soporta: Ubuntu/Debian, Arch Linux                             ║
# ║  Arquitecturas: x86_64, aarch64, armv7                          ║
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
CAMILLA_VERSION="v4.1.1"
INSTALL_DIR="/opt/camilladsp"
BIN_DIR="/usr/local/bin"
CONFIG_DIR="/etc/camilladsp"
SYSTEMD_DIR="/etc/systemd/system"
LIMITS_FILE="/etc/security/limits.d/camilladsp-audio.conf"
GITHUB_RELEASES="https://github.com/HEnquist/camilladsp/releases/download/${CAMILLA_VERSION}"
GUI_BACKEND_REPO="https://github.com/HEnquist/camillagui-backend/archive/refs/heads/master.tar.gz"

# ─── 1. Verificar root ────────────────────────────────────────────────────────
header "CamillaDSP Modern GUI — Instalador"

if [[ $EUID -ne 0 ]]; then
  error "Este instalador debe ejecutarse como root."
  echo "  Usa: sudo bash install.sh"
  exit 1
fi

REAL_USER="${SUDO_USER:-$(logname 2>/dev/null || echo '')}"
if [[ -z "$REAL_USER" ]]; then
  error "No se pudo determinar el usuario que invocó sudo."
  exit 1
fi

log "Instalando para el usuario: ${BOLD}$REAL_USER${NC}"

# ─── 2. Detectar distribución ─────────────────────────────────────────────────
header "Detectando entorno del sistema"

if [[ -f /etc/os-release ]]; then
  source /etc/os-release
  DISTRO_ID="${ID:-unknown}"
  DISTRO_LIKE="${ID_LIKE:-}"
else
  error "No se puede leer /etc/os-release — distribución no soportada."
  exit 1
fi

PKG_MANAGER=""
if command -v apt-get &>/dev/null && ([[ "$DISTRO_ID" == "ubuntu" ]] || [[ "$DISTRO_ID" == "debian" ]] || [[ "$DISTRO_LIKE" == *"debian"* ]]); then
  PKG_MANAGER="apt"
  log "Distribución: Ubuntu/Debian (apt)"
elif command -v pacman &>/dev/null && [[ "$DISTRO_ID" == "arch" ]]; then
  PKG_MANAGER="pacman"
  log "Distribución: Arch Linux (pacman)"
else
  error "Distribución no soportada: ${DISTRO_ID}"
  echo "  Soportadas: Ubuntu 22.04+, Debian 12+, Arch Linux"
  exit 1
fi

# ─── 3. Detectar arquitectura ─────────────────────────────────────────────────
ARCH_RAW=$(uname -m)
case "$ARCH_RAW" in
  x86_64)         ARCH="amd64";   ARCH_NAME="x86_64" ;;
  aarch64|arm64)  ARCH="aarch64"; ARCH_NAME="ARM 64-bit (Raspberry Pi 4/5)" ;;
  armv7l)         ARCH="armv7";   ARCH_NAME="ARM v7 (Raspberry Pi 2/3)" ;;
  armv6l)         ARCH="armv6";   ARCH_NAME="ARM v6 (Raspberry Pi Zero)" ;;
  *)
    error "Arquitectura no soportada: ${ARCH_RAW}"
    exit 1
    ;;
esac
log "Arquitectura: ${ARCH_NAME}"

# ─── 4. Detectar backend de audio activo ─────────────────────────────────────
AUDIO_BACKEND="alsa"
BACKEND_SUFFIX=""

detect_audio_backend() {
  # PipeWire tiene prioridad si está corriendo como servicio de usuario
  if systemctl --user is-active --quiet pipewire 2>/dev/null || \
     pgrep -x pipewire &>/dev/null; then
    AUDIO_BACKEND="pipewire"
    BACKEND_SUFFIX="-pipewire"
    log "Backend de audio: PipeWire (activo)"
    return
  fi

  # PulseAudio
  if systemctl --user is-active --quiet pulseaudio 2>/dev/null || \
     pgrep -x pulseaudio &>/dev/null; then
    AUDIO_BACKEND="pulseaudio"
    BACKEND_SUFFIX="-pulseaudio"
    log "Backend de audio: PulseAudio (activo)"
    return
  fi

  # Fallback: ALSA
  log "Backend de audio: ALSA (base)"
}

# Para armv7 y armv6 solo hay binario ALSA
if [[ "$ARCH" == "armv7" ]] || [[ "$ARCH" == "armv6" ]]; then
  warn "ARM v6/v7: solo disponible variante ALSA"
  BACKEND_SUFFIX=""
else
  detect_audio_backend
fi

# Construir nombre del binario a descargar
if [[ "$ARCH" == "armv6" ]] || [[ "$ARCH" == "armv7" ]]; then
  BINARY_NAME="camilladsp-linux-${ARCH}.tar.gz"
else
  BINARY_NAME="camilladsp-linux${BACKEND_SUFFIX}-${ARCH}.tar.gz"
fi
DOWNLOAD_URL="${GITHUB_RELEASES}/${BINARY_NAME}"

info "Binario a descargar: ${BINARY_NAME}"

# ─── 5. Instalar dependencias del sistema ─────────────────────────────────────
header "Instalando dependencias del sistema"

install_apt() {
  apt-get update -qq
  local PKGS=(curl tar python3 python3-pip python3-venv)

  # ALSA siempre
  PKGS+=(libasound2 libasound2-dev)

  # PipeWire si aplica
  if [[ "$AUDIO_BACKEND" == "pipewire" ]]; then
    PKGS+=(libpipewire-0.3-0)
  fi

  # PulseAudio si aplica
  if [[ "$AUDIO_BACKEND" == "pulseaudio" ]]; then
    PKGS+=(libpulse0)
  fi

  apt-get install -y "${PKGS[@]}" 2>&1 | grep -E "(installed|upgraded|already)" || true
  log "Dependencias APT instaladas"
}

install_pacman() {
  local PKGS=(curl tar python python-pip alsa-lib)

  if [[ "$AUDIO_BACKEND" == "pipewire" ]]; then
    PKGS+=(pipewire)
  fi
  if [[ "$AUDIO_BACKEND" == "pulseaudio" ]]; then
    PKGS+=(libpulse)
  fi

  pacman -Sy --noconfirm --needed "${PKGS[@]}" 2>&1 | tail -3
  log "Dependencias Pacman instaladas"
}

[[ "$PKG_MANAGER" == "apt" ]]    && install_apt
[[ "$PKG_MANAGER" == "pacman" ]] && install_pacman

# Verificar Python 3.9+
PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [[ "$PYTHON_MAJOR" -lt 3 ]] || ([[ "$PYTHON_MAJOR" -eq 3 ]] && [[ "$PYTHON_MINOR" -lt 9 ]]); then
  error "Python 3.9+ requerido. Encontrado: Python ${PYTHON_VERSION}"
  exit 1
fi
log "Python ${PYTHON_VERSION} ✓"

# ─── 6. Configurar permisos de audio ──────────────────────────────────────────
header "Configurando permisos de audio en tiempo real"

# Crear grupo realtime si no existe
if ! getent group realtime &>/dev/null; then
  groupadd -r realtime
  log "Grupo 'realtime' creado"
fi

# Agregar usuario a grupos audio y realtime
for GROUP in audio realtime; do
  if id -nG "$REAL_USER" | grep -qw "$GROUP"; then
    log "Usuario $REAL_USER ya está en grupo '$GROUP'"
  else
    usermod -aG "$GROUP" "$REAL_USER"
    log "Usuario $REAL_USER agregado al grupo '$GROUP'"
  fi
done

# Configurar límites RT
cat > "$LIMITS_FILE" << 'LIMITS'
# CamillaDSP — Límites de audio en tiempo real
@audio   -  rtprio   99
@audio   -  memlock  unlimited
@audio   -  nice     -19

@realtime - rtprio   99
@realtime - memlock  unlimited
LIMITS
log "Límites RT configurados en ${LIMITS_FILE}"

# ─── 7. Descargar e instalar CamillaDSP engine ────────────────────────────────
header "Descargando CamillaDSP ${CAMILLA_VERSION}"

TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

info "URL: ${DOWNLOAD_URL}"
if ! curl -fsSL --progress-bar -o "${TMP_DIR}/${BINARY_NAME}" "$DOWNLOAD_URL"; then
  error "No se pudo descargar el binario de CamillaDSP."
  echo "  Verifica tu conexión a internet y que la versión ${CAMILLA_VERSION} existe."
  exit 1
fi

tar -xzf "${TMP_DIR}/${BINARY_NAME}" -C "$TMP_DIR"
install -m 755 "${TMP_DIR}/camilladsp" "${BIN_DIR}/camilladsp"
log "CamillaDSP instalado en ${BIN_DIR}/camilladsp"

# ─── 8. Instalar backend Python de CamillaGUI ─────────────────────────────────
header "Instalando CamillaGUI Backend (Python)"

mkdir -p "${INSTALL_DIR}"

# Si ya existe, hacer backup de configs
if [[ -d "${INSTALL_DIR}/backend" ]] && [[ -d "${INSTALL_DIR}/backend/config" ]]; then
  BACKUP="${INSTALL_DIR}/config-backup-$(date +%Y%m%d%H%M%S)"
  cp -r "${INSTALL_DIR}/backend/config" "$BACKUP"
  warn "Backup de configs guardado en: ${BACKUP}"
fi

info "Descargando CamillaGUI Backend..."
curl -fsSL --progress-bar -o "${TMP_DIR}/camillagui-backend.tar.gz" "$GUI_BACKEND_REPO"
tar -xzf "${TMP_DIR}/camillagui-backend.tar.gz" -C "$TMP_DIR"
BACKEND_SRC=$(find "$TMP_DIR" -maxdepth 1 -name "camillagui-backend-*" -type d | head -1)

rm -rf "${INSTALL_DIR}/backend"
mkdir -p "${INSTALL_DIR}/backend"
cp -r "${BACKEND_SRC}/"* "${INSTALL_DIR}/backend/"

# Crear virtualenv e instalar dependencias Python
info "Creando entorno virtual Python..."
python3 -m venv "${INSTALL_DIR}/backend/venv"
"${INSTALL_DIR}/backend/venv/bin/pip" install --quiet --upgrade pip

# Instalar dependencias base del backend
"${INSTALL_DIR}/backend/venv/bin/pip" install --quiet aiohttp aiohttp-index-redirect pyyaml

# pycamilladsp y pycamilladsp-plot no están en PyPI — instalar desde GitHub
info "Instalando pycamilladsp desde GitHub..."
"${INSTALL_DIR}/backend/venv/bin/pip" install --quiet \
  "camilladsp @ git+https://github.com/HEnquist/pycamilladsp.git" \
  "camilladsp-plot @ git+https://github.com/HEnquist/pycamilladsp-plot.git"

log "Backend Python instalado"

# ─── 9. Instalar frontend compilado ───────────────────────────────────────────
header "Instalando CamillaDSP Modern GUI (Frontend)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIST="${SCRIPT_DIR}/camilla-frontend/dist"

if [[ ! -d "$FRONTEND_DIST" ]]; then
  error "Frontend no encontrado en: ${FRONTEND_DIST}"
  echo "  Ejecuta primero: cd camilla-frontend && npm run build"
  exit 1
fi

mkdir -p "${INSTALL_DIR}/backend/build"
cp -r "${FRONTEND_DIST}/"* "${INSTALL_DIR}/backend/build/"
log "Frontend instalado en ${INSTALL_DIR}/backend/build/"

# ─── 10. Configuración inicial ────────────────────────────────────────────────
header "Creando configuración inicial"

mkdir -p "$CONFIG_DIR"

# Config del backend Python (todos los campos requeridos)
cat > "${CONFIG_DIR}/camillagui.yml" << GUICONFIG
---
camilla_host: "localhost"
camilla_port: 1234
bind_address: "0.0.0.0"
port: 5005
ssl_certificate: null
ssl_private_key: null
gui_config_file: null
config_dir: "${CONFIG_DIR}/configs"
coeff_dir: "${CONFIG_DIR}/coeffs"
default_config: "${CONFIG_DIR}/configs/default.yml"
statefile_path: "${CONFIG_DIR}/statefile.yml"
log_file: null
on_set_active_config: null
on_get_active_config: null
supported_capture_types: null
supported_playback_types: null
GUICONFIG

# Crear statefile con permisos correctos
touch "${CONFIG_DIR}/statefile.yml"

# Config inicial de CamillaDSP (ejemplo mínimo)
mkdir -p "${CONFIG_DIR}/configs" "${CONFIG_DIR}/coeffs"

if [[ ! -f "${CONFIG_DIR}/configs/default.yml" ]]; then
  cat > "${CONFIG_DIR}/configs/default.yml" << 'DEFAULTCFG'
---
# Configuración inicial de CamillaDSP
# Edita los dispositivos de audio según tu hardware
# Usa: aplay -l (para listar dispositivos de playback)
#      arecord -l (para listar dispositivos de captura)

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
  gain_flat:
    type: Gain
    parameters:
      gain: 0
      inverted: false

mixers: {}

pipeline:
  - type: Filter
    channels: [0, 1]
    names:
      - gain_flat
DEFAULTCFG
  log "Configuración inicial creada en ${CONFIG_DIR}/configs/default.yml"
fi

# ─── 11. Servicios systemd ────────────────────────────────────────────────────
header "Configurando servicios systemd"

# Engine
cat > "${SYSTEMD_DIR}/camilladsp-engine.service" << ENGINESVC
[Unit]
Description=CamillaDSP Audio Processing Engine
Documentation=https://github.com/HEnquist/camilladsp
After=sound.target
Wants=sound.target

[Service]
Type=simple
User=${REAL_USER}
Group=audio
SupplementaryGroups=realtime
Nice=-10
IOSchedulingClass=realtime
IOSchedulingPriority=0
LimitRTPRIO=99
LimitMEMLOCK=infinity

ExecStart=${BIN_DIR}/camilladsp -p 1234 -w ${CONFIG_DIR}/configs/default.yml
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=camilladsp-engine

[Install]
WantedBy=multi-user.target
ENGINESVC

# GUI Backend
cat > "${SYSTEMD_DIR}/camilladsp-gui.service" << GUISVC
[Unit]
Description=CamillaDSP GUI Backend
Documentation=https://github.com/HEnquist/camillagui-backend
After=network.target camilladsp-engine.service
Wants=camilladsp-engine.service

[Service]
Type=simple
User=${REAL_USER}
WorkingDirectory=${INSTALL_DIR}/backend
Environment=PYTHONUNBUFFERED=1

ExecStart=${INSTALL_DIR}/backend/venv/bin/python main.py -c ${CONFIG_DIR}/camillagui.yml
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=camilladsp-gui

[Install]
WantedBy=multi-user.target
GUISVC

systemctl daemon-reload
systemctl enable camilladsp-engine.service camilladsp-gui.service
log "Servicios systemd habilitados"

# Ajustar permisos de instalación
chown -R "${REAL_USER}:${REAL_USER}" "${INSTALL_DIR}/backend/build" 2>/dev/null || true
chown "${REAL_USER}:${REAL_USER}" "${CONFIG_DIR}/statefile.yml" 2>/dev/null || true
chmod -R 755 "${INSTALL_DIR}/backend/build" 2>/dev/null || true

# ─── 12. Iniciar servicios ────────────────────────────────────────────────────
header "Iniciando servicios"

systemctl start camilladsp-engine.service && log "Engine iniciado" || warn "Engine no se pudo iniciar (necesita config de audio válida)"
systemctl start camilladsp-gui.service   && log "GUI Backend iniciado" || warn "GUI Backend no se pudo iniciar"

# ─── 13. Resumen final ────────────────────────────────────────────────────────
header "Instalación completada"

echo ""
echo -e "${BOLD}Accede a la GUI en:${NC}"
echo -e "  ${CYAN}http://localhost:5005/gui${NC}"
echo ""
echo -e "${BOLD}Archivos instalados:${NC}"
echo -e "  Engine:   ${BIN_DIR}/camilladsp"
echo -e "  Backend:  ${INSTALL_DIR}/backend/"
echo -e "  Frontend: ${INSTALL_DIR}/backend/build/"
echo -e "  Config:   ${CONFIG_DIR}/"
echo ""
echo -e "${BOLD}Comandos útiles:${NC}"
echo -e "  Ver logs del engine: ${CYAN}journalctl -u camilladsp-engine -f${NC}"
echo -e "  Ver logs del GUI:    ${CYAN}journalctl -u camilladsp-gui -f${NC}"
echo -e "  Reiniciar engine:    ${CYAN}systemctl restart camilladsp-engine${NC}"
echo -e "  Estado servicios:    ${CYAN}systemctl status camilladsp-engine camilladsp-gui${NC}"
echo ""

if id -nG "$REAL_USER" | grep -qw "realtime"; then
  echo -e "${YELLOW}IMPORTANTE:${NC} Los cambios de grupo de usuario requieren"
  echo -e "  cerrar sesión y volver a iniciar sesión para tomar efecto."
fi

echo ""
echo -e "${GREEN}${BOLD}CamillaDSP Modern GUI instalado correctamente.${NC}"
echo ""
