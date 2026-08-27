"use client";

import { useState } from "react";
import { EditorAtributos } from "@/components/atributos";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { AreaTexto, Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { guardarItemCatalogo } from "@/lib/acciones";
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
            <Entrada
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="platillo"
              required
            />
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
          <Entrada name="nombre" defaultValue={item?.nombre} required placeholder="Tacos de pastor" />
        </Campo>
      </div>

      <Campo etiqueta="Descripción" ayuda="El agente la traduce a como hablaría una persona.">
        <AreaTexto
          name="descripcion"
          defaultValue={item?.descripcion ?? ""}
          rows={2}
          placeholder="Cinco tacos con piña, cebolla y cilantro."
        />
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
