import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { TablaRecados } from "@/components/kit/relacion-recados";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { negocio, recados } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

export default async function Recados({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const giro = await exigirSeccion("/recados");
  const parametros = await searchParams;
  const soloPendientes = parametros.ver !== "todos";
  const [config, lista] = await Promise.all([negocio(), recados(soloPendientes)]);
  const pendientes = lista.filter((r) => !r.atendido).length;

  return (
    <>
      <Encabezado
        titulo="Recados"
        descripcion="Quién llamó, qué necesita y a qué número regresarle la llamada."
        giro={giro.nombre}
        acciones={
          <div className="flex border border-linea bg-panel">
            {[
              { valor: "pendientes", nombre: "Pendientes" },
              { valor: "todos", nombre: "Todos" },
            ].map((v) => (
              <Link
                key={v.valor}
                href={`/recados?ver=${v.valor}`}
                aria-current={(v.valor === "todos") === !soloPendientes ? "page" : undefined}
                className={`px-2.5 py-1 text-xs transition-colors duration-150 ${
                  (v.valor === "todos") === !soloPendientes
                    ? "bg-acento-suave font-medium text-acento"
                    : "text-tinta-2 hover:bg-panel-2 hover:text-tinta"
                }`}
              >
                {v.nombre}
              </Link>
            ))}
          </div>
        }
      />

      <div className="px-5 py-5">
        <Tarjeta>
          <TarjetaCabecera
            titulo={pendientes === 1 ? "1 sin atender" : `${pendientes} sin atender`}
            descripcion="Cada uno lo tomó el agente cuando no pudo resolver la llamada."
          />
          <TablaRecados lista={lista} zona={config.zona_horaria} soloPendientes={soloPendientes} />
        </Tarjeta>
      </div>
    </>
  );
}
