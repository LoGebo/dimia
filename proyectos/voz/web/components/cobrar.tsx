"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import {
  cancelarCobroTerminal,
  estadoCobro,
  iniciarCobro,
  opcionesCobro,
  registrarPago,
  type Estado,
  type EstadoCobroIniciado,
  type OpcionesCobro,
} from "@/lib/acciones";
import { Dialogo } from "@/components/dialogo";
import { MarcaExito, useAvisos } from "@/components/kit";
import { Aviso, Boton, Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { NOMBRE_PROVEEDOR } from "@/lib/pagos/tipos";
import { NOMBRE_METODO, type MetodoPago } from "@/lib/tipos";

const inicial: Estado = {};
const inicialCobro: EstadoCobroIniciado = {};

/** Registra el cobro de una cita o un pedido: efectivo, terminal, enlace, transferencia. */
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
          className="h-8 rounded-lg bg-bueno px-3 text-[12.5px] font-semibold text-white transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.98]"
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
            <FormaCobro bookingId={bookingId} pedidoId={pedidoId} concepto={concepto} montoSugerido={montoSugerido ?? ""} cerrar={() => setAbierto(false)} />,
            document.body,
          )
        : null}
    </>
  );
}

type Modo = MetodoPago | "terminal";

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
  const { avisar } = useAvisos();
  const [estado, enviar, enviando] = useActionState(registrarPago, inicial);
  const [cobro, iniciar, iniciando] = useActionState(iniciarCobro, inicialCobro);
  const [opciones, setOpciones] = useState<OpcionesCobro | null>(null);
  const [modo, setModo] = useState<Modo>("efectivo");
  const [proveedor, setProveedor] = useState("");
  const [terminal, setTerminal] = useState("");
  const [pendiente, setPendiente] = useState(false);
  const [terminalEstado, setTerminalEstado] = useState<"esperando" | "pagado" | "cancelado" | "error" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const sondeo = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let vivo = true;
    opcionesCobro().then((o) => {
      if (!vivo) return;
      setOpciones(o);
      const pred = o.terminales.find((t) => t.predeterminada) ?? o.terminales[0];
      if (pred) {
        setTerminal(pred.id);
        setProveedor(pred.proveedor);
      } else if (o.enlaces[0]) setProveedor(o.enlaces[0]);
    });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (estado.ok) {
      router.refresh();
      avisar({ titulo: estado.ok, detalle: concepto, tono: "bueno" });
      const t = setTimeout(cerrar, 700);
      return () => clearTimeout(t);
    }
  }, [estado.ok, router, cerrar, avisar, concepto]);

  useEffect(() => {
    if (!cobro.ok || !cobro.pagoId) return;
    if (cobro.modo === "enlace") {
      router.refresh();
      return;
    }
    setTerminalEstado("esperando");
    const id = cobro.pagoId;
    sondeo.current = setInterval(async () => {
      const r = await estadoCobro(id);
      if (r.estado === "abierto") return;
      if (sondeo.current) clearInterval(sondeo.current);
      setTerminalEstado(r.estado);
      if (r.estado === "pagado") {
        router.refresh();
        avisar({ titulo: "Cobro aprobado en la terminal", detalle: concepto, tono: "bueno" });
        setTimeout(cerrar, 900);
      }
    }, 2000);
    return () => {
      if (sondeo.current) clearInterval(sondeo.current);
    };
  }, [cobro.ok, cobro.pagoId, cobro.modo, router, avisar, cerrar, concepto]);

  async function cancelarTerminal() {
    if (!cobro.pagoId) return;
    if (sondeo.current) clearInterval(sondeo.current);
    await cancelarCobroTerminal(cobro.pagoId);
    setTerminalEstado("cancelado");
    router.refresh();
  }

  async function copiar() {
    if (!cobro.enlace) return;
    try {
      await navigator.clipboard.writeText(cobro.enlace);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  }

  const conTerminal = (opciones?.terminales.length ?? 0) > 0;
  const conEnlace = (opciones?.enlaces.length ?? 0) > 0;
  const porPasarela = modo === "terminal" || (modo === "enlace" && conEnlace);
  const accion = porPasarela ? iniciar : enviar;
  const ocupado = enviando || iniciando;
  const cerrado = Boolean(estado.ok) || Boolean(cobro.ok);

  const modos: { valor: Modo; nombre: string }[] = [
    { valor: "efectivo", nombre: "Efectivo" },
    ...(conTerminal ? [{ valor: "terminal" as Modo, nombre: "Terminal (tarjeta)" }] : [{ valor: "tarjeta" as Modo, nombre: "Tarjeta" }]),
    { valor: "enlace", nombre: conEnlace ? "Enlace de pago por WhatsApp" : NOMBRE_METODO.enlace },
    { valor: "transferencia", nombre: "Transferencia" },
    { valor: "otro", nombre: "Otro" },
  ];

  return (
    <Dialogo cerrar={cerrar} titulo="Cobrar" descripcion={concepto} cabecera className="max-w-md">
      <form id="forma-cobro" action={accion}>
        <div className="space-y-3 px-4 py-4">
          {bookingId ? <input type="hidden" name="booking_id" value={bookingId} /> : null}
          {pedidoId ? <input type="hidden" name="pedido_id" value={pedidoId} /> : null}
          <input type="hidden" name="concepto" value={concepto} />
          <input type="hidden" name="pendiente" value={pendiente ? "1" : "0"} />
          {porPasarela ? (
            <>
              <input type="hidden" name="modo" value={modo === "terminal" ? "terminal" : "enlace"} />
              <input type="hidden" name="proveedor" value={proveedor} />
              {modo === "terminal" ? <input type="hidden" name="terminal" value={terminal} /> : null}
            </>
          ) : (
            <input type="hidden" name="metodo" value={modo} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Monto (MXN)">
              <Entrada name="monto" type="number" min={1} step="1" defaultValue={montoSugerido} required autoFocus className="numeros text-[16px]" disabled={cerrado} />
            </Campo>
            <Campo etiqueta="Cómo paga">
              <Selector value={modo} onChange={(e) => setModo(e.target.value as Modo)} disabled={cerrado}>
                {modos.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          </div>

          {modo === "terminal" && opciones ? (
            <Campo etiqueta="Terminal" ayuda="El monto aparece en la terminal; aquí ves cuando se aprueba.">
              <Selector
                value={terminal}
                onChange={(e) => {
                  const t = opciones.terminales.find((x) => x.id === e.target.value);
                  setTerminal(e.target.value);
                  if (t) setProveedor(t.proveedor);
                }}
                disabled={cerrado}
              >
                {opciones.terminales.map((t) => (
                  <option key={t.id} value={t.id}>
                    {NOMBRE_PROVEEDOR[t.proveedor]} · {t.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
          ) : null}

          {modo === "enlace" && conEnlace && opciones ? (
            <Campo etiqueta="Pasarela" ayuda="Se crea el enlace y, si el cliente tiene teléfono, se le manda por WhatsApp.">
              <Selector value={proveedor} onChange={(e) => setProveedor(e.target.value)} disabled={cerrado}>
                {opciones.enlaces.map((p) => (
                  <option key={p} value={p}>
                    {NOMBRE_PROVEEDOR[p]}
                  </option>
                ))}
              </Selector>
            </Campo>
          ) : null}

          {modo === "enlace" && !conEnlace ? (
            <Campo etiqueta="Enlace de pago" ayuda="Pega el enlace de tu pasarela, o conéctala en Ajustes → Pagos para que se cree solo.">
              <Entrada name="enlace_url" type="url" placeholder="https://" />
            </Campo>
          ) : null}

          {!porPasarela && (modo === "transferencia" || modo === "tarjeta" || modo === "enlace") ? (
            <Campo etiqueta="Referencia" ayuda="Folio, últimos dígitos o número de operación.">
              <Entrada name="referencia" placeholder="Opcional" />
            </Campo>
          ) : null}

          {!porPasarela ? (
            <>
              <Campo etiqueta="Notas">
                <Entrada name="notas" placeholder="Opcional" />
              </Campo>
              <label className="flex items-center gap-2 text-[12.5px] text-tinta-2">
                <input type="checkbox" checked={pendiente} onChange={(e) => setPendiente(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--acento)]" />
                Todavía no paga: dejarlo pendiente
              </label>
            </>
          ) : null}

          {estado.error || cobro.error ? <Aviso tono="error">{estado.error ?? cobro.error}</Aviso> : null}
          {estado.ok ? <MarcaExito texto={estado.ok} /> : null}

          {cobro.ok && cobro.modo === "enlace" && cobro.enlace ? (
            <div className="rounded-lg border border-linea bg-panel-2 p-3">
              <MarcaExito texto={cobro.ok} />
              <div className="mt-2 flex items-center gap-2">
                <code className="numeros min-w-0 flex-1 truncate rounded-lg border border-linea bg-panel px-2.5 py-1.5 font-mono text-[11.5px] text-tinta-2">{cobro.enlace}</code>
                <button
                  type="button"
                  onClick={copiar}
                  aria-label="Copiar enlace"
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-linea text-tinta-2 transition-colors duration-150 hover:bg-panel hover:text-tinta"
                >
                  {copiado ? <Check size={16} className="text-bueno" /> : <Copy size={16} />}
                </button>
              </div>
            </div>
          ) : null}

          {terminalEstado ? (
            <div className="flex items-center gap-3 rounded-lg border border-linea bg-panel-2 p-3 text-[13px]">
              {terminalEstado === "esperando" ? (
                <>
                  <span className="gira h-5 w-5 flex-none rounded-full border-2 border-acento border-t-transparent" aria-hidden="true" />
                  <span className="flex-1 text-tinta">Esperando la tarjeta en la terminal…</span>
                  <button type="button" onClick={cancelarTerminal} className="text-[12px] text-tinta-3 transition-colors duration-150 hover:text-critico">
                    Cancelar
                  </button>
                </>
              ) : terminalEstado === "pagado" ? (
                <MarcaExito texto="Aprobado" />
              ) : (
                <span className="text-critico">{terminalEstado === "cancelado" ? "Cobro cancelado." : "La terminal no pudo cobrar."}</span>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-linea px-4 py-3">
          <Boton type="button" variante="fantasma" onClick={cerrar}>
            {cerrado ? "Cerrar" : "Cancelar"}
          </Boton>
          {!cerrado ? (
            <Boton type="submit" variante="solido" disabled={ocupado || (porPasarela && !proveedor)}>
              {ocupado
                ? "Enviando…"
                : modo === "terminal"
                  ? "Mandar a la terminal"
                  : modo === "enlace" && conEnlace
                    ? "Crear enlace"
                    : pendiente
                      ? "Dejar pendiente"
                      : "Registrar cobro"}
            </Boton>
          ) : null}
        </div>
      </form>
    </Dialogo>
  );
}
