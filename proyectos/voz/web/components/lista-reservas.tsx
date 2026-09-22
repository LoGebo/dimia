import { cancelarReserva, moverCita } from "@/lib/acciones";
import { Formulario } from "@/components/formulario";
import { Boton, Insignia } from "@/components/ui/primitivos";
import { Reagendar } from "@/components/reagendar";
import { fechaCorta, hora, telefono } from "@/lib/formato";
import { confirmacionDe, type EstadoReserva, type Reserva } from "@/lib/tipos";

const TONO: Record<EstadoReserva, "bueno" | "neutro" | "critico" | "acento"> = {
  confirmada: "bueno",
  completada: "neutro",
  cancelada: "critico",
  no_asistio: "critico",
};

const NOMBRE: Record<EstadoReserva, string> = {
  confirmada: "Confirmada",
  completada: "Atendida",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

export function ListaReservas({
  reservas,
  zona,
  mostrarFecha = false,
}: {
  reservas: Reserva[];
  zona: string;
  mostrarFecha?: boolean;
}) {
  const ahora = Date.now();
  return (
    <ul className="divide-y divide-linea">
      {reservas.map((r) => {
        // Ya terminó y nadie la cerró: se ofrece cerrarla (llegó / no llegó) en vez de moverla o cancelarla.
        const paso = r.estado === "confirmada" && new Date(r.fin).getTime() < ahora;
        return (
        <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 hover:bg-panel-2">
          <div className="numeros w-[92px] shrink-0">
            {mostrarFecha ? (
              <span className="block text-[11px] text-tinta-3">{fechaCorta(r.inicio, zona)}</span>
            ) : null}
            <span className="text-[13px] font-medium text-tinta">{hora(r.inicio, zona)}</span>
            <span className="block text-[11px] text-tinta-3">a {hora(r.fin, zona)}</span>
          </div>
          <div className="min-w-[160px] flex-1">
            <p className="truncate text-[13px] font-medium text-tinta">{r.cliente_nombre}</p>
            <p className="numeros truncate text-[11px] text-tinta-3">{telefono(r.telefono)}</p>
          </div>
          <div className="min-w-[140px] flex-1">
            <p className="truncate text-[13px] text-tinta-2">{r.servicio}</p>
            <p className="truncate text-[11px] text-tinta-3">
              {r.recurso} · {r.personas} {r.personas === 1 ? "persona" : "personas"}
            </p>
          </div>
          {r.notas ? (
            <p className="hidden max-w-[180px] truncate text-[11px] text-tinta-3 xl:block" title={r.notas}>
              {r.notas}
            </p>
          ) : null}
          <span className="numeros border border-linea bg-panel-2 px-1.5 py-0.5 text-[11px] font-medium tracking-wider text-tinta-2">
            {r.codigo}
          </span>
          {paso ? <Insignia tono="alerta">Ya pasó · sin cerrar</Insignia> : <Insignia tono={TONO[r.estado]}>{NOMBRE[r.estado]}</Insignia>}
          {paso ? null : confirmacionDe(r) === "confirmo" ? (
            <Insignia tono="bueno">Confirmó</Insignia>
          ) : confirmacionDe(r) === "sin_confirmar" ? (
            <Insignia tono="alerta">Sin confirmar</Insignia>
          ) : null}
          {paso ? (
            <div className="flex items-center gap-1">
              <Formulario accion={moverCita}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="paso" value="atendida" />
                <Boton>Llegó</Boton>
              </Formulario>
              <Formulario accion={moverCita}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="paso" value="no_llego" />
                <Boton variante="peligro">No llegó</Boton>
              </Formulario>
            </div>
          ) : r.estado === "confirmada" ? (
            <div className="flex items-center gap-1">
              <Reagendar reserva={r} zona={zona} />
              <Formulario accion={cancelarReserva}>
                <input type="hidden" name="id" value={r.id} />
                <Boton variante="peligro">Cancelar</Boton>
              </Formulario>
            </div>
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}
