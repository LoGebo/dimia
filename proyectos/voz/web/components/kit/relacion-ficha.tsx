"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChipHerramienta, ChipsHerramienta, Pestanas, type EstadoHerramienta } from "@/components/kit";
import { fechaCorta, fechaLarga, hora, isoDia, moneda } from "@/lib/formato";
import { NOMBRE_EVENTO, type Evento } from "@/lib/tipos";

type Familia = "todo" | "citas" | "pedidos" | "conversaciones" | "cobros" | "campanas";

const FAMILIA: Record<string, Familia> = {
  cita: "citas",
  pedido: "pedidos",
  recado: "conversaciones",
  conversacion: "conversaciones",
  llamada: "conversaciones",
  pago: "cobros",
  campana: "campanas",
  resena: "conversaciones",
};

const NOMBRE_FAMILIA: Record<Familia, string> = {
  todo: "Todo",
  citas: "Citas",
  pedidos: "Pedidos",
  conversaciones: "Conversaciones",
  cobros: "Cobros",
  campanas: "Campañas",
};

const ESTADO: Record<string, EstadoHerramienta> = {
  "cita.atendida": "hecho",
  "cita.confirmada": "hecho",
  "cita.llegada": "hecho",
  "pedido.entregado": "hecho",
  "pago.registrado": "hecho",
  "campana.agendo": "hecho",
  "campana.contestado": "hecho",
  "resena.recibida": "hecho",
  "cita.no_asistio": "fallo",
  "campana.fallido": "fallo",
  "conversacion.escalada": "fallo",
  "campana.en_curso": "en-curso",
  "pago.pendiente": "en-curso",
  "pedido.abierto": "en-curso",
  "conversacion.abierta": "en-curso",
};

const CUADRO: Record<EstadoHerramienta, string> = {
  hecho: "bg-bueno",
  fallo: "bg-critico",
  "en-curso": "bg-acento",
};

const AUTOR: Record<Evento["autor"], string> = {
  agente: "el agente",
  equipo: "el equipo",
  cliente: "el cliente",
  sistema: "el sistema",
};

function familiaDe(e: Evento): Familia {
  return FAMILIA[e.tipo.split(".")[0] ?? ""] ?? "conversaciones";
}

/** Lo que el agente o el equipo hizo en ese evento, como chips: verbo y dato en mono. */
function herramientas(e: Evento, zona: string): { verbo: string; dato?: string; estado: EstadoHerramienta }[] {
  const d = e.datos;
  const estado = ESTADO[e.tipo] ?? "hecho";
  const codigo = typeof d.codigo === "string" ? d.codigo : undefined;
  const inicio = typeof d.inicio === "string" ? `${fechaCorta(d.inicio, zona)} ${hora(d.inicio, zona)}` : undefined;
  switch (e.tipo) {
    case "cita.creada":
      return [{ verbo: "cita", dato: [codigo, inicio].filter(Boolean).join(" · "), estado }];
    case "cita.confirmada":
      return [{ verbo: "confirmó", dato: codigo, estado }];
    case "cita.movida":
      return [{ verbo: "ahora", dato: [codigo, inicio].filter(Boolean).join(" · "), estado }];
    case "cita.cancelada":
      return [{ verbo: "canceló", dato: codigo, estado }];
    case "cita.atendida":
      return [{ verbo: "atendida", dato: codigo, estado }];
    case "cita.no_asistio":
      return [{ verbo: "no llegó", dato: codigo, estado }];
    case "cita.llegada":
      return [{ verbo: typeof d.retraso_min === "number" && d.retraso_min > 0 ? "llegó tarde" : "llegó a tiempo", dato: typeof d.retraso_min === "number" && d.retraso_min > 0 ? `${d.retraso_min} min` : undefined, estado }];
    case "pedido.abierto":
    case "pedido.confirmado":
    case "pedido.entregado":
    case "pedido.cancelado":
      return [{ verbo: "pedido", dato: [codigo, moneda(String(d.total ?? "0"))].filter(Boolean).join(" · "), estado }];
    case "recado.creado":
      return [{ verbo: "tomó recado", dato: undefined, estado: "en-curso" }];
    case "recado.atendido":
      return [{ verbo: "recado atendido", estado }];
    case "conversacion.abierta":
      return [{ verbo: "abrió conversación", dato: typeof d.canal === "string" ? d.canal : undefined, estado }];
    case "conversacion.escalada":
      return [{ verbo: "escaló a una persona", dato: typeof d.motivo === "string" ? d.motivo : undefined, estado }];
    case "conversacion.cerrada":
      return [{ verbo: "cerró", dato: typeof d.motivo === "string" ? d.motivo : undefined, estado }];
    case "llamada.terminada": {
      const seg = typeof d.duracion_seg === "number" ? d.duracion_seg : 0;
      const dur = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
      return [
        { verbo: "llamada", dato: dur, estado: d.escalado ? "fallo" : "hecho" },
        { verbo: d.escalado ? "pasó a una persona" : d.resuelto ? "resuelta por el agente" : "sin resolver", estado: d.escalado ? "fallo" : d.resuelto ? "hecho" : "en-curso" },
      ];
    }
    case "pago.registrado":
      return [{ verbo: typeof d.metodo === "string" ? d.metodo : "cobró", dato: moneda(String(d.monto ?? "0")), estado }];
    case "pago.pendiente":
      return [{ verbo: "dejó pendiente", dato: moneda(String(d.monto ?? "0")), estado }];
    case "pago.cancelado":
      return [{ verbo: "canceló cobro", dato: moneda(String(d.monto ?? "0")), estado }];
    case "campana.enviado":
      return [{ verbo: "mandó mensaje", estado }];
    case "campana.en_curso":
      return [{ verbo: "marcando", estado }];
    case "campana.contestado":
      return [{ verbo: "contestó", estado }];
    case "campana.agendo":
      return [{ verbo: "agendó", dato: codigo, estado }];
    case "campana.sin_respuesta":
      return [{ verbo: "sin respuesta", estado: "en-curso" }];
    case "campana.rechazo":
      return [{ verbo: "pidió no llamar", estado }];
    case "campana.fallido":
      return [{ verbo: "no se pudo contactar", estado }];
    case "resena.recibida":
      return [{ verbo: "calificó", dato: typeof d.calificacion === "number" ? `${d.calificacion}/5` : undefined, estado }];
    default:
      return [];
  }
}

