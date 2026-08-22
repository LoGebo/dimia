"use client";

import { Formulario } from "@/components/formulario";
import { AreaTexto, Boton, Campo, Entrada } from "@/components/ui/primitivos";
import { guardarFaq } from "@/lib/acciones";
import type { Faq } from "@/lib/tipos";

export function FormularioFaq({ entrada, compacto = false }: { entrada?: Faq; compacto?: boolean }) {
  return (
    <Formulario accion={guardarFaq} className="space-y-3" reiniciar={!entrada}>
      {(pendiente) => (
        <>
          {entrada ? <input type="hidden" name="id" value={entrada.id} /> : null}
          <Campo etiqueta="Lo que preguntan">
            <Entrada name="pregunta" defaultValue={entrada?.pregunta} required placeholder="¿Tienen estacionamiento?" />
          </Campo>
          <Campo etiqueta="Lo que contesta el agente" ayuda="Escríbelo hablado, como si lo dijeras por teléfono.">
            <AreaTexto
              name="respuesta"
              defaultValue={entrada?.respuesta}
              required
              rows={compacto ? 3 : 2}
              placeholder="Sí, hay estacionamiento gratuito para pacientes."
            />
          </Campo>
          <Campo etiqueta="Prioridad" ayuda="Más alto, más arriba en el contexto del agente.">
            <Entrada name="prioridad" type="number" min={0} max={10} defaultValue={entrada?.prioridad ?? 5} />
          </Campo>
          <Boton variante="solido" disabled={pendiente}>
            {entrada ? "Guardar cambios" : "Agregar respuesta"}
          </Boton>
        </>
      )}
    </Formulario>
  );
}
