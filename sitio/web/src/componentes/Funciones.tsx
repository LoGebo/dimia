import { FUNCIONES } from "@/contenido/sitio";
import css from "./Funciones.module.css";

/** Ilustración de interfaz para cada tarjeta: pequeña, con datos de ejemplo. */
function Ilustracion({ clave }: { clave: string }) {
  switch (clave) {
    case "contesta":
      return (
        <div className={css.horas} aria-hidden="true">
          {Array.from({ length: 24 }, (_, h) => (
            <i key={h} data-noche={h < 9 || h >= 19 ? "1" : "0"} />
          ))}
          <span>00:00</span>
          <span>12:00</span>
          <span>23:59</span>
        </div>
      );
    case "agenda":
      return (
        <ul className={css.agenda} aria-hidden="true">
          <li data-estado="ocupado">
            <span>17:00</span>Ocupado
          </li>
          <li data-estado="ocupado">
            <span>17:30</span>Ocupado
          </li>
          <li data-estado="nuevo">
            <span>18:00</span>Reserva · 4 personas
          </li>
          <li>
            <span>18:30</span>Libre
          </li>
        </ul>
      );
    case "whatsapp":
      return (
        <div className={css.chat} aria-hidden="true">
          <p className={css.burbuja}>Su cita quedó: jueves 4, 18:00. ¿Nos confirma?</p>
          <div className={css.botones}>
            <span>Confirmar</span>
            <span>Cambiar</span>
          </div>
        </div>
      );
    case "responde":
      return (
        <div className={css.chat} aria-hidden="true">
          <p className={css.pregunta}>¿Abren el domingo?</p>
          <p className={css.burbuja}>Sí, los domingos abrimos de 9:00 a 15:00.</p>
        </div>
      );
    case "transfiere":
      return (
        <div className={css.transfiere} aria-hidden="true">
          <span className={css.nodo}>Agente</span>
          <span className={css.flecha} />
          <span className={css.nodo} data-equipo="1">
            Su equipo
          </span>
        </div>
      );
    default:
      return (
        <ul className={css.lista} aria-hidden="true">
          <li>
            <span>21:04</span>Reserva para 4<i data-color="bueno" />
          </li>
          <li>
            <span>19:52</span>Reserva para 2<i data-color="alerta" />
          </li>
          <li>
            <span>18:15</span>Pide al gerente<i data-color="hueso" />
          </li>
        </ul>
      );
  }
}

export function Funciones() {
  return (
    <ul data-revela="lista" className={css.rejilla}>
      {FUNCIONES.tarjetas.map((t) => (
        <li key={t.clave} className={css.tarjeta}>
          <div className={css.lienzo}>
            <Ilustracion clave={t.clave} />
          </div>
          <h3 className={css.titulo}>{t.titulo}</h3>
          <p className={css.texto}>{t.texto}</p>
        </li>
      ))}
    </ul>
  );
}
