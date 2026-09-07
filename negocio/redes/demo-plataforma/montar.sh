#!/usr/bin/env bash
# Junta la grabación, la pista de voz y la placa de cierre.
#
#   ./montar.sh <grabacion.mp4>
set -euo pipefail
CRUDO="${1:?uso: ./montar.sh <grabacion.mp4>}"
PISTA="audio/pista.mp3"
PLACA="placa.png"
SALIDA="salida/dimia-demo.mp4"
mkdir -p salida

LARGO=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$CRUDO")
CIERRE=4.5                     # cuánto dura la placa
FUNDE=0.7                      # el cruce entre el panel y la placa
INICIO=$(python3 -c "print(round($LARGO - $FUNDE, 3))")
TOTAL=$(python3 -c "print(round($LARGO + $CIERRE - $FUNDE, 3))")

# La placa entra encadenada al final y el audio se estira con silencio hasta el corte.
ffmpeg -v error -y \
  -i "$CRUDO" \
  -loop 1 -t "$(python3 -c "print($CIERRE + $FUNDE)")" -i "$PLACA" \
  -i "$PISTA" \
  -filter_complex "
    [0:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[a];
    [1:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[b];
    [a][b]xfade=transition=fade:duration=${FUNDE}:offset=${INICIO}[v];
    [2:a]apad,atrim=0:${TOTAL},afade=t=out:st=$(python3 -c "print(round($TOTAL-1.6,3))"):d=1.6,asetpts=N/SR/TB[au]
  " \
  -map "[v]" -map "[au]" \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -movflags +faststart \
  "$SALIDA"

echo "$SALIDA"
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,width,height -of default=noprint_wrappers=1 "$SALIDA"
