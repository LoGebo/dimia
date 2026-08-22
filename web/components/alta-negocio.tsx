"use client";

import { BotonEnviar, Formulario } from "@/components/formulario";
import { Boton, Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { altaNegocio } from "@/lib/acciones";
import { etiquetasRecurso, ZONAS_HORARIAS, type PlantillaVertical } from "@/lib/tipos";

export function AltaNegocio({ plantillas }: { plantillas: PlantillaVertical[] }) {
  return (
    <Formulario accion={altaNegocio} className="space-y-4">
          <Campo etiqueta="Nombre del negocio" ayuda="Así se presenta el agente al contestar.">
            <Entrada name="nombre" required placeholder="Clínica Dental Sonrisa" autoFocus />
          </Campo>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-tinta-2">Giro</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {plantillas.map((p, i) => (
                <label
                  key={p.clave}
                  className="cursor-pointer rounded-lg border border-linea bg-panel px-3 py-2.5 transition has-checked:border-acento has-checked:bg-acento-suave"
                >
                  <input
                    type="radio"
                    name="vertical"
                    value={p.clave}
                    defaultChecked={i === 0}
                    className="sr-only"
                  />
                  <span className="block text-[13px] font-medium text-tinta">{p.nombre}</span>
                  <span className="mt-0.5 block text-[11px] text-tinta-3">
                    Reserva {etiquetasRecurso(p.clave).recurso.toLowerCase()}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Zona horaria">
              <Selector name="zona_horaria" defaultValue="America/Mexico_City">
                {ZONAS_HORARIAS.map((z) => (
                  <option key={z} value={z}>
                    {z.replace("America/", "").replace("_", " ")}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Número para transferir" ayuda="A dónde pasa las llamadas que no resuelve.">
              <Entrada name="telefono_escalamiento" placeholder="+52 55 1234 5678" />
            </Campo>
          </div>
          <BotonEnviar>
            "Crear negocio"
          </BotonEnviar>
    </Formulario>
  );
}
