import { Paso } from "@/components/paso";
import { FormularioServicio } from "@/components/catalogo";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { recursos, servicios } from "@/lib/consultas";
import { moneda } from "@/lib/formato";

export default async function AltaServicios() {
  const [listaRecursos, lista] = await Promise.all([recursos(), servicios()]);

  return (
    <Paso
      titulo="¿Qué se puede reservar?"
      descripcion="La duración define el hueco que aparta cada cita. El buffer es el tiempo de limpieza o preparación que nadie puede ocupar. El precio se lo dice el agente tal cual: si lo dejas vacío, no inventa uno."
      siguiente="/alta/horario"
      puedeSaltar={lista.length === 0}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaCabecera titulo="Agregar servicio" />
          <div className="px-4 py-4">
            <FormularioServicio recursos={listaRecursos.filter((r) => r.activo)} compacto />
          </div>
        </Tarjeta>
        <Tarjeta>
          <TarjetaCabecera titulo={`${lista.length} servicios`} />
          {lista.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-tinta-3">Aún no agregas ninguno.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {lista.map((s) => (
                <li key={s.id} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-tinta">{s.nombre}</span>
                    <span className="numeros text-[12px] text-tinta-2">{moneda(s.precio)}</span>
                  </div>
                  <p className="numeros text-[11px] text-tinta-3">
                    {s.duracion_min} min{s.buffer_min > 0 ? ` + ${s.buffer_min} de buffer` : ""}
                    {s.alias.length > 0 ? ` · ${s.alias.join(", ")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </Paso>
  );
}
