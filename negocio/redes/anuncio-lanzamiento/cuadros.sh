#!/usr/bin/env bash
# Genera los cuadros fijos del anuncio con Nano Banana Pro, en registro documental.
# Uso: ./cuadros.sh               todos, una variante
#      VARIANTES=3 ./cuadros.sh 02  tres variantes del 02
# La primera versión (GPT Image 2.5, look pulido) quedó en cuadros/v1-pulido/.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p cuadros

ESTILO="Documentary photograph, available light only, unstaged and lived-in, like a still from a Mexican independent film. Shot on 35mm film, slightly imperfect handheld framing, real film grain, muted desaturated colors, deep blue-black shadows and cool night tones; any warm light is dim tungsten, never decorative. Real wear, dust, scratches and fingerprints. Hands, when present, look like real working hands and no face is ever visible. Key subject in the middle of the frame; the bottom third of the frame is dark and quiet. No motion lines, no graphic symbols, no readable text, no logos, no screen content, no glow, no lens flare."

prompt() {
  case "$1" in
    01) echo "A small family-run fonda in Mexico City right after closing, around nine at night. On a worn, scratched stainless steel counter: a damp rag, a plastic napkin holder, a squeeze bottle of salsa, a paper order pad with a ballpoint pen. A cheap black smartphone in a scuffed case lies face down among these things, buzzing. Behind, out of focus, chairs stacked on tables, a mop in a bucket, one fluorescent tube still on in the kitchen, and a half-lowered metal roll-up shutter with cold white street light coming through. No people." ;;
    02) echo "A small dental office in a Mexican neighborhood after the last patient, lights mostly off. Close-up of a dentist's tired hands, with a wedding ring and a wristwatch, peeling off a white nitrile glove over a stainless steel tray with used instruments and cotton rolls. Behind, out of focus, the reception desk with a beige office desk telephone whose small red line light is lit, a paper appointment book, a pharmacy wall calendar, and a dental chair covered in plastic film." ;;
    03) echo "A neighborhood beauty salon in Mexico after closing. Close-up of a stylist's hand with chipped nail polish setting down steel scissors on a cluttered station: a comb in a jar of disinfectant, hair clips, a spray bottle, a hair dryer with its tangled cable, loose cut hair on the counter. A black smartphone in a worn clear case lies face down beside the scissors, buzzing. The mirror behind reflects the dim empty salon and a broom leaning on a chair." ;;
    04) echo "A small, cramped accounting office in Mexico at night. Close-up of a man's hand, shirt sleeve rolled up, reaching to switch off an old desk lamp. On the desk: stacked folders with sticky notes, a printing calculator with its paper roll, a mug of cold coffee, reading glasses. A black smartphone lies face down among the papers, buzzing. Cheap vertical blinds with cold street light behind." ;;
    05) echo "Early morning, pale blue dawn on a Mexico City street. From inside the same small fonda, low angle: two real hands in a worn sweater lifting a dented corrugated metal roll-up shutter halfway, cold daylight spilling across a scuffed tiled floor, chairs still stacked on tables, a gray street and a parked car outside. No face visible." ;;
    06) echo "Early morning in the small fonda. Straight top-down overhead shot of a scratched stainless steel counter: a black smartphone lying face up, flat and centered, its screen switched off and completely black. Next to it a clay cup of café de olla, a plastic bag of bolillos, a ring of keys, and a hand reaching for the cup. Soft cold window daylight." ;;
  esac
}

IDS="${*:-01 02 03 04 05 06}"
VARIANTES="${VARIANTES:-1}"
for id in $IDS; do
  for v in $(seq 1 "$VARIANTES"); do
    higgsfield generate create nano_banana_pro \
      --prompt "$(prompt "$id") ${ESTILO}" \
      --aspect_ratio 9:16 --resolution 2k \
      --wait --json > "cuadros/$id-$v.json" &
  done
done
wait

for id in $IDS; do
  for v in $(seq 1 "$VARIANTES"); do
    url=$(jq -r '.[0].result_url' "cuadros/$id-$v.json")
    curl -sL "$url" -o "cuadros/$id-$v.png"
    echo "$id-$v $url"
  done
done
