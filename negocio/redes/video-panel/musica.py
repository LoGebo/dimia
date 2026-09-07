"""Cama ambiental original para el video del panel.

Se genera, no se descarga: así no hay licencia de terceros que perseguir.
Pad de cuerdas sintéticas sobre una vuelta de cuatro acordes, sin percusión.

    python3 musica.py            # escribe cama.wav en esta carpeta

Después se remezcla con la locución en `audio.sh`.
"""

import math
import random
import struct
import wave
from array import array
from pathlib import Path

SR = 22050  # ffmpeg lo sube a 44.1 kHz; el pad no tiene nada arriba de 8 kHz
DURACION = 44.5
COMPAS = DURACION / 8

# Am9 · Fmaj7 · Cmaj7 · G6, dos vueltas. Todo diatónico a do mayor.
VUELTA = [
    [110.00, 164.81, 220.00, 261.63, 493.88],
    [87.31, 130.81, 220.00, 329.63],
    [130.81, 196.00, 329.63, 493.88],
    [98.00, 146.83, 246.94, 329.63],
]
ACORDES = VUELTA + VUELTA

ATAQUE = 0.8
CAIDA = 1.6


def envolvente(t: float, largo: float) -> float:
    """Entra despacio y suelta encima del acorde siguiente."""
    if t < ATAQUE:
        x = t / ATAQUE
        return x * x * (3 - 2 * x)
    if t > largo - CAIDA:
        x = (largo - t) / CAIDA
        if x < 0:
            return 0.0
        return x * x * (3 - 2 * x)
    return 1.0


def main() -> None:
    n = int(SR * DURACION)
    izq = [0.0] * n
    der = [0.0] * n
    aleatorio = random.Random(7)

    for indice, acorde in enumerate(ACORDES):
        inicio = indice * COMPAS
        largo = COMPAS + CAIDA  # se encima con el siguiente
        desde = int(inicio * SR)
        hasta = min(n, int((inicio + largo) * SR))

        for voz, frecuencia in enumerate(acorde):
            # Cada voz se desafina un pelo: el pad respira en vez de zumbar.
            desafine = (aleatorio.random() - 0.5) * 0.30
            f1 = frecuencia + desafine
            f2 = frecuencia - desafine
            peso = 1.0 / (1.0 + voz * 0.55)  # los graves mandan
            pan = 0.5 + (voz - (len(acorde) - 1) / 2) * 0.16
            pan = min(0.86, max(0.14, pan))

            paso1 = 2 * math.pi * f1 / SR
            paso2 = 2 * math.pi * f2 / SR
            paso3 = 2 * math.pi * (frecuencia * 3) / SR
            fase1 = aleatorio.random() * math.tau
            fase2 = aleatorio.random() * math.tau
            fase3 = aleatorio.random() * math.tau

            for i in range(desde, hasta):
                t = i / SR - inicio
                env = envolvente(t, largo)
                if env <= 0.0:
                    continue
                a1 = fase1 + paso1 * (i - desde)
                a2 = fase2 + paso2 * (i - desde)
                a3 = fase3 + paso3 * (i - desde)
                s = (math.sin(a1) + math.sin(a2)) * 0.5 + math.sin(a3) * 0.06
                s *= env * peso
                izq[i] += s * (1 - pan)
                der[i] += s * pan

    # Aire: ruido filtrado muy abajo, para que el pad no suene a sintetizador pelón.
    estado = 0.0
    for i in range(n):
        estado += 0.0016 * ((aleatorio.random() - 0.5) * 2 - estado * 0.5)
        izq[i] += estado
        der[i] += estado * 0.92

    # Un polo pasa-bajos: quita el filo de las sinusoidales.
    def suavizar(canal: list[float], corte: float) -> None:
        a = math.exp(-2 * math.pi * corte / SR)
        previo = 0.0
        for i in range(n):
            previo = canal[i] * (1 - a) + previo * a
            canal[i] = previo

    suavizar(izq, 1400.0)
    suavizar(der, 1350.0)

    # Respiración lenta de todo el conjunto, y entrada y salida largas.
    for i in range(n):
        t = i / SR
        lfo = 1.0 + 0.09 * math.sin(2 * math.pi * 0.055 * t + 1.1)
        entrada = min(1.0, t / 1.0)
        salida = min(1.0, (DURACION - t) / 2.5)
        g = lfo * entrada * max(0.0, salida)
        izq[i] *= g
        der[i] *= g

    pico = max(max(abs(v) for v in izq), max(abs(v) for v in der)) or 1.0
    escala = 0.72 / pico

    datos = array("h")
    for i in range(n):
        datos.append(int(max(-1.0, min(1.0, izq[i] * escala)) * 32767))
        datos.append(int(max(-1.0, min(1.0, der[i] * escala)) * 32767))

    destino = Path(__file__).with_name("cama.wav")
    with wave.open(str(destino), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(datos.tobytes())
    print(f"{destino} · {DURACION:.1f} s")


if __name__ == "__main__":
    main()
