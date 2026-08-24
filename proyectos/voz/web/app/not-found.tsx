import Link from "next/link";
import { IconoDimia } from "@/components/marca";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-[460px]">
        <IconoDimia tamano={26} />
        <p className="etiqueta mt-6">Error 404</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight font-light tracking-[-0.012em] text-tinta">
          Esta página no existe
          <i className="cuadrado ml-1.5 align-baseline" aria-hidden="true" />
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-tinta-2">
          La dirección está mal escrita o la sección cambió de lugar.
        </p>
        <Link
          href="/resumen"
          className="mt-7 inline-flex min-h-[44px] items-center bg-acento px-5 text-[14px] font-semibold text-acento-tinta transition hover:opacity-90"
        >
          Ir al resumen
        </Link>
      </div>
    </main>
  );
}
