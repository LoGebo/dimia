import { Encabezado } from "@/components/encabezado";
import { BotonDialogo } from "@/components/dialogo";
import { FormularioItem, TablaCatalogo } from "@/components/item-catalogo";
import { ProbadorCatalogo } from "@/components/probador-catalogo";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Campo, Entrada, Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { agregarGrupoCatalogo, quitarGrupoCatalogo } from "@/lib/acciones";
import { catalogo, negocio, recursos } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";
import { etiquetaTipo, TIPOS_POR_VERTICAL } from "@/lib/tipos";

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
        acciones={agotados > 0 ? <Insignia tono="alerta">{agotados} marcados como no disponibles</Insignia> : null}
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
                  accion={
                    <BotonDialogo
                      etiqueta={`+ Agregar ${etiquetaTipo(tipo).toLowerCase()}`}
                      titulo={`Nuevo ${etiquetaTipo(tipo).toLowerCase()}`}
                      descripcion="Queda en el catálogo en cuanto guardes; el agente lo ofrece en la siguiente llamada."
                      ancho="max-w-2xl"
                    >
                      <FormularioItem tipos={tipos} recursos={activos} tipoInicial={tipo} />
                    </BotonDialogo>
                  }
                />
                <TablaCatalogo items={delTipo} tipos={tipos} recursos={activos} tipo={tipo} />
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
              <BotonEnviar className="mb-[22px]">Agregar grupo</BotonEnviar>
            </Formulario>
            {propios.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-linea px-4 py-3">
                <span className="etiqueta">Tuyos</span>
                {propios.map((g) => (
                  <Formulario key={g} accion={quitarGrupoCatalogo} className="inline-flex" silencioso>
                    <input type="hidden" name="grupo" value={g} />
                    <button
                      type="submit"
                      className="flex items-center gap-1.5 border border-linea px-2 py-1 text-[12px] text-tinta-2 transition-colors duration-150 hover:border-critico hover:text-critico"
                      title="Quitar el grupo"
                    >
                      <i aria-hidden="true" className="h-1 w-1 bg-current" />
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
            <TarjetaCabecera titulo="Probar como cliente" descripcion="Lo mismo que ejecuta el agente en la llamada: buscar_catalogo." />
            <ProbadorCatalogo tipos={tipos} />
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
