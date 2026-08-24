import type { Metadata } from "next";
import { FIRMA } from "@/contenido/sitio";
import { IconoDimia } from "@/componentes/Iconos";
import css from "./aviso.module.css";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description:
    "Cómo trata Dimia Consulting los datos personales que se envían desde dimia.mx.",
  robots: { index: true, follow: true },
};

export default function AvisoDePrivacidad() {
  return (
    <main className={css.pagina}>
      <div className={css.contenedor}>
        <a href="/" aria-label={FIRMA.nombre} className={css.marca}>
          <IconoDimia tamano={30} />
        </a>

        <p className={css.rotulo}>Aviso de privacidad</p>
        <h1 className={css.titulo}>
          Qué datos pedimos y para qué
          <i className={css.cuadrado} />
        </h1>

        <div className={css.texto}>
          <h2>Responsable</h2>
          <p>
            {FIRMA.nombre}, con domicilio en [ domicilio fiscal por confirmar ], {FIRMA.ciudad}, es
            responsable del tratamiento de los datos personales que usted proporciona en este sitio.
          </p>

          <h2>Qué datos recabamos</h2>
          <p>
            Únicamente los que usted escribe en el formulario de contacto: <strong>nombre</strong>,{" "}
            <strong>empresa</strong> y un <strong>medio de contacto</strong> —teléfono o correo—. No
            usamos cookies de seguimiento ni recabamos datos sensibles.
          </p>

          <h2>Para qué los usamos</h2>
          <p>
            Para responder su solicitud y agendar una demostración. No los usamos para ninguna otra
            finalidad, no los vendemos y no los compartimos con terceros, salvo el proveedor de correo
            que entrega el mensaje.
          </p>

          <h2>Cuánto tiempo los conservamos</h2>
          <p>
            El tiempo necesario para atender su solicitud y, si se vuelve cliente, mientras dure la
            relación comercial y los plazos que exija la ley.
          </p>

          <h2>Sus derechos</h2>
          <p>
            Puede solicitar el acceso, la rectificación, la cancelación o la oposición al tratamiento
            de sus datos —derechos ARCO—, así como revocar su consentimiento, escribiendo a{" "}
            <a href={`mailto:${FIRMA.correo}`}>{FIRMA.correo}</a>. Contestamos en un plazo máximo de
            veinte días hábiles.
          </p>

          <h2>Cambios</h2>
          <p>
            Cualquier modificación a este aviso se publica en esta misma dirección. Última
            actualización: [ fecha por confirmar ].
          </p>
        </div>

        <a href="/" className={css.volver}>
          Volver al inicio
        </a>
      </div>
    </main>
  );
}
