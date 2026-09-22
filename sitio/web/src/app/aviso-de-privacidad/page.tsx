import type { Metadata } from "next";
import { FIRMA } from "@/contenido/sitio";
import { IconoDimia } from "@/componentes/Iconos";
import css from "./aviso.module.css";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description:
    "Cómo trata Dimia Consulting los datos personales que se envían desde dimia.mx y desde la app de Dimia.",
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

          <h2>La app de Dimia y el panel</h2>
          <p>
            Si su negocio es cliente, usted entra a la app de Dimia para iPhone y al panel con su{" "}
            <strong>correo</strong> y una contraseña. Ahí se guardan los datos de su negocio —servicios,
            horarios, citas, pedidos, cobros— y las conversaciones que sus clientes tienen con sus
            agentes por teléfono, WhatsApp, Instagram y Messenger, además de lo que usted le escribe a
            sus agentes. Los usamos solo para dar el servicio: que los agentes contesten, agenden y le
            muestren lo que pasó. No los vendemos, no los usamos para publicidad y no rastreamos su
            actividad fuera de la app.
          </p>
          <p>
            Para operar usamos proveedores que procesan los datos por nuestra cuenta: alojamiento y base
            de datos, telefonía y mensajería (Meta, operador telefónico) y el modelo de lenguaje que usted
            conecta a sus agentes (su cuenta de ChatGPT o de Claude).
          </p>
          <p>
            Puede eliminar su cuenta desde la app, en Cuenta → Eliminar mi cuenta. Se borran su usuario
            y sus accesos; si es el único dueño, el negocio queda desactivado.
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
            actualización: 22 de septiembre de 2026.
          </p>
        </div>

        <a href="/" className={css.volver}>
          Volver al inicio
        </a>
      </div>
    </main>
  );
}
