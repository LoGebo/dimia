import Link from "next/link";
import { nombreDe } from "@/components/bandeja";
import { ChipHerramienta, ChipsHerramienta, TextoFluye } from "@/components/kit";
import { IconoDimia } from "@/components/marca";
import { fechaLarga, hora, isoDia, telefono as formatearTelefono } from "@/lib/formato";
import { NOMBRE_CANAL, NOMBRE_RESULTADO, type ConversacionDetalle, type Mensaje } from "@/lib/tipos";

// Lo que entra a la izquierda, lo que sale a la derecha: es como se lee
// cualquier bandeja, y el dueño ya tiene esa costumbre de su propio WhatsApp.
const LADO: Record<Mensaje["autor"], string> = {
  cliente: "justify-start",
  agente: "justify-end",
  equipo: "justify-end",
  sistema: "justify-center",
};

const BURBUJA: Record<Mensaje["autor"], string> = {
  cliente: "rounded-2xl rounded-bl-md bg-panel-2 text-tinta",
  agente: "rounded-2xl rounded-br-md bg-acento text-acento-tinta",
  equipo: "rounded-2xl rounded-br-md bg-bueno/15 text-tinta",
  sistema: "rounded-lg bg-transparent text-tinta-3",
};

/** Solo el último mensaje del agente en una conversación viva se muestra llegando: lo demás ya pasó. */
const VENTANA_EN_VIVO_MS = 3 * 60 * 1000;

