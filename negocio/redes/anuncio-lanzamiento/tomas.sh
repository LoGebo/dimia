#!/usr/bin/env bash
# Anima los cuadros aprobados con Kling 3.0 Pro: 5 s, 9:16, con sonido. 12.5 créditos por toma.
# Uso: ./tomas.sh           todas
#      ./tomas.sh 02 05     solo esas
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p tomas

REAL="Real-time speed, no slow motion. Photorealistic documentary footage, natural film grain. No text, no graphics, no glow, no faces."

movimiento() {
  case "$1" in
    01) echo "Fast handheld push-in toward the black smartphone lying face down on the steel counter while focus pulls from the metal shutter in the background to the phone. The phone vibrates in short buzzing pulses, rattling slightly against the steel. Everything else in the fonda stays still. Sound: a phone buzzing hard on stainless steel, fluorescent tube hum." ;;
    02) echo "The hand pulls the white nitrile glove off in one quick tug. Focus then shifts to the beige desk telephone in the background, whose small red light blinks while it rings. Subtle handheld camera. Sound: glove snap, an office desk phone ringing in an empty room." ;;
    03) echo "The hand drops the steel scissors onto the wooden station and withdraws out of frame. The black smartphone next to them vibrates in short buzzing pulses. Slight handheld drift toward the phone. Sound: scissors clattering on wood, a phone buzzing on wood." ;;
    04) echo "The hand clicks the desk lamp off and the office falls into darkness, lit only by cold street light through the blinds. On the desk the smartphone keeps vibrating in short pulses. Nearly locked camera with a very slight push-in. Sound: lamp switch click, a phone buzzing on paper." ;;
    05) echo "The hands shove the metal roll-up shutter up in one strong movement, rattling loudly, and cold morning daylight floods into the fonda across the floor. The camera tilts up and rises with the shutter. Sound: a metal roll-up shutter rattling open, early street ambience." ;;
    06) echo "Locked top-down overhead camera with a very slow push-in. The hand lifts the clay cup of coffee off the counter and out of frame. The smartphone stays perfectly still and flat and its screen stays black. Sound: quiet morning room tone, a ceramic cup lifted from steel." ;;
  esac
}

IDS="${*:-01 02 03 04 05 06}"
for id in $IDS; do
  higgsfield generate create kling3_0 --mode pro --duration 5 --aspect_ratio 9:16 --sound on \
    --start-image "cuadros/$id-1.png" \
    --prompt "$(movimiento "$id") ${REAL}" \
    --wait --wait-timeout 20m --json > "tomas/$id.json" &
done
wait

for id in $IDS; do
  url=$(jq -r '.[0].result_url' "tomas/$id.json")
  curl -sL "$url" -o "tomas/$id.mp4"
  echo "$id $url"
done
