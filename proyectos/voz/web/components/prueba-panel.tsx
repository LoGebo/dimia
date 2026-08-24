"use client";

import type { EstadoPrueba } from "@/lib/acciones";
import { Insignia, Vacio } from "@/components/ui/primitivos";
import { duracion, hora, moneda } from "@/lib/formato";

export function CarritoVivo({ pedido, zona }: { pedido: EstadoPrueba["pedido"]; zona: string }) {
  if (!pedido) {
    return (
      <Vacio
        titulo="El pedido aparece aquí"
        detalle="Conforme el agente agregue cosas, las vas a ver caer una por una con su precio."
      />
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <span className="numeros rounded border border-linea bg-panel-2 px-1.5 py-0.5 text-[11px] font-medium tracking-wider text-tinta-2">
          {pedido.codigo}
        </span>
        <span className="text-[11px] text-tinta-3 capitalize">{pedido.tipo}</span>
        {pedido.estado === "confirmado" ? (
          <Insignia tono="bueno">Confirmado</Insignia>
        ) : (
          <Insignia tono="acento">Tomando pedido</Insignia>
        )}
      </div>
      {pedido.items.length === 0 ? (
        <p className="px-4 pb-3 text-[12px] text-tinta-3">Sin items todavía.</p>
      ) : (
        <ul className="divide-y divide-linea border-t border-linea">
          {pedido.items.map((item, i) => (
            <li key={`${item.nombre}-${i}`} className="flex items-baseline gap-2 px-4 py-2">
              <span className="numeros w-6 shrink-0 text-[12px] text-tinta-3">{item.cantidad}×</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-tinta">{item.nombre}</span>
                {item.notas ? <span className="block text-[11px] text-tinta-3">{item.notas}</span> : null}
              </span>
              <span className="numeros text-[12px] text-tinta-2">{moneda(item.subtotal)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between border-t border-linea px-4 py-2.5">
        <span className="etiqueta">Total</span>
        <span className="numeros text-[20px] font-semibold tracking-tight text-tinta">
          {moneda(pedido.total)}
        </span>
      </div>
      <p className="border-t border-linea px-4 py-2 text-[11px] text-tinta-3">
        Sale de `pedido_resumen` en Postgres, no de la pantalla: es el pedido real.
      </p>
    </div>
  );
}

export function ReservasVivas({ reservas, zona }: { reservas: EstadoPrueba["reservas"]; zona: string }) {
  if (reservas.length === 0) {
    return (
      <Vacio
        titulo="La reserva aparece aquí"
        detalle="En cuanto el agente confirme una cita, la vas a ver aterrizar con su código."
      />
    );
  }
  return (
    <ul className="divide-y divide-linea">
      {reservas.map((r) => (
        <li key={r.id} className="px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-medium text-tinta">{r.cliente_nombre}</span>
            <span className="numeros rounded border border-linea bg-panel-2 px-1.5 py-0.5 text-[11px] tracking-wider text-tinta-2">
              {r.codigo}
            </span>
          </div>
          <p className="numeros text-[11px] text-tinta-3">
            {hora(r.inicio, zona)} · {r.servicio} · {r.recurso}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function LlamadasRegistradas({ llamadas }: { llamadas: EstadoPrueba["llamadas"] }) {
  if (llamadas.length === 0) {
    return <p className="px-4 py-3 text-[11px] text-tinta-3">Al colgar se registra aquí la llamada.</p>;
  }
  return (
    <ul className="divide-y divide-linea">
      {llamadas.map((l, i) => (
        <li key={l.call_id} className="flex items-center gap-2 px-4 py-2">
          <span className="numeros text-[12px] text-tinta-3">
            {new Date(l.inicio).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="numeros text-[12px] text-tinta-2" title="Duración">
            {duracion(l.duracion_seg)}
          </span>
          {i === 0 ? <Insignia tono="acento">La última</Insignia> : null}
          {l.escalado ? (
            <Insignia tono="alerta">Escaló: {l.motivo_escalamiento ?? "sin motivo"}</Insignia>
          ) : l.resuelto ? (
            <Insignia tono="bueno">Resuelta sin humano</Insignia>
          ) : (
            <Insignia>Sin resolver</Insignia>
          )}
        </li>
      ))}
    </ul>
  );
}
