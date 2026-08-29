"use client";

import { TablaRegistros } from "@/components/kit";
import { Insignia } from "@/components/ui/primitivos";
import { fechaCorta, hora, telefono as formatearTelefono } from "@/lib/formato";
import { NOMBRE_PLANTILLA, type MensajeSaliente } from "@/lib/tipos";

function cuando(iso: string | null, zona: string): string {
  if (!iso) return "—";
  return `${fechaCorta(iso, zona)} ${hora(iso, zona)}`;
}

function Estado({ mensaje: m }: { mensaje: MensajeSaliente }) {
  if (m.estado === "enviado") return <Insignia tono="bueno">Entregado</Insignia>;
  if (m.estado === "fallido") return <Insignia tono="critico">No salió</Insignia>;
  return <Insignia tono="alerta">En cola</Insignia>;
}

export function TablaMensajes({ lista, zona }: { lista: MensajeSaliente[]; zona: string }) {
  return (
    <TablaRegistros<MensajeSaliente>
      columnas={[
        {
          clave: "destino",
          titulo: "Para",
          ancho: "170px",
          valor: (m) => m.destino,
          render: (m) => (
            <span className="numeros font-mono text-[12.5px] text-tinta">
              {m.destino.startsWith("+") ? formatearTelefono(m.destino) : m.destino}
            </span>
          ),
        },
        {
          clave: "plantilla",
          titulo: "Qué se mandó",
          valor: (m) => NOMBRE_PLANTILLA[m.plantilla] ?? m.plantilla,
          render: (m) => (
            <span className="block">
              <span className="text-tinta">{NOMBRE_PLANTILLA[m.plantilla] ?? m.plantilla}</span>
              <span className="ml-2 text-[11px] text-tinta-3">{m.canal}</span>
            </span>
          ),
        },
        {
          clave: "estado",
          titulo: "Estado",
          valor: (m) => m.estado,
          render: (m) => (
            <span className="flex flex-col items-start gap-1 py-1.5 whitespace-normal">
              <Estado mensaje={m} />
              {m.ultimo_error ? <span className="max-w-[320px] text-[11px] leading-snug text-tinta-3">{m.ultimo_error}</span> : null}
              {m.estado === "pendiente" && m.intentos > 0 ? (
                <span className="numeros font-mono text-[11px] text-tinta-3">
                  intento {m.intentos} de {m.max_intentos}
                </span>
              ) : null}
            </span>
          ),
        },
        {
          clave: "cuando",
          titulo: "Cuándo",
          numerica: true,
          ancho: "160px",
          valor: (m) => m.enviado ?? m.creado,
          render: (m) => <span className="text-tinta-3">{cuando(m.enviado ?? m.creado, zona)}</span>,
        },
      ]}
      filas={lista}
      clave={(m) => m.id}
      filtros={[
        { clave: "enviados", nombre: "Entregados", tono: "bueno", pasa: (m) => m.estado === "enviado" },
        { clave: "cola", nombre: "En cola", tono: "alerta", pasa: (m) => m.estado === "pendiente" },
        { clave: "fallidos", nombre: "No salieron", tono: "critico", pasa: (m) => m.estado === "fallido" },
      ]}
      ordenInicial={{ clave: "cuando", dir: "desc" }}
      vacio={{
        titulo: "Todavía no sale ningún mensaje",
        detalle: "En cuanto el agente cierre un pedido o aparte una cita, la confirmación se manda sola y aparece aquí.",
      }}
    />
  );
}
