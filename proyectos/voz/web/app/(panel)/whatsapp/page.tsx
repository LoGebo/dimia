import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Bienvenida, ListaReglas, NuevaRegla } from "@/components/reglas-whatsapp";
import { Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { lineaWhatsApp, negocio, reglasWa } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";
import { telefono } from "@/lib/formato";

/**
 * Ajustes → WhatsApp: el bot determinista (bienvenida y respuestas por
 * palabra, sin tokens) y, debajo, quién contesta lo demás. El orden en que se
 * evalúa un mensaje es el mismo en que se lee la página: bienvenida →
 * palabras → inteligencia artificial.
 */
export default async function WhatsApp() {
  const giro = await exigirSeccion("/whatsapp");
  const [config, reglas, linea] = await Promise.all([negocio(), reglasWa(), lineaWhatsApp()]);
  const bienvenida = reglas.find((r) => r.tipo === "bienvenida") ?? null;
  const palabras = reglas.filter((r) => r.tipo === "palabra");

  return (
    <>
      <Encabezado
        titulo="WhatsApp"
        descripcion="Primero contestan tus reglas fijas, sin gastar tokens. Lo que no atrapen lo resuelve el agente con inteligencia artificial."
        giro={giro.nombre}
      />
      <div className="grid grid-cols-1 gap-4 px-5 py-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Línea conectada"
              accion={linea ? <Insignia tono="bueno">Conectada</Insignia> : <Insignia>Sin línea</Insignia>}
            />
            <div className="space-y-1 px-5 py-4 text-[13px] text-tinta-2">
              {linea ? (
                <>
                  <p>
                    Los mensajes a <span className="numeros font-medium text-tinta">{telefono(linea)}</span> los contesta este
                    negocio.
                  </p>
                  <p className="text-[12px] text-tinta-3">
                    El número definitivo se conecta cuando Meta termine de revisar la cuenta; las reglas de aquí aplican igual.
                  </p>
                </>
              ) : (
                <p>Este negocio aún no tiene línea de WhatsApp asignada.</p>
              )}
            </div>
          </Tarjeta>
          <Bienvenida actual={bienvenida} />
          <NuevaRegla />
        </div>
        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Respuestas por palabra"
              descripcion={`${palabras.length} ${palabras.length === 1 ? "regla" : "reglas"} · se evalúan en orden y contestan al instante.`}
            />
            <ListaReglas reglas={palabras} />
          </Tarjeta>
          <Tarjeta>
            <TarjetaCabecera titulo="Lo demás lo contesta la IA" />
            <div className="px-5 py-4 text-[13px] text-tinta-2">
              <p>
                Cualquier mensaje que no atrape una regla va al mismo agente que contesta el teléfono: agenda, consulta tus
                respuestas y toma recados con el cerebro configurado en{" "}
                <Link href="/agente" className="text-acento transition-opacity hover:opacity-80">
                  Negocio y agente
                </Link>
                .
              </p>
              <p className="mt-1 text-[12px] text-tinta-3">Zona horaria del negocio: {config.zona_horaria}.</p>
            </div>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
