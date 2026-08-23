"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { Acciones, Transcripcion, type Accion, type Turno } from "@/components/prueba-transcripcion";
import { CarritoVivo, LlamadasRegistradas, ReservasVivas } from "@/components/prueba-panel";
import { Aviso, Boton, Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { estadoPrueba, type EstadoPrueba } from "@/lib/acciones";

type Fase = "listo" | "conectando" | "en_llamada";

export function ConsolaPrueba({
  tenantId,
  nombre,
  vertical,
  zona,
  saludo,
}: {
  tenantId: string;
  nombre: string;
  vertical: string;
  zona: string;
  saludo: string;
}) {
  const [fase, setFase] = useState<Fase>("listo");
  const [error, setError] = useState<string | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [acciones, setAcciones] = useState<Accion[]>([]);
  const [latencias, setLatencias] = useState<number[]>([]);
  const [necesitaDesbloqueo, setNecesitaDesbloqueo] = useState(false);
  const [microActivo, setMicroActivo] = useState(true);
  const [avisoMicro, setAvisoMicro] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoPrueba | null>(null);
  const [nivelMicro, setNivelMicro] = useState(0);

  const sala = useRef<Room | null>(null);
  const audios = useRef<HTMLDivElement>(null);
  const inicioTurno = useRef<number | null>(null);
  const esperando = useRef(false);
  const previo = useRef<EstadoPrueba | null>(null);
  const medidor = useRef<{ contexto: AudioContext; flujo: MediaStream } | null>(null);

  const anotar = useCallback((texto: string) => {
    setAcciones((lista) => [
      ...lista,
      { id: `${Date.now()}-${texto}-${lista.length}`, texto, momento: Date.now() },
    ]);
  }, []);

  const refrescar = useCallback(async () => {
    const nuevo = await estadoPrueba(30).catch(() => null);
    if (!nuevo) return;
    detectarAcciones(previo.current, nuevo, anotar);
    previo.current = nuevo;
    setEstado(nuevo);
  }, [anotar]);

  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  useEffect(() => {
    if (fase !== "en_llamada") return;
    const reloj = setInterval(() => void refrescar(), 2000);
    return () => clearInterval(reloj);
  }, [fase, refrescar]);

  function desbloquear() {
    void sala.current?.startAudio();
    audios.current?.querySelectorAll("audio").forEach((a) => void a.play().catch(() => undefined));
    setNecesitaDesbloqueo(false);
  }

  function detenerMedidor() {
    medidor.current?.flujo.getTracks().forEach((p) => p.stop());
    void medidor.current?.contexto.close();
    medidor.current = null;
    setNivelMicro(0);
  }

  async function abrirMicrofono(): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia) {
      setAvisoMicro("Este navegador no permite usar el micrófono. Prueba en Chrome.");
      return null;
    }
    try {
      const flujo = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const [primera] = flujo.getAudioTracks();
      if (!primera || primera.readyState !== "live") {
        setAvisoMicro("El micrófono abrió pero no entrega audio. Revisa el de entrada en Ajustes del sistema.");
        return null;
      }

      const contexto = new AudioContext();
      const analizador = contexto.createAnalyser();
      analizador.fftSize = 512;
      contexto.createMediaStreamSource(flujo).connect(analizador);
      const muestras = new Uint8Array(analizador.frequencyBinCount);
      medidor.current = { contexto, flujo };

      const medir = () => {
        if (!medidor.current) return;
        analizador.getByteTimeDomainData(muestras);
        let pico = 0;
        for (const m of muestras) pico = Math.max(pico, Math.abs(m - 128));
        setNivelMicro(Math.min(1, pico / 60));
        requestAnimationFrame(medir);
      };
      requestAnimationFrame(medir);

      setAvisoMicro(null);
      return flujo;
    } catch (falla) {
      const nombre = falla instanceof DOMException ? falla.name : "";
      setAvisoMicro(
        nombre === "NotAllowedError"
          ? "El navegador bloqueó el micrófono. Dale permiso en el candado de la barra de direcciones y vuelve a llamar."
          : nombre === "NotFoundError"
            ? "No se encontró micrófono. Revisa el dispositivo de entrada en Ajustes del sistema."
            : "No se pudo abrir el micrófono. Ciérralo en otras apps (Zoom, Meet) y vuelve a intentar.",
      );
      return null;
    }
  }

  async function llamar() {
    const flujoMicro = await abrirMicrofono();
    setError(null);
    setTurnos([]);
    setAcciones([]);
    setLatencias([]);
    setAvisoMicro(null);
    setFase("conectando");

    try {
      const respuesta = await fetch("/api/prueba/token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(mensajeDeError(datos));

      const { Room: Cuarto, RoomEvent, Track } = await import("livekit-client");
      const cuarto = new Cuarto({ adaptiveStream: true, dynacast: true });
      sala.current = cuarto;

      cuarto.on(RoomEvent.TrackSubscribed, (pista) => {
        if (pista.kind !== Track.Kind.Audio) return;
        const elemento = pista.attach() as HTMLAudioElement;
        elemento.autoplay = true;
        elemento.setAttribute("playsinline", "");
        audios.current?.appendChild(elemento);
        elemento.play().catch(() => setNecesitaDesbloqueo(true));
      });

      cuarto.on(RoomEvent.TrackUnsubscribed, (pista) => {
        pista.detach().forEach((elemento) => elemento.remove());
      });

      cuarto.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setNecesitaDesbloqueo(!cuarto.canPlaybackAudio);
      });

      cuarto.on(RoomEvent.ParticipantConnected, () => anotar("El agente entró a la llamada"));

      cuarto.on(RoomEvent.TranscriptionReceived, (segmentos, participante) => {
        const esTuyo = participante?.isLocal ?? false;
        for (const segmento of segmentos) {
          if (esTuyo && segmento.final) {
            inicioTurno.current = performance.now();
            esperando.current = true;
          }
          if (!esTuyo && esperando.current && inicioTurno.current !== null) {
            const espera = Math.round(performance.now() - inicioTurno.current);
            esperando.current = false;
            setLatencias((lista) => [...lista, espera]);
          }
          setTurnos((lista) => mezclarTurno(lista, segmento, esTuyo));
        }
      });

      cuarto.on(RoomEvent.Disconnected, () => {
        audios.current?.replaceChildren();
        detenerMedidor();
        setFase("listo");
        setNecesitaDesbloqueo(false);
        anotar("Llamada terminada");
        setTimeout(() => void refrescar(), 1500);
        setTimeout(() => void refrescar(), 5000);
      });

      await cuarto.connect(datos.url, datos.token);
      await cuarto.startAudio().catch(() => setNecesitaDesbloqueo(true));
      if (!cuarto.canPlaybackAudio) setNecesitaDesbloqueo(true);
      setFase("en_llamada");
      anotar("Llamada abierta");

      const pistaMicro = flujoMicro?.getAudioTracks()[0];
      if (pistaMicro) {
        await cuarto.localParticipant.publishTrack(pistaMicro, {
          source: Track.Source.Microphone,
        });
        setMicroActivo(true);
        anotar("Micrófono publicado");
      } else {
        setMicroActivo(false);
      }
    } catch (falla) {
      setFase("listo");
      setError(falla instanceof Error ? falla.message : "No se pudo conectar.");
      sala.current?.disconnect();
      sala.current = null;
    }
  }

  function colgar() {
    void sala.current?.disconnect();
    sala.current = null;
  }

  async function alternarMicro() {
    const cuarto = sala.current;
    if (!cuarto) return;
    const siguiente = !microActivo;
    medidor.current?.flujo.getAudioTracks().forEach((p) => (p.enabled = siguiente));
    await cuarto.localParticipant.setMicrophoneEnabled(siguiente);
    setMicroActivo(siguiente);
  }

  const ultima = latencias.at(-1) ?? null;
  const mediana = calcularMediana(latencias);
  const enLlamada = fase === "en_llamada";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <Tarjeta>
          <div className="flex flex-wrap items-center gap-3 px-4 py-4">
            <Boton
              variante={enLlamada ? "peligro" : "solido"}
              onClick={enLlamada ? colgar : () => void llamar()}
              disabled={fase === "conectando"}
              className="h-10 px-5 text-[14px]"
            >
              {fase === "conectando" ? "Conectando…" : enLlamada ? "Colgar" : "Llamar al agente"}
            </Boton>

            {enLlamada ? (
              <>
                <Boton onClick={() => void alternarMicro()} className="h-10">
                  {microActivo ? "Silenciar micrófono" : "Reactivar micrófono"}
                </Boton>
                <div
                  className="flex items-center gap-2"
                  title={microActivo ? "Nivel de tu micrófono" : "Micrófono silenciado"}
                >
                  <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                    tu voz
                  </span>
                  <div className="flex h-6 items-end gap-[3px]">
                    {[0.08, 0.2, 0.35, 0.5, 0.68, 0.85].map((umbral) => (
                      <span
                        key={umbral}
                        className={`w-[4px] rounded-sm transition-colors ${
                          microActivo && nivelMicro >= umbral
                            ? "bg-emerald-400"
                            : "bg-neutral-700"
                        }`}
                        style={{ height: `${8 + umbral * 16}px` }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {necesitaDesbloqueo ? (
              <Boton variante="solido" onClick={desbloquear} className="h-10">
                Activar audio
              </Boton>
            ) : null}

            <div className="ml-auto flex items-center gap-3">
              {enLlamada ? <Insignia tono="bueno">En llamada</Insignia> : null}
              <div className="text-right">
                <p className="etiqueta">Último turno</p>
                <p className="numeros text-[15px] font-semibold text-tinta">
                  {ultima === null ? "—" : `${ultima} ms`}
                </p>
              </div>
              <div className="text-right">
                <p className="etiqueta">Mediana</p>
                <p className="numeros text-[15px] font-semibold text-tinta">
                  {mediana === null ? "—" : `${mediana} ms`}
                </p>
              </div>
            </div>
          </div>

          {necesitaDesbloqueo ? (
            <div className="px-4 pb-3">
              <Aviso tono="error">
                Tu navegador bloqueó la reproducción automática. Toca “Activar audio” para oír al
                agente. Safari lo bloquea siempre la primera vez.
              </Aviso>
            </div>
          ) : null}

          {avisoMicro ? (
            <div className="px-4 pb-3">
              <Aviso tono="error">{avisoMicro}</Aviso>
            </div>
          ) : null}

          {error ? (
            <div className="px-4 pb-3">
              <Aviso tono="error">{error}</Aviso>
            </div>
          ) : null}

          <p className="border-t border-linea px-4 py-2 text-[11px] text-tinta-3">
            Contesta el mismo agente que atiende tus llamadas reales, con el menú, los horarios y las
            respuestas de {nombre}. Cada prueba consume crédito de las APIs de voz y de modelo:
            úsala para demostrar, no para platicar.
          </p>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera
            titulo="Conversación"
            descripcion={`Arranca con: “${saludo}”`}
          />
          <Transcripcion turnos={turnos} />
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera
            titulo="Lo que hizo el agente"
            descripcion="Cada renglón es un cambio real en la base, no una animación."
          />
          <Acciones acciones={acciones} />
        </Tarjeta>
      </div>

      <div className="space-y-4 xl:sticky xl:top-[76px] xl:self-start">
        <Tarjeta>
          <TarjetaCabecera
            titulo={vertical === "comida" ? "Pedido en curso" : "Reservas de esta prueba"}
            descripcion={vertical === "comida" ? "Leído de Postgres cada dos segundos." : "Creadas en los últimos 30 minutos."}
          />
          {vertical === "comida" ? (
            <CarritoVivo pedido={estado?.pedido ?? null} zona={zona} />
          ) : (
            <ReservasVivas reservas={estado?.reservas ?? []} zona={zona} />
          )}
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Bitácora de la llamada" descripcion="Se escribe al colgar." />
          <LlamadasRegistradas llamadas={estado?.llamadas ?? []} />
        </Tarjeta>
      </div>

      <div ref={audios} className="hidden" />
    </div>
  );
}

function mezclarTurno(
  lista: Turno[],
  segmento: { id: string; text: string; final: boolean },
  esTuyo: boolean,
): Turno[] {
  const quien: Turno["quien"] = esTuyo ? "tu" : "agente";
  const existente = lista.findIndex((t) => t.id === segmento.id);
  const turno: Turno = {
    id: segmento.id,
    quien,
    texto: segmento.text,
    final: segmento.final,
    momento: Date.now(),
  };
  if (existente === -1) return [...lista, turno];
  const copia = [...lista];
  copia[existente] = turno;
  return copia;
}

function calcularMediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  if (ordenados.length % 2 === 1) return ordenados[medio]!;
  return Math.round((ordenados[medio - 1]! + ordenados[medio]!) / 2);
}

function detectarAcciones(
  anterior: EstadoPrueba | null,
  actual: EstadoPrueba,
  anotar: (texto: string) => void,
): void {
  if (!anterior) return;

  const antes = anterior.pedido;
  const ahora = actual.pedido;
  if (ahora && !antes) anotar(`Abrió el pedido ${ahora.codigo}`);
  if (ahora && antes) {
    const previos = contar(antes.items);
    for (const item of ahora.items) {
      const clave = `${item.nombre}·${item.cantidad}·${item.notas ?? ""}`;
      const restante = previos.get(clave) ?? 0;
      if (restante > 0) {
        previos.set(clave, restante - 1);
        continue;
      }
      anotar(`Agregó ${item.cantidad} × ${item.nombre}${item.notas ? ` (${item.notas})` : ""}`);
    }
    if (antes.items.length > ahora.items.length) anotar("Quitó algo del pedido");
    if (antes.estado !== "confirmado" && ahora.estado === "confirmado") {
      anotar(`Cerró el pedido ${ahora.codigo} por ${ahora.total}`);
    }
  }

  const conocidas = new Set(anterior.reservas.map((r) => r.id));
  for (const reserva of actual.reservas) {
    if (!conocidas.has(reserva.id)) anotar(`Reservó ${reserva.servicio} con código ${reserva.codigo}`);
  }

  const registradas = new Set(anterior.llamadas.map((l) => l.call_id));
  for (const llamada of actual.llamadas) {
    if (!registradas.has(llamada.call_id)) anotar("Registró la llamada en la bitácora");
  }
}

function contar(items: { nombre: string; cantidad: number; notas: string | null }[]): Map<string, number> {
  const cuenta = new Map<string, number>();
  for (const item of items) {
    const clave = `${item.nombre}·${item.cantidad}·${item.notas ?? ""}`;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  return cuenta;
}

function mensajeDeError(datos: { error?: string; faltantes?: string[] }): string {
  if (datos.error === "livekit_sin_configurar") {
    return `Faltan variables de entorno: ${(datos.faltantes ?? []).join(", ")}.`;
  }
  if (datos.error === "sin_acceso") return "Tu cuenta no tiene acceso a este negocio.";
  if (datos.error === "sin_sesion") return "Se cerró tu sesión. Vuelve a entrar.";
  return "El servidor no pudo emitir el token de la llamada.";
}
