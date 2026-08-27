import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Boton, Insignia, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { Formulario } from "@/components/formulario";
import { cambiarEstadoCampana } from "@/lib/acciones";
import { campanas, negocio } from "@/lib/consultas";
import { fechaCorta } from "@/lib/formato";
import { contexto } from "@/lib/sesion";
import { NOMBRE_TIPO_CAMPANA, type Campana } from "@/lib/tipos";

const TONO_ESTADO = { borrador: "neutro", activa: "bueno", pausada: "alerta", terminada: "neutro" } as const;
const NOMBRE_ESTADO = { borrador: "Borrador", activa: "Activa", pausada: "Pausada", terminada: "Terminada" } as const;

export default async function Campanas() {
  const { giro } = await contexto();
  const [config, lista] = await Promise.all([negocio(), campanas()]);
  const activas = lista.filter((c) => c.estado === "activa");
  const otras = lista.filter((c) => c.estado !== "activa");

  return (
    <>
      <Encabezado
        titulo="Campañas"
        descripcion="El agente sale a buscar: a quien faltó, a quien no ha vuelto, a quien debe. Por WhatsApp o marcando."
        giro={giro.nombre}
        principal={
          <Link href="/campanas/nueva" className="inline-flex h-8 items-center gap-1.5 border border-transparent bg-acento px-3 text-[13px] font-medium text-acento-tinta transition hover:brightness-110">
            <span aria-hidden="true" className="font-mono">+</span> Nueva campaña
          </Link>
        }
      />
      <div className="space-y-4 px-5 py-5">
        {lista.length === 0 ? (
          <Tarjeta>
            <Vacio
              titulo="Todavía no hay campañas"
              detalle="La primera que conviene: recuperar a quien faltó a su cita. Toma un minuto crearla."
              accion={
                <Link href="/campanas/nueva" className="mt-2 text-[13px] font-medium text-acento hover:underline">
                  Crear la primera →
                </Link>
              }
            />
          </Tarjeta>
        ) : null}
        {[
          { titulo: "Activas", items: activas },
          { titulo: "Las demás", items: otras },
        ]
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <Tarjeta key={g.titulo}>
              <TarjetaCabecera titulo={g.titulo} />
              <ul className="divide-y divide-linea">
                {g.items.map((c) => (
                  <Renglon key={c.id} campana={c} zona={config.zona_horaria} />
                ))}
              </ul>
            </Tarjeta>
          ))}
      </div>
    </>
  );
}

function Renglon({ campana: c, zona }: { campana: Campana; zona: string }) {
  const avance = c.total > 0 ? Math.round(((c.total - c.pendientes) / c.total) * 100) : 0;
  return (
    <li className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
      <div className="min-w-[220px] flex-1">
        <Link href={`/campanas/${c.id}`} className="text-[13px] font-medium text-tinta transition hover:text-acento">
          {c.nombre}
        </Link>
        <p className="text-[11.5px] text-tinta-3">
          {NOMBRE_TIPO_CAMPANA[c.tipo].nombre} · {c.canal === "llamada" ? "llamada" : "WhatsApp"} · {fechaCorta(c.creado, zona)}
        </p>
      </div>
      <div className="flex min-w-[260px] flex-1 items-center gap-3">
        <div className="h-[3px] flex-1 bg-linea">
          <div className="h-full bg-acento" style={{ width: `${avance}%` }} />
        </div>
        <span className="numeros font-mono text-[11px] text-tinta-3">
          {c.total - c.pendientes}/{c.total}
        </span>
      </div>
      <div className="numeros flex gap-3 font-mono text-[11px]">
        <span className="text-tinta-2" title="Contestaron">{c.contestados} contestaron</span>
        <span className="text-bueno" title="Agendaron">{c.agendaron} agendaron</span>
      </div>
      <Insignia tono={TONO_ESTADO[c.estado]}>{NOMBRE_ESTADO[c.estado]}</Insignia>
      <div className="flex gap-1">
        {c.estado === "borrador" || c.estado === "pausada" ? (
          <Formulario accion={cambiarEstadoCampana}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="estado" value="activa" />
            <Boton variante="solido" className="!h-7">Activar</Boton>
          </Formulario>
        ) : null}
        {c.estado === "activa" ? (
          <Formulario accion={cambiarEstadoCampana}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="estado" value="pausada" />
            <Boton variante="fantasma" className="!h-7">Pausar</Boton>
          </Formulario>
        ) : null}
      </div>
    </li>
  );
}
