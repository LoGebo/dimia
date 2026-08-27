import Link from "next/link";
import { notFound } from "next/navigation";
import { Encabezado } from "@/components/encabezado";
import { Formulario } from "@/components/formulario";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { Boton, Campo, Insignia, Selector, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { agregarContactosCampana, cambiarEstadoCampana, excluirContacto } from "@/lib/acciones";
import { campana, contactosDeCampana, negocio } from "@/lib/consultas";
import { fechaCorta, hora, telefono } from "@/lib/formato";
import { contexto } from "@/lib/sesion";
import { NOMBRE_ESTADO_CONTACTO, NOMBRE_TIPO_CAMPANA, type EstadoContacto } from "@/lib/tipos";

const TONO: Record<EstadoContacto, "neutro" | "bueno" | "alerta" | "critico" | "acento"> = {
  pendiente: "neutro",
  en_curso: "acento",
  enviado: "acento",
  contestado: "bueno",
  agendo: "bueno",
  sin_respuesta: "alerta",
  rechazo: "critico",
  fallido: "critico",
  excluido: "neutro",
};

export default async function DetalleCampana({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { giro } = await contexto();
  const [config, c] = await Promise.all([negocio(), campana(id)]);
  if (!c) notFound();
  const contactos = await contactosDeCampana(id);
  const tasa = c.enviados > 0 ? Math.round((c.contestados / c.enviados) * 100) : 0;

  return (
    <>
      <Encabezado
        titulo={c.nombre}
        descripcion={`${NOMBRE_TIPO_CAMPANA[c.tipo].nombre} · por ${c.canal === "llamada" ? "llamada" : "WhatsApp"} · de ${c.ventana_inicio.slice(0, 5)} a ${c.ventana_fin.slice(0, 5)} · hasta ${c.max_intentos} intentos`}
        giro={giro.nombre}
        acciones={
          <Link href="/campanas" className="text-[12px] text-tinta-3 transition hover:text-acento">
            Todas las campañas
          </Link>
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
          <Tarjeta>
            <TarjetaCabecera titulo="Personas" descripcion="Qué pasó con cada una. Excluir saca a alguien sin borrar el rastro." />
            {contactos.length === 0 ? (
              <Vacio titulo="Nadie todavía" detalle="Agrega personas desde la derecha o cambia el criterio de la campaña." />
            ) : (
              <ul className="divide-y divide-linea">
                {contactos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
                    <div className="min-w-[180px] flex-1">
                      <Link href={`/clientes/${p.cliente_id}`} className="text-[13px] font-medium text-tinta transition hover:text-acento">
                        {p.cliente_nombre ?? "Sin nombre"}
                      </Link>
                      <p className="numeros font-mono text-[11px] text-tinta-3">{p.cliente_telefono ? telefono(p.cliente_telefono) : "—"}</p>
                    </div>
                    <p className="max-w-[320px] flex-1 truncate text-[12px] text-tinta-2" title={p.resultado ?? ""}>
                      {p.resultado ?? ""}
                    </p>
                    <span className="numeros font-mono text-[11px] text-tinta-3">
                      {p.ultimo_intento ? `${fechaCorta(p.ultimo_intento, config.zona_horaria)} ${hora(p.ultimo_intento, config.zona_horaria)}` : `intento ${p.intentos}`}
                    </span>
                    <Insignia tono={TONO[p.estado]}>{NOMBRE_ESTADO_CONTACTO[p.estado]}</Insignia>
                    {p.estado === "pendiente" || p.estado === "sin_respuesta" ? (
                      <Formulario accion={excluirContacto}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="h-7 px-2 text-[12px] text-tinta-3 transition hover:text-critico">Excluir</button>
                      </Formulario>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <div className="space-y-4">
            <Tarjeta>
              <TarjetaCabecera titulo={c.canal === "llamada" ? "Guion" : "Mensaje"} />
              <p className="px-4 pb-4 text-[13px] leading-relaxed whitespace-pre-wrap text-tinta">{c.mensaje}</p>
              {c.objetivo ? <p className="border-t border-linea px-4 py-2.5 text-[12px] text-tinta-3">Objetivo: {c.objetivo}</p> : null}
            </Tarjeta>
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
