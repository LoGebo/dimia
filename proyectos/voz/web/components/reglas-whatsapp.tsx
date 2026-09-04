"use client";

/**
 * Configuración del bot determinista de WhatsApp. Dos piezas:
 * la bienvenida (una sola, para el primer mensaje de cada persona) y las
 * respuestas por palabra (si el mensaje contiene alguno de los disparadores,
 * contesta fijo). Nada de esto gasta tokens; lo que no atrape una regla lo
 * contesta la inteligencia artificial de siempre.
 */

import { useActionState } from "react";
import { MessageSquareText, Trash2 } from "lucide-react";
import {
  alternarReglaWa,
  eliminarReglaWa,
  guardarBienvenidaWa,
  guardarReglaWa,
  type Estado,
} from "@/lib/acciones";
import type { ReglaWa } from "@/lib/consultas";
import { Aviso, Boton, Campo, Entrada, Insignia, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";

const inicial: Estado = {};

export function Bienvenida({ actual }: { actual: ReglaWa | null }) {
  const [estado, enviar, enviando] = useActionState(guardarBienvenidaWa, inicial);

  return (
    <Tarjeta>
      <TarjetaCabecera
        titulo="Mensaje de bienvenida"
        descripcion="Se manda solo, sin gastar tokens, cuando alguien escribe por primera vez o vuelve tras cerrarse su conversación."
        accion={actual ? <Insignia tono="bueno">Activa</Insignia> : <Insignia>Sin configurar</Insignia>}
      />
      <form action={enviar} className="space-y-3 px-5 py-4">
        <Campo etiqueta="Texto" ayuda="Déjalo vacío para que la IA abra la conversación directamente.">
          <textarea
            name="respuesta"
            defaultValue={actual?.respuesta ?? ""}
            rows={3}
            className="w-full rounded-lg border border-linea bg-panel px-3 py-2 text-[13px] text-tinta outline-none transition-colors focus:border-acento"
            placeholder="¡Hola! Soy el asistente de Dimia. ¿Buscas conocer el servicio o ya eres cliente?"
          />
        </Campo>
        {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tono="ok">{estado.ok}</Aviso> : null}
        <Boton type="submit" variante="solido" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar bienvenida"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

export function NuevaRegla() {
  const [estado, enviar, enviando] = useActionState(guardarReglaWa, inicial);

  return (
    <Tarjeta>
      <TarjetaCabecera
        titulo="Nueva respuesta por palabra"
        descripcion="Si el mensaje contiene alguna de las palabras, contesta esto tal cual. Sin tokens, sin espera."
      />
      <form action={enviar} className="space-y-3 px-5 py-4">
        <Campo etiqueta="Palabras que la disparan" ayuda="Separadas por coma. Ignora mayúsculas y acentos.">
          <Entrada name="disparador" placeholder="precio, planes, cuánto cuesta" />
        </Campo>
        <Campo etiqueta="Respuesta">
          <textarea
            name="respuesta"
            rows={3}
            className="w-full rounded-lg border border-linea bg-panel px-3 py-2 text-[13px] text-tinta outline-none transition-colors focus:border-acento"
            placeholder="Tenemos tres planes desde $1,490 al mes. En una demo de 30 minutos te decimos cuál conviene: ¿te la agendo?"
          />
        </Campo>
        {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tono="ok">{estado.ok}</Aviso> : null}
        <Boton type="submit" variante="solido" disabled={enviando}>
          {enviando ? "Guardando…" : "Agregar regla"}
        </Boton>
      </form>
    </Tarjeta>
  );
}

export function ListaReglas({ reglas }: { reglas: ReglaWa[] }) {
  if (reglas.length === 0) {
    return (
      <Vacio
        titulo="Sin respuestas por palabra"
        detalle="Agrega la primera: precios, horario, ubicación… lo que la gente pregunta igual todos los días."
      />
    );
  }
  return (
    <ul className="divide-y divide-linea">
      {reglas.map((r) => (
        <li key={r.id} className={`flex items-start gap-3 px-5 py-3 ${r.activo ? "" : "opacity-50"}`}>
          <MessageSquareText size={16} strokeWidth={1.75} className="mt-0.5 flex-none text-tinta-3" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-tinta">{r.disparador}</p>
            <p className="mt-0.5 text-[12.5px] text-tinta-2">{r.respuesta}</p>
          </div>
          <form action={alternarReglaWa}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="text-[12px] text-tinta-3 transition-colors hover:text-tinta">
              {r.activo ? "Pausar" : "Activar"}
            </button>
          </form>
          <form action={eliminarReglaWa}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" aria-label="Eliminar regla" className="text-tinta-3 transition-colors hover:text-critico">
              <Trash2 size={15} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
