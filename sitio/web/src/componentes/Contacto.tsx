"use client";

import { useState } from "react";
import { CIERRE, FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Contacto.module.css";

type Estado = "reposo" | "enviando" | "enviado" | "error" | "sinConexion";

const AVISOS: Record<Exclude<Estado, "reposo" | "enviando">, { color: string; titulo: string }> = {
  enviado: { color: "var(--bueno)", titulo: "Recibido" },
  error: { color: "var(--critico)", titulo: "No se pudo enviar" },
  sinConexion: { color: "var(--alerta)", titulo: "Pendiente" },
};

export function Contacto() {
  const [estado, setEstado] = useState<Estado>("reposo");
  const [mensaje, setMensaje] = useState("");

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (estado === "enviando") return;

    const formulario = e.currentTarget;
    const datos = new FormData(formulario);
    setEstado("enviando");

    try {
      const respuesta = await fetch("/api/contacto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: String(datos.get("nombre") ?? ""),
          empresa: String(datos.get("empresa") ?? ""),
          contacto: String(datos.get("contacto") ?? ""),
        }),
      });

      const cuerpo = (await respuesta.json().catch(() => ({}))) as {
        ok?: boolean;
        mensaje?: string;
        codigo?: string;
      };

      if (respuesta.ok && cuerpo.ok) {
        setEstado("enviado");
        setMensaje(cuerpo.mensaje ?? "Recibimos su solicitud. Le contestamos el mismo día hábil.");
        formulario.reset();
        return;
      }

      if (cuerpo.codigo === "sin_configurar") {
        setEstado("sinConexion");
        setMensaje(cuerpo.mensaje ?? "");
        return;
      }

      setEstado("error");
      setMensaje(cuerpo.mensaje ?? "Intente de nuevo en un momento.");
    } catch {
      setEstado("error");
      setMensaje("No hubo conexión. Intente de nuevo o llámenos.");
    }
  }

  const textoBoton =
    estado === "enviando" ? "Enviando…" : estado === "enviado" ? "Enviar otra solicitud" : "Agendar una demostración";

  const aviso = estado === "reposo" || estado === "enviando" ? null : AVISOS[estado];

  return (
    <section id="contacto" className={ui.seccion}>
      <div className={ui.contenedor}>
        <h2 className={css.titular}>
          {CIERRE.titular}
        </h2>

        <div className={css.columnas}>
          <div className={css.izquierda}>
            {/* El teléfono es la demostración: contesta el propio agente. */}
            <a href={FIRMA.telefonoHref} className={css.llamada}>
              <span className={css.llamadaEstado}>
                {CIERRE.notaTelefono}
              </span>
              <span className={css.telefono}>{FIRMA.telefono}</span>
            </a>

            <div className={css.correoFila}>
              <span className={css.rotuloDato}>Correo</span>
              <a href={`mailto:${FIRMA.correo}`} className={css.correo}>
                {FIRMA.correo}
              </a>
            </div>
          </div>

          <div className={css.derecha}>
            <p className={css.formularioTitulo}>Agendar una demostración</p>

            <form onSubmit={enviar} className={css.formulario}>
              <label className={css.campo}>
                <span className={css.etiqueta}>Nombre</span>
                <input name="nombre" type="text" required autoComplete="name" className={css.entrada} />
              </label>
              <label className={css.campo}>
                <span className={css.etiqueta}>Empresa</span>
                <input name="empresa" type="text" required autoComplete="organization" className={css.entrada} />
              </label>
              <label className={`${css.campo} ${css.campoAncho}`}>
                <span className={css.etiqueta}>Teléfono o correo</span>
                <input name="contacto" type="text" required className={css.entradaMono} />
              </label>
              {/* Trampa para robots: una persona nunca la llena */}
              <input
                type="text"
                name="pagina"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className={css.trampa}
              />
              <button type="submit" disabled={estado === "enviando"} className={css.boton}>
                {textoBoton}
              </button>
            </form>

            {aviso && (
              <div className={css.aviso} style={{ borderLeftColor: aviso.color }} role="status" aria-live="polite">
                <p className={ui.estado} style={{ color: aviso.color, marginBottom: 10 }}>
                  <i className={ui.punto} style={{ background: aviso.color }} />
                  {aviso.titulo}
                </p>
                <p className={css.avisoTexto}>
                  {mensaje}{" "}
                  {estado !== "enviado" && (
                    <>
                      Escriba a <a href={`mailto:${FIRMA.correo}`}>{FIRMA.correo}</a> o marque al {FIRMA.telefono}.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
