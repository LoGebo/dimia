import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Boton, Insignia, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { alternarRecado } from "@/lib/acciones";
import { negocio, recados } from "@/lib/consultas";
import { fechaCorta, hora, telefono } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import type { Recado } from "@/lib/tipos";

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
          <div className="flex overflow-hidden rounded-md border border-linea bg-panel">
            {[
              { valor: "pendientes", nombre: "Pendientes" },
              { valor: "todos", nombre: "Todos" },
            ].map((v) => (
              <Link
                key={v.valor}
                href={`/recados?ver=${v.valor}`}
                className={`px-2.5 py-1 text-xs transition ${
                  (v.valor === "todos") === !soloPendientes
                    ? "bg-acento-suave font-medium text-acento"
                    : "text-tinta-2 hover:bg-panel-2"
                }`}
              >
                {v.nombre}
              </Link>
            ))}
          </div>
        }
      />

      <div className="px-6 py-5">
        <Tarjeta>
          <TarjetaCabecera
            titulo={`${pendientes} sin atender`}
            descripcion="Cada uno lo tomó el agente cuando no pudo resolver la llamada."
          />
          {lista.length === 0 ? (
            <Vacio
              titulo={soloPendientes ? "Nada pendiente" : "Sin recados"}
              detalle="Cuando el agente no pueda resolver algo, toma nombre, teléfono y el asunto, y aquí lo vas a ver."
            />
          ) : (
            <ul className="divide-y divide-linea">
              {lista.map((r) => (
                <FilaRecado key={r.id} recado={r} zona={config.zona_horaria} />
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </>
  );
}

function FilaRecado({ recado, zona }: { recado: Recado; zona: string }) {
  const extras = Object.entries(recado.campos).filter(([, valor]) => valor !== null && valor !== "");
  return (
    <li className={`flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 ${recado.atendido ? "opacity-55" : ""}`}>
      <div className="numeros w-[92px] shrink-0">
        <span className="block text-[11px] text-tinta-3">{fechaCorta(recado.creado, zona)}</span>
        <span className="text-[13px] font-medium text-tinta">{hora(recado.creado, zona)}</span>
      </div>
      <div className="min-w-[160px] flex-1">
        <p className="truncate text-[13px] font-medium text-tinta">{recado.nombre ?? "Sin nombre"}</p>
        <p className="numeros truncate text-[13px] text-tinta-2">{telefono(recado.telefono)}</p>
      </div>
      <div className="min-w-[220px] flex-[2]">
        <p className="text-[13px] text-tinta">{recado.asunto}</p>
        {recado.detalle ? <p className="mt-0.5 text-[12px] text-tinta-2">{recado.detalle}</p> : null}
        {extras.length > 0 ? (
          <p className="mt-1 flex flex-wrap gap-1">
            {extras.map(([clave, valor]) => (
              <Insignia key={clave}>{`${clave}: ${String(valor)}`}</Insignia>
            ))}
          </p>
        ) : null}
      </div>
      <form action={alternarRecado}>
        <input type="hidden" name="id" value={recado.id} />
        <Boton variante={recado.atendido ? "fantasma" : "solido"}>
          {recado.atendido ? "Reabrir" : "Marcar atendido"}
        </Boton>
      </form>
    </li>
  );
}
