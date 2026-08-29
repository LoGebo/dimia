"use client";

import { useState, type ReactNode } from "react";
import { BotonDialogo, Dialogo } from "@/components/dialogo";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { TablaRegistros } from "@/components/kit";
import { Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { guardarRecurso, guardarServicio } from "@/lib/acciones";
import { ETIQUETAS_RECURSO, type Recurso, type Servicio, type Vertical } from "@/lib/tipos";

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
      {recurso ? <input type="hidden" name="id" value={recurso.id} /> : null}
      <div className={compacto ? "space-y-3" : "grid gap-3 sm:grid-cols-3"}>
        <Campo etiqueta="Nombre" className={compacto ? "" : "sm:col-span-2"}>
          <Entrada name="nombre" defaultValue={recurso?.nombre} required placeholder="Dra. Ana Ruiz" autoFocus />
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
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-tinta-2">Qué es</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["persona", "lugar"] as const).map((t) => (
            <OpcionTarjeta
              key={t}
              nombre={t === "persona" ? "Una persona" : "Un lugar"}
              detalle={t === "persona" ? "Doctora, estilista, técnico. Tiene ausencias y comisión." : "Consultorio, mesa, estación."}
            >
              <input type="radio" name="tipo" value={t} defaultChecked={(recurso?.tipo ?? "lugar") === t} className="sr-only" />
            </OpcionTarjeta>
          ))}
        </div>
      </fieldset>
      <div className={compacto ? "space-y-3" : "grid gap-3 sm:grid-cols-3"}>
        <Campo etiqueta="Teléfono" ayuda="Para avisarle de sus citas.">
          <Entrada name="telefono" type="tel" defaultValue={recurso?.telefono ?? ""} placeholder="+52..." />
        </Campo>
        <Campo etiqueta="Correo">
          <Entrada name="correo" type="email" defaultValue={recurso?.correo ?? ""} placeholder="opcional" />
        </Campo>
        <Campo etiqueta="Comisión (%)" ayuda="Sobre lo cobrado de sus citas.">
          <Entrada name="comision_pct" type="number" min={0} max={100} step="0.5" defaultValue={recurso?.comision_pct ?? ""} placeholder="0" />
        </Campo>
      </div>
      <BotonEnviar>{recurso ? "Guardar cambios" : "Agregar recurso"}</BotonEnviar>
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
      {servicio ? <input type="hidden" name="id" value={servicio.id} /> : null}
      <Campo etiqueta="Nombre">
        <Entrada name="nombre" defaultValue={servicio?.nombre} required placeholder="Limpieza dental" autoFocus />
      </Campo>
      <Campo etiqueta="Cómo más le dicen" ayuda="Separa con comas. El agente los reconoce al oírlos.">
        <Entrada name="alias" defaultValue={servicio?.alias.join(", ")} placeholder="limpieza, profilaxis" />
      </Campo>
      <div className={compacto ? "grid grid-cols-3 gap-3" : "grid gap-3 sm:grid-cols-3"}>
        <Campo etiqueta="Duración (min)">
          <Entrada name="duracion_min" type="number" min={5} step={5} defaultValue={servicio?.duracion_min ?? 30} required />
        </Campo>
        <Campo etiqueta="Entre citas (min)" ayuda="Tiempo libre que se deja después de cada una.">
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
              className="flex cursor-pointer items-center gap-1.5 border border-linea bg-panel px-2 py-1 text-[12px] text-tinta-2 transition-colors duration-150 hover:border-linea-fuerte has-checked:border-acento has-checked:bg-acento-suave has-checked:text-acento"
            >
              <input
                type="checkbox"
                name="recursos_validos"
                value={r.id}
                defaultChecked={servicio?.recursos_validos.includes(r.id)}
                className="sr-only"
              />
              <i aria-hidden="true" className="h-1.5 w-1.5 bg-current opacity-40 [label:has(:checked)>&]:opacity-100" />
              {r.nombre}
            </label>
          ))}
        </div>
      </fieldset>
      <BotonEnviar>{servicio ? "Guardar cambios" : "Agregar servicio"}</BotonEnviar>
    </Formulario>
  );
}

/** Tarjeta de opción (radio o casilla): filete azul y cuadrado cuando está marcada. */
export function OpcionTarjeta({
  nombre,
  detalle,
  children,
  punteada = false,
}: {
  nombre: string;
  detalle?: string;
  children: ReactNode;
  punteada?: boolean;
}) {
  return (
    <label
      className={`group/opcion relative cursor-pointer border bg-panel px-3 py-2 transition-colors duration-150 hover:border-linea-fuerte has-checked:border-acento has-checked:bg-acento-suave ${
        punteada ? "border-dashed border-linea-fuerte has-checked:border-solid" : "border-linea"
      }`}
    >
      {children}
      <span className="flex items-center gap-2">
        <i aria-hidden="true" className="h-1.5 w-1.5 flex-none bg-linea-fuerte transition-colors duration-150 group-has-[:checked]/opcion:bg-acento" />
        <span className="block text-[13px] font-medium text-tinta">{nombre}</span>
      </span>
      {detalle ? <span className="mt-0.5 block pl-3.5 text-[11px] text-tinta-3">{detalle}</span> : null}
    </label>
  );
}

