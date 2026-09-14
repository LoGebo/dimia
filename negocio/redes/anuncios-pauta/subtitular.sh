#!/usr/bin/env bash
# Transcribe palabra por palabra un video de vocero con whisper.cpp local y lo renderiza como
# reel: acercamiento en cada frase, panel en teléfono, notificación, subtítulos, aviso de IA y placa.
# Uso: ./subtitular.sh videos/marco15.mp4 [salida]
set -euo pipefail
cd "$(dirname "$0")"

CRUDO="${1:?falta el video crudo, p. ej. videos/marco15.mp4}"
NOMBRE="$(basename "$CRUDO" .mp4)"
SALIDA="${2:-videos/$NOMBRE-reel.mp4}"
MODELO="$HOME/Library/Application Support/geboou/whisper-models/ggml-large-v3-turbo.bin"
TMP="$(mktemp -d)"

ffmpeg -v error -y -i "$CRUDO" -vn -ac 1 -ar 16000 "$TMP/voz.wav"
# -ml 1 y -sow: un segmento por palabra, con su tiempo en milisegundos.
whisper-cli -m "$MODELO" -l es -f "$TMP/voz.wav" -ml 1 -sow -oj -of "$TMP/voz" >/dev/null 2>&1
DURACION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CRUDO")"

python3 - "$TMP/voz.json" "$DURACION" "pauta/$CRUDO" > "videos/$NOMBRE-props.json" <<'EOF'
import json, sys, re
datos = json.load(open(sys.argv[1]))
palabras = []
for seg in datos.get("transcription", []):
    texto = seg.get("text", "").strip()
    if texto:
        palabras.append({"texto": texto, "desde": seg["offsets"]["from"] / 1000, "hasta": seg["offsets"]["to"] / 1000})

# Cada frase empieza después de una palabra con punto, coma o signo de cierre.
cortes = [0.0]
for a, b in zip(palabras, palabras[1:]):
    if re.search(r"[.,?!»]$", a["texto"]):
        cortes.append(b["desde"])

def momento(patron, respaldo):
    for p in palabras:
        if re.search(patron, p["texto"], re.I):
            return p["desde"]
    return respaldo

dur = float(sys.argv[2])
t_contesta = momento(r"^contesta", dur * 0.35)
t_agenda = momento(r"^agenda", dur * 0.6)
recursos = [
    {"tipo": "aviso", "desde": round(t_contesta, 2), "hasta": round(min(t_contesta + 2.2, dur), 2),
     "titulo": "Llamada contestada", "texto": "Paciente nuevo · 21:47", "tono": "azul"},
    {"tipo": "panel", "desde": round(t_agenda, 2), "hasta": round(min(t_agenda + 3.0, dur), 2),
     "captura": "panel/agenda.png"},
]
print(json.dumps({"video": sys.argv[3], "duracion": dur, "palabras": palabras, "cortes": cortes, "recursos": recursos}, ensure_ascii=False))
EOF

echo "transcripción: $(python3 -c 'import json,sys;print(" ".join(p["texto"] for p in json.load(open(sys.argv[1]))["palabras"]))' "videos/$NOMBRE-props.json")"

cd ../video-panel
npx remotion render src/index.ts VoceraValentina "salida/$NOMBRE-reel-crudo.mp4" \
  --props="../anuncios-pauta/videos/$NOMBRE-props.json" --crf 18 --log error
ffmpeg -v error -y -i "salida/$NOMBRE-reel-crudo.mp4" -c:v copy \
  -af "loudnorm=I=-14:TP=-1:LRA=11" -c:a aac -b:a 192k "../anuncios-pauta/$SALIDA"
echo "../anuncios-pauta/$SALIDA"
