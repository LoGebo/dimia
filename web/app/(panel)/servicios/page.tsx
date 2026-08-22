import { Encabezado } from "@/components/encabezado";
import {
  FilaRecurso,
  FilaServicio,
  FormularioRecurso,
  FormularioServicio,
  NuevoEnPanel,
} from "@/components/catalogo";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { negocio, recursos, servicios } from "@/lib/consultas";
import { etiquetasRecurso } from "@/lib/tipos";

export default async function Catalogo() {
  const [config, listaRecursos, listaServicios] = await Promise.all([negocio(), recursos(), servicios()]);
  const vertical = etiquetasRecurso(config.vertical);

  return (
    <>
      <Encabezado
        titulo="Servicios"
        descripcion="Qué puede reservar el agente, cuánto dura y con quién."
      />
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaCabecera
            titulo={`${vertical.recurso}es`}
            descripcion={`Lo que se ocupa al reservar. Ejemplos: ${vertical.ejemplos}.`}
          />
          <NuevoEnPanel titulo={`Nuevo ${vertical.recurso.toLowerCase()}`}>
            <FormularioRecurso vertical={config.vertical} compacto />
          </NuevoEnPanel>
          {listaRecursos.length === 0 ? (
            <Vacio titulo="Sin recursos" detalle="Sin al menos uno, el agente no puede ofrecer horarios." />
          ) : (
            <div>
              {listaRecursos.map((r) => (
                <FilaRecurso key={r.id} recurso={r} vertical={config.vertical} />
              ))}
            </div>
          )}
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera
            titulo="Servicios"
            descripcion="Duración, buffer y precio. El agente los dice tal cual."
          />
          <NuevoEnPanel titulo="Nuevo servicio">
            <FormularioServicio recursos={listaRecursos.filter((r) => r.activo)} compacto />
          </NuevoEnPanel>
          {listaServicios.length === 0 ? (
            <Vacio titulo="Sin servicios" detalle="Agrega al menos uno para poder agendar." />
          ) : (
            <div>
              {listaServicios.map((s) => (
                <FilaServicio key={s.id} servicio={s} recursos={listaRecursos.filter((r) => r.activo)} />
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
