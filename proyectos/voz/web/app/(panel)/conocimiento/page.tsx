import { Encabezado } from "@/components/encabezado";
import { FormularioFaq } from "@/components/faq";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { faq } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";
import { TablaRespuestas } from "./tabla";

const SUGERENCIAS = [
  "¿Dónde están?",
  "¿Tienen estacionamiento?",
  "¿Qué formas de pago aceptan?",
  "¿Cuál es el horario?",
  "¿Aceptan seguro?",
];

export default async function Conocimiento() {
  const { giro } = await contexto();
  const entradas = await faq();
  const cubiertas = new Set(entradas.map((e) => e.pregunta.toLowerCase()));
  const faltantes = SUGERENCIAS.filter((s) => !cubiertas.has(s.toLowerCase()));

  return (
    <>
      <Encabezado
        titulo="Respuestas"
        descripcion="Lo que el agente puede contestar además de su trabajo principal. Si no está aquí, transfiere."
        giro={giro.nombre}
      />
      <div className="grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[380px_1fr]">
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
                  <li key={s} className="flex items-center gap-2.5 px-4 py-2 text-[13px] text-tinta-2">
                    <i aria-hidden="true" className="h-1.5 w-1.5 flex-none bg-alerta" />
                    {s}
                  </li>
                ))}
              </ul>
            </Tarjeta>
          ) : null}
        </div>

        <Tarjeta>
          <TarjetaCabecera
            titulo={`${entradas.length} ${entradas.length === 1 ? "respuesta" : "respuestas"}`}
            descripcion="Ordenadas por prioridad. Toca una para editarla."
          />
          <TablaRespuestas entradas={entradas} />
        </Tarjeta>
      </div>
    </>
  );
}
