"use client";

import { useState } from "react";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { AreaTexto, Campo, Entrada } from "@/components/ui/primitivos";
import { crearCampana } from "@/lib/acciones";
import { NOMBRE_TIPO_CAMPANA, type CanalCampana, type TipoCampana } from "@/lib/tipos";

const MENSAJES: Record<TipoCampana, { whatsapp: string; llamada: string; objetivo: string }> = {
  no_show: {
    whatsapp: "{nombre}, en {negocio} te esperábamos y no pudiste venir. ¿Te reagendamos? Responde por aquí y te damos horario.",
    llamada: "La persona tenía cita y no llegó. Pregunta con amabilidad si todo está bien y ofrece reagendar en el horario que le acomode.",
    objetivo: "reagendar la cita",
  },
  inactivos: {
    whatsapp: "{nombre}, hace tiempo que no te vemos en {negocio}. Si quieres agendar, responde por aquí y te apartamos lugar.",
    llamada: "Hace tiempo que no viene. Salúdale de parte del negocio, pregunta si necesita algo y ofrece agendar.",
    objetivo: "agendar una cita",
  },
  recordatorio_pago: {
    whatsapp: "{nombre}, te recordamos que tienes un saldo pendiente con {negocio}. Si ya lo cubriste, ignora este mensaje.",
    llamada: "Tiene un pago pendiente. Recuérdaselo con tacto y pregunta cómo prefiere cubrirlo.",
    objetivo: "acordar el pago",
  },
  resena: {
    whatsapp: "{nombre}, gracias por venir a {negocio}. ¿Cómo te fue del 1 al 5? Responde con el número.",
    llamada: "Vino hace poco. Pregunta cómo le fue y si recomendaría el lugar.",
    objetivo: "obtener una calificación",
  },
  marketing: {
    whatsapp: "{nombre}, en {negocio} tenemos [ promoción ] hasta [ fecha ]. Responde por aquí si te interesa.",
    llamada: "Cuéntale la promoción y pregunta si le interesa agendar.",
    objetivo: "agendar una cita",
  },
  manual: {
    whatsapp: "{nombre}, te escribimos de {negocio}. ",
    llamada: "",
    objetivo: "",
  },
};

export function NuevaCampana({ alcances }: { alcances: Record<string, number> }) {
  const [tipo, setTipo] = useState<TipoCampana>("no_show");
  const [canal, setCanal] = useState<CanalCampana>("whatsapp");
  const [dias, setDias] = useState(30);
  const [mensaje, setMensaje] = useState(MENSAJES.no_show.whatsapp);
  const [objetivo, setObjetivo] = useState(MENSAJES.no_show.objetivo);

  function cambiar(t: TipoCampana, c: CanalCampana) {
    setTipo(t);
    setCanal(c);
    setMensaje(MENSAJES[t][c]);
    setObjetivo(MENSAJES[t].objetivo);
    if (t === "inactivos" && dias < 60) setDias(90);
  }

  const alcance = alcances[tipo];

  return (
    <Formulario accion={crearCampana} className="space-y-5">
      <Campo etiqueta="Nombre de la campaña">
        <Entrada name="nombre" required placeholder="Recuperar faltas de agosto" autoFocus />
      </Campo>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-tinta-2">A quién</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(NOMBRE_TIPO_CAMPANA) as TipoCampana[]).map((t) => (
            <label key={t} className="cursor-pointer border border-linea bg-panel px-3 py-2.5 transition has-checked:border-acento has-checked:bg-acento-suave">
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => cambiar(t, canal)} className="sr-only" />
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-tinta">{NOMBRE_TIPO_CAMPANA[t].nombre}</span>
                {alcances[t] !== undefined ? (
                  <span className="numeros bg-panel-2 px-1.5 font-mono text-[11px] text-tinta-2">{alcances[t]}</span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] text-tinta-3">{NOMBRE_TIPO_CAMPANA[t].detalle}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {tipo === "no_show" || tipo === "inactivos" ? (
        <Campo etiqueta={tipo === "no_show" ? "Faltas de los últimos (días)" : "Sin venir desde hace (días)"}>
          <Entrada name="dias" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(Number(e.target.value) || 30)} className="w-32" />
        </Campo>
      ) : (
        <input type="hidden" name="dias" value={dias} />
      )}

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-tinta-2">Por dónde</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["whatsapp", "llamada"] as CanalCampana[]).map((c) => (
            <label key={c} className="cursor-pointer border border-linea bg-panel px-3 py-2.5 transition has-checked:border-acento has-checked:bg-acento-suave">
              <input type="radio" name="canal" value={c} checked={canal === c} onChange={() => cambiar(tipo, c)} className="sr-only" />
              <span className="block text-[13px] font-medium text-tinta">{c === "whatsapp" ? "WhatsApp" : "Llamada del agente"}</span>
              <span className="mt-0.5 block text-[11px] text-tinta-3">
                {c === "whatsapp" ? "Un mensaje; si contesta, el agente sigue la conversación." : "El agente marca, se presenta y agenda ahí mismo."}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Campo
        etiqueta={canal === "whatsapp" ? "Mensaje" : "Guion para el agente"}
        ayuda={canal === "whatsapp" ? "{nombre} y {negocio} se sustituyen solos." : "Dile al agente qué sabe de la persona y qué debe lograr. Él arma la conversación."}
      >
        <AreaTexto name="mensaje" rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} required />
      </Campo>

      {canal === "llamada" ? (
        <Campo etiqueta="Objetivo de la llamada">
          <Entrada name="objetivo" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="reagendar la cita" />
        </Campo>
      ) : (
        <input type="hidden" name="objetivo" value={objetivo} />
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Desde las" ayuda="Hora local del negocio.">
          <Entrada name="ventana_inicio" type="time" defaultValue="10:00" />
        </Campo>
        <Campo etiqueta="Hasta las">
          <Entrada name="ventana_fin" type="time" defaultValue="19:00" />
        </Campo>
        <Campo etiqueta="Intentos por persona" ayuda="Si no contesta, se reintenta al día siguiente.">
          <Entrada name="max_intentos" type="number" min={1} max={5} defaultValue={2} />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-4">
        <BotonEnviar>Crear campaña</BotonEnviar>
        <p className="text-[12px] text-tinta-3">
          {alcance !== undefined ? `Alcanzaría a ${alcance} ${alcance === 1 ? "persona" : "personas"} hoy. ` : ""}
          Se crea en borrador; tú la activas cuando quieras.
        </p>
      </div>
    </Formulario>
  );
}
