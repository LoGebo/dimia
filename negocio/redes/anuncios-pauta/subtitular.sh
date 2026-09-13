#!/usr/bin/env bash
# Transcribe palabra por palabra el video de la vocera con whisper.cpp local y lo renderiza
# con subtítulos, aviso de IA y placa final.
# Uso: ./subtitular.sh            (usa videos/valentina-crudo.mp4)
set -euo pipefail
cd "$(dirname "$0")"

MODELO="$HOME/Library/Application Support/geboou/whisper-models/ggml-large-v3-turbo.bin"
CRUDO="videos/valentina-crudo.mp4"
TMP="$(mktemp -d)"

ffmpeg -v error -y -i "$CRUDO" -vn -ac 1 -ar 16000 "$TMP/voz.wav"

# -ml 1 y -sow: un segmento por palabra, con su tiempo en milisegundos.
whisper-cli -m "$MODELO" -l es -f "$TMP/voz.wav" -ml 1 -sow -oj -of "$TMP/voz" >/dev/null 2>&1

DURACION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$CRUDO")"

python3 - "$TMP/voz.json" "$DURACION" > videos/valentina-props.json <<'EOF'
import json, sys
datos = json.load(open(sys.argv[1]))
palabras = []
for seg in datos.get("transcription", []):
    texto = seg.get("text", "").strip()
    if not texto:
        continue
    palabras.append({
        "texto": texto,
        "desde": seg["offsets"]["from"] / 1000,
        "hasta": seg["offsets"]["to"] / 1000,
    })
print(json.dumps({"duracion": float(sys.argv[2]), "palabras": palabras}, ensure_ascii=False))
EOF

echo "palabras: $(python3 -c 'import json;print(len(json.load(open("videos/valentina-props.json"))["palabras"]))')"
python3 -c 'import json;print(" ".join(p["texto"] for p in json.load(open("videos/valentina-props.json"))["palabras"]))'

cd ../video-panel
npx remotion render src/index.ts VoceraValentina salida/valentina-sub.mp4 \
  --props=../anuncios-pauta/videos/valentina-props.json --crf 18 --log error
ffmpeg -v error -y -i salida/valentina-sub.mp4 -c:v copy \
  -af "loudnorm=I=-14:TP=-1:LRA=11" -c:a aac -b:a 192k ../anuncios-pauta/videos/valentina.mp4
echo "../anuncios-pauta/videos/valentina.mp4"
