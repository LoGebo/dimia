#!/usr/bin/env bash
# Genera los cuadros fijos del anuncio con GPT Image 2.5.
# Uso: ./cuadros.sh            todos
#      ./cuadros.sh 01 05      solo esos
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p cuadros

ESTILO="Vertical 9:16 still frame from a premium cinematic TV commercial. 35mm lens, shallow depth of field, natural film grain, low-key practical lighting. Color grade: shadows crushed to a deep blue-black ink (#0b0f17), cool steel-blue ambient light, exactly one small warm brass-colored (#c8a45c) practical lamp. Desaturated and restrained. Key subject placed between 15% and 55% of the frame height; the bottom third of the frame is calm dark negative space. No human faces, only hands when people appear. No readable text, no logos, no screen content, no glow, no particles, no lens flare, no hologram, no teal-and-orange grade."

prompt() {
  case "$1" in
    01) echo "A small closed Mexican restaurant at night. Close-up looking along the counter: a black smartphone lies face down on a brushed zinc bar counter, placed in the middle of the frame, vibrating, a thin line of cold light leaking from under its edges onto the metal. Behind it, out of focus, wooden chairs stacked upside down on tables, a half-lowered corrugated metal roll-up shutter at the entrance with blue street light coming through." ;;
    02) echo "A small dental clinic after hours, lights off. Close-up of a pair of hands peeling off white nitrile gloves over a stainless steel tray. In the background, softly out of focus on the reception desk, a black desk telephone with one small light blinking. Silhouette of a dental chair, cool light through a frosted window." ;;
    03) echo "A neighborhood hair salon closed at night. Close-up of a hand setting down a pair of steel scissors on a black stone station counter in front of a large mirror. Next to the scissors a black smartphone lies face down, vibrating, cold light leaking from its edges. The mirror reflects empty salon chairs in darkness." ;;
    04) echo "A small law office at night. Close-up of a hand reaching to switch off a brass desk lamp. On the wooden desk, beside stacked paper folders, a black smartphone lies face down, vibrating, cold light leaking from its edges. Venetian blinds cast stripes of blue street light across the desk." ;;
    05) echo "Early morning, pale blue dawn, the same small Mexican restaurant. Low angle from inside: two hands lifting a corrugated metal roll-up shutter halfway, soft daylight spilling across a tiled floor and the legs of stacked chairs." ;;
    06) echo "Early morning inside the restaurant. Locked-off overhead top-down shot of a dark wooden table: a black smartphone lying face up, perfectly flat and centered, its screen completely flat matte black with no reflection and no content. Beside it a clay cup of café de olla with steam and a hand resting near the cup. Soft window daylight." ;;
  esac
}

IDS="${*:-01 02 03 04 05 06}"
for id in $IDS; do
  higgsfield generate create gpt_image_2_5 \
    --prompt "$(prompt "$id") ${ESTILO}" \
    --aspect_ratio 9:16 --resolution 2k --quality high \
    --wait --json > "cuadros/$id.json" &
done
wait

for id in $IDS; do
  url=$(jq -r '.[0].result_url' "cuadros/$id.json")
  curl -sL "$url" -o "cuadros/$id.png"
  echo "$id $url"
done
