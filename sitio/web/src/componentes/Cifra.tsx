import css from "./Cifra.module.css";

const DIGITOS = "0123456789";

/**
 * Cifra que gira dígito por dígito cuando cambia su valor. Cada dígito es una columna
 * 0–9 que se desplaza en vertical; los signos ($ , +) quedan fijos. Solo transform.
 */
export function Cifra({ texto }: { texto: string }) {
  const caracteres = texto.split("");
  return (
    <span className={css.cifra}>
      <span className={css.lector}>{texto}</span>
      {caracteres.map((c, i) => {
        // Llave desde la derecha: las unidades conservan su columna aunque cambie el largo.
        const llave = caracteres.length - i;
        if (!DIGITOS.includes(c)) {
          return (
            <span key={`s${llave}`} className={css.signo} aria-hidden="true">
              {c}
            </span>
          );
        }
        return (
          <span key={`d${llave}`} className={css.ventana} aria-hidden="true">
            <span className={css.columna} style={{ transform: `translateY(-${Number(c) * 10}%)` }}>
              {DIGITOS.split("").map((d) => (
                <span key={d} className={css.digito}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
