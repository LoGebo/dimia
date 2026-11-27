import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navegacion } from "@/componentes/Navegacion";
import { Pie } from "@/componentes/Pie";
import { PortadaPublicacion } from "@/componentes/lab/Portada";
import { PUBLICACIONES } from "@/contenido/laboratorio";
import ui from "@/componentes/ui.module.css";
import css from "../laboratorio.module.css";

type Props = { params: Promise<{ slug: string }> };

const buscar = (slug: string) => PUBLICACIONES.find((p) => p.slug === slug);

export const dynamicParams = false;

export function generateStaticParams() {
  return PUBLICACIONES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = buscar(slug);
  const url = `/laboratorio/${slug}`;
  const tarjeta = { title: p?.titulo, description: p?.resumen, images: ["/og.png"] };
  return {
    title: p?.titulo,
    description: p?.resumen,
    alternates: { canonical: url },
    openGraph: { ...tarjeta, url, type: "article" },
    twitter: { ...tarjeta, card: "summary_large_image" },
  };
}

export default async function PaginaPublicacion({ params }: Props) {
  const p = buscar((await params).slug);
  if (!p) notFound();

  return (
    <>
      <div className={ui.tonoPapel}>
      <Navegacion claro />
      <main>
        <article className={css.articulo}>
          <a href="/laboratorio" className={css.volver}>
            Laboratorio
          </a>
          <h1 className={css.subtitular}>{p.titulo}</h1>
          <p className={css.entrada}>{p.resumen}</p>
          <PortadaPublicacion semilla={p.slug} className={css.banda} />
          {p.apartados.map((a) => (
            <section key={a.titulo}>
              <h2>{a.titulo}</h2>
              {a.parrafos.map((t) => (
                <p key={t}>{t}</p>
              ))}
              {a.codigo && (
                <pre>
                  <code>{a.codigo}</code>
                </pre>
              )}
            </section>
          ))}
        </article>
      </main>
      </div>
      <Pie />
    </>
  );
}
