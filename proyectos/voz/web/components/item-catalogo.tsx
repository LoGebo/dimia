"use client";

import { useState } from "react";
import { EditorAtributos } from "@/components/atributos";
import { BotonPeligro } from "@/components/boton-peligro";
import { Dialogo } from "@/components/dialogo";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { TablaRegistros } from "@/components/kit";
import { AreaTexto, Campo, Entrada, Insignia, Selector } from "@/components/ui/primitivos";
import { alternarDisponible, eliminarItemCatalogo, guardarItemCatalogo } from "@/lib/acciones";
import { moneda } from "@/lib/formato";
import { etiquetaTipo, type CatalogoItem, type Recurso } from "@/lib/tipos";

export function FormularioItem({
  item,
  tipos,
  recursos,
  tipoInicial,
}: {
  item?: CatalogoItem;
  tipos: string[];
  recursos: Recurso[];
  tipoInicial?: string;
}) {
  const [tipo, setTipo] = useState(item?.tipo ?? tipoInicial ?? tipos[0] ?? "platillo");
  const [tipoLibre, setTipoLibre] = useState(!tipos.includes(tipo));

  return (
    <Formulario accion={guardarItemCatalogo} className="space-y-3" reiniciar={!item}>
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <input type="hidden" name="tipo" value={tipo} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Tipo" ayuda="Agrupa el catálogo y filtra la búsqueda del agente.">
          {tipoLibre ? (
            <Entrada value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="platillo" required />
          ) : (
            <Selector
              value={tipo}
              onChange={(e) => {
                if (e.target.value === "__otro") {
                  setTipoLibre(true);
                  setTipo("");
                  return;
                }
                setTipo(e.target.value);
              }}
            >
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {etiquetaTipo(t)}
                </option>
              ))}
              <option value="__otro">Otro tipo…</option>
            </Selector>
          )}
        </Campo>
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" defaultValue={item?.nombre} required placeholder="Tacos de pastor" autoFocus />
        </Campo>
      </div>

      <Campo etiqueta="Descripción" ayuda="El agente la traduce a como hablaría una persona.">
        <AreaTexto name="descripcion" defaultValue={item?.descripcion ?? ""} rows={2} placeholder="Cinco tacos con piña, cebolla y cilantro." />
      </Campo>

      <Campo etiqueta="Cómo más le dicen" ayuda="Separa con comas. Se indexan para la búsqueda por voz.">
        <Entrada name="alias" defaultValue={item?.alias.join(", ")} placeholder="pastor, al pastor" />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-4">
        <Campo etiqueta="Precio (MXN)">
          <Entrada name="precio" type="number" min={0} step={5} defaultValue={item?.precio ?? ""} placeholder="opcional" />
        </Campo>
        <Campo etiqueta="Existencias" ayuda="Vacío = sin control. Baja con cada pedido; en cero se apaga solo.">
          <Entrada name="existencias" type="number" min={0} defaultValue={item?.existencias ?? ""} placeholder="sin control" />
        </Campo>
        <Campo etiqueta="Orden" ayuda="Menor aparece antes.">
          <Entrada name="orden" type="number" defaultValue={item?.orden ?? 0} />
        </Campo>
        <Campo etiqueta="Recurso ligado" ayuda="Solo si es una persona o estación.">
          <Selector name="resource_id" defaultValue={item?.resource_id ?? ""}>
            <option value="">Ninguno</option>
            {recursos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
      </div>

      <EditorAtributos key={tipo} tipo={tipo} iniciales={item?.atributos ?? {}} />

      <BotonEnviar>{item ? "Guardar cambios" : "Agregar al catálogo"}</BotonEnviar>
    </Formulario>
  );
}

