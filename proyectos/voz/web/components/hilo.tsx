import Link from "next/link";
import { nombreDe } from "@/components/bandeja";
import { Insignia } from "@/components/ui/primitivos";
import { telefono as formatearTelefono } from "@/lib/formato";
import { NOMBRE_CANAL, NOMBRE_RESULTADO, type Conversacion, type Mensaje } from "@/lib/tipos";

// Lo que entra a la izquierda, lo que sale a la derecha: es como se lee
// cualquier bandeja, y el dueño ya tiene esa costumbre de su propio WhatsApp.
const LADO: Record<Mensaje["autor"], string> = {
  cliente: "justify-start",
  agente: "justify-end",
  equipo: "justify-end",
  sistema: "justify-center",
};

const BURBUJA: Record<Mensaje["autor"], string> = {
  cliente: "border-linea bg-panel-2 text-tinta",
  agente: "border-acento/25 bg-acento-suave text-tinta",
  equipo: "border-bueno/30 bg-bueno/10 text-tinta",
  sistema: "border-linea bg-transparent text-tinta-3",
};

const QUIEN: Record<Mensaje["autor"], string> = {
  cliente: "Cliente",
  agente: "Agente",
  equipo: "Equipo",
  sistema: "Sistema",
};

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dia(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function Hilo({
  conversacion: c,
  mensajes,
}: {
  conversacion: Conversacion;
  mensajes: Mensaje[];
}) {
  let ultimoDia = "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-6 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-tinta">
              {nombreDe(c)}
            </h2>
            <span className="etiqueta text-[10px]">{NOMBRE_CANAL[c.canal]}</span>
            {c.estado === "escalada" ? (
              <Insignia tono="alerta">Pidió una persona</Insignia>
            ) : null}
          </div>
          {c.contacto.startsWith("+") ? (
            <p className="numeros mt-0.5 text-[12px] text-tinta-3">
              {formatearTelefono(c.contacto)}
              {c.cliente_id ? (
                <>
                  {" · "}
                  <Link href={`/clientes/${c.cliente_id}`} className="text-acento hover:underline">
                    Ver cliente
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* De la conversación al hecho: lo que salió de ella se abre desde aquí. */}
        <div className="flex flex-wrap items-center gap-2">
          {c.pedido_id ? (
            <Link href="/pedidos" className="text-[12px] text-acento hover:underline">
              Ver el pedido →
            </Link>
          ) : null}
          {c.booking_id ? (
            <Link href="/agenda" className="text-[12px] text-acento hover:underline">
              Ver la cita →
            </Link>
          ) : null}
        </div>
      </header>

      {c.resumen || c.motivo ? (
        <section aria-label="Qué pasó" className="border-b border-linea bg-panel-2 px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="etiqueta">Qué pasó</span>
            {c.resultado ? <Insignia tono={c.resultado === "sin_resultado" ? "neutro" : c.resultado === "transferida" ? "alerta" : "bueno"}>{NOMBRE_RESULTADO[c.resultado]}</Insignia> : null}
            {c.motivo ? <span className="text-[12px] text-tinta-2">{c.motivo}</span> : null}
          </div>
          {c.resumen ? <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-tinta">{c.resumen}</p> : null}
        </section>
      ) : null}

      {c.estado === "escalada" && c.motivo_escalamiento ? (
        <p className="border-b border-alerta/25 bg-alerta/10 px-6 py-2 text-[12px] text-tinta">
          El agente se detuvo: {c.motivo_escalamiento}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-6 py-5">
        {mensajes.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-tinta-3">
            Esta conversación no tiene mensajes escritos.
          </p>
        ) : null}

        {mensajes.map((m) => {
          const suDia = dia(m.creado);
          const cambiaDia = suDia !== ultimoDia;
          ultimoDia = suDia;

          return (
            <div key={m.id}>
              {cambiaDia ? (
                <p className="etiqueta py-3 text-center text-[10px]">{suDia}</p>
              ) : null}
              <div className={`flex ${LADO[m.autor]}`}>
                <div className={`max-w-[min(560px,80%)] border px-3 py-2 ${BURBUJA[m.autor]}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="etiqueta text-[10px]">{QUIEN[m.autor]}</span>
                    <span className="numeros text-[10px] text-tinta-3">{hora(m.creado)}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap">
                    {m.texto}
                  </p>
                  {/* Por qué contestó eso: la herramienta que consultó. */}
                  {m.herramienta ? (
                    <p className="mt-1.5 text-[10px] text-tinta-3">
                      consultó {m.herramienta.replaceAll("_", " ")}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
