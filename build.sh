#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  build.sh — Compila el frontend y genera el paquete final       ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

GREEN='\033[0;32m'; BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'; BOLD='\033[1m'
log()  { echo -e "${GREEN}✓${NC} $*"; }
info() { echo -e "${BLUE}→${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="${SCRIPT_DIR}/camilla-frontend"
DIST_DIR="${SCRIPT_DIR}/dist-package"

echo -e "\n${BOLD}${CYAN}CamillaDSP Modern GUI — Build${NC}"
echo "$(printf '─%.0s' {1..50})"

# 1. Verificar Node.js
if ! command -v node &>/dev/null; then
  echo "✗ Node.js no encontrado. Instala Node.js 18+ primero."
  exit 1
fi
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
  echo "✗ Node.js 18+ requerido. Versión actual: $(node --version)"
  exit 1
fi
log "Node.js $(node --version) ✓"

# 2. Instalar dependencias del frontend
info "Instalando dependencias npm..."
cd "$FRONTEND_DIR"
npm install --silent
log "Dependencias instaladas"

# 3. Compilar frontend
info "Compilando frontend React..."
npm run build
log "Frontend compilado en ${FRONTEND_DIR}/dist/"

# 4. Crear directorio de distribución
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 5. Copiar frontend compilado
cp -r "${FRONTEND_DIR}/dist" "${DIST_DIR}/camilla-frontend-dist"
log "Frontend copiado"

# 6. Copiar instalador
cp "${SCRIPT_DIR}/install.sh" "${DIST_DIR}/install.sh"
chmod +x "${DIST_DIR}/install.sh"

# 7. Crear estructura esperada por install.sh
mkdir -p "${DIST_DIR}/camilla-frontend"
cp -r "${FRONTEND_DIR}/dist" "${DIST_DIR}/camilla-frontend/dist"

# 8. Generar tarball final
cd "${SCRIPT_DIR}"
TARBALL="camilladsp-modern-gui.tar.gz"
tar -czf "$TARBALL" -C "$(dirname "$DIST_DIR")" "$(basename "$DIST_DIR")" \
  --transform "s|$(basename "$DIST_DIR")|camilladsp-modern-gui|"

log "Paquete generado: ${SCRIPT_DIR}/${TARBALL}"

echo ""
echo -e "${BOLD}Para instalar en Linux:${NC}"
echo -e "  tar -xzf ${TARBALL}"
echo -e "  cd camilladsp-modern-gui"
echo -e "  sudo bash install.sh"
echo ""
echo -e "${GREEN}${BOLD}Build completado.${NC}"
