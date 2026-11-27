import type { Metadata } from "next";
import { Navegacion } from "@/componentes/Navegacion";
import { Revelar } from "@/componentes/Revelar";
import { Pie } from "@/componentes/Pie";
import { Campo } from "@/componentes/lab/Campo";
import { Diagrama } from "@/componentes/lab/Diagrama";
import { PortadaPublicacion } from "@/componentes/lab/Portada";
import { FASES, LABORATORIO, PUBLICACIONES } from "@/contenido/laboratorio";
import ui from "@/componentes/ui.module.css";
import css from "./laboratorio.module.css";

export const metadata: Metadata = {
  title: "Laboratorio",
  description: LABORATORIO.entrada,
  alternates: { canonical: "/laboratorio" },
  openGraph: { url: "/laboratorio", title: LABORATORIO.titular, description: LABORATORIO.entrada, images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: LABORATORIO.titular, description: LABORATORIO.entrada, images: ["/og.png"] },
};

export default function PaginaLaboratorio() {
  return (
    <>
      <Revelar />
      <div className={`${ui.tonoPapel} ${css.lab}`}>
        <Navegacion claro />
        <main>
          <header className={css.portada}>
            <h1 className={css.titular}>{LABORATORIO.titular}</h1>
            <div className={css.bajada}>
              <p className={css.entrada}>{LABORATORIO.entrada}</p>
              <a href="/#contacto" className={ui.botonPrimario}>
                Agendar una conversación
              </a>
            </div>
            <Campo />
          </header>

          <nav className={css.indice} aria-label="Laboratorio">
            {FASES.map((f) => (
              <a key={f.id} href={`#${f.id}`}>
                {f.nombre}
              </a>
            ))}
            <a href="#bitacora">Bitácora</a>
          </nav>

          {FASES.map((f) => (
            <section key={f.id} id={f.id} className={css.fase} data-fase={f.id}>
              <div className={css.faseCabeza}>
                <p data-revela="titulo" className={css.faseNombre}>
                  {f.nombre}
                </p>
                <h2 data-revela="texto" className={css.faseTitular}>
                  {f.titular}
                </h2>
              </div>
              <ul data-revela="lista" className={css.mosaico}>
                {f.tarjetas.map((t) => (
                  <li key={t.titulo} className={css.tarjeta}>
                    <div className={css.escena}>
                      <Diagrama tipo={t.diagrama} />
                    </div>
                    <div className={css.ficha}>
                      <h3>{t.titulo}</h3>
                      <p>{t.texto}</p>
                      <ul>
                        {t.puntos.map((p) => (
                          <li key={p}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section id="bitacora" className={css.bitacora}>
            <h2 data-revela="titulo" className={css.faseNombre}>
              Bitácora
            </h2>
            <p data-revela="texto" className={css.entrada}>
              Proyectos, experimentos y pruebas de lo que construimos.
            </p>
            <ul data-revela="lista" className={css.publicaciones}>
              {PUBLICACIONES.map((p) => (
                <li key={p.slug}>
                  <a href={`/laboratorio/${p.slug}`} className={css.publicacion}>
                    <span className={css.marco}>
                      <PortadaPublicacion semilla={p.slug} />
                    </span>
                    <span className={css.tipo}>{p.tipo}</span>
                    <span className={css.nombre}>{p.titulo}</span>
                    <span className={css.resumen}>{p.resumen}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
      <Pie />
    </>
  );
}
