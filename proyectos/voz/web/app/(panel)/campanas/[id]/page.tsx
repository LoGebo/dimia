import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado } from "@/components/encabezado";
import { Formulario } from "@/components/formulario";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { AvanceCampana, MarcaCampanaCreada, ResultadosCampana, TablaContactos } from "@/components/kit/relacion-campanas";
import { Boton, Campo, Selector, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { agregarContactosCampana, cambiarEstadoCampana } from "@/lib/acciones";
import { campana, contactosDeCampana, negocio } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";
import { NOMBRE_TIPO_CAMPANA } from "@/lib/tipos";

export default async function DetalleCampana({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { giro } = await contexto();
  const [config, c] = await Promise.all([negocio(), campana(id)]);
  if (!c) notFound();
  const contactos = await contactosDeCampana(id);
  const tasa = c.enviados > 0 ? Math.round((c.contestados / c.enviados) * 100) : 0;
  const rechazos = contactos.filter((p) => p.estado === "rechazo").length;

  return (
    <>
      <Encabezado
        titulo={c.nombre}
        descripcion={`${NOMBRE_TIPO_CAMPANA[c.tipo].nombre} · por ${c.canal === "llamada" ? "llamada" : "WhatsApp"} · de ${c.ventana_inicio.slice(0, 5)} a ${c.ventana_fin.slice(0, 5)} · hasta ${c.max_intentos} intentos`}
        giro={giro.nombre}
        acciones={
          <>
            <MarcaCampanaCreada nombre={c.nombre} />
            <Link href="/campanas" className="text-[12px] text-tinta-3 transition-colors duration-150 hover:text-acento">
              Todas las campañas
            </Link>
          </>
        }
        principal={
          c.estado === "activa" ? (
            <Formulario accion={cambiarEstadoCampana}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="estado" value="pausada" />
              <Boton>Pausar</Boton>
            </Formulario>
          ) : c.estado === "terminada" ? null : (
            <Formulario accion={cambiarEstadoCampana}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="estado" value="activa" />
              <Boton variante="solido">Activar</Boton>
            </Formulario>
          )
        }
      />
      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra etiqueta="Personas" valor={String(c.total)} unidad={`${c.pendientes} por contactar`} glifo={Glifos.personas} />
          <Cifra etiqueta="Contactadas" valor={String(c.enviados)} glifo={Glifos.llamada} pildora={c.sin_respuesta > 0 ? `${c.sin_respuesta} sin respuesta` : undefined} tono="alerta" />
          <Cifra etiqueta="Contestaron" valor={String(c.contestados)} unidad={c.enviados > 0 ? `${tasa} %` : undefined} glifo={Glifos.personas} tono="bueno" />
          <Cifra etiqueta="Agendaron" valor={String(c.agendaron)} glifo={Glifos.reloj} tono="bueno" pildora={c.agendaron > 0 ? "recuperadas" : undefined} />
        </TiraIndicadores>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Tarjeta>
              <TarjetaCabecera titulo="Personas" descripcion="Qué pasó con cada una. Excluir saca a alguien sin borrar el rastro." />
              <TablaContactos contactos={contactos} zona={config.zona_horaria} />
            </Tarjeta>
            <Tarjeta>
              <TarjetaCabecera titulo={c.canal === "llamada" ? "Guion" : "Mensaje"} descripcion={c.canal === "llamada" ? "Lo que el agente sabe antes de marcar." : "Tal cual lo recibe cada persona."} />
              <p className="border-l-2 border-acento mx-4 mb-4 pl-3 text-[13px] leading-relaxed whitespace-pre-wrap text-tinta">{c.mensaje}</p>
              {c.objetivo ? (
                <p className="border-t border-linea px-4 py-2.5 text-[12px] text-tinta-2">
                  <span className="text-tinta-3">Objetivo: </span>
                  {c.objetivo}
                </p>
              ) : null}
            </Tarjeta>
          </div>

          <div className="space-y-4">
            <AvanceCampana campana={c} zona={config.zona_horaria} rechazos={rechazos} />
            <ResultadosCampana campana={c} contactos={contactos} zona={config.zona_horaria} />
            <Tarjeta>
              <TarjetaCabecera titulo="Agregar personas" descripcion="Un segmento completo de tus clientes." />
              <Formulario accion={agregarContactosCampana} className="space-y-3 px-4 pb-4">
                <input type="hidden" name="campana_id" value={c.id} />
                <div className="flex items-end gap-2">
                  <Campo etiqueta="Segmento" className="flex-1">
                    <Selector name="segmento" defaultValue="faltan">
                      <option value="faltan">Han faltado a una cita</option>
                      <option value="inactivos">Sin contacto en 90 días</option>
                      <option value="frecuentes">Frecuentes</option>
                      <option value="todos">Todos con teléfono</option>
                    </Selector>
                  </Campo>
                  <Boton>Agregar</Boton>
                </div>
              </Formulario>
            </Tarjeta>
          </div>
        </div>
      </div>
    </>
  );
}
