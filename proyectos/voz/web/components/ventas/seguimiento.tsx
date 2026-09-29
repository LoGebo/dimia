"use client";

import { useState, useTransition } from "react";
import { AvatarAgente } from "@/components/avatar-agente";
import { Boton, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { guardarSeguimiento } from "@/lib/acciones-ventas";
import type { ConfigSeguimiento, PasoSeguimiento } from "@/lib/ventas";
import { AGENTE } from "@/components/ventas/interesados";

// Pasada la ventana de 24 h, solo WhatsApp y con la plantilla aprobada (seguimiento_solicitud).
const PLANTILLA = "Hola {nombre}, te escribimos de {negocio} sobre la información que nos pediste. ¿Quieres que te ayudemos a agendar? Si ya no te interesa, responde BAJA.";
const CON_PLANTILLA: Record<string, number[]> = { suave: [], normal: [48], insistente: [48, 120], propio: [48] };

const NIVELES = [
  { clave: "suave", nombre: "Suave", detalle: "1 mensaje si deja de contestar" },
  { clave: "normal", nombre: "Normal", detalle: "2 mensajes el primer día y 1 a las 48 h" },
  { clave: "insistente", nombre: "Insistente", detalle: "3 el primer día, a las 48 h y a los 5 días" },
] as const;

/** Cómo trabaja el agente a los interesados: un nivel ya armado y, si se quiere, los mensajes a mano. */
export function Seguimiento({ inicial, niveles }: { inicial: ConfigSeguimiento; niveles: Record<string, Record<"usted" | "tu", PasoSeguimiento[]>> }) {
  const [c, setC] = useState<ConfigSeguimiento>(inicial);
  const [editar, setEditar] = useState(inicial.nivel === "propio");
  const [aviso, setAviso] = useState<{ ok?: string; error?: string }>({});
  const [guardando, iniciar] = useTransition();
  const pasos: PasoSeguimiento[] = c.nivel === "propio" && c.pasos ? c.pasos : niveles[c.nivel]?.[c.trato] ?? [];
  const cambiar = (x: Partial<ConfigSeguimiento>) => { setC((v) => ({ ...v, ...x })); setAviso({}); };

  function editarPaso(n: number, mensaje: string) {
    cambiar({ nivel: "propio", pasos: pasos.map((p, k) => (k === n ? { ...p, mensaje } : p)) });
  }

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <Tarjeta className="flex flex-wrap items-center gap-4 p-5">
          <AvatarAgente nombre={AGENTE.nombre} avatar={AGENTE.avatar} tamano={40} activo={c.activo} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-tinta">{c.activo ? `${AGENTE.nombre} da seguimiento` : "Seguimiento apagado"}</p>
            <p className="text-[13px] text-tinta-2">{c.activo ? "Si alguien deja de contestar, le vuelve a escribir según esto." : `${AGENTE.nombre} contesta a todos, pero no le vuelve a escribir a quien deja de responder.`}</p>
          </div>
          <button onClick={() => cambiar({ activo: !c.activo })} className={`h-9 rounded-full px-5 text-[14px] font-semibold ${c.activo ? "border border-linea bg-panel text-tinta-2" : "bg-acento text-acento-tinta hover:brightness-110"}`}>
            {c.activo ? "Apagar" : "Encender"}
          </button>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="¿Qué tanto insiste?" descripcion="Se detiene solo si agenda, si le dicen que no, si piden baja o si usted toma la conversación." />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {NIVELES.map((n) => (
              <button key={n.clave} onClick={() => { cambiar({ nivel: n.clave, pasos: null }); setEditar(false); }} className={`rounded-lg border p-4 text-left ${c.nivel === n.clave ? "border-acento bg-acento-suave" : "border-linea hover:bg-panel-2"}`}>
                <div className="text-[15px] font-bold text-tinta">{n.nombre}</div>
                <div className="mt-1 text-[12.5px] text-tinta-2">{n.detalle}</div>
              </button>
            ))}
          </div>
          {c.nivel === "propio" ? <p className="px-5 pb-4 text-[13px] text-tinta-2">Con mensajes propios.</p> : null}
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Cómo y cuándo" />
          <div className="space-y-4 p-5 text-[13.5px]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-36 text-tinta-2">Canales</span>
              <label className="flex items-center gap-2 text-tinta"><input type="checkbox" checked readOnly /> WhatsApp e Instagram</label>
              <label className="flex items-center gap-2 text-tinta"><input type="checkbox" checked={!!c.canales?.llamada} onChange={() => cambiar({ canales: { ...c.canales, llamada: !c.canales?.llamada } })} /> Llamada <span className="text-[12px] text-tinta-3">(en el primer seguimiento)</span></label>
              <label className="flex items-center gap-2 text-tinta-3"><input type="checkbox" disabled /> Correo <span className="text-[12px]">(pronto)</span></label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-36 text-tinta-2">Horario</span>
              <select value={c.dias} onChange={(e) => cambiar({ dias: e.target.value as ConfigSeguimiento["dias"] })} className="h-8 rounded-md border border-linea bg-panel px-2">
                <option value="lun-sab">Lunes a sábado</option><option value="lun-vie">Lunes a viernes</option><option value="todos">Todos los días</option>
              </select>
              <input type="time" value={c.hora_inicio} onChange={(e) => cambiar({ hora_inicio: e.target.value })} className="h-8 rounded-md border border-linea bg-panel px-2 tabular-nums" /> a
              <input type="time" value={c.hora_fin} onChange={(e) => cambiar({ hora_fin: e.target.value })} className="h-8 rounded-md border border-linea bg-panel px-2 tabular-nums" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-36 text-tinta-2">Trato</span>
              <select value={c.trato} onChange={(e) => cambiar({ trato: e.target.value as "usted" | "tu", ...(c.nivel === "propio" ? {} : { pasos: null }) })} className="h-8 rounded-md border border-linea bg-panel px-2">
                <option value="usted">Usted</option><option value="tu">Tú</option>
              </select>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Preguntas antes de agendar" descripcion="Máximo 4. El agente las hace en orden natural, no como encuesta." />
          <div className="space-y-2 p-5">
            {c.preguntas.map((p, n) => (
              <div key={n} className="flex items-center gap-2">
                <span className="w-5 text-right text-[13px] tabular-nums text-tinta-3">{n + 1}.</span>
                <input value={p} onChange={(e) => cambiar({ preguntas: c.preguntas.map((x, k) => (k === n ? e.target.value : x)) })} className="h-8 flex-1 rounded-md border border-linea bg-panel px-2 text-[13.5px]" />
                <button onClick={() => cambiar({ preguntas: c.preguntas.filter((_, k) => k !== n) })} className="text-[12.5px] text-tinta-3 hover:text-critico">Quitar</button>
              </div>
            ))}
            {c.preguntas.length < 4 ? <Boton variante="fantasma" onClick={() => cambiar({ preguntas: [...c.preguntas, ""] })}>+ Agregar pregunta</Boton> : null}
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Cuándo pasa a una persona" descripcion="Le llega el aviso con la conversación completa." />
          <div className="space-y-2 p-5">
            {c.escalar.map((r, n) => (
              <div key={n} className="flex items-center gap-2">
                <input value={r} onChange={(e) => cambiar({ escalar: c.escalar.map((x, k) => (k === n ? e.target.value : x)) })} className="h-8 flex-1 rounded-md border border-linea bg-panel px-2 text-[13.5px]" />
                <button onClick={() => cambiar({ escalar: c.escalar.filter((_, k) => k !== n) })} className="text-[12.5px] text-tinta-3 hover:text-critico">Quitar</button>
              </div>
            ))}
            <Boton variante="fantasma" onClick={() => cambiar({ escalar: [...c.escalar, ""] })}>+ Otra regla</Boton>
          </div>
        </Tarjeta>

        <div className="flex items-center gap-3">
          <button disabled={guardando} onClick={() => iniciar(async () => setAviso(await guardarSeguimiento({ ...c, pasos: c.nivel === "propio" ? pasos : null })))} className="h-10 rounded-full bg-acento px-6 text-[14.5px] font-semibold text-acento-tinta hover:brightness-110 disabled:opacity-60">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {aviso.ok ? <span className="text-[13.5px] text-bueno">{aviso.ok}</span> : null}
          {aviso.error ? <span className="text-[13.5px] text-critico">{aviso.error}</span> : null}
        </div>
      </div>

      <Tarjeta className="self-start">
        <TarjetaCabecera
          titulo="Lo que escribe si deja de contestar"
          descripcion="Horas desde su última respuesta."
          accion={<Boton variante="contorno" onClick={() => setEditar((v) => !v)}>{editar ? "Listo" : "Personalizar"}</Boton>}
        />
        <ol className="relative space-y-4 p-5">
          {pasos.map((p, n) => (
            <li key={n} className="relative pl-6">
              <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-acento" />
              <div className="text-[13px] font-semibold tabular-nums text-tinta">A las {p.horas} h</div>
              {editar
                ? <textarea value={p.mensaje} onChange={(e) => editarPaso(n, e.target.value)} className="mt-1 w-full rounded-md border border-linea bg-panel p-2 text-[13px]" rows={2} />
                : <p className="mt-1 text-[13px] text-tinta-2">«{p.mensaje}»</p>}
            </li>
          ))}
          {(CON_PLANTILLA[c.nivel] ?? []).map((h) => (
            <li key={`p${h}`} className="relative pl-6">
              <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-acento" />
              <div className="text-[13px] font-semibold tabular-nums text-tinta">A las {h} h · solo WhatsApp</div>
              <p className="mt-1 text-[13px] text-tinta-2">«{PLANTILLA}»</p>
              <p className="text-[12px] text-tinta-3">Plantilla de marketing aprobada por Meta: solo a quien aceptó recibir promociones, y el texto no se puede cambiar.</p>
            </li>
          ))}
          <li className="pl-6 text-[12.5px] text-tinta-3">Si no contesta en 24 h más, se da por cerrado. {"{nombre}"} se cambia por el nombre de la persona.</li>
        </ol>
      </Tarjeta>
    </div>
  );
}
