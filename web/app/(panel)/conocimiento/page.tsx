import { Encabezado } from "@/components/encabezado";
import { FormularioFaq } from "@/components/faq";
import { Boton, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { eliminarFaq } from "@/lib/acciones";
import { faq } from "@/lib/consultas";

const SUGERENCIAS = [
  "¿Dónde están?",
  "¿Tienen estacionamiento?",
  "¿Qué formas de pago aceptan?",
  "¿Cuál es el horario?",
  "¿Aceptan seguro?",
];

export default async function Conocimiento() {
  const entradas = await faq();
  const cubiertas = new Set(entradas.map((e) => e.pregunta.toLowerCase()));
  const faltantes = SUGERENCIAS.filter((s) => !cubiertas.has(s.toLowerCase()));

  return (
    <>
      <Encabezado
        titulo="Respuestas"
        descripcion="Lo único que el agente puede contestar fuera de agendar. Si no está aquí, transfiere."
      />
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera titulo="Nueva respuesta" />
            <div className="px-4 py-4">
              <FormularioFaq compacto />
            </div>
          </Tarjeta>
          {faltantes.length > 0 ? (
            <Tarjeta>
              <TarjetaCabecera titulo="Te faltan las más pedidas" descripcion="Casi toda llamada trae una de estas." />
              <ul className="divide-y divide-linea">
                {faltantes.map((s) => (
                  <li key={s} className="px-4 py-2 text-[13px] text-tinta-2">
                    {s}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}
        </div>

        <Tarjeta>
          <TarjetaCabecera titulo={`${entradas.length} respuestas`} descripcion="Ordenadas por prioridad." />
          {entradas.length === 0 ? (
            <Vacio
              titulo="Todavía no hay respuestas"
              detalle="Sin esto el agente transfiere cualquier pregunta que no sea agendar. Con cinco respuestas cubres casi todo."
            />
          ) : (
            <div>
              {entradas.map((e) => (
                <details key={e.id} className="group border-b border-linea last:border-0">
                  <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-2.5 hover:bg-panel-2">
                    <span className="numeros mt-0.5 w-5 shrink-0 text-[11px] text-tinta-3">{e.prioridad}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-tinta">{e.pregunta}</span>
                      <span className="block truncate text-[12px] text-tinta-3">{e.respuesta}</span>
                    </span>
                    <span className="text-[11px] text-tinta-3 group-open:text-acento">
                      <span className="group-open:hidden">Editar</span>
                      <span className="hidden group-open:inline">Cerrar</span>
                    </span>
                  </summary>
                  <div className="border-t border-linea bg-panel-2 px-4 py-4">
                    <FormularioFaq entrada={e} />
                    <form action={eliminarFaq} className="mt-3 border-t border-linea pt-3">
                      <input type="hidden" name="id" value={e.id} />
                      <Boton variante="peligro">Eliminar respuesta</Boton>
                    </form>
                  </div>
                </details>
              ))}
            </div>
          )}
        </Tarjeta>
      </div>
    </>
  );
}
