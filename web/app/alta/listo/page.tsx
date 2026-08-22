import Link from "next/link";
import { Paso } from "@/components/paso";
import { Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { faq, negocio, plantillaActual, recursos, reglas, servicios } from "@/lib/consultas";
import { saludo } from "@/lib/prompt";

export default async function AltaListo() {
  const [config, listaRecursos, listaServicios, listaReglas, listaFaq] = await Promise.all([
    negocio(),
    recursos(),
    servicios(),
    reglas(),
    faq(),
  ]);
  const plantilla = await plantillaActual(config.vertical);

  const revisiones = [
    { nombre: "Recursos", valor: listaRecursos.filter((r) => r.activo).length, minimo: 1, ruta: "/alta/recursos" },
    { nombre: "Servicios", valor: listaServicios.filter((s) => s.activo).length, minimo: 1, ruta: "/alta/servicios" },
    { nombre: "Franjas de horario", valor: listaReglas.filter((r) => r.tipo === "disponible").length, minimo: 1, ruta: "/alta/horario" },
    { nombre: "Respuestas frecuentes", valor: listaFaq.length, minimo: 3, ruta: "/alta/respuestas" },
  ];

  return (
    <Paso
      titulo="Tu agente ya puede contestar"
      descripcion="Falta un solo paso que no depende de ti: asignarte el número de entrada. Mientras tanto, todo lo demás ya quedó guardado y puedes editarlo cuando quieras."
    >
      <Tarjeta>
        <TarjetaCabecera titulo="Así saluda" />
        <p className="px-4 py-4 text-[15px] text-tinta">“{saludo(config, plantilla)}”</p>
      </Tarjeta>

      <Tarjeta>
        <TarjetaCabecera titulo="Lo que capturaste" />
        <ul className="divide-y divide-linea">
          {revisiones.map((r) => (
            <li key={r.nombre} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[13px] text-tinta-2">{r.nombre}</span>
              <span className="numeros text-[13px] font-medium text-tinta">{r.valor}</span>
              {r.valor >= r.minimo ? (
                <Insignia tono="bueno">Listo</Insignia>
              ) : (
                <Link href={r.ruta}>
                  <Insignia tono="alerta">Completar</Insignia>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Tarjeta>

      <div className="flex flex-wrap gap-3 border-t border-linea pt-4">
        <Link
          href="/resumen"
          className="inline-flex h-8 items-center rounded-md bg-acento px-4 text-[13px] font-medium text-acento-tinta transition hover:brightness-110"
        >
          Ir al panel
        </Link>
        <Link
          href="/agente"
          className="inline-flex h-8 items-center rounded-md border border-linea-fuerte bg-panel px-4 text-[13px] font-medium text-tinta transition hover:bg-panel-2"
        >
          Ver las instrucciones del agente
        </Link>
      </div>
    </Paso>
  );
}
