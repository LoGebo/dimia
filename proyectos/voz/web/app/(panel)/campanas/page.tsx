import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { TarjetaInsight, type Insight } from "@/components/kit";
import { TablaCampanas } from "@/components/kit/relacion-campanas";
import { Tarjeta, Vacio } from "@/components/ui/primitivos";
import { campanas, negocio } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";
import type { Campana } from "@/lib/tipos";

/** Lo que las campañas han dejado, en tres lecturas: citas recuperadas, respuesta y lo que falta. */
function insightsDe(lista: Campana[]): Insight[] {
  const cronologicas = [...lista].sort((a, b) => new Date(a.creado).getTime() - new Date(b.creado).getTime());
  const acumulado = (toma: (c: Campana) => number) => {
    let suma = 0;
    return [0, ...cronologicas.map((c) => (suma += toma(c)))];
  };
  const enviados = lista.reduce((s, c) => s + c.enviados, 0);
  const contestados = lista.reduce((s, c) => s + c.contestados, 0);
  const agendaron = lista.reduce((s, c) => s + c.agendaron, 0);
  const pendientes = lista.filter((c) => c.estado === "activa").reduce((s, c) => s + c.pendientes, 0);
  const sinRespuesta = lista.reduce((s, c) => s + c.sin_respuesta, 0);
  const tasa = enviados > 0 ? Math.round((contestados / enviados) * 100) : 0;
  const mejor = [...lista].sort((a, b) => b.agendaron - a.agendaron)[0];

  return [
    {
      id: "agendaron",
      titulo: "Citas recuperadas por campañas",
      cifra: String(agendaron),
      unidad: agendaron === 1 ? "cita" : "citas",
      variacion: { texto: `${contestados} contestaron`, tono: contestados > 0 ? "bueno" : "neutro" },
      serie: acumulado((c) => c.agendaron),
      nota: mejor && mejor.agendaron > 0 ? `La que más trajo: ${mejor.nombre}.` : "Todavía ninguna trae citas; el agente sigue marcando.",
      accion: { texto: "Ver clientes que faltaron", href: "/clientes?ver=faltan" },
    },
    {
      id: "respuesta",
      titulo: "De cada 100 personas contactadas, contestaron",
      cifra: String(tasa),
      unidad: "%",
      variacion: { texto: `${enviados} contactadas`, tono: "neutro" },
      serie: acumulado((c) => c.contestados),
      nota: sinRespuesta > 0 ? `${sinRespuesta} sin respuesta; se reintentan al día siguiente.` : "Sin pendientes de respuesta.",
    },
    {
      id: "pendientes",
      titulo: "Personas por contactar en campañas activas",
      cifra: String(pendientes),
      unidad: pendientes === 1 ? "persona" : "personas",
      variacion: { texto: `${lista.filter((c) => c.estado === "activa").length} activas`, tono: pendientes > 0 ? "alerta" : "neutro" },
      serie: acumulado((c) => c.total),
      nota: "El agente sale en la ventana de horario de cada campaña.",
      accion: { texto: "Nueva campaña", href: "/campanas/nueva" },
    },
  ];
}

export default async function Campanas() {
  const { giro } = await contexto();
  const [config, lista] = await Promise.all([negocio(), campanas()]);

  return (
    <>
      <Encabezado
        titulo="Campañas"
        descripcion="El agente sale a buscar: a quien faltó, a quien no ha vuelto, a quien debe. Por WhatsApp o marcando."
        giro={giro.nombre}
        principal={
          <Link href="/campanas/nueva" className="inline-flex h-8 items-center gap-1.5 border border-transparent bg-acento px-3 text-[13px] font-medium text-acento-tinta transition-[filter] duration-150 hover:brightness-110">
            <span aria-hidden="true" className="">+</span> Nueva campaña
          </Link>
        }
      />
      <div className="px-5 py-5">
        {lista.length === 0 ? (
          <Tarjeta>
            <Vacio
              titulo="Todavía no hay campañas"
              detalle="La primera que conviene: recuperar a quien faltó a su cita. Toma un minuto crearla."
              accion={
                <Link href="/campanas/nueva" className="mt-2 text-[13px] font-medium text-acento hover:underline">
                  Crear la primera
                </Link>
              }
            />
          </Tarjeta>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <TablaCampanas lista={lista} zona={config.zona_horaria} />
            <TarjetaInsight rotulo="Resultados" insights={insightsDe(lista)} />
          </div>
        )}
      </div>
    </>
  );
}
