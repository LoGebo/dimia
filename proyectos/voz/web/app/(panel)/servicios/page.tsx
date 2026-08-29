import { Encabezado } from "@/components/encabezado";
import { FormularioRecurso, FormularioServicio, NuevoEnPanel, TablaRecursos, TablaServicios } from "@/components/catalogo";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { negocio, recursos, servicios } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";
import { etiquetasRecurso } from "@/lib/tipos";

export default async function Catalogo() {
  const giro = await exigirSeccion("/servicios");
  const [config, listaRecursos, listaServicios] = await Promise.all([negocio(), recursos(), servicios()]);
  const vertical = etiquetasRecurso(config.vertical);
  const activos = listaRecursos.filter((r) => r.activo);

  return (
    <>
      <Encabezado
        titulo="Servicios"
        descripcion="Qué puede reservar el agente, cuánto dura y con quién."
        giro={giro.nombre}
      />
      <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaCabecera
            titulo={vertical.plural}
            descripcion={`Lo que se ocupa al reservar. Ejemplos: ${vertical.ejemplos}.`}
            accion={
              <NuevoEnPanel titulo={`Nuevo ${vertical.recurso.toLowerCase()}`}>
                <FormularioRecurso vertical={config.vertical} />
              </NuevoEnPanel>
            }
          />
          <TablaRecursos recursos={listaRecursos} vertical={config.vertical} etiqueta={vertical.recurso} />
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera
            titulo="Servicios"
            descripcion="Duración, buffer y precio. El agente los dice tal cual."
            accion={
              <NuevoEnPanel titulo="Nuevo servicio">
                <FormularioServicio recursos={activos} />
              </NuevoEnPanel>
            }
          />
          <TablaServicios servicios={listaServicios} recursos={activos} />
        </Tarjeta>
      </div>
    </>
  );
}
