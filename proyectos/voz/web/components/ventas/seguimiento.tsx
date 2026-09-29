"use client";

import { useState } from "react";
import { Boton, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";

type Nivel = "suave" | "normal" | "insistente";
type Paso = { cuando: string; acciones: string[]; texto?: string };

const NIVELES: { clave: Nivel; nombre: string; detalle: string; pasos: Paso[] }[] = [
  { clave: "suave", nombre: "Suave", detalle: "3 intentos · solo WhatsApp", pasos: [
    { cuando: "Minuto 0", acciones: ["WhatsApp"], texto: "Hola {nombre}, soy la asistente virtual de {negocio}. Vi que pidió informes de {servicio}. ¿Para cuándo le gustaría?" },
    { cuando: "Día 1", acciones: ["WhatsApp"], texto: "¿Sigue interesado en {servicio}? Tengo espacio esta semana." },
    { cuando: "Día 4", acciones: ["WhatsApp"], texto: "¿Lo dejamos para después? Aquí estoy cuando lo necesite." },
  ] },
  { clave: "normal", nombre: "Normal", detalle: "6 llamadas + 3 WhatsApp en 6 días", pasos: [
    { cuando: "Minuto 0", acciones: ["Llamada", "WhatsApp"], texto: "Hola {nombre}, soy la asistente virtual de {negocio}. Vi que pidió informes de {servicio}…" },
    { cuando: "+2 horas", acciones: ["Llamada"] },
    { cuando: "Día 1", acciones: ["WhatsApp", "Llamada en otra franja"], texto: "¿Sigue interesado en {servicio}?" },
    { cuando: "Día 3", acciones: ["Llamada"] },
    { cuando: "Día 5", acciones: ["Llamada"] },
    { cuando: "Día 6", acciones: ["WhatsApp", "Llamada"], texto: "¿Lo dejamos para después?" },
  ] },
  { clave: "insistente", nombre: "Insistente", detalle: "8 llamadas + 4 WhatsApp en 10 días", pasos: [
    { cuando: "Minuto 0", acciones: ["Llamada", "WhatsApp"] },
    { cuando: "+1 hora", acciones: ["Llamada"] },
    { cuando: "+4 horas", acciones: ["Llamada"] },
    { cuando: "Día 1", acciones: ["WhatsApp", "Llamada"] },
    { cuando: "Día 2", acciones: ["Llamada"] },
    { cuando: "Día 4", acciones: ["WhatsApp", "Llamada"] },
    { cuando: "Día 7", acciones: ["Llamada"] },
    { cuando: "Día 10", acciones: ["WhatsApp", "Llamada"], texto: "¿Lo dejamos para después?" },
  ] },
];

/** Cómo trabaja el agente a los interesados: un nivel ya armado y, si se quiere, los pasos a mano. */
export function Seguimiento() {
  const [nivel, setNivel] = useState<Nivel>("normal");
  const [canales, setCanales] = useState({ Llamada: true, WhatsApp: true, Correo: false });
  const [preguntas, setPreguntas] = useState(["¿Qué servicio busca?", "¿Para cuándo lo necesita?", "¿En qué sucursal le queda mejor?"]);
  const [editar, setEditar] = useState(false);
  const elegido = NIVELES.find((n) => n.clave === nivel)!;

  return (
    <div className="grid gap-5 p-5 xl:grid-cols-[1fr_420px]">
      <div className="space-y-5">
        <Tarjeta>
          <TarjetaCabecera titulo="¿Qué tanto insiste el agente?" descripcion="Se detiene solo si agenda, si le dicen que no o si piden no ser contactados." />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {NIVELES.map((n) => (
              <button key={n.clave} onClick={() => setNivel(n.clave)} className={`rounded-lg border p-4 text-left ${nivel === n.clave ? "border-acento bg-acento-suave" : "border-linea hover:bg-panel-2"}`}>
                <div className="text-[15px] font-bold text-tinta">{n.nombre}</div>
                <div className="mt-1 text-[12.5px] text-tinta-2">{n.detalle}</div>
              </button>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Cómo y cuándo" />
          <div className="space-y-4 p-5 text-[13.5px]">
            <div className="flex flex-wrap items-center gap-4">
              <span className="w-36 text-tinta-2">Canales</span>
              {(Object.keys(canales) as (keyof typeof canales)[]).map((c) => (
                <label key={c} className="flex items-center gap-2 text-tinta">
                  <input type="checkbox" checked={canales[c]} onChange={() => setCanales((x) => ({ ...x, [c]: !x[c] }))} /> {c}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-36 text-tinta-2">Horario</span>
              <select className="h-8 rounded-md border border-linea bg-panel px-2"><option>Lunes a sábado</option><option>Lunes a viernes</option><option>Todos los días</option></select>
              <input type="time" defaultValue="09:00" className="h-8 rounded-md border border-linea bg-panel px-2 tabular-nums" /> a
              <input type="time" defaultValue="20:00" className="h-8 rounded-md border border-linea bg-panel px-2 tabular-nums" />
              <span className="text-tinta-3">hora del interesado</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-36 text-tinta-2">Objetivo</span>
              <select className="h-8 rounded-md border border-linea bg-panel px-2"><option>Agendar cita</option><option>Mandar cotización</option><option>Visita a sucursal</option></select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-36 text-tinta-2">Trato</span>
              <select className="h-8 rounded-md border border-linea bg-panel px-2"><option>Usted</option><option>Tú</option></select>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Preguntas antes de agendar" descripcion="Máximo 4. El agente las hace en orden natural, no como encuesta." />
          <div className="space-y-2 p-5">
            {preguntas.map((p, n) => (
              <div key={n} className="flex items-center gap-2">
                <span className="w-5 text-right text-[13px] tabular-nums text-tinta-3">{n + 1}.</span>
                <input value={p} onChange={(e) => setPreguntas((l) => l.map((x, k) => (k === n ? e.target.value : x)))} className="h-8 flex-1 rounded-md border border-linea bg-panel px-2 text-[13.5px]" />
                <button onClick={() => setPreguntas((l) => l.filter((_, k) => k !== n))} className="text-[12.5px] text-tinta-3 hover:text-critico">Quitar</button>
              </div>
            ))}
            {preguntas.length < 4 ? <Boton variante="fantasma" onClick={() => setPreguntas((l) => [...l, ""])}>+ Agregar pregunta</Boton> : null}
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera titulo="Cuándo pasa a una persona" descripcion="Le llega un aviso con el resumen y la conversación completa." />
          <div className="flex flex-wrap gap-2 p-5 text-[13px]">
            {["Pregunta un precio fuera del catálogo", "Se molesta o se queja", "Pide hablar con una persona", "Pregunta algo médico o legal"].map((r) => (
              <label key={r} className="flex items-center gap-2 rounded-md border border-linea px-3 py-1.5"><input type="checkbox" defaultChecked /> {r}</label>
            ))}
            <Boton variante="fantasma">+ Otra regla</Boton>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta className="self-start">
        <TarjetaCabecera
          titulo={`Pasos · ${elegido.nombre}`}
          descripcion="Así sigue a cada interesado."
          accion={<Boton variante="contorno" onClick={() => setEditar((v) => !v)}>{editar ? "Listo" : "Personalizar pasos"}</Boton>}
        />
        <ol className="relative space-y-4 p-5">
          {elegido.pasos.map((p, n) => (
            <li key={n} className="relative pl-6">
              <span className="absolute left-0 top-1.5 h-2.5 w-2.5 bg-acento" />
              {n < elegido.pasos.length - 1 ? <span className="absolute left-[4px] top-4 h-[calc(100%+4px)] w-px bg-linea" /> : null}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold tabular-nums text-tinta">{p.cuando}</span>
                <span className="text-[12.5px] text-tinta-2">{p.acciones.filter((a) => canales[a.split(" ")[0] as keyof typeof canales] !== false).join(" + ")}</span>
              </div>
              {p.texto ? (editar
                ? <textarea defaultValue={p.texto} className="mt-1 w-full rounded-md border border-linea bg-panel p-2 text-[12.5px]" rows={2} />
                : <p className="mt-1 text-[12.5px] text-tinta-3">«{p.texto}»</p>) : null}
            </li>
          ))}
          <li className="pl-6 text-[12.5px] text-tinta-3">Fin: pasa a novedades mensuales solo si aceptó recibirlas.</li>
          {editar ? <li className="pl-6"><Boton variante="fantasma">+ Agregar paso</Boton></li> : null}
        </ol>
      </Tarjeta>
    </div>
  );
}
