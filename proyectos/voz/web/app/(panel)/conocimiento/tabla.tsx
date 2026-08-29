"use client";

import { useState } from "react";
import { BotonPeligro } from "@/components/boton-peligro";
import { Dialogo } from "@/components/dialogo";
import { FormularioFaq } from "@/components/faq";
import { Formulario } from "@/components/formulario";
import { TablaRegistros } from "@/components/kit";
import { eliminarFaq } from "@/lib/acciones";
import type { Faq } from "@/lib/tipos";

export function TablaRespuestas({ entradas }: { entradas: Faq[] }) {
  const [editando, setEditando] = useState<Faq | null>(null);
  return (
    <>
      <TablaRegistros<Faq>
        className="border-none"
        columnas={[
          { clave: "prioridad", titulo: "Prio.", numerica: true, ancho: "64px", valor: (e) => e.prioridad },
          {
            clave: "pregunta",
            titulo: "Lo que preguntan",
            valor: (e) => e.pregunta,
            render: (e) => <span className="font-medium text-tinta">{e.pregunta}</span>,
          },
          {
            clave: "respuesta",
            titulo: "Lo que contesta",
            valor: (e) => e.respuesta,
            render: (e) => <span className="block max-w-[460px] truncate text-tinta-2">{e.respuesta}</span>,
          },
        ]}
        filas={entradas}
        clave={(e) => e.id}
        filtros={[
          { clave: "altas", nombre: "Prioridad alta", tono: "acento", pasa: (e) => e.prioridad >= 7 },
          { clave: "cortas", nombre: "Respuesta corta", pasa: (e) => e.respuesta.length <= 80 },
        ]}
        ordenInicial={{ clave: "prioridad", dir: "desc" }}
        alClic={setEditando}
        vacio={{
          titulo: "Todavía no hay respuestas",
          detalle: "Sin esto el agente transfiere cualquier pregunta que no sea agendar. Con cinco respuestas cubres casi todo.",
        }}
      />
      {editando ? (
        <Dialogo titulo={editando.pregunta} descripcion="Escríbelo hablado, como si lo dijeras por teléfono." cerrar={() => setEditando(null)} cabecera className="max-w-xl">
          <div className="px-4 py-4">
            <FormularioFaq entrada={editando} />
            <Formulario accion={eliminarFaq} className="mt-3 border-t border-linea pt-3">
              <input type="hidden" name="id" value={editando.id} />
              <BotonPeligro>Eliminar respuesta</BotonPeligro>
            </Formulario>
          </div>
        </Dialogo>
      ) : null}
    </>
  );
}
