#!/usr/bin/env bash
# Spot «La cita quedó escrita». Consultorio cerrado, llamada fuera de horario, cita confirmada.
# Uso: ./generar.sh k0 | previa | final
# Créditos: k0 ≈ 2 · previa 480p ≈ 37.5 · final 1080p ≈ 135. Cierre de marca en Remotion, no aquí.
set -euo pipefail
cd "$(dirname "$0")"

ESTILO="Photorealistic still from a restrained institutional commercial, shot on an ARRI Alexa 35 with a 35mm lens at f/4, subtle film texture. A real contemporary private medical clinic in Monterrey, Mexico, after business hours: a space people actually use, natural materials, slight everyday wear. Deep ink-blue shadows, bone-white surfaces, steel-gray details, one very restrained cobalt-blue accent and one small brass detail. Rectilinear architecture, level camera, balanced negative space, realistic practical lighting. Vertical 9:16; the bottom third of the frame is calm. No people, no text, no logos, no readable screens, no glow, no neon, no lens flare."

PLANO="One continuous 15-second shot, no cuts, driven by sound and camera. Hook, 0-3 s: near-black frame of an empty private medical clinic reception after closing; a black desk telephone on the counter rings sharply and the sound cuts the silence. Second ring: a low, fast push-in on a dolly toward the telephone, the practical desk lamp raking across it. 3-6 s: the ring stops mid-tone as the call is answered automatically; a single small square blue status light on the phone switches on and the camera settles, tight on the handset, shallow depth of field. 6-10 s: a quick, precise rack focus and a short lateral dolly to the computer monitor beside the phone; a clean dark calendar interface made only of simple geometric shapes; one pending slot snaps to confirmed and a small green square locks into place with a soft click. 10-15 s: the camera holds completely still, all sound effects stop, the room is silent. Then a male voice-over speaks, the only voice in the video, in clear neutral Mexican Spanish, slow, warm, close to the microphone, every syllable articulated, with a short pause between the two sentences. He says exactly, in Spanish: \"Dimia trabaja cuando usted no está.\" (pause) \"La cita ya quedó agendada.\" Nothing plays under the voice; the voice must be loud, clean and fully intelligible and must finish before the video ends. Sound before the voice: sharp desk phone ringing, the pick-up click, the calendar click, quiet room tone. No music. Photorealistic institutional cinematography, ARRI Alexa 35, 35mm to 50mm, decisive but smooth camera moves, no camera shake, no crash zoom. No on-screen text, no subtitles, no readable text on the monitor, no robots, no holograms, no glowing circuits, no floating graphics, no rounded interfaces, no people."

bajar() { curl -sL "$(jq -r '(if type=="array" then .[0] else . end) | .result_url' "$1")" -o "$2"; echo "$2"; }

case "${1:-}" in
  k0)
    higgsfield generate create nano_banana_pro --aspect_ratio 9:16 --resolution 2k --wait --json \
      --prompt "Wide shot, eye level, of the empty reception of a private medical clinic at night, closed. A long bone-white reception counter with a black office desk telephone and a dark computer monitor turned off, a steel-gray chair behind it, a narrow brass door handle on a closed consulting-room door in the background. Most lights are off; one desk lamp and a strip of ceiling light remain on. ${ESTILO}" \
      > cuadros/k0.json
    bajar cuadros/k0.json cuadros/k0.png ;;
  previa|final)
    res=$([ "$1" = final ] && echo 1080p || echo 480p)
    id=$(higgsfield generate create cinematic_studio_video_4_0 --mode omni_reference \
      --start-image cuadros/k0.png \
      --duration 15 --resolution "$res" --aspect_ratio 9:16 --generate_audio true \
      --prompt "$PLANO" --json | jq -r '.[0] | if type=="object" then .id else . end')
    echo "$id" > "tomas/$1.id"
    for intento in 1 2 3 4 5; do
      higgsfield generate wait "$id" --timeout 30m --interval 10s --quiet --json > "tomas/$1.json" && break
      echo "espera interrumpida (intento $intento), reintento en 30 s" >&2; sleep 30
    done
    bajar "tomas/$1.json" "tomas/$1.mp4" ;;
  *) echo "Uso: $0 k0 | previa | final" >&2; exit 1 ;;
esac
