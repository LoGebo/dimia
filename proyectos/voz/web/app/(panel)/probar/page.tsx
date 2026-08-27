import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { CombinacionActiva } from "@/components/combinacion";
import { ConsolaPrueba } from "@/components/prueba-consola";
import { Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { catalogo, faq, negocio, plantillaActual, servicios } from "@/lib/consultas";
import { variablesFaltantes } from "@/lib/livekit";
import { saludo } from "@/lib/prompt";
import { contexto } from "@/lib/sesion";

export default async function Probar() {
  const { negocioId, giro } = await contexto();
  const config = await negocio();
  const plantilla = await plantillaActual(config.vertical);
  const faltantes = variablesFaltantes();

  if (faltantes.length > 0) {
    return (
      <>
        <Encabezado titulo="Probar el agente" descripcion="Háblale a tu agente desde aquí." />
        <div className="px-5 py-5">
          <Tarjeta className="max-w-2xl">
            <TarjetaCabecera
              titulo="Falta conectar LiveKit"
              descripcion="Es el transporte de audio entre este navegador y el agente."
            />
            <div className="space-y-3 px-4 py-4">
              <p className="text-[13px] leading-relaxed text-tinta-2">
                La sección funciona en cuanto existan estas variables en el entorno del panel
                (<span className="font-mono text-[12px]">web/.env.local</span> en desarrollo):
              </p>
              <ul className="space-y-1">
                {(["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"] as const).map((nombre) => (
                  <li key={nombre} className="flex items-center gap-2">
                    <span className="font-mono text-[12px] text-tinta">{nombre}</span>
                    {faltantes.includes(nombre) ? (
                      <Insignia tono="alerta">Falta</Insignia>
                    ) : (
                      <Insignia tono="bueno">Lista</Insignia>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[13px] leading-relaxed text-tinta-2">
                Los tres valores salen del proyecto de LiveKit Cloud, en Settings → Keys. Son los
                mismos que usa el worker de voz, así que si el agente ya contesta llamadas reales,
                cópialos del <span className="font-mono text-[12px]">.env</span> de la raíz.
              </p>
              <p className="text-[13px] leading-relaxed text-tinta-2">
                También necesitas el worker corriendo:{" "}
                <span className="font-mono text-[12px]">python -m agent.agent dev</span>. Sin él la
                sala se abre y nadie contesta.
              </p>
              <p className="text-[11px] text-tinta-3">
                Mientras tanto puedes revisar el{" "}
                <Link href="/agente" className="text-acento hover:underline">
                  prompt que recibiría
                </Link>
                .
              </p>
            </div>
          </Tarjeta>
        </div>
      </>
    );
  }

  const [listaServicios, listaFaq, items] = await Promise.all([servicios(), faq(), catalogo()]);
  const disponibles = items.filter((i) => i.disponible).length;

  return (
    <>
      <Encabezado
        titulo="Probar el agente"
        descripcion={`Háblale a ${config.nombre} desde el navegador. Es el mismo agente que contesta el teléfono.`}
        giro={giro.nombre}
        acciones={
          <div className="flex items-center gap-2">
            <Insignia>{listaServicios.filter((s) => s.activo).length} servicios</Insignia>
            <Insignia>{disponibles} en catálogo</Insignia>
            <Insignia>{listaFaq.length} respuestas</Insignia>
          </div>
        }
      />
      <div className="space-y-4 px-5 py-5">
        <CombinacionActiva negocio={config} />
        <ConsolaPrueba
          tenantId={negocioId}
          nombre={config.nombre}
          vertical={config.vertical}
          zona={config.zona_horaria}
          saludo={saludo(config, plantilla)}
        />
      </div>
    </>
  );
}