export function Hilo({
  conversacion: c,
  mensajes,
  zona,
}: {
  conversacion: ConversacionDetalle;
  mensajes: Mensaje[];
  zona: string;
}) {
  let ultimoDia = "";
  const enlacePedido = c.pedido_creado ? `/pedidos?dia=${isoDia(new Date(c.pedido_creado), zona)}&estado=todos` : "/pedidos";
  const enlaceCita = c.booking_codigo ? `/agenda?q=${encodeURIComponent(c.booking_codigo)}` : "/agenda";
  const ultimo = mensajes[mensajes.length - 1];
  const enVivo =
    ultimo?.autor === "agente" && c.estado !== "cerrada" && Date.now() - new Date(ultimo.creado).getTime() < VENTANA_EN_VIVO_MS
      ? ultimo.id
      : null;
  const tonoResultado = !c.resultado || c.resultado === "sin_resultado" ? null : c.resultado === "transferida" ? "fallo" : "hecho";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-linea px-6 py-3.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold tracking-tight text-tinta">
              {nombreDe(c)}
            </h2>
            <span className="text-[12px] text-tinta-3">{NOMBRE_CANAL[c.canal]}</span>
            {c.estado === "escalada" ? <ChipHerramienta estado="fallo">pidió una persona</ChipHerramienta> : null}
            {c.estado === "abierta" && enVivo ? <ChipHerramienta estado="en-curso">en curso</ChipHerramienta> : null}
          </div>
          {c.contacto.startsWith("+") ? (
            <p className="numeros mt-0.5 text-[12px] text-tinta-3">
              {formatearTelefono(c.contacto)}
              {c.cliente_id ? (
                <>
                  {" · "}
                  <Link href={`/clientes/${c.cliente_id}`} className="font-sans text-acento transition-colors duration-150 hover:text-tinta">
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
            <Link href={enlacePedido} className="inline-flex h-7 items-center gap-1.5 border border-linea bg-panel px-2.5 text-[12px] font-medium text-tinta transition-colors duration-150 hover:border-linea-fuerte hover:text-acento">
              Ver el pedido
            </Link>
          ) : null}
          {c.booking_id ? (
            <Link href={enlaceCita} className="inline-flex h-7 items-center gap-1.5 border border-linea bg-panel px-2.5 text-[12px] font-medium text-tinta transition-colors duration-150 hover:border-linea-fuerte hover:text-acento">
              Ver la cita
              {c.booking_codigo ? <span className="numeros text-[11px] text-tinta-3">{c.booking_codigo}</span> : null}
            </Link>
          ) : null}
        </div>
      </header>

      {c.resumen || c.motivo || tonoResultado ? (
        <section aria-label="Qué pasó" className="border-b border-linea bg-panel-2 px-6 py-3.5">
          <div className="grid gap-x-6 gap-y-2 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="etiqueta text-laton">Qué pasó</span>
                {c.motivo ? <span className="text-[12.5px] font-medium text-tinta">{c.motivo}</span> : null}
              </div>
              {c.resumen ? (
                <p className="mt-1.5 max-w-3xl border-l-2 border-acento pl-3 text-[13px] leading-relaxed text-tinta">{c.resumen}</p>
              ) : null}
            </div>
            <ChipsHerramienta>
              {c.resultado && tonoResultado ? (
                <ChipHerramienta estado={tonoResultado}>{NOMBRE_RESULTADO[c.resultado].toLowerCase()}</ChipHerramienta>
              ) : null}
              {c.booking_id ? (
                <ChipHerramienta estado="hecho" dato={c.booking_codigo ?? undefined}>
                  {c.booking_inicio ? `cita ${fechaLarga(c.booking_inicio, zona)} ${hora(c.booking_inicio, zona)}` : "cita"}
                </ChipHerramienta>
              ) : null}
            </ChipsHerramienta>
          </div>
        </section>
      ) : null}

      {c.estado === "escalada" && c.motivo_escalamiento ? (
        <p className="flex items-center gap-2 border-b border-alerta/25 bg-alerta/10 px-6 py-2 text-[12px] text-tinta">
          <i aria-hidden="true" className="late h-1.5 w-1.5 flex-none bg-alerta" />
          El agente se detuvo: {c.motivo_escalamiento}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
        {mensajes.length === 0 ? (
          <p className="py-8 text-center text-[12px] text-tinta-3">
            Esta conversación no tiene mensajes escritos.
          </p>
        ) : null}

        {mensajes.map((m) => {
          const suDia = fechaLarga(m.creado, zona);
          const cambiaDia = suDia !== ultimoDia;
          ultimoDia = suDia;

          return (
            <div key={m.id}>
              {cambiaDia ? (
                <p className="flex items-center gap-3 py-3 text-[11px] text-tinta-3 before:h-px before:flex-1 before:bg-linea after:h-px after:flex-1 after:bg-linea">
                  {suDia}
                </p>
              ) : null}
              <div className={`flex items-end gap-2 ${LADO[m.autor]}`}>
                {m.autor === "cliente" ? (
                  <span
                    aria-hidden="true"
                    className="mb-6 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-linea text-[12px] font-bold text-tinta uppercase"
                  >
                    {nombreDe(c).slice(0, 1)}
                  </span>
                ) : null}
                <div className={`max-w-[min(560px,78%)] ${m.autor === "sistema" ? "" : "aparece-arriba"}`}>
                  <div className={`px-4 py-2.5 ${BURBUJA[m.autor]}`}>
                    {m.id === enVivo ? (
                      <TextoFluye texto={m.texto} className="whitespace-pre-wrap" />
                    ) : (
                      <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.texto}</p>
                    )}
                  </div>
                  <div className={`mt-1 flex items-center gap-2 px-1 text-[11px] text-tinta-3 ${LADO[m.autor]}`}>
                    {m.autor === "equipo" ? <span>Equipo</span> : null}
                    <span className="numeros">{hora(m.creado, zona)}</span>
                    {m.herramienta ? <ChipHerramienta estado="hecho">consultó {m.herramienta.replaceAll("_", " ")}</ChipHerramienta> : null}
                  </div>
                </div>
                {m.autor === "agente" ? (
                  <span aria-hidden="true" className="mb-6 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-panel-2 text-tinta">
                    <IconoDimia tamano={16} />
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
