import Link from "next/link";
import { fechaCorta, hora, isoDia, moneda } from "@/lib/formato";
import { NOMBRE_EVENTO, type Evento } from "@/lib/tipos";

const TONO: Record<string, string> = {
  "cita.atendida": "bg-bueno",
  "pedido.entregado": "bg-bueno",
  "pago.registrado": "bg-bueno",
  "cita.cancelada": "bg-critico",
  "cita.no_asistio": "bg-critico",
  "pedido.cancelado": "bg-critico",
  "conversacion.escalada": "bg-alerta",
  "recado.creado": "bg-alerta",
};

const AUTOR: Record<Evento["autor"], string> = {
  agente: "el agente",
  equipo: "el equipo",
  cliente: "el cliente",
  sistema: "el sistema",
};

function detalle(e: Evento, zona: string): string | null {
  const d = e.datos;
  switch (e.tipo) {
    case "cita.creada":
    case "cita.confirmada":
    case "cita.cancelada":
    case "cita.atendida":
    case "cita.no_asistio":
      return typeof d.inicio === "string" ? `${fechaCorta(d.inicio, zona)} ${hora(d.inicio, zona)} · ${String(d.codigo ?? "")}` : null;
    case "cita.llegada":
      return typeof d.retraso_min === "number" && d.retraso_min > 0 ? `${d.retraso_min} min tarde` : "a tiempo";
    case "cita.movida":
      return typeof d.inicio === "string" ? `a ${fechaCorta(d.inicio, zona)} ${hora(d.inicio, zona)}` : null;
    case "pedido.abierto":
    case "pedido.confirmado":
    case "pedido.entregado":
    case "pedido.cancelado":
      return `${String(d.codigo ?? "")} · ${moneda(String(d.total ?? "0"))}`;
    case "recado.creado":
    case "recado.atendido":
      return typeof d.asunto === "string" ? d.asunto : null;
    case "conversacion.abierta":
    case "conversacion.escalada":
    case "conversacion.cerrada":
      return [typeof d.canal === "string" ? d.canal : null, typeof d.motivo === "string" ? d.motivo : null].filter(Boolean).join(" · ") || null;
    case "llamada.terminada": {
      const seg = typeof d.duracion_seg === "number" ? d.duracion_seg : 0;
      const partes = [`${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")} min`];
      if (d.escalado) partes.push("pasó a una persona");
      else if (d.resuelto) partes.push("resuelta por el agente");
      return partes.join(" · ");
    }
    case "pago.registrado":
      return `${moneda(String(d.monto ?? "0"))} · ${String(d.metodo ?? "")}`;
    default:
      return null;
  }
}

function enlace(e: Evento, zona: string): string | null {
  if (e.entidad === "conversacion" && e.entidad_id) return `/bandeja/${e.entidad_id}`;
  if (e.entidad === "booking" && typeof e.datos.inicio === "string") return `/agenda?dia=${isoDia(new Date(e.datos.inicio), zona)}`;
  if (e.entidad === "pedido") return "/pedidos";
  if (e.entidad === "lead") return "/recados";
  return null;
}

/** Lo que pasó con un cliente, de lo más reciente a lo más viejo. */
export function LineaTiempo({ eventos, zona }: { eventos: Evento[]; zona: string }) {
  if (eventos.length === 0) {
    return <p className="px-5 py-8 text-center text-[13px] text-tinta-3">Todavía no hay movimientos.</p>;
  }
  return (
    <ol className="px-5 py-2">
      {eventos.map((e, i) => {
        const nombre = NOMBRE_EVENTO[e.tipo] ?? e.tipo;
        const texto = detalle(e, zona);
        const href = enlace(e, zona);
        return (
          <li key={e.id} className="relative flex gap-4 py-3">
            <span className="relative flex w-3 flex-none justify-center">
              <i aria-hidden="true" className={`mt-1.5 h-2 w-2 ${TONO[e.tipo] ?? "bg-linea-fuerte"}`} />
              {i < eventos.length - 1 ? <span aria-hidden="true" className="absolute top-4 bottom-[-14px] w-px bg-linea" /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-tinta">
                {href ? (
                  <Link href={href} className="font-medium transition hover:text-acento">
                    {nombre}
                  </Link>
                ) : (
                  <span className="font-medium">{nombre}</span>
                )}
                {texto ? <span className="text-tinta-2"> · {texto}</span> : null}
              </p>
              <p className="numeros mt-0.5 text-[11px] text-tinta-3">
                {fechaCorta(e.creado, zona)} {hora(e.creado, zona)} · {AUTOR[e.autor]}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
