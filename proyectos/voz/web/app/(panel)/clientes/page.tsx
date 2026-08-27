import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Chip, Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { Tarjeta, Vacio } from "@/components/ui/primitivos";
import { clientes, negocio, resumenClientes, type SegmentoCliente } from "@/lib/consultas";
import { fechaCorta, moneda, telefono } from "@/lib/formato";
import { contexto } from "@/lib/sesion";

const SEGMENTOS: { valor: SegmentoCliente; nombre: string }[] = [
  { valor: "todos", nombre: "Todos" },
  { valor: "nuevos", nombre: "Nuevos este mes" },
  { valor: "frecuentes", nombre: "Frecuentes" },
  { valor: "inactivos", nombre: "Sin contacto en 90 días" },
  { valor: "faltan", nombre: "Han faltado" },
];

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; q?: string }>;
}) {
  const { giro } = await contexto();
  const parametros = await searchParams;
  const segmento = SEGMENTOS.find((s) => s.valor === parametros.ver)?.valor ?? "todos";
  const busqueda = parametros.q?.trim() ?? "";
  const [config, lista, resumen] = await Promise.all([negocio(), clientes(segmento, busqueda), resumenClientes()]);
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");

  return (
    <>
      <Encabezado
        titulo="Clientes"
        descripcion="Cada persona que llamó o escribió. Entra a una para ver todo lo que pasó con ella."
        giro={giro.nombre}
        acciones={
          <form action="/clientes" className="flex items-center gap-1">
            <input type="hidden" name="ver" value={segmento} />
            <input
              name="q"
              defaultValue={busqueda}
              placeholder="Nombre o teléfono"
              aria-label="Buscar cliente por nombre o teléfono"
              className="h-8 w-52 border border-linea bg-panel px-2.5 text-xs text-tinta outline-none placeholder:text-tinta-3 focus:border-acento"
            />
          </form>
        }
      />

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra etiqueta="Clientes" valor={String(resumen.total)} glifo={Glifos.personas} />
          <Cifra etiqueta="Nuevos en 30 días" valor={String(resumen.nuevos30)} glifo={Glifos.personas} tono="bueno" pildora={resumen.nuevos30 > 0 ? "creciendo" : undefined} />
          <Cifra
            etiqueta="Sin contacto en 90 días"
            valor={String(resumen.inactivos90)}
            glifo={Glifos.reloj}
            tono={resumen.inactivos90 > 0 ? "alerta" : "bueno"}
            pildora={resumen.inactivos90 > 0 ? "por recuperar" : "al día"}
          />
          <Cifra
            etiqueta="Han faltado a una cita"
            valor={String(resumen.faltan)}
            glifo={Glifos.alerta}
            tono={resumen.faltan > 0 ? "critico" : "bueno"}
          />
        </TiraIndicadores>

        <div className="flex flex-wrap items-center gap-1.5">
          {SEGMENTOS.map((s) => (
            <Chip key={s.valor} activo={s.valor === segmento} href={`/clientes?ver=${s.valor}${busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}`}>
              {s.nombre}
            </Chip>
          ))}
          <span className="numeros ml-auto font-mono text-[11px] text-tinta-3">{lista.length} clientes</span>
        </div>

        <Tarjeta>
          {lista.length === 0 ? (
            <Vacio titulo="Nadie por aquí" detalle={busqueda ? "Prueba con otro nombre o teléfono." : "En cuanto alguien llame o escriba, aparece aquí solo."} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-linea">
                    <th className="etiqueta px-4 py-2.5 text-left font-normal">Cliente</th>
                    <th className="etiqueta px-4 py-2.5 text-left font-normal">Teléfono</th>
                    {agenda ? <th className="etiqueta px-4 py-2.5 text-right font-normal">Citas</th> : null}
                    {agenda ? <th className="etiqueta px-4 py-2.5 text-right font-normal">Faltas</th> : null}
                    {pedidos ? <th className="etiqueta px-4 py-2.5 text-right font-normal">Pedidos</th> : null}
                    {pedidos ? <th className="etiqueta px-4 py-2.5 text-right font-normal">Gastado</th> : null}
                    <th className="etiqueta px-4 py-2.5 text-left font-normal">Último contacto</th>
                    <th className="etiqueta px-4 py-2.5 text-left font-normal">Etiquetas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {lista.map((c) => (
                    <tr key={c.id} className="hover:bg-panel-2">
                      <td className="px-4 py-2.5">
                        <Link href={`/clientes/${c.id}`} className="font-medium text-tinta transition hover:text-acento">
                          {c.nombre ?? "Sin nombre"}
                        </Link>
                        {c.recados_pendientes > 0 ? (
                          <span className="ml-2 bg-alerta/12 px-1.5 py-0.5 font-mono text-[10px] text-alerta">recado</span>
                        ) : null}
                      </td>
                      <td className="numeros px-4 py-2.5 font-mono text-[12px] text-tinta-2">{c.telefono ? telefono(c.telefono) : "—"}</td>
                      {agenda ? <td className="numeros px-4 py-2.5 text-right font-mono text-[12px]">{c.citas}</td> : null}
                      {agenda ? (
                        <td className={`numeros px-4 py-2.5 text-right font-mono text-[12px] ${c.no_asistio > 0 ? "text-critico" : "text-tinta-3"}`}>
                          {c.no_asistio}
                        </td>
                      ) : null}
                      {pedidos ? <td className="numeros px-4 py-2.5 text-right font-mono text-[12px]">{c.pedidos}</td> : null}
                      {pedidos ? <td className="numeros px-4 py-2.5 text-right font-mono text-[12px]">{moneda(c.gastado)}</td> : null}
                      <td className="numeros px-4 py-2.5 font-mono text-[12px] text-tinta-2">{fechaCorta(c.ultimo_contacto, config.zona_horaria)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {c.etiquetas.map((e) => (
                            <span key={e} className="bg-panel-2 px-1.5 py-0.5 text-[11px] text-tinta-2">
                              {e}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