function enlace(e: Evento, zona: string): string | null {
  if (e.entidad === "conversacion" && e.entidad_id) return `/bandeja/${e.entidad_id}`;
  if (e.entidad === "booking" && typeof e.datos.inicio === "string") return `/agenda?dia=${isoDia(new Date(e.datos.inicio), zona)}`;
  if (e.entidad === "pedido") return "/pedidos";
  if (e.entidad === "lead") return "/recados";
  if (e.entidad === "campana" && e.entidad_id) return `/campanas/${e.entidad_id}`;
  return null;
}

/** Lo que pasó con un cliente, de lo más reciente a lo más viejo, con lo que hizo el agente en chips. */
export function LineaTiempoCliente({ eventos, zona }: { eventos: Evento[]; zona: string }) {
  const [familia, setFamilia] = useState<Familia>("todo");
  const conteos = useMemo(() => {
    const c: Partial<Record<Familia, number>> = { todo: eventos.length };
    for (const e of eventos) c[familiaDe(e)] = (c[familiaDe(e)] ?? 0) + 1;
    return c;
  }, [eventos]);
  const pestanas = (Object.keys(NOMBRE_FAMILIA) as Familia[])
    .filter((f) => f === "todo" || (conteos[f] ?? 0) > 0)
    .map((f) => ({ id: f, nombre: NOMBRE_FAMILIA[f], conteo: conteos[f] ?? 0 }));
  const visibles = familia === "todo" ? eventos : eventos.filter((e) => familiaDe(e) === familia);

  if (eventos.length === 0) {
    return (
      <p className="flex items-center gap-2 px-4 py-8 text-[13px] text-tinta-3">
        <i aria-hidden="true" className="h-1.5 w-1.5 bg-tinta-3" />
        Todavía no hay movimientos.
      </p>
    );
  }

  let ultimoDia = "";
  return (
    <div>
      {pestanas.length > 2 ? (
        <Pestanas pestanas={pestanas} activa={familia} cambiar={(id) => setFamilia(id as Familia)} rotulo="Qué ver" className="px-4" />
      ) : null}
      <ol className="px-4 py-2">
        {visibles.map((e, i) => {
          const nombre = NOMBRE_EVENTO[e.tipo] ?? e.tipo;
          const href = enlace(e, zona);
          const todas = herramientas(e, zona);
          const chips = todas.filter((h) => h.dato);
          const notas = todas.filter((h) => !h.dato && (h.estado !== (ESTADO[e.tipo] ?? "hecho") || e.tipo === "llamada.terminada"));
          const estado = ESTADO[e.tipo];
          const dia = fechaLarga(e.creado, zona);
          const cambiaDia = dia !== ultimoDia;
          ultimoDia = dia;
          return (
            <li key={e.id}>
              {cambiaDia ? <p className="pt-3 pb-1 text-[11px] text-tinta-3">{dia}</p> : null}
              <div className="relative flex gap-4 py-2.5">
                <span className="relative flex w-3 flex-none justify-center">
                  <i aria-hidden="true" className={`mt-1.5 h-2 w-2 ${estado ? CUADRO[estado] : "bg-linea-fuerte"}`} />
                  {i < visibles.length - 1 ? <span aria-hidden="true" className="absolute top-4 bottom-[-12px] w-px bg-linea" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                    <p className="text-[13px] font-medium text-tinta">
                      {href ? (
                        <Link href={href} className="transition-colors duration-150 hover:text-acento">
                          {nombre}
                        </Link>
                      ) : (
                        nombre
                      )}
                      {notas.length > 0 ? <span className="font-normal text-tinta-2"> · {notas.map((n) => n.verbo).join(" · ")}</span> : null}
                    </p>
                    <p className="numeros font-mono text-[11px] text-tinta-3">
                      {hora(e.creado, zona)} · {AUTOR[e.autor]}
                    </p>
                  </div>
                  {chips.length > 0 ? (
                    <div className="mt-1.5">
                      <ChipsHerramienta>
                        {chips.map((h, j) => (
                          <ChipHerramienta key={j} estado={h.estado} dato={h.dato}>
                            {h.verbo}
                          </ChipHerramienta>
                        ))}
                      </ChipsHerramienta>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {visibles.length === 0 ? (
          <li className="flex items-center gap-2 py-6 text-[12px] text-tinta-3">
            <i aria-hidden="true" className="h-1.5 w-1.5 bg-tinta-3" />
            Nada en esta pestaña.
          </li>
        ) : null}
      </ol>
    </div>
  );
}
