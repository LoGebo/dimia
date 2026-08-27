import { BotonPeligro } from "@/components/boton-peligro";
import { Encabezado } from "@/components/encabezado";
import { EditorHorario } from "@/components/editor-horario";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Campo, Entrada, Selector, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { fechaCorta } from "@/lib/formato";
import { eliminarRegla, guardarExcepcion } from "@/lib/acciones";
import { negocio, recursos, reglas } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

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

        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Tarjeta>
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
                  <BotonEnviar className="w-full">
                    Agregar
                  </BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera titulo="Excepciones" descripcion={`${excepciones.length} fechas con reglas propias.`} />
            {excepciones.length === 0 ? (
              <Vacio
                titulo="Sin excepciones"
                detalle="Da de alta los días festivos y los puentes para que el agente no ofrezca horarios en los que estarás cerrado."
              />
            ) : (
              <ul className="divide-y divide-linea">
                {excepciones.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="numeros w-24 text-[13px] font-medium text-tinta">{fechaCorta(`${r.fecha}T12:00:00Z`, "UTC")}</span>
                    <span className="text-[13px] text-tinta-2">
                      {r.tipo === "festivo"
                        ? "Cerrado"
                        : r.tipo === "bloqueo"
                          ? "Bloqueo"
                          : "Abierto extraordinario"}
                    </span>
                    <span className="numeros text-[12px] text-tinta-3">
                      {r.hora_inicio} – {r.hora_fin}
                    </span>
                    <Formulario accion={eliminarRegla} className="ml-auto">
                      <input type="hidden" name="id" value={r.id} />
                      <BotonPeligro etiqueta="Sí, quitar">Quitar</BotonPeligro>
                    </Formulario>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
