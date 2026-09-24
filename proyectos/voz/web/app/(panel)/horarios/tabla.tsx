"use client";

import { BotonPeligro } from "@/components/boton-peligro";
import { Formulario } from "@/components/formulario";
import { TablaRegistros } from "@/components/kit";
import { eliminarRegla } from "@/lib/acciones";
import type { Regla } from "@/lib/tipos";

const NOMBRE: Record<string, string> = {
  festivo: "Cerrado todo el día",
  bloqueo: "Bloqueo parcial",
  disponible: "Abierto extraordinario",
};

// Con año: una excepción puede ser del año que entra y la lista no debe confundirlas.
const FECHA = new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const TONO: Record<string, string> = {
  festivo: "bg-critico",
  bloqueo: "bg-serie-2",
  disponible: "bg-acento",
};

export function TablaExcepciones({ excepciones }: { excepciones: Regla[] }) {
  return (
    <TablaRegistros<Regla>
      className="border-none"
      columnas={[
        {
          clave: "fecha",
          titulo: "Fecha",
          ancho: "120px",
          valor: (r) => r.fecha ?? "",
          render: (r) => <span className="numeros text-[12.5px] font-medium text-tinta">{FECHA.format(new Date(`${r.fecha}T12:00:00Z`))}</span>,
        },
        {
          clave: "tipo",
          titulo: "Qué pasa",
          valor: (r) => NOMBRE[r.tipo] ?? r.tipo,
          render: (r) => (
            <span className="flex items-center gap-2 text-tinta-2">
              <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${TONO[r.tipo] ?? "bg-tinta-3"}`} />
              {NOMBRE[r.tipo] ?? r.tipo}
            </span>
          ),
        },
        {
          clave: "horas",
          titulo: "Horas",
          numerica: true,
          ancho: "130px",
          valor: (r) => r.hora_inicio,
          render: (r) =>
            r.tipo === "festivo" ? (
              <span className="text-tinta-3">—</span>
            ) : (
              <span className="text-tinta-3">
                {r.hora_inicio} – {r.hora_fin}
              </span>
            ),
        },
        {
          clave: "quitar",
          titulo: "",
          ancho: "150px",
          render: (r) => (
            <Formulario accion={eliminarRegla} className="flex justify-end" silencioso>
              <input type="hidden" name="id" value={r.id} />
              <BotonPeligro etiqueta="Sí, quitar">Quitar</BotonPeligro>
            </Formulario>
          ),
        },
      ]}
      filas={excepciones}
      clave={(r) => r.id}
      filtros={[
        { clave: "cerrado", nombre: "Cerrado", tono: "critico", pasa: (r) => r.tipo === "festivo" },
        { clave: "bloqueo", nombre: "Bloqueo", pasa: (r) => r.tipo === "bloqueo" },
        { clave: "abierto", nombre: "Abierto extra", tono: "acento", pasa: (r) => r.tipo === "disponible" },
      ]}
      ordenInicial={{ clave: "fecha", dir: "asc" }}
      vacio={{
        titulo: "Sin excepciones",
        detalle: "Dé de alta los días festivos y los puentes para que el agente no ofrezca horarios en los que estará cerrado.",
      }}
    />
  );
}
