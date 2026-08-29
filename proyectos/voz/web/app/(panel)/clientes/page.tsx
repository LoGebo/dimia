import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { TablaClientes } from "@/components/kit/relacion-clientes";
import { clientes, negocio, resumenClientes, type SegmentoCliente } from "@/lib/consultas";
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

        {segmento !== "todos" || busqueda ? (
          <p className="flex flex-wrap items-center gap-x-3 text-[12px] text-tinta-2">
            <span>
              Viendo {SEGMENTOS.find((s) => s.valor === segmento)?.nombre.toLowerCase()}
              {busqueda ? ` que coinciden con «${busqueda}»` : ""}
              {lista.length >= 200 ? " · primeros 200" : ""}
            </span>
            <Link href="/clientes" className="text-acento transition-colors duration-150 hover:text-tinta">
              Ver todos
            </Link>
          </p>
        ) : lista.length >= 200 ? (
          <p className="text-[12px] text-tinta-3">Se muestran los 200 con contacto más reciente; busca por nombre o teléfono para llegar al resto.</p>
        ) : null}

        <TablaClientes lista={lista} zona={config.zona_horaria} agenda={agenda} pedidos={pedidos} busqueda={busqueda} />
      </div>
    </>
  );
}
