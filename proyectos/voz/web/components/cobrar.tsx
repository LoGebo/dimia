"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { registrarPago, type Estado } from "@/lib/acciones";
import { Dialogo } from "@/components/dialogo";
import { MarcaExito, useAvisos } from "@/components/kit";
import {
  Aviso,
  Boton,
  Campo,
  Entrada,
  Selector,
} from "@/components/ui/primitivos";
import { NOMBRE_METODO, type MetodoPago } from "@/lib/tipos";

const inicial: Estado = {};

/** Registra el cobro de una cita o un pedido: monto real, método y referencia. */
export function Cobrar({
  bookingId,
  pedidoId,
  concepto,
  montoSugerido,
  compacto = false,
  etiqueta = "Cobrar",
}: {
  bookingId?: string;
  pedidoId?: string;
  concepto: string;
  montoSugerido?: string | null;
  compacto?: boolean;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      {compacto ? (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="h-7 bg-bueno px-2.5 text-[12px] font-medium text-white transition-[filter] duration-150 hover:brightness-110"
        >
          {etiqueta}
        </button>
      ) : (
        <Boton variante="solido" onClick={() => setAbierto(true)}>
          {etiqueta}
        </Boton>
      )}
      {abierto
        ? createPortal(
            <FormaCobro
              bookingId={bookingId}
              pedidoId={pedidoId}
              concepto={concepto}
              montoSugerido={montoSugerido ?? ""}
              cerrar={() => setAbierto(false)}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function FormaCobro({
  bookingId,
  pedidoId,
  concepto,
  montoSugerido,
  cerrar,
}: {
  bookingId?: string;
  pedidoId?: string;
  concepto: string;
  montoSugerido: string;
  cerrar: () => void;
}) {
  const router = useRouter();
  const [estado, enviar, enviando] = useActionState(registrarPago, inicial);
  const { avisar } = useAvisos();
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo");
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
      avisar({ titulo: estado.ok, detalle: concepto, tono: "bueno" });
      const t = setTimeout(cerrar, 700);
      return () => clearTimeout(t);
    }
  }, [estado.ok, router, cerrar, avisar, concepto]);

  return (
    <Dialogo
      cerrar={cerrar}
      titulo="Cobrar"
      descripcion={concepto}
      cabecera
      className="max-w-md"
    >
      <form id="forma-cobro" action={enviar}>
        <div className="space-y-3 px-4 py-4">
          {bookingId ? (
            <input type="hidden" name="booking_id" value={bookingId} />
          ) : null}
          {pedidoId ? (
            <input type="hidden" name="pedido_id" value={pedidoId} />
          ) : null}
          <input type="hidden" name="concepto" value={concepto} />
          <input type="hidden" name="pendiente" value={pendiente ? "1" : "0"} />
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Monto (MXN)">
              <Entrada
                name="monto"
                type="number"
                min={1}
                step="1"
                defaultValue={montoSugerido}
                required
                autoFocus
                className="numeros text-[16px]"
              />
            </Campo>
            <Campo etiqueta="Cómo pagó">
              <Selector
                name="metodo"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
              >
                {(Object.keys(NOMBRE_METODO) as MetodoPago[]).map((m) => (
                  <option key={m} value={m}>
                    {NOMBRE_METODO[m]}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>
          {metodo === "enlace" ? (
            <Campo
              etiqueta="Enlace de pago"
              ayuda="Pega el enlace de tu pasarela. Se manda por WhatsApp al cliente."
            >
              <Entrada name="enlace_url" type="url" placeholder="https://" />
            </Campo>
          ) : null}
          {metodo === "transferencia" ||
          metodo === "tarjeta" ||
          metodo === "enlace" ? (
            <Campo
              etiqueta="Referencia"
              ayuda="Folio, últimos dígitos o número de operación."
            >
              <Entrada name="referencia" placeholder="Opcional" />
            </Campo>
          ) : null}
          <Campo etiqueta="Notas">
            <Entrada name="notas" placeholder="Opcional" />
          </Campo>
          <label className="flex items-center gap-2 text-[12.5px] text-tinta-2">
            <input
              type="checkbox"
              checked={pendiente}
              onChange={(e) => setPendiente(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--acento)]"
            />
            Todavía no paga: dejarlo pendiente
          </label>
          {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
          {estado.ok ? <MarcaExito texto={estado.ok} /> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-linea bg-panel-2 px-4 py-3">
          <Boton type="button" variante="fantasma" onClick={cerrar}>
            Cerrar
          </Boton>
          <Boton
            type="submit"
            variante="solido"
            disabled={enviando || Boolean(estado.ok)}
          >
            {enviando
              ? "Guardando…"
              : pendiente
                ? "Dejar pendiente"
                : "Registrar cobro"}
          </Boton>
        </div>
      </form>
    </Dialogo>
  );
}
