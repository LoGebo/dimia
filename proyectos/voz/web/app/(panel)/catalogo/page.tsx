import { Encabezado } from "@/components/encabezado";
import { FormularioItem } from "@/components/item-catalogo";
import { ProbadorCatalogo } from "@/components/probador-catalogo";
import { BotonPeligro } from "@/components/boton-peligro";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Boton, Campo, Entrada, Insignia, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { agregarGrupoCatalogo, alternarDisponible, eliminarItemCatalogo, quitarGrupoCatalogo } from "@/lib/acciones";
import { catalogo, negocio, recursos } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";
import { moneda } from "@/lib/formato";
import { etiquetaTipo, TIPOS_POR_VERTICAL, type CatalogoItem, type Recurso } from "@/lib/tipos";

export default async function Catalogo() {
  const { giro } = await contexto();
  const [config, items, listaRecursos] = await Promise.all([negocio(), catalogo(), recursos()]);

  const sugeridos = TIPOS_POR_VERTICAL[config.vertical] ?? ["paquete"];
  const presentes = [...new Set(items.map((i) => i.tipo))];
  const propios = config.tipos_catalogo ?? [];
  const tipos = [...new Set([...sugeridos, ...propios, ...presentes])];
  const activos = listaRecursos.filter((r) => r.activo);
  const agotados = items.filter((i) => !i.disponible).length;

  return (
    <>
      <Encabezado
        titulo="Catálogo"
        descripcion="Lo que el negocio ofrece e informa: platillos, profesionales, propiedades. Es de donde el agente saca precios y de donde arma un pedido."
        giro={giro.nombre}
        acciones={
          agotados > 0 ? <Insignia tono="alerta">{agotados} marcados como no disponibles</Insignia> : null
        }
      />

      <div className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {tipos.map((tipo) => {
            const delTipo = items.filter((i) => i.tipo === tipo);
            return (
              <Tarjeta key={tipo}>
                <TarjetaCabecera
                  titulo={etiquetaTipo(tipo, true)}
                  descripcion={`${delTipo.length} items · ${delTipo.filter((i) => i.disponible).length} disponibles`}
                />
                <details className="border-b border-linea">
                  <summary className="cursor-pointer list-none px-4 py-2.5 text-[13px] font-medium text-acento hover:bg-panel-2">
                    + Agregar {etiquetaTipo(tipo).toLowerCase()}
                  </summary>
                  <div className="border-t border-linea bg-panel-2 px-4 py-4">
                    <FormularioItem tipos={tipos} recursos={activos} tipoInicial={tipo} />
                  </div>
                </details>
                {delTipo.length === 0 ? (
                  <Vacio
                    titulo={`Sin ${etiquetaTipo(tipo, true).toLowerCase()}`}
                    detalle="Mientras no haya nada aquí, el agente contesta que no tiene el dato y ofrece transferir."
                  />
                ) : (
                  <div>
                    {delTipo.map((item) => (
                      <FilaItem key={item.id} item={item} tipos={tipos} recursos={activos} />
                    ))}
                  </div>
                )}
              </Tarjeta>
            );
          })}

          <Tarjeta>
            <TarjetaCabecera
              titulo="Agregar un grupo"
              descripcion="Un grupo nuevo para acomodar lo que ofreces: postres, extras, promociones."
            />
            <Formulario accion={agregarGrupoCatalogo} className="flex flex-wrap items-end gap-3 px-4 py-4" reiniciar>
              <div className="min-w-0 flex-1">
                <Campo etiqueta="Nombre del grupo" ayuda="Una palabra en singular: postre, extra, promocion.">
                  <Entrada name="grupo" placeholder="postre" required />
                </Campo>
              </div>
              <BotonEnviar>Agregar grupo</BotonEnviar>
            </Formulario>
            {propios.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-linea px-4 py-3">
                <span className="etiqueta">Tuyos</span>
                {propios.map((g) => (
                  <Formulario key={g} accion={quitarGrupoCatalogo} className="inline-flex">
                    <input type="hidden" name="grupo" value={g} />
                    <button
                      type="submit"
                      className="border border-linea px-2 py-1 text-[12px] text-tinta-2 transition hover:border-critico hover:text-critico"
                      title="Quitar el grupo"
                    >
                      {etiquetaTipo(g, true)} ×
                    </button>
                  </Formulario>
                ))}
              </div>
            ) : null}
          </Tarjeta>
        </div>

        <div className="space-y-4 xl:sticky xl:top-[76px] xl:self-start">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Probar como cliente"
              descripcion="Lo mismo que ejecuta el agente en la llamada: buscar_catalogo."
            />
            <ProbadorCatalogo tipos={tipos} />
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

function FilaItem({
  item,
  tipos,
  recursos,
}: {
  item: CatalogoItem;
  tipos: string[];
  recursos: Recurso[];
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start border-b border-linea last:border-0">
      <form action={alternarDisponible} className="py-2.5 pl-4">
        <input type="hidden" name="id" value={item.id} />
        <button
          title={item.disponible ? "Marcar como agotado" : "Volver a ofrecerlo"}
          aria-label={item.disponible ? "Marcar como agotado" : "Volver a ofrecerlo"}
          className={`flex h-4 w-7 items-center rounded-full border transition ${
            item.disponible ? "justify-end border-bueno bg-bueno/25" : "justify-start border-linea-fuerte bg-panel-2"
          }`}
        >
          <span
            className={`mx-px h-3 w-3 rounded-full ${item.disponible ? "bg-bueno" : "bg-linea-fuerte"}`}
          />
        </button>
      </form>

      <details className="group min-w-0">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-panel-2">
          <span className={`min-w-0 flex-1 ${item.disponible ? "" : "opacity-45"}`}>
            <span className="block truncate text-[13px] font-medium text-tinta">{item.nombre}</span>
            {item.alias.length > 0 ? (
              <span className="block truncate text-[11px] text-tinta-3">{item.alias.join(", ")}</span>
            ) : null}
          </span>
          {item.existencias !== null && item.disponible ? (
            <span className={`numeros font-mono text-[11px] ${item.existencias <= 3 ? "text-alerta" : "text-tinta-3"}`}>{item.existencias} en existencia</span>
          ) : null}
          {item.disponible ? null : <Insignia tono="alerta">Se acabó</Insignia>}
          <span className="numeros text-[12px] text-tinta-2">{moneda(item.precio)}</span>
          <span className="text-[11px] text-tinta-3 group-open:text-acento">
            <span className="group-open:hidden">Editar</span>
            <span className="hidden group-open:inline">Cerrar</span>
          </span>
        </summary>
        <div className="border-t border-linea bg-panel-2 px-4 py-4">
          <FormularioItem item={item} tipos={tipos} recursos={recursos} />
          <form action={eliminarItemCatalogo} className="mt-3 border-t border-linea pt-3">
            <input type="hidden" name="id" value={item.id} />
            <BotonPeligro>Eliminar del catálogo</BotonPeligro>
          </form>
        </div>
      </details>
    </div>
  );
}
