import { Paso } from "@/components/paso";
import { FormularioRecurso } from "@/components/catalogo";
import { Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { negocio, recursos } from "@/lib/consultas";
import { siguientePaso } from "@/lib/giro";
import { exigirPasoAlta } from "@/lib/sesion";
import { etiquetasRecurso } from "@/lib/tipos";

export default async function AltaRecursos() {
  const giro = await exigirPasoAlta("/alta/recursos");
  const [config, lista] = await Promise.all([negocio(), recursos()]);
  const vertical = etiquetasRecurso(config.vertical);

  return (
    <Paso
      titulo={`¿Con qué atiendes?`}
      descripcion={`Cada ${vertical.recurso.toLowerCase()} se ocupa por completo mientras dura una reserva. Dos reservas nunca pueden encimarse sobre el mismo. Ejemplos: ${vertical.ejemplos}.`}
      siguiente={siguientePaso(giro.herramientas, "/alta/recursos")}
      puedeSaltar={lista.length === 0}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaCabecera titulo={`Agregar ${vertical.recurso.toLowerCase()}`} />
          <div className="px-4 py-4">
            <FormularioRecurso vertical={config.vertical} compacto />
          </div>
        </Tarjeta>
        <Tarjeta>
          <TarjetaCabecera titulo={`${lista.length} dados de alta`} />
          {lista.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-tinta-3">Aún no agregas ninguno.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {lista.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-[13px] font-medium text-tinta">{r.nombre}</span>
                  <Insignia>capacidad {r.capacidad}</Insignia>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </Paso>
  );
}
