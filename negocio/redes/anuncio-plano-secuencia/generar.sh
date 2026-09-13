#!/usr/bin/env bash
# Spot «La torre no cierra». Cada paso deja su .json con la result_url y el binario.
# Uso: ./generar.sh personaje | k0 | k1 | previa | final
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p cuadros tomas

ESTILO="Photorealistic still from a premium real estate TV commercial, shot on an ARRI Alexa 35 with an anamorphic 40mm lens, shallow depth of field, subtle film grain. Restrained and elegant but real: natural skin texture, real materials, an immaculate corporate space that people actually use. Color: deep blue-black ink shadows, cool city light, dim warm brass practical accents, desaturated. Vertical 9:16. Key subjects between 15% and 60% of the frame height; the bottom third of the frame is calm. No text, no logos, no readable screens, no glow, no lens flare."

PLANO="One continuous uninterrupted crane shot with no cuts. It begins close on the ringing desk phone in the foreground of the dark lobby at night while the woman in the navy suit walks away toward the elevators. The camera slowly lifts off the phone and glides forward past the illuminated architectural scale model of the tower, rising gently. Through the floor-to-ceiling windows the night city turns smoothly into sunrise while the camera keeps moving, and daylight fills the lobby. The camera settles on the same woman the next morning greeting a couple at the scale model, showing them a tablet, and they shake hands. Photorealistic premium commercial, ARRI Alexa 35, anamorphic lens, elegant slow camera, natural performances, nobody looks at the camera. Sound: a desk phone ringing in an empty lobby that fades away, soft city ambience, then warm morning lobby ambience with quiet footsteps. No music, no voice, no text."

bajar() { # $1 json  $2 destino
  curl -sL "$(jq -r '.[0].result_url' "$1")" -o "$2"
  echo "$2"
}

case "${1:-}" in
  personaje)
    higgsfield generate create nano_banana_pro --aspect_ratio 3:2 --resolution 2k --wait --json \
      --prompt "Character reference sheet in documentary photo realism: a Mexican woman in her mid-thirties, a real estate sales executive. Shoulder-length dark brown hair tied low, light olive skin, minimal makeup, small gold earrings, tailored navy blue suit over a white shirt, no logo. Three views side by side on a plain warm gray studio background: front, three-quarter and profile. Soft natural light, 50mm, real skin texture, calm confident expression. No text, no labels." \
      > cuadros/ejecutiva.json
    bajar cuadros/ejecutiva.json cuadros/ejecutiva.png ;;
  k0)
    higgsfield generate create nano_banana_pro --aspect_ratio 9:16 --resolution 2k --wait --json \
      --image-references cuadros/ejecutiva.png \
      --prompt "Night, 8:14 pm, the double-height lobby and sales gallery of a luxury residential tower developer in Santa Fe, Mexico City. Travertine floors and walls, floor-to-ceiling windows with the city towers at night. In the sharp foreground, on a travertine reception desk, a black office desk phone with its small display lit, ringing. In the middle ground, an illuminated architectural scale model of a glass residential tower on a pedestal. In the background, the woman from the reference image, in her navy suit with a laptop bag on her shoulder, walking away toward the elevators, seen from behind at a three-quarter angle. Most lights are already off. ${ESTILO}" \
      > cuadros/k0.json
    bajar cuadros/k0.json cuadros/k0.png ;;
  k1)
    higgsfield generate create nano_banana_pro --aspect_ratio 9:16 --resolution 2k --wait --json \
      --image-references cuadros/ejecutiva.png --image-references cuadros/k0.png \
      --prompt "The next morning, 9:58 am, the same lobby and sales gallery as the second reference image, now filled with soft daylight from the floor-to-ceiling windows, the city towers in clear morning light. The woman from the first reference image, same navy suit, stands at the same illuminated architectural scale model greeting a well-dressed Mexican couple in their forties, showing them a tablet whose screen faces away from the camera. Natural professional expressions, nobody looks at the camera. The camera is higher and closer to the scale model than in the second reference, as if it had risen and glided forward. ${ESTILO}" \
      > cuadros/k1.json
    bajar cuadros/k1.json cuadros/k1.png ;;
  previa|final)
    res=$([ "$1" = final ] && echo 1080p || echo 480p)
    higgsfield generate create cinematic_studio_video_4_0 --mode omni_reference \
      --start-image cuadros/k0.png --end-image cuadros/k1.png \
      --duration 15 --resolution "$res" --aspect_ratio 9:16 --generate_audio true \
      --prompt "$PLANO" --wait --wait-timeout 30m --json > "tomas/$1.json"
    bajar "tomas/$1.json" "tomas/$1.mp4" ;;
  *)
    echo "Uso: $0 personaje | k0 | k1 | previa | final" >&2; exit 1 ;;
esac
