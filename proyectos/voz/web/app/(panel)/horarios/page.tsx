import { Encabezado } from "@/components/encabezado";
import { EditorHorario } from "@/components/editor-horario";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Campo, Entrada, Selector, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { guardarExcepcion } from "@/lib/acciones";
import { negocio, recursos, reglas } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";
import { TablaExcepciones } from "./tabla";

export default async function Horarios() {
  const giro = await exigirSeccion("/horarios");
  const [config, listaRecursos, listaReglas] = await Promise.all([negocio(), recursos(), reglas()]);
  // Las ausencias por persona tienen su propia lista en Equipo; aquí solo las del negocio.
  const excepciones = listaReglas.filter((r) => r.fecha !== null && r.resource_id === null);

  return (
    <>
      <Encabezado
        titulo="Horarios"
        descripcion={`Cuándo contesta y trabaja el negocio. Hora de ${config.zona_horaria}.`}
        giro={giro.nombre}
      />
      <div className="space-y-4 px-5 py-5">
        <Tarjeta>
          <TarjetaCabecera
            titulo="Semana tipo"
            descripcion="Se repite cada semana. Las excepciones de abajo la sobrescriben en fechas puntuales."
          />
          <EditorHorario reglas={listaReglas} recursos={listaRecursos.filter((r) => r.activo)} />
        </Tarjeta>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
          <Tarjeta className="self-start">
            <TarjetaCabecera titulo="Agregar excepción" descripcion="Un festivo, un puente, una junta." />
            <Formulario accion={guardarExcepcion} className="space-y-3 px-4 py-4" reiniciar>
              <Campo etiqueta="Fecha">
                <Entrada type="date" name="fecha" required />
              </Campo>
              <Campo etiqueta="Qué pasa ese día">
                <Selector name="tipo" defaultValue="festivo">
                  <option value="festivo">Cerrado todo el día</option>
                  <option value="bloqueo">Bloqueo parcial</option>
                  <option value="disponible">Abierto extraordinario</option>
                </Selector>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Desde">
                  <Entrada type="time" name="hora_inicio" defaultValue="00:00" />
                </Campo>
                <Campo etiqueta="Hasta">
                  <Entrada type="time" name="hora_fin" defaultValue="23:59" />
                </Campo>
              </div>
              <BotonEnviar className="w-full">Agregar</BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta className="self-start">
            <TarjetaCabecera
              titulo="Excepciones"
              descripcion={`${excepciones.length} ${excepciones.length === 1 ? "fecha" : "fechas"} con reglas propias.`}
            />
            <TablaExcepciones excepciones={excepciones} />
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
