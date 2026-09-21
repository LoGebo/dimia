#!/bin/bash
# Dimia en esta computadora. Uso: curl -fsSL __ORQUESTADOR__/local/instalar.sh | bash -s CODIGO
# Instala Hermes (si falta), el demonio del túnel y lo deja corriendo al iniciar sesión (launchd).
set -e
CODIGO="${1:-}"
URL="__ORQUESTADOR__"
[ -n "$CODIGO" ] || { echo "Falta el código de emparejamiento (viene en Ajustes del agente)."; exit 1; }
[ "$(uname)" = "Darwin" ] || { echo "Por ahora solo Mac."; exit 1; }

RAIZ="$HOME/.dimia"
mkdir -p "$RAIZ"

echo "· Hermes"
HERMES=""
for c in "$(command -v hermes 2>/dev/null)" "$HOME/.local/bin/hermes" "$HOME/.hermes/hermes-agent/venv/bin/hermes"; do
  [ -n "$c" ] && [ -x "$c" ] && HERMES="$c" && break
done
if [ -z "$HERMES" ]; then
  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --non-interactive --skip-setup
  for c in "$HOME/.local/bin/hermes" "$HOME/.hermes/hermes-agent/venv/bin/hermes"; do [ -x "$c" ] && HERMES="$c" && break; done
  [ -n "$HERMES" ] || { echo "No encontré hermes después de instalarlo."; exit 1; }
fi
echo "  $HERMES"

echo "· Demonio"
PY="$(command -v python3)"
[ -n "$PY" ] || { echo "Falta python3 (xcode-select --install)."; exit 1; }
[ -x "$RAIZ/venv/bin/python" ] || "$PY" -m venv "$RAIZ/venv"
"$RAIZ/venv/bin/pip" install -q --upgrade websockets imageio-ffmpeg
curl -fsSL "$URL/local/dimia-local.py" -o "$RAIZ/dimia-local.py"
printf '{"url": "%s", "codigo": "%s", "hermes": "%s"}\n' "$URL" "$CODIGO" "$HERMES" > "$RAIZ/agente.json"
chmod 600 "$RAIZ/agente.json"

echo "· Arranque automático"
PLIST="$HOME/Library/LaunchAgents/mx.dimia.agente.plist"
mkdir -p "$HOME/Library/LaunchAgents"
launchctl bootout "gui/$(id -u)/mx.dimia.agente" 2>/dev/null || true
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>mx.dimia.agente</string>
  <key>ProgramArguments</key><array><string>$RAIZ/venv/bin/python</string><string>$RAIZ/dimia-local.py</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$RAIZ/launchd.log</string>
  <key>StandardErrorPath</key><string>$RAIZ/launchd.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict></plist>
EOF
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo
echo "Listo. En unos segundos el agente aparece «Conectada» en el panel."
echo "Para que pueda usar la pantalla, dé permiso a Accesibilidad y Grabación de pantalla cuando macOS lo pida."
