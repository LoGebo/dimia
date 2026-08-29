"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { TablaRegistros, useAvisos, type Columna, type Filtro } from "@/components/kit";
import { cambiarEstadoPago, type Estado } from "@/lib/acciones";
import { fechaCorta, hora, moneda } from "@/lib/formato";
import { NOMBRE_METODO, type EstadoPago, type MetodoPago, type Pago } from "@/lib/tipos";

const ORDEN_METODO: MetodoPago[] = ["efectivo", "tarjeta", "transferencia", "enlace", "otro"];

const ESTADO: Record<EstadoPago, { texto: string; cuadro: string; clase: string; tono: "bueno" | "alerta" | "critico" | "neutro" }> = {
  pagado: { texto: "Pagado", cuadro: "bg-bueno", clase: "text-bueno", tono: "bueno" },
  pendiente: { texto: "Pendiente", cuadro: "bg-alerta", clase: "text-alerta", tono: "alerta" },
  cancelado: { texto: "Cancelado", cuadro: "bg-tinta-3", clase: "text-tinta-3", tono: "neutro" },
  reembolsado: { texto: "Reembolsado", cuadro: "bg-tinta-3", clase: "text-tinta-3", tono: "neutro" },
};

export function EstadoPagoRotulo({ estado }: { estado: EstadoPago }) {
  const e = ESTADO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${e.clase}`}>
      <i aria-hidden="true" className={`h-1.5 w-1.5 ${e.cuadro}`} />
      {e.texto}
    </span>
  );
}

function BotonPago({ children, className }: { children: React.ReactNode; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className} disabled:opacity-50`}>
      {pending ? "…" : children}
    </button>
  );
}

/** Cambia el estado de un cobro y lo cuenta con un aviso apilado, sin recargar la vista. */
function AccionesPago({ pago }: { pago: Pago }) {
  const { avisar } = useAvisos();
  const [, enviar] = useActionState(async (previo: Estado, fd: FormData) => {
    const resultado = await cambiarEstadoPago(previo, fd);
    const estado = String(fd.get("estado"));
    if (resultado.error) {
      avisar({ titulo: "No se pudo registrar", detalle: resultado.error, tono: "critico", duracion: 6000 });
    } else if (estado === "pagado") {
      avisar({ titulo: "Cobro registrado", detalle: `${moneda(pago.monto)} · ${NOMBRE_METODO[pago.metodo]} · ${pago.cliente_nombre ?? pago.concepto}`, tono: "bueno" });
    } else {
      avisar({ titulo: "Cobro cancelado", detalle: `${moneda(pago.monto)} · ${pago.cliente_nombre ?? pago.concepto}`, tono: "alerta" });
    }
    return resultado;
  }, {} as Estado);

  return (
    <span className="flex justify-end gap-1">
      <form action={enviar}>
        <input type="hidden" name="id" value={pago.id} />
        <input type="hidden" name="estado" value="pagado" />
        <BotonPago className="h-7 bg-bueno px-2.5 text-[12px] font-medium text-white transition-[filter] duration-150 hover:brightness-110">
          Ya pagó
        </BotonPago>
      </form>
      <form action={enviar}>
        <input type="hidden" name="id" value={pago.id} />
        <input type="hidden" name="estado" value="cancelado" />
        <BotonPago className="h-7 px-2 text-[12px] text-tinta-3 transition-colors duration-150 hover:text-critico">Cancelar</BotonPago>
      </form>
    </span>
  );
}

/** Cobros como tabla de registros: hora o fecha, quién, concepto, método y monto; los pendientes traen sus acciones. */
export function TablaPagos({
  pagos,
  zona,
  conFecha = false,
  vacio,
}: {
  pagos: Pago[];
  zona: string;
  conFecha?: boolean;
  vacio: { titulo: string; detalle?: string };
}) {
  const pendientes = pagos.some((p) => p.estado === "pendiente");

  const columnas: Columna<Pago>[] = [
    {
      clave: "cuando",
      titulo: conFecha ? "Fecha" : "Hora",
      ancho: "84px",
      valor: (p) => (conFecha ? p.creado : (p.pagado_en ?? p.creado)),
      render: (p) => (
        <span className="numeros text-[12px] text-tinta-3">
          {conFecha ? fechaCorta(p.creado, zona) : hora(p.pagado_en ?? p.creado, zona)}
        </span>
      ),
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      valor: (p) => p.cliente_nombre ?? "",
      render: (p) => (
        <span className="flex flex-col leading-tight">
          {p.cliente_id ? (
            <Link href={`/clientes/${p.cliente_id}`} className="font-medium text-tinta transition-colors duration-150 hover:text-acento">
              {p.cliente_nombre ?? "Sin nombre"}
            </Link>
          ) : (
            <span className="font-medium text-tinta">{p.cliente_nombre ?? "Sin nombre"}</span>
          )}
          <span className="max-w-[280px] truncate text-[11.5px] text-tinta-3">
            {p.concepto}
            {p.referencia_externa ? ` · ${p.referencia_externa}` : ""}
          </span>
        </span>
      ),
    },
    {
      clave: "metodo",
      titulo: "Método",
      ancho: "120px",
      valor: (p) => NOMBRE_METODO[p.metodo],
      render: (p) => <span className="text-[12px] text-tinta-2">{NOMBRE_METODO[p.metodo]}</span>,
    },
    {
      clave: "monto",
      titulo: "Monto",
      numerica: true,
      ancho: "110px",
      valor: (p) => Number(p.monto),
      render: (p) => (
        <span className={`text-[13px] font-medium ${p.estado === "pagado" ? "text-tinta" : p.estado === "pendiente" ? "text-alerta" : "text-tinta-3 line-through"}`}>
          {moneda(p.monto)}
        </span>
      ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      ancho: "120px",
      valor: (p) => ESTADO[p.estado].texto,
      render: (p) => <EstadoPagoRotulo estado={p.estado} />,
    },
  ];
  if (pendientes) {
    columnas.push({ clave: "acciones", titulo: "", ancho: "150px", render: (p) => (p.estado === "pendiente" ? <AccionesPago pago={p} /> : null) });
  }

  const estados = (["pendiente", "pagado", "cancelado", "reembolsado"] as EstadoPago[]).filter((e) => pagos.some((p) => p.estado === e));
  const metodos = ORDEN_METODO.filter((m) => pagos.some((p) => p.metodo === m));
  const filtros: Filtro<Pago>[] = [
    ...(estados.length > 1 ? estados.map((e) => ({ clave: e, nombre: ESTADO[e].texto, tono: ESTADO[e].tono, pasa: (p: Pago) => p.estado === e })) : []),
    ...(metodos.length > 1 ? metodos.map((m) => ({ clave: m, nombre: NOMBRE_METODO[m], pasa: (p: Pago) => p.metodo === m })) : []),
  ];

  return (
    <TablaRegistros<Pago>
      columnas={columnas}
      filas={pagos}
      clave={(p) => p.id}
      filtros={filtros.length ? filtros : undefined}
      ordenInicial={{ clave: "cuando", dir: "desc" }}
      vacio={vacio}
      className="border-0"
    />
  );
}
