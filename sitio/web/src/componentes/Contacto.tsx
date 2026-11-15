"use client";

import { useState } from "react";
import { CIERRE, CIERRE_CTA, FIRMA } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Contacto.module.css";

type Estado = "reposo" | "enviando" | "enviado" | "error" | "sinConexion";

const AVISOS: Record<Exclude<Estado, "reposo" | "enviando">, { color: string; titulo: string }> = {
  enviado: { color: "var(--bueno)", titulo: "Demostración solicitada" },
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
    estado === "enviando" ? "Enviando…" : estado === "enviado" ? "Enviar otra solicitud" : "Agendar demostración";

  const aviso = estado === "reposo" || estado === "enviando" ? null : AVISOS[estado];

  return (
    <section id="contacto" className={ui.seccion}>
      <div className={ui.contenedor}>
        <h2 className={ui.titulo}>{CIERRE_CTA.titular}</h2>
        <p className={`${ui.entrada} ${css.bajada}`}>{CIERRE_CTA.entrada}</p>

        {/* El teléfono es la demostración: contesta el propio agente. */}
        <a href={FIRMA.telefonoHref} className={css.cartel}>
          <span className={css.telefono}>{FIRMA.telefono}</span>
          <span className={css.nota}>{CIERRE.notaTelefono}</span>
        </a>

        <div className={css.columnas}>
          <div className={css.izquierda}>
            <p className={ui.entrada}>{CIERRE.formulario}</p>
            <p className={css.correo}>
              También puede escribirnos a <a href={`mailto:${FIRMA.correo}`}>{FIRMA.correo}</a>
            </p>
          </div>

          <div className={css.derecha}>
            <form onSubmit={enviar} className={css.formulario}>
              <label className={css.campo}>
                <span className={css.etiqueta}>Nombre</span>
                <input name="nombre" type="text" required autoComplete="name" className={css.entrada} />
              </label>
              <label className={css.campo}>
                <span className={css.etiqueta}>Negocio</span>
                <input name="empresa" type="text" required autoComplete="organization" className={css.entrada} />
              </label>
              <label className={`${css.campo} ${css.campoAncho}`}>
                <span className={css.etiqueta}>Teléfono o correo</span>
                <input name="contacto" type="text" required className={css.entrada} />
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
              <div className={css.envio}>
                <button type="submit" disabled={estado === "enviando"} className={`${ui.botonPrimario} ${css.boton}`}>
                  {textoBoton}
                </button>
                <p className={css.aclaracion}>Le contestamos el mismo día hábil.</p>
              </div>
            </form>

            {aviso && (
              <div className={css.aviso} style={{ borderLeftColor: aviso.color }} role="status" aria-live="polite">
                <p className={ui.estado} style={{ color: aviso.color }}>
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
