"use client";

import { TablaRegistros } from "@/components/kit";
import { moneda, telefono } from "@/lib/formato";
import type { Productividad, Recurso } from "@/lib/tipos";

export function TablaProduccion({ produccion, personas }: { produccion: Productividad[]; personas: Recurso[] }) {
  return (
    <TablaRegistros<Productividad>
      className="border-none"
      columnas={[
        {
          clave: "nombre",
          titulo: "Persona",
          valor: (p) => p.nombre,
          render: (p) => {
            const persona = personas.find((x) => x.id === p.resource_id);
            return (
              <span className="block py-1">
                <span className="block font-medium text-tinta">{p.nombre}</span>
                <span className="numeros block font-mono text-[11px] text-tinta-3">
                  {persona?.telefono ? telefono(persona.telefono) : ""}
                  {p.comision_pct ? `${persona?.telefono ? " · " : ""}${Number(p.comision_pct)} % comisión` : ""}
                </span>
              </span>
            );
          },
        },
        { clave: "citas", titulo: "Citas", numerica: true, ancho: "80px", valor: (p) => p.citas },
        { clave: "atendidas", titulo: "Atendidas", numerica: true, ancho: "100px", valor: (p) => p.atendidas },
        {
          clave: "faltas",
          titulo: "Faltas",
          numerica: true,
          ancho: "80px",
          valor: (p) => p.no_asistio,
          render: (p) => <span className={p.no_asistio > 0 ? "text-critico" : "text-tinta-3"}>{p.no_asistio}</span>,
        },
        { clave: "cobrado", titulo: "Cobrado", numerica: true, ancho: "110px", valor: (p) => Number(p.cobrado), render: (p) => moneda(p.cobrado) },
        {
          clave: "comision",
          titulo: "Comisión",
          numerica: true,
          ancho: "110px",
          valor: (p) => Number(p.comision),
          render: (p) => <span className="text-alerta">{moneda(p.comision)}</span>,
        },
      ]}
      filas={produccion}
      clave={(p) => p.resource_id}
      filtros={[
        { clave: "con-faltas", nombre: "Con faltas", tono: "critico", pasa: (p) => p.no_asistio > 0 },
        { clave: "con-comision", nombre: "Con comisión", tono: "alerta", pasa: (p) => Number(p.comision) > 0 },
      ]}
      ordenInicial={{ clave: "cobrado", dir: "desc" }}
    />
  );
}
