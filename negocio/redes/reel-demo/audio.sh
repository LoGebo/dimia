#!/usr/bin/env bash
# Pista del reel: cuatro frases de la misma locución del demo, repartidas por
# plano, sobre la cama. No hace falta grabar voz nueva.
#
#   python3 musica.py && ./audio.sh
set -euo pipefail
VOZ="${1:-locucion.mp3}"
DESTINO="public/pista.mp3"
LARGO=33.0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# desde  hasta  (en la locución)   ·   entra (en el reel)
#  «Este es el panel de Dimia. Aquí llega todo lo que la IA contestó por usted.»
#  «Ábrala y lea la llamada completa…»
#  «Lo que agendó ya está en la agenda del día…»
#  «Contesta también cuando usted cierra. Dimia. Donde el dato decide.»
CORTES=(
  "0.000   6.410   2.2"
  "17.730 24.910   9.4"
  "24.910 32.510  17.0"
  "61.860 66.930  25.0"
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

ffmpeg -v error -y -i cama.wav "${ENTRADAS[@]}" -filter_complex "
  $(IFS=';'; echo "${FILTROS[*]}");
  ${MEZCLA}amix=inputs=${i}:normalize=0[vozmono];
  [vozmono]aformat=channel_layouts=stereo,volume=1.9,
    highpass=f=90,acompressor=threshold=0.12:ratio=3:attack=8:release=180[voz];
  [voz]asplit=2[vozsal][llavecruda];
  [llavecruda]apad=whole_dur=34[llave];
  [0:a]volume=0.30,aecho=0.8:0.85:340|560:0.26|0.18[camacruda];
  [camacruda][llave]sidechaincompress=threshold=0.035:ratio=8:attack=25:release=420[camaduck];
  [camaduck][vozsal]amix=inputs=2:normalize=0,
    loudnorm=I=-14:TP=-1.5:LRA=11,
    alimiter=limit=0.95,atrim=0:${LARGO},asetpts=N/SR/TB[fin]
" -map "[fin]" -c:a libmp3lame -b:a 192k -ar 44100 "$DESTINO"
echo "$DESTINO"; ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$DESTINO"
