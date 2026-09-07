#!/usr/bin/env bash
# Arma public/audio/pista.mp3: la locución re-espaciada sobre la cama ambiental.
#
#   python3 musica.py && ./audio.sh          # usa audio/locucion.mp3
#
# La locución de ElevenLabs viene corrida; aquí se parte en sus siete párrafos
# y cada uno se coloca en el segundo que le toca según el guion de VideoPanel.tsx.
set -euo pipefail

VOZ="${1:-audio/locucion.mp3}"
CAMA="cama.wav"
DESTINO="public/audio/pista.mp3"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$(dirname "$DESTINO")"

# Corte de cada párrafo en la locución original (a la mitad de su pausa) y
# segundo en que debe entrar en el video.
CORTES=(
  "0.000 5.490 0.90"
  "5.490 10.400 7.30"
  "10.400 16.390 12.60"
  "16.390 21.020 19.10"
  "21.020 27.140 24.30"
  "27.140 32.300 31.00"
  "32.300 36.210 36.80"
)

ENTRADAS=(); FILTROS=(); MEZCLA=""; i=0
for corte in "${CORTES[@]}"; do
  read -r desde hasta en <<<"$corte"
  ffmpeg -v error -y -ss "$desde" -to "$hasta" -i "$VOZ" -ac 1 -ar 44100 "$TMP/p$i.wav"
  ENTRADAS+=(-i "$TMP/p$i.wav")
  ms=$(python3 -c "print(int($en*1000))")
  FILTROS+=("[$((i+1)):a]adelay=${ms}|${ms}[v$i]")
  MEZCLA="${MEZCLA}[v$i]"
  i=$((i+1))
done

# La cama entra en [0]; la voz mezclada la agacha con sidechaincompress.
ffmpeg -v error -y -i "$CAMA" "${ENTRADAS[@]}" -filter_complex "
  $(IFS=';'; echo "${FILTROS[*]}");
  ${MEZCLA}amix=inputs=${i}:normalize=0[vozmono];
  [vozmono]aformat=channel_layouts=stereo,volume=1.9,
    highpass=f=90,acompressor=threshold=0.12:ratio=3:attack=8:release=180[voz];
  [voz]asplit=2[vozsal][llavecruda];
  [llavecruda]apad=whole_dur=42[llave];
  [0:a]volume=0.26,aecho=0.8:0.85:340|560:0.26|0.18[camacruda];
  [camacruda][llave]sidechaincompress=threshold=0.035:ratio=8:attack=25:release=420[camaduck];
  [camaduck][vozsal]amix=inputs=2:normalize=0,
    loudnorm=I=-14:TP=-1.5:LRA=11,
    alimiter=limit=0.95,atrim=0:41.8,asetpts=N/SR/TB[fin]
" -map "[fin]" -c:a libmp3lame -b:a 192k -ar 44100 "$DESTINO"

echo "$DESTINO"
ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$DESTINO"
