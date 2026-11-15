import { PANEL_DEMO, WHATSAPP_DEMO } from "@/contenido/sitio";
import css from "./Confirma.module.css";

/** Dos piezas lado a lado: lo que recibe el cliente y lo que ve el negocio. */
export function Confirma() {
  const reservas = PANEL_DEMO.llamadas.filter((l) => l.resumen.startsWith("Reserva"));

  return (
    <div className={css.rejilla}>
      <figure className={css.celda}>
        <figcaption className={css.titulo}>Lo que recibe su cliente</figcaption>
        <div className={css.chat}>
          <p className={css.remitente}>{WHATSAPP_DEMO.remitente}</p>
          <div className={css.burbuja}>
            <p>{WHATSAPP_DEMO.mensaje}</p>
            <span className={css.hora}>{WHATSAPP_DEMO.hora}</span>
          </div>
          <div className={css.botones}>
            {WHATSAPP_DEMO.botones.map((b) => (
              <span key={b}>{b}</span>
            ))}
          </div>
          <div className={css.respuesta}>
            <p>{WHATSAPP_DEMO.botones[0]}</p>
            <span className={css.hora}>{WHATSAPP_DEMO.respuestaHora}</span>
          </div>
          <div className={css.burbuja}>
            <p>{WHATSAPP_DEMO.confirmacion}</p>
            <span className={css.hora}>{WHATSAPP_DEMO.respuestaHora}</span>
          </div>
        </div>
      </figure>

      <figure className={css.celda}>
        <figcaption className={css.titulo}>Lo que ve usted en el panel</figcaption>
        <ul className={css.lista}>
          {reservas.map((r) => {
            const estado = PANEL_DEMO.estados[r.estado];
            return (
              <li key={r.hora} className={css.fila}>
                <span className={css.dato}>{r.hora}</span>
                <span className={css.resumen}>{r.resumen}</span>
                <span className={css.estado} style={{ color: estado.color }}>
                  <i style={{ background: estado.color }} />
                  {estado.texto}
                </span>
              </li>
            );
          })}
        </ul>
        <p className={css.nota}>
          Si el cliente no responde, usted decide en Ajustes qué pasa con la reserva y cuánto se espera.
        </p>
      </figure>
    </div>
  );
}
