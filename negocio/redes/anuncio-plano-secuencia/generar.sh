#!/usr/bin/env bash
# Spot «La torre no cierra». Cada paso deja su .json con la result_url y el binario.
# Uso: ./generar.sh personaje | k0 | k1 | previa | final
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p cuadros tomas

ESTILO="Photorealistic still from a premium real estate TV commercial, shot on an ARRI Alexa 35 with an anamorphic 40mm lens, shallow depth of field, subtle film grain. Restrained and elegant but real: natural skin texture, real materials, an immaculate corporate space that people actually use. Color: deep blue-black ink shadows, cool city light, dim warm brass practical accents, desaturated. Vertical 9:16. Key subjects between 15% and 60% of the frame height; the bottom third of the frame is calm. No text, no logos, no readable screens, no glow, no lens flare."

# Versión 2: cámara fija en time-lapse. La primera previa, con grúa, fundió noche y mañana
# en una disolvencia; con el mismo encuadre en ambos cuadros el paso del tiempo es el plano.
PLANO="Locked-off static camera on a tripod: one continuous time-lapse shot with no camera movement and no cuts. In the foreground the black desk phone rings at night in the dark lobby while the woman in the navy suit walks away toward the elevators. Then time passes quickly: the city lights outside fade, the night sky turns to dawn and then to bright morning, and warm sunlight sweeps across the travertine floor, with only brief time-lapse traces of people passing. In the final seconds time slows back to real time: the same woman greets a couple at the illuminated scale model, shows them a tablet, and they shake hands. Photorealistic premium commercial, ARRI Alexa 35, anamorphic lens, natural performances, nobody looks at the camera. Sound: a desk phone ringing in an empty lobby that fades away, a soft time-lapse city hum, then warm morning lobby ambience with quiet footsteps. No music, no voice, no text."

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
      --image-references cuadros/k0.png --image-references cuadros/ejecutiva.png --image-references cuadros/k1-v2.png \
      --prompt "Use the first reference image as the exact frame: keep the identical camera position, lens, framing, architecture, travertine reception desk and the black desk phone in the foreground, its display now off. Change the time to the next morning, 9:58 am: warm golden sunlight pours through the floor-to-ceiling windows, clear sky and sunlit towers outside, soft sun shafts across the floor. At the illuminated scale model in the middle ground, the woman from the second reference image, same navy suit and no bag, greets the couple from the third reference image, showing them a tablet whose screen faces away; they are about to shake hands. Natural expressions, nobody looks at the camera. ${ESTILO}" \
      > cuadros/k1.json
    bajar cuadros/k1.json cuadros/k1.png ;;
  previa|final)
    res=$([ "$1" = final ] && echo 1080p || echo 480p)
    # Se crea sin esperar y se guarda el ID: si la API responde 503 durante la espera,
    # el trabajo sigue vivo y se retoma con `generate wait` sin volver a cobrar.
    id=$(higgsfield generate create cinematic_studio_video_4_0 --mode omni_reference \
      --start-image cuadros/k0.png --end-image cuadros/k1.png \
      --duration 15 --resolution "$res" --aspect_ratio 9:16 --generate_audio true \
      --prompt "$PLANO" --json | jq -r '(if type=="array" then .[0] else . end) | .id')
    echo "$id" > "tomas/$1.id"
    for intento in 1 2 3 4 5; do
      higgsfield generate wait "$id" --timeout 30m --interval 10s --quiet --json > "tomas/$1.json" && break
      echo "espera interrumpida (intento $intento), reintento en 30 s" >&2; sleep 30
    done
    curl -sL "$(jq -r '(if type=="array" then .[0] else . end) | .result_url' "tomas/$1.json")" -o "tomas/$1.mp4"
    echo "tomas/$1.mp4" ;;
  *)
    echo "Uso: $0 personaje | k0 | k1 | previa | final" >&2; exit 1 ;;
esac