function Interruptor({ item }: { item: CatalogoItem }) {
  return (
    <Formulario accion={alternarDisponible} silencioso>
      <input type="hidden" name="id" value={item.id} />
      <button
        title={item.disponible ? "Marcar como agotado" : "Volver a ofrecerlo"}
        aria-label={item.disponible ? "Marcar como agotado" : "Volver a ofrecerlo"}
        aria-pressed={item.disponible}
        onClick={(e) => e.stopPropagation()}
        className={`flex h-4 w-7 items-center border transition-colors duration-150 ${
          item.disponible ? "justify-end border-bueno bg-bueno/25" : "justify-start border-linea-fuerte bg-panel-2"
        }`}
      >
        <span className={`mx-px h-3 w-3 transition-colors duration-150 ${item.disponible ? "bg-bueno" : "bg-linea-fuerte"}`} />
      </button>
    </Formulario>
  );
}

/** Los items de un grupo del catálogo: interruptor de disponibilidad, filtros y edición en diálogo. */
export function TablaCatalogo({
  items,
  tipos,
  recursos,
  tipo,
}: {
  items: CatalogoItem[];
  tipos: string[];
  recursos: Recurso[];
  tipo: string;
}) {
  const [editando, setEditando] = useState<CatalogoItem | null>(null);
  return (
    <>
      <TablaRegistros<CatalogoItem>
        className="border-none"
        columnas={[
          { clave: "on", titulo: "", ancho: "44px", render: (i) => <Interruptor item={i} /> },
          {
            clave: "nombre",
            titulo: "Nombre",
            valor: (i) => i.nombre,
            render: (i) => (
              <span className={`block min-w-0 ${i.disponible ? "" : "opacity-50"}`}>
                <span className="block truncate font-medium text-tinta">{i.nombre}</span>
                {i.alias.length > 0 ? <span className="block truncate text-[11px] text-tinta-3">{i.alias.join(", ")}</span> : null}
              </span>
            ),
          },
          {
            clave: "estado",
            titulo: "Estado",
            ancho: "132px",
            valor: (i) => (i.disponible ? 1 : 0),
            render: (i) =>
              i.disponible ? (
                i.existencias !== null ? (
                  <span className={`numeros text-[11.5px] ${i.existencias <= 3 ? "text-alerta" : "text-tinta-3"}`}>
                    {i.existencias} en existencia
                  </span>
                ) : (
                  <span className="text-[11.5px] text-tinta-3">Se ofrece</span>
                )
              ) : (
                <Insignia tono="alerta">Se acabó</Insignia>
              ),
          },
          {
            clave: "precio",
            titulo: "Precio",
            numerica: true,
            ancho: "96px",
            valor: (i) => (i.precio ? Number(i.precio) : null),
            render: (i) => (i.precio ? moneda(i.precio) : <span className="text-tinta-3">—</span>),
          },
          { clave: "orden", titulo: "Orden", numerica: true, ancho: "64px", valor: (i) => i.orden },
        ]}
        filas={items}
        clave={(i) => i.id}
        filtros={[
          { clave: "disponibles", nombre: "Se ofrecen", tono: "bueno", pasa: (i) => i.disponible },
          { clave: "agotados", nombre: "Agotados", tono: "alerta", pasa: (i) => !i.disponible },
          { clave: "pocos", nombre: "Quedan pocos", tono: "critico", pasa: (i) => i.existencias !== null && i.existencias <= 3 },
        ]}
        ordenInicial={{ clave: "orden", dir: "asc" }}
        alClic={setEditando}
        vacio={{
          titulo: `Sin ${etiquetaTipo(tipo, true).toLowerCase()}`,
          detalle: "Mientras no haya nada aquí, el agente contesta que no tiene el dato y ofrece transferir.",
        }}
      />
      {editando ? (
        <Dialogo
          titulo={editando.nombre}
          descripcion={`${etiquetaTipo(editando.tipo)} · ${editando.disponible ? "se ofrece" : "agotado"}`}
          cerrar={() => setEditando(null)}
          cabecera
          className="max-w-2xl"
        >
          <div className="px-4 py-4">
            <FormularioItem item={editando} tipos={tipos} recursos={recursos} />
            <Formulario accion={eliminarItemCatalogo} className="mt-3 border-t border-linea pt-3">
              <input type="hidden" name="id" value={editando.id} />
              <BotonPeligro>Eliminar del catálogo</BotonPeligro>
            </Formulario>
          </div>
        </Dialogo>
      ) : null}
    </>
  );
}
