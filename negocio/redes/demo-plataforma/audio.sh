#!/usr/bin/env bash
# Arma la pista del demo: la locución repartida por planos, sobre la cama.
#
#   python3 musica.py && ./audio.sh
#
# La locución de ElevenLabs viene corrida. Aquí se parte en sus nueve párrafos
# —cortando a la mitad de cada pausa— y cada uno entra medio segundo después del
# corte del plano al que corresponde.
set -euo pipefail

VOZ="${1:-audio/locucion.mp3}"
CAMA="cama.wav"
DESTINO="audio/pista.mp3"
LARGO=90.03
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# desde  hasta  (en la locución)   ·   entra (en el video)
CORTES=(
  "0.000   6.410   4.0"
  "6.410  17.730  12.0"
  "17.730 24.910  24.5"
  "24.910 32.510  33.0"
  "32.510 38.140  43.0"
  "38.140 45.400  51.5"
  "45.400 51.980  62.0"
  "51.980 61.860  71.5"
  "61.860 66.930  83.5"
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

ffmpeg -v error -y -i "$CAMA" "${ENTRADAS[@]}" -filter_complex "
  $(IFS=';'; echo "${FILTROS[*]}");
  ${MEZCLA}amix=inputs=${i}:normalize=0[vozmono];
  [vozmono]aformat=channel_layouts=stereo,volume=1.9,
    highpass=f=90,acompressor=threshold=0.12:ratio=3:attack=8:release=180[voz];
  [voz]asplit=2[vozsal][llavecruda];
  [llavecruda]apad=whole_dur=91[llave];
  [0:a]volume=0.26,aecho=0.8:0.85:340|560:0.26|0.18[camacruda];
  [camacruda][llave]sidechaincompress=threshold=0.035:ratio=8:attack=25:release=420[camaduck];
  [camaduck][vozsal]amix=inputs=2:normalize=0,
    loudnorm=I=-14:TP=-1.5:LRA=11,
    alimiter=limit=0.95,atrim=0:${LARGO},asetpts=N/SR/TB[fin]
" -map "[fin]" -c:a libmp3lame -b:a 192k -ar 44100 "$DESTINO"

echo "$DESTINO"
ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$DESTINO"
