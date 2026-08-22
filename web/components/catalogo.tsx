"use client";

import type { ReactNode } from "react";
import { Formulario } from "@/components/formulario";
import { Boton, Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { guardarRecurso, guardarServicio } from "@/lib/acciones";
import type { Recurso, Servicio, Vertical } from "@/lib/tipos";

function Desplegable({ resumen, children }: { resumen: ReactNode; children: ReactNode }) {
  return (
    <details className="group border-b border-linea last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
        {resumen}
        <span className="ml-auto text-[11px] text-tinta-3 group-open:text-acento">
          <span className="group-open:hidden">Editar</span>
          <span className="hidden group-open:inline">Cerrar</span>
        </span>
      </summary>
      <div className="border-t border-linea bg-panel-2 px-4 py-4">{children}</div>
    </details>
  );
}

export function FormularioRecurso({
  recurso,
  vertical,
  compacto = false,
}: {
  recurso?: Recurso;
  vertical: Vertical;
  compacto?: boolean;
}) {
  const capacidadImporta = vertical === "restaurante";
  return (
    <Formulario accion={guardarRecurso} className="space-y-3" reiniciar={!recurso}>
      {(pendiente) => (
        <>
          {recurso ? <input type="hidden" name="id" value={recurso.id} /> : null}
          <div className={compacto ? "space-y-3" : "grid gap-3 sm:grid-cols-3"}>
            <Campo etiqueta="Nombre" className={compacto ? "" : "sm:col-span-2"}>
              <Entrada name="nombre" defaultValue={recurso?.nombre} required placeholder="Dra. Ana Ruiz" />
            </Campo>
            <Campo
              etiqueta={capacidadImporta ? "Capacidad" : "Personas a la vez"}
              ayuda={capacidadImporta ? "Cuántos comensales caben." : undefined}
            >
              <Entrada name="capacidad" type="number" min={1} defaultValue={recurso?.capacidad ?? 1} />
            </Campo>
          </div>
          <Campo etiqueta="Etiqueta interna" ayuda="Zona, especialidad o piso. Solo la ves tú.">
            <Entrada name="etiqueta" defaultValue={recurso?.metadatos?.etiqueta} placeholder="terraza" />
          </Campo>
          <Boton variante="solido" disabled={pendiente}>
            {recurso ? "Guardar cambios" : "Agregar recurso"}
          </Boton>
        </>
      )}
    </Formulario>
  );
}

export function FormularioServicio({
  servicio,
  recursos,
  compacto = false,
}: {
  servicio?: Servicio;
  recursos: Recurso[];
  compacto?: boolean;
}) {
  return (
    <Formulario accion={guardarServicio} className="space-y-3" reiniciar={!servicio}>
      {(pendiente) => (
        <>
          {servicio ? <input type="hidden" name="id" value={servicio.id} /> : null}
          <Campo etiqueta="Nombre">
            <Entrada name="nombre" defaultValue={servicio?.nombre} required placeholder="Limpieza dental" />
          </Campo>
          <Campo etiqueta="Cómo más le dicen" ayuda="Separa con comas. El agente los reconoce al oírlos.">
            <Entrada name="alias" defaultValue={servicio?.alias.join(", ")} placeholder="limpieza, profilaxis" />
          </Campo>
          <div className={compacto ? "grid grid-cols-3 gap-3" : "grid gap-3 sm:grid-cols-3"}>
            <Campo etiqueta="Duración (min)">
              <Entrada name="duracion_min" type="number" min={5} step={5} defaultValue={servicio?.duracion_min ?? 30} required />
            </Campo>
            <Campo etiqueta="Buffer (min)" ayuda="Limpieza entre citas.">
              <Entrada name="buffer_min" type="number" min={0} step={5} defaultValue={servicio?.buffer_min ?? 0} />
            </Campo>
            <Campo etiqueta="Precio (MXN)">
              <Entrada name="precio" type="number" min={0} step={10} defaultValue={servicio?.precio ?? ""} placeholder="opcional" />
            </Campo>
          </div>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-tinta-2">Quién lo puede dar</legend>
            <p className="mb-2 text-[11px] text-tinta-3">Sin marcar nada, cualquier recurso disponible sirve.</p>
            <div className="flex flex-wrap gap-1.5">
              {recursos.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-linea bg-panel px-2 py-1 text-[12px] text-tinta-2 has-checked:border-acento has-checked:bg-acento-suave has-checked:text-acento"
                >
                  <input
                    type="checkbox"
                    name="recursos_validos"
                    value={r.id}
                    defaultChecked={servicio?.recursos_validos.includes(r.id)}
                    className="accent-acento"
                  />
                  {r.nombre}
                </label>
              ))}
            </div>
          </fieldset>
          <Boton variante="solido" disabled={pendiente}>
            {servicio ? "Guardar cambios" : "Agregar servicio"}
          </Boton>
        </>
      )}
    </Formulario>
  );
}

export function FilaRecurso({ recurso, vertical }: { recurso: Recurso; vertical: Vertical }) {
  return (
    <Desplegable
      resumen={
        <>
          <span className={`text-[13px] font-medium ${recurso.activo ? "text-tinta" : "text-tinta-3 line-through"}`}>
            {recurso.nombre}
          </span>
          <span className="numeros text-[12px] text-tinta-3">cap. {recurso.capacidad}</span>
          {recurso.metadatos?.etiqueta ? (
            <span className="text-[11px] text-tinta-3">{recurso.metadatos.etiqueta}</span>
          ) : null}
        </>
      }
    >
      <FormularioRecurso recurso={recurso} vertical={vertical} />
    </Desplegable>
  );
}

export function FilaServicio({ servicio, recursos }: { servicio: Servicio; recursos: Recurso[] }) {
  return (
    <Desplegable
      resumen={
        <>
          <span className={`text-[13px] font-medium ${servicio.activo ? "text-tinta" : "text-tinta-3 line-through"}`}>
            {servicio.nombre}
          </span>
          <span className="numeros text-[12px] text-tinta-3">
            {servicio.duracion_min} min{servicio.buffer_min > 0 ? ` +${servicio.buffer_min}` : ""}
          </span>
          {servicio.precio ? (
            <span className="numeros text-[12px] text-tinta-2">${Math.round(Number(servicio.precio))}</span>
          ) : null}
          {servicio.alias.length > 0 ? (
            <span className="hidden truncate text-[11px] text-tinta-3 sm:block">{servicio.alias.join(", ")}</span>
          ) : null}
        </>
      }
    >
      <FormularioServicio servicio={servicio} recursos={recursos} />
    </Desplegable>
  );
}

export function NuevoEnPanel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="border-b border-linea">
      <summary className="cursor-pointer list-none px-4 py-2.5 text-[13px] font-medium text-acento hover:bg-panel-2">
        + {titulo}
      </summary>
      <div className="border-t border-linea bg-panel-2 px-4 py-4">{children}</div>
    </details>
  );
}

export { Selector };
