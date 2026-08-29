"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { TablaRegistros, type Columna, type Filtro } from "@/components/kit";
import { fechaCorta, moneda, telefono } from "@/lib/formato";
import type { ClienteResumen } from "@/lib/tipos";

/** La lista de clientes como tabla de registros: orden por columna y filtros rápidos sobre lo cargado. */
export function TablaClientes({
  lista,
  zona,
  agenda,
  pedidos,
  busqueda,
}: {
  lista: ClienteResumen[];
  zona: string;
  agenda: boolean;
  pedidos: boolean;
  busqueda: string;
}) {
  const router = useRouter();

  const columnas: Columna<ClienteResumen>[] = [
    {
      clave: "nombre",
      titulo: "Cliente",
      valor: (c) => c.nombre ?? "",
      render: (c) => (
        <span className="flex items-center gap-2">
          <Link
            href={`/clientes/${c.id}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-tinta transition-colors duration-150 group-hover:text-acento"
          >
            {c.nombre ?? "Sin nombre"}
          </Link>
          {c.recados_pendientes > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-alerta">
              <i aria-hidden="true" className="h-1.5 w-1.5 bg-alerta" />
              recado
            </span>
          ) : null}
        </span>
      ),
    },
    {
      clave: "telefono",
      titulo: "Teléfono",
      valor: (c) => c.telefono ?? "",
      render: (c) => (
        <span className="numeros text-[12px] text-tinta-2">{c.telefono ? telefono(c.telefono) : "—"}</span>
      ),
    },
  ];

  if (agenda) {
    columnas.push(
      { clave: "citas", titulo: "Citas", numerica: true, ancho: "72px", valor: (c) => c.citas, render: (c) => <span className={c.citas > 0 ? "" : "text-tinta-3"}>{c.citas}</span> },
      {
        clave: "faltas",
        titulo: "Faltas",
        numerica: true,
        ancho: "72px",
        valor: (c) => c.no_asistio,
        render: (c) => <span className={c.no_asistio > 0 ? "text-alerta" : "text-tinta-3"}>{c.no_asistio}</span>,
      },
    );
  }
  if (pedidos) {
    columnas.push(
      { clave: "pedidos", titulo: "Pedidos", numerica: true, ancho: "80px", valor: (c) => c.pedidos, render: (c) => <span className={c.pedidos > 0 ? "" : "text-tinta-3"}>{c.pedidos}</span> },
      { clave: "gastado", titulo: "Gastado", numerica: true, ancho: "110px", valor: (c) => Number(c.gastado), render: (c) => moneda(c.gastado) },
    );
  }
  columnas.push(
    {
      clave: "ultimo",
      titulo: "Último contacto",
      ancho: "140px",
      valor: (c) => c.ultimo_contacto,
      render: (c) => <span className="numeros text-[12px] text-tinta-2">{fechaCorta(c.ultimo_contacto, zona)}</span>,
    },
    {
      clave: "origen",
      titulo: "Origen",
      ancho: "110px",
      valor: (c) => c.origen ?? "",
      render: (c) => <span className="text-[12px] text-tinta-3">{c.origen ?? "—"}</span>,
    },
    {
      clave: "etiquetas",
      titulo: "Etiquetas",
      render: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.etiquetas.map((e) => (
            <span key={e} className="bg-panel-2 px-1.5 text-[11px] leading-5 text-tinta-2">
              {e}
            </span>
          ))}
        </span>
      ),
    },
  );

  const hace90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const hace30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const origenes = Array.from(new Set(lista.map((c) => c.origen).filter((o): o is string => !!o))).sort();
  if (origenes.length < 2) origenes.length = 0;
  const filtros: Filtro<ClienteResumen>[] = [
    { clave: "nuevos", nombre: "Nuevos este mes", tono: "bueno", pasa: (c) => new Date(c.primer_contacto).getTime() >= hace30 },
    { clave: "recado", nombre: "Con recado", tono: "alerta", pasa: (c) => c.recados_pendientes > 0 },
    { clave: "sin-volver", nombre: "Sin volver en 90 días", tono: "alerta", pasa: (c) => new Date(c.ultimo_contacto).getTime() < hace90 },
  ];
  if (agenda) filtros.push({ clave: "faltas", nombre: "Han faltado", tono: "alerta", pasa: (c) => c.no_asistio > 0 });
  if (pedidos) filtros.push({ clave: "gasto", nombre: "Han comprado", tono: "bueno", pasa: (c) => Number(c.gastado) > 0 });
  filtros.push({ clave: "etiqueta", nombre: "Con etiqueta", pasa: (c) => c.etiquetas.length > 0 });
  for (const o of origenes) filtros.push({ clave: `origen-${o}`, nombre: o, pasa: (c) => c.origen === o });

  return (
    <TablaRegistros<ClienteResumen>
      columnas={columnas}
      filas={lista}
      clave={(c) => c.id}
      filtros={filtros}
      ordenInicial={{ clave: "ultimo", dir: "desc" }}
      alClic={(c) => router.push(`/clientes/${c.id}`)}
      vacio={{
        titulo: "Nadie por aquí",
        detalle: busqueda ? "Prueba con otro nombre o teléfono." : "En cuanto alguien llame o escriba, aparece aquí solo.",
      }}
    />
  );
}
