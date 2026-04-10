# CamillaDSP Modern GUI

Interfaz gráfica moderna para [CamillaDSP](https://github.com/HEnquist/camilladsp), el engine de procesamiento de audio digital en tiempo real.

Esta GUI reemplaza la interfaz original con un diseño oscuro moderno, curvas de respuesta EQ en tiempo real, medidores de nivel VU y una cadena de señal visual interactiva — sin modificar el engine Rust ni el backend Python originales.

---

## Arquitectura del sistema

```
[Navegador Web]
      ↕ HTTP
[Esta GUI — React + TypeScript]   ← lo que instala este repo
      ↕ HTTP / WebSocket
[CamillaGUI Backend — Python]     ← se descarga e instala automáticamente
      ↕ WebSocket (puerto 1234)
[CamillaDSP Engine — Rust]        ← se descarga automáticamente desde GitHub
      ↕
[Hardware de Audio: ALSA / PipeWire / PulseAudio]
```

> El instalador descarga y configura todo automáticamente. Solo necesitas ejecutar un comando.

---

## Requisitos

| Componente | Mínimo |
|---|---|
| Sistema operativo | Ubuntu 22.04+ / Debian 12+ / Arch Linux |
| Arquitectura | x86\_64, aarch64 (Raspberry Pi 4/5), armv7 (Raspberry Pi 2/3), armv6 (Pi Zero) |
| Python | 3.9 o superior |
| Memoria RAM | 512 MB mínimo (1 GB recomendado) |
| Disco | ~300 MB libres |
| Audio | ALSA (base), PipeWire o PulseAudio |

---

## Instalación rápida

### Paso 1 — Clonar el repositorio

```bash
git clone https://github.com/AGRIT2025/CamillaDSP_v1.git
cd CamillaDSP_v1
```

### Paso 2 — Ejecutar el instalador

```bash
sudo bash install.sh
```

El instalador detecta automáticamente:
- Tu distribución Linux (Ubuntu/Debian o Arch)
- La arquitectura de tu CPU
- El backend de audio activo (PipeWire > PulseAudio > ALSA)

Y realiza automáticamente:
1. Instala dependencias del sistema
2. Configura permisos de audio en tiempo real
3. Descarga el binario de CamillaDSP correcto desde GitHub
4. Instala el backend Python de CamillaGUI
5. Copia la GUI compilada
6. Crea los servicios systemd para arranque automático

### Paso 3 — Acceder a la GUI

```bash
xdg-open http://localhost:5005/
# o abre manualmente en tu navegador:
# http://localhost:5005/
# (redirige automáticamente a /gui/index.html)
```

---

## Configuración de audio

Después de instalar, configura tus dispositivos de audio:

### Listar dispositivos disponibles

```bash
# Dispositivos de reproducción (playback)
aplay -l

# Dispositivos de captura
arecord -l

# Dispositivos ALSA con nombre largo
aplay -L
```

### Editar la configuración inicial

El instalador crea una configuración base en `/etc/camilladsp/configs/default.yml`.
Puedes editarla directamente o usar la GUI en `http://localhost:5005/`.

```bash
# Editar configuración
sudo nano /etc/camilladsp/configs/default.yml

# Aplicar cambios (reiniciar el engine)
sudo systemctl restart camilladsp-engine
```

### Ejemplo de configuración para ALSA

```yaml
devices:
  samplerate: 48000
  chunksize: 1024
  enable_rate_adjust: true
  capture:
    type: Alsa
    channels: 2
    device: "hw:0,0"     # ← cambia esto por tu dispositivo
    format: S32LE
  playback:
    type: Alsa
    channels: 2
    device: "hw:0,0"     # ← cambia esto por tu dispositivo
    format: S32LE
```

### Ejemplo de configuración para PipeWire

```yaml
devices:
  samplerate: 48000
  chunksize: 1024
  capture:
    type: Pipewire
    channels: 2
    device: null          # null = dispositivo por defecto
  playback:
    type: Pipewire
    channels: 2
    device: null
```

---

## Comandos de administración

### Servicios systemd

```bash
# Ver estado de los servicios
sudo systemctl status camilladsp-engine
sudo systemctl status camilladsp-gui

# Iniciar / detener / reiniciar
sudo systemctl start   camilladsp-engine camilladsp-gui
sudo systemctl stop    camilladsp-engine camilladsp-gui
sudo systemctl restart camilladsp-engine camilladsp-gui

# Habilitar / deshabilitar arranque automático
sudo systemctl enable  camilladsp-engine camilladsp-gui
sudo systemctl disable camilladsp-engine camilladsp-gui
```

### Logs en tiempo real

```bash
# Log del engine CamillaDSP
sudo journalctl -u camilladsp-engine -f

# Log del backend GUI
sudo journalctl -u camilladsp-gui -f

# Últimas 100 líneas del engine
sudo journalctl -u camilladsp-engine -n 100
```

### Actualizar la GUI

```bash
cd CamillaDSP_v1
git pull
sudo bash install.sh
```

---

## Grupos de usuario y permisos

El instalador agrega automáticamente al usuario a los grupos `audio` y `realtime`.

> **Importante:** Los cambios de grupo requieren **cerrar sesión y volver a entrar** para tomar efecto.

Para verificar que el usuario está en los grupos correctos:

```bash
groups $USER
# Debe incluir: audio realtime
```

Para agregar manualmente a otro usuario:

```bash
sudo usermod -aG audio,realtime NOMBRE_DE_USUARIO
```

---

## Estructura de archivos instalados

```
/usr/local/bin/camilladsp              # Engine de audio (Rust)
/opt/camilladsp/
  backend/                            # Backend Python (CamillaGUI)
    venv/                             # Entorno virtual Python aislado
    build/                            # Esta GUI (React compilado)
/etc/camilladsp/
  camillagui.yml                      # Configuración del backend
  configs/
    default.yml                       # Configuración de audio inicial
  coeffs/                             # Archivos de coeficientes FIR
/etc/systemd/system/
  camilladsp-engine.service           # Servicio del engine
  camilladsp-gui.service              # Servicio del backend GUI
/etc/security/limits.d/
  camilladsp-audio.conf               # Límites de tiempo real
```

---

## Características de la GUI

| Sección | Funcionalidad |
|---|---|
| **Dashboard** | Estado del engine, carga CPU, sample rate, medidores de nivel VU por canal en tiempo real |
| **Volume** | Faders verticales para volumen master y auxiliares (Aux 1-4) con control de mute por canal |
| **Devices** | Selector de dispositivos de captura y reproducción con browser de dispositivos disponibles |
| **Filters** | Editor de filtros IIR (Biquad) con curva de respuesta en frecuencia en tiempo real |
| **Mixers** | Tabla de routing de canales con control de ganancia y mute por fuente |
| **Pipeline** | Editor visual de la cadena de señal con reordenamiento y bypass por etapa |

---

## Desinstalar

```bash
# Detener y deshabilitar servicios
sudo systemctl stop camilladsp-engine camilladsp-gui
sudo systemctl disable camilladsp-engine camilladsp-gui

# Eliminar archivos de servicios
sudo rm /etc/systemd/system/camilladsp-engine.service
sudo rm /etc/systemd/system/camilladsp-gui.service
sudo systemctl daemon-reload

# Eliminar binario y aplicación
sudo rm /usr/local/bin/camilladsp
sudo rm -rf /opt/camilladsp

# Eliminar configuración (opcional — borrará tus configs de audio)
sudo rm -rf /etc/camilladsp
sudo rm /etc/security/limits.d/camilladsp-audio.conf
```

---

## Solución de problemas

### La GUI no carga en el navegador

```bash
# Verificar que el backend está corriendo
sudo systemctl status camilladsp-gui

# Ver si el puerto 5005 está escuchando
ss -tlnp | grep 5005
```

### El engine no inicia

```bash
# Ver el error específico
sudo journalctl -u camilladsp-engine -n 50

# Causas comunes:
# 1. Dispositivo de audio mal configurado en default.yml
# 2. El dispositivo de audio está ocupado por otra aplicación
# 3. El usuario no está en el grupo 'audio' (requiere cerrar sesión)
```

### Error de permisos de audio

```bash
# Verificar grupos del usuario
groups $USER

# Si falta el grupo audio o realtime:
sudo usermod -aG audio,realtime $USER
# Luego cerrar sesión y volver a entrar
```

### Latencia alta o dropouts de audio

```bash
# Verificar si el kernel tiene soporte de baja latencia
uname -r
# Si no termina en -lowlatency o -rt, considera instalarlo:
sudo apt install linux-lowlatency    # Ubuntu/Debian

# Aumentar el tamaño del buffer en default.yml
# chunksize: 2048  (mayor buffer = menos dropouts pero más latencia)
```

---

## Créditos

- **[CamillaDSP](https://github.com/HEnquist/camilladsp)** por Henrik Enquist — engine de audio en Rust
- **[CamillaGUI Backend](https://github.com/HEnquist/camillagui-backend)** por Henrik Enquist — backend Python original
- **Esta GUI** — frontend moderno construido con React, TypeScript, Tailwind CSS y Recharts

## Licencia

GPL-3.0 — compatible con la licencia del proyecto original CamillaDSP.