export function TablaRecursos({ recursos, vertical, etiqueta }: { recursos: Recurso[]; vertical: Vertical; etiqueta: string }) {
  const [editando, setEditando] = useState<Recurso | null>(null);
  return (
    <>
      <TablaRegistros<Recurso>
        className="border-none"
        columnas={[
          {
            clave: "nombre",
            titulo: "Nombre",
            valor: (r) => r.nombre,
            render: (r) => (
              <span className={`font-medium ${r.activo ? "text-tinta" : "text-tinta-3 line-through"}`}>{r.nombre}</span>
            ),
          },
          {
            clave: "tipo",
            titulo: "Qué es",
            valor: (r) => (r.tipo === "persona" ? "persona" : "lugar"),
            render: (r) => <span className="text-tinta-2">{r.tipo === "persona" ? "Persona" : "Lugar"}</span>,
          },
          { clave: "etiqueta", titulo: "Etiqueta", valor: (r) => r.metadatos?.etiqueta ?? "", render: (r) => <span className="text-tinta-3">{r.metadatos?.etiqueta ?? "—"}</span> },
          { clave: "capacidad", titulo: "Cap.", numerica: true, ancho: "64px", valor: (r) => r.capacidad },
          {
            clave: "comision",
            titulo: "Comisión",
            numerica: true,
            ancho: "96px",
            valor: (r) => (r.comision_pct ? Number(r.comision_pct) : null),
            render: (r) => (r.comision_pct ? `${Number(r.comision_pct)} %` : <span className="text-tinta-3">—</span>),
          },
        ]}
        filas={recursos}
        clave={(r) => r.id}
        filtros={[
          { clave: "personas", nombre: "Personas", tono: "acento", pasa: (r) => r.tipo === "persona" },
          { clave: "lugares", nombre: "Lugares", pasa: (r) => r.tipo !== "persona" },
          { clave: "inactivos", nombre: "Inactivos", tono: "alerta", pasa: (r) => !r.activo },
        ]}
        ordenInicial={{ clave: "nombre", dir: "asc" }}
        alClic={setEditando}
        vacio={{ titulo: `Sin ${(ETIQUETAS_RECURSO[vertical]?.plural ?? "recursos").toLowerCase()}`, detalle: "Sin al menos uno, el agente no puede ofrecer horarios." }}
      />
      {editando ? (
        <Dialogo titulo={editando.nombre} descripcion="Cambios que el agente usa en la siguiente llamada." cerrar={() => setEditando(null)} cabecera className="max-w-xl">
          <div className="px-4 py-4">
            <FormularioRecurso recurso={editando} vertical={vertical} />
          </div>
        </Dialogo>
      ) : null}
    </>
  );
}

export function TablaServicios({ servicios, recursos }: { servicios: Servicio[]; recursos: Recurso[] }) {
  const [editando, setEditando] = useState<Servicio | null>(null);
  const nombreDe = (id: string) => recursos.find((r) => r.id === id)?.nombre ?? "";
  return (
    <>
      <TablaRegistros<Servicio>
        className="border-none"
        columnas={[
          {
            clave: "nombre",
            titulo: "Servicio",
            valor: (s) => s.nombre,
            render: (s) => (
              <span className="block min-w-0">
                <span className={`block font-medium ${s.activo ? "text-tinta" : "text-tinta-3 line-through"}`}>{s.nombre}</span>
                {s.alias.length > 0 ? <span className="block truncate text-[11px] text-tinta-3">{s.alias.join(", ")}</span> : null}
              </span>
            ),
          },
          {
            clave: "quien",
            titulo: "Quién",
            valor: (s) => s.recursos_validos.map(nombreDe).join(", "),
            render: (s) => (
              <span className="text-tinta-2">
                {s.recursos_validos.length === 0 ? <span className="text-tinta-3">Cualquiera</span> : s.recursos_validos.map(nombreDe).join(", ")}
              </span>
            ),
          },
          {
            clave: "duracion",
            titulo: "Dura",
            numerica: true,
            ancho: "92px",
            valor: (s) => s.duracion_min,
            render: (s) => (
              <>
                {s.duracion_min} min{s.buffer_min > 0 ? <span className="text-tinta-3"> +{s.buffer_min}</span> : null}
              </>
            ),
          },
          {
            clave: "precio",
            titulo: "Precio",
            numerica: true,
            ancho: "88px",
            valor: (s) => (s.precio ? Number(s.precio) : null),
            render: (s) => (s.precio ? `$${Math.round(Number(s.precio))}` : <span className="text-tinta-3">—</span>),
          },
        ]}
        filas={servicios}
        clave={(s) => s.id}
        filtros={[
          { clave: "con-precio", nombre: "Con precio", tono: "bueno", pasa: (s) => !!s.precio },
          { clave: "sin-precio", nombre: "Sin precio", tono: "alerta", pasa: (s) => !s.precio },
          { clave: "inactivos", nombre: "Inactivos", pasa: (s) => !s.activo },
        ]}
        ordenInicial={{ clave: "nombre", dir: "asc" }}
        alClic={setEditando}
        vacio={{ titulo: "Sin servicios", detalle: "Agrega al menos uno para poder agendar." }}
      />
      {editando ? (
        <Dialogo titulo={editando.nombre} descripcion="Duración, precio y quién lo da. El agente lo dice tal cual." cerrar={() => setEditando(null)} cabecera className="max-w-xl">
          <div className="px-4 py-4">
            <FormularioServicio servicio={editando} recursos={recursos} />
          </div>
        </Dialogo>
      ) : null}
    </>
  );
}

/** Botón «Nuevo» que abre el formulario en un diálogo; se cierra solo al guardar. */
export function NuevoEnPanel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <BotonDialogo etiqueta={`+ ${titulo}`} titulo={titulo} variante="contorno" ancho="max-w-xl">
      {children}
    </BotonDialogo>
  );
}

export { Selector };
