import { Paso } from "@/components/paso";
import { FormularioFaq } from "@/components/faq";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { faq } from "@/lib/consultas";

export default async function AltaRespuestas() {
  const lista = await faq();
  return (
    <Paso
      titulo="¿Qué más te preguntan?"
      descripcion="Ubicación, estacionamiento, formas de pago. El agente solo puede contestar lo que esté aquí; cualquier otra cosa la transfiere en vez de inventarla. Con tres o cuatro cubres la mayoría de las llamadas."
      siguiente="/alta/listo"
      puedeSaltar={lista.length === 0}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaCabecera titulo="Agregar respuesta" />
          <div className="px-4 py-4">
            <FormularioFaq compacto />
          </div>
        </Tarjeta>
        <Tarjeta>
          <TarjetaCabecera titulo={`${lista.length} respuestas`} />
          {lista.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-tinta-3">Aún no agregas ninguna.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {lista.map((e) => (
                <li key={e.id} className="px-4 py-2.5">
                  <p className="text-[13px] font-medium text-tinta">{e.pregunta}</p>
                  <p className="text-[12px] text-tinta-3">{e.respuesta}</p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </Paso>
  );
}
