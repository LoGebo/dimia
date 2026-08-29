import Link from "next/link";
import { notFound } from "next/navigation";
import { RenglonConversacion } from "@/components/renglon-conversacion";
import { Encabezado } from "@/components/encabezado";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { LineaTiempoCliente } from "@/components/kit/relacion-ficha";
import { ListaReservas } from "@/components/lista-reservas";
import { AreaTexto, Campo, Entrada, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { guardarCliente } from "@/lib/acciones";
import { cliente, conversacionesDeCliente, eventosDeCliente, negocio, reservasDeCliente } from "@/lib/consultas";
import { fechaCorta, moneda, telefono } from "@/lib/formato";
import { contexto } from "@/lib/sesion";

export default async function FichaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { giro } = await contexto();
  const [config, ficha] = await Promise.all([negocio(), cliente(id)]);
  if (!ficha) notFound();
  const [eventos, reservas, hilos] = await Promise.all([eventosDeCliente(id), reservasDeCliente(id), conversacionesDeCliente(id)]);
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");

  return (
    <>
      <Encabezado
        titulo={ficha.nombre ?? "Sin nombre"}
        descripcion={`Cliente desde ${fechaCorta(ficha.primer_contacto, config.zona_horaria)} · ${ficha.telefono ? telefono(ficha.telefono) : "sin teléfono"}`}
        giro={giro.nombre}
        acciones={
          <>
            {ficha.origen ? <span className="font-mono text-[10.5px] tracking-[0.14em] text-tinta-3 uppercase">Origen · {ficha.origen}</span> : null}
            <Link href="/clientes" className="text-[12px] text-tinta-3 transition-colors duration-150 hover:text-acento">
              Todos los clientes
            </Link>
          </>
        }
      />

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          {agenda ? <Cifra etiqueta="Citas" valor={String(ficha.citas)} unidad={`${ficha.atendidas} atendidas`} glifo={Glifos.personas} /> : null}
          {agenda ? (
            <Cifra etiqueta="Faltas" valor={String(ficha.no_asistio)} glifo={Glifos.alerta} tono={ficha.no_asistio > 0 ? "critico" : "bueno"} pildora={ficha.no_asistio > 1 ? "reincide" : undefined} />
          ) : null}
          {pedidos ? <Cifra etiqueta="Pedidos" valor={String(ficha.pedidos)} glifo={Glifos.personas} /> : null}
          {pedidos ? <Cifra etiqueta="Gastado" valor={moneda(ficha.gastado)} glifo={Glifos.dinero} /> : null}
          <Cifra etiqueta="Último contacto" valor={fechaCorta(ficha.ultimo_contacto, config.zona_horaria)} glifo={Glifos.reloj} />
          {!agenda && !pedidos ? <Cifra etiqueta="Recados pendientes" valor={String(ficha.recados_pendientes)} glifo={Glifos.llamada} tono={ficha.recados_pendientes > 0 ? "alerta" : "bueno"} /> : null}
        </TiraIndicadores>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Tarjeta>
              <TarjetaCabecera titulo="Qué ha pasado" descripcion="Cada cita, pedido, recado, mensaje y llamada, en orden." />
              <LineaTiempoCliente eventos={eventos} zona={config.zona_horaria} />
            </Tarjeta>

            {agenda ? (
              <Tarjeta>
                <TarjetaCabecera titulo="Citas" descripcion={`${reservas.length} más recientes`} />
                {reservas.length === 0 ? <Vacio titulo="Sin citas" /> : <ListaReservas reservas={reservas} zona={config.zona_horaria} mostrarFecha />}
              </Tarjeta>
            ) : null}
          </div>

          <div className="space-y-4">
            <Tarjeta>
              <TarjetaCabecera titulo="Ficha" descripcion="Lo que el equipo sabe de esta persona." />
              {ficha.etiquetas.length > 0 ? (
                <p className="flex flex-wrap gap-1 px-4 pt-3">
                  {ficha.etiquetas.map((e) => (
                    <span key={e} className="border border-linea bg-panel-2 px-1.5 text-[11px] leading-5 text-tinta-2">
                      {e}
                    </span>
                  ))}
                </p>
              ) : null}
              <Formulario accion={guardarCliente} className="space-y-3 px-4 py-4">
                <input type="hidden" name="id" value={ficha.id} />
                <Campo etiqueta="Nombre">
                  <Entrada name="nombre" defaultValue={ficha.nombre ?? ""} placeholder="Como se presenta" />
                </Campo>
                <Campo etiqueta="Correo">
                  <Entrada name="correo" type="email" defaultValue={ficha.correo ?? ""} placeholder="Opcional" />
                </Campo>
                <Campo etiqueta="Etiquetas" ayuda="Separadas por coma: vip, alergia, factura.">
                  <Entrada name="etiquetas" defaultValue={ficha.etiquetas.join(", ")} />
                </Campo>
                <Campo etiqueta="Notas" ayuda="Lo que el agente debe saber al atenderle.">
                  <AreaTexto name="notas" rows={4} defaultValue={ficha.notas ?? ""} />
                </Campo>
                <BotonEnviar>Guardar</BotonEnviar>
              </Formulario>
            </Tarjeta>

            <Tarjeta>
              <TarjetaCabecera titulo="Conversaciones" descripcion="Por teléfono, WhatsApp y redes." />
              {hilos.length === 0 ? (
                <Vacio titulo="Sin conversaciones" />
              ) : (
                hilos.map((c) => <RenglonConversacion key={c.id} conversacion={c} zona={config.zona_horaria} />)
              )}
            </Tarjeta>
          </div>
        </div>
      </div>
    </>
  );
}
