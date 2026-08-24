import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Copiar } from "@/components/copiar";
import { AreaTexto, Campo, Entrada, Insignia, Selector, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { guardarNegocio, guardarPrompt, guardarSaludo } from "@/lib/acciones";
import { ConfiguracionCerebro, ConfiguracionVoz } from "@/components/voz";
import { catalogo, faq, negocio, plantillaActual, recursos, reglas, servicios } from "@/lib/consultas";
import { baseDeFabrica, construirPrompt, saludo, saludoDelGiro } from "@/lib/prompt";
import { avance } from "@/lib/listo";
import { contexto } from "@/lib/sesion";
import { etiquetaTipo, ZONAS_HORARIAS } from "@/lib/tipos";

export default async function Agente() {
  const { giro } = await contexto();
  const [config, listaServicios, listaFaq, listaRecursos, listaReglas, items] = await Promise.all([
    negocio(),
    servicios(),
    faq(),
    recursos(),
    reglas(),
    catalogo(),
  ]);
  const plantilla = await plantillaActual(config.vertical);

  const tiposCatalogo = [...new Set(items.filter((i) => i.disponible).map((i) => i.tipo))];
  const prompt = construirPrompt({
    negocio: config,
    servicios: listaServicios,
    faq: listaFaq,
    plantilla,
    tiposCatalogo: tiposCatalogo.map((t) => etiquetaTipo(t, true).toLowerCase()),
  });
  const fabrica = baseDeFabrica(config.vertical, plantilla);
  const propio = config.prompt_base?.trim() ?? "";
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");
  const progreso = await avance(giro.herramientas);

  return (
    <>
      <Encabezado
        titulo="Agente"
        descripcion="Cómo suena, a dónde transfiere y con qué contexto contesta."
        giro={giro.nombre}
      />
      <div className="grid gap-4 px-6 py-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Listo para contestar"
              descripcion={
                progreso.completo
                  ? "Todo en su lugar."
                  : `Faltan ${progreso.total - progreso.cumplidos} de ${progreso.total}.`
              }
            />
            <ul className="divide-y divide-linea">
              {progreso.requisitos.map((r) => (
                <li key={r.clave} className="flex items-center justify-between gap-3 px-4 py-2">
                  <Link href={r.ruta} className="min-w-0 text-[13px] text-tinta-2 transition hover:text-tinta">
                    {r.nombre}
                    <span className="block text-[11.5px] text-tinta-3">{r.ayuda}</span>
                  </Link>
                  {r.listo ? <Insignia tono="bueno">Listo</Insignia> : <Insignia tono="alerta">Falta</Insignia>}
                </li>
              ))}
            </ul>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera titulo="Configuración" />
            <Formulario accion={guardarNegocio} className="space-y-3 px-4 py-4">
                  <Campo etiqueta="Nombre del negocio" ayuda="Así se presenta al contestar.">
                    <Entrada name="nombre" defaultValue={config.nombre} required />
                  </Campo>
                  <ConfiguracionCerebro
                    proveedor={config.llm_proveedor}
                    modelo={config.llm_modelo}
                  />
                  <ConfiguracionVoz
                    proveedor={config.tts_proveedor}
                    vozId={config.voz_id}
                    ajustes={config.tts_ajustes}
                  />
                  <Campo etiqueta="Zona horaria">
                    <Selector name="zona_horaria" defaultValue={config.zona_horaria}>
                      {ZONAS_HORARIAS.map((z) => (
                        <option key={z} value={z}>
                          {z.replace("America/", "").replace("_", " ")}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  <div className="grid grid-cols-2 gap-3">
                    <Campo etiqueta="Transferir a" ayuda="A dónde pasa las llamadas difíciles.">
                      <Entrada
                        name="telefono_escalamiento"
                        defaultValue={config.telefono_escalamiento ?? ""}
                        placeholder="+52..."
                      />
                    </Campo>
                  <Campo
                    etiqueta="Número de entrada"
                    ayuda={
                      progreso.puedeActivarLinea
                        ? "El número al que llaman tus clientes. Al guardarlo, el agente empieza a contestar."
                        : `Bloqueado hasta terminar lo que falta (${progreso.cumplidos} de ${progreso.total}). Antes de eso el agente contestaría a medias.`
                    }
                  >
                    <Entrada
                      name="telefono_entrada"
                      defaultValue={config.telefono_entrada ?? ""}
                      placeholder="+52..."
                      disabled={!progreso.puedeActivarLinea && !config.telefono_entrada}
                    />
                  </Campo>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Campo etiqueta="Cada (min)" ayuda="Salto entre horarios.">
                      <Entrada name="slot_granularidad_min" type="number" min={5} max={120} step={5} defaultValue={config.slot_granularidad_min} />
                    </Campo>
                    <Campo etiqueta="Anticipación" ayuda="Mínimo antes de la cita.">
                      <Entrada name="anticipacion_min" type="number" min={0} step={5} defaultValue={config.anticipacion_min} />
                    </Campo>
                    <Campo etiqueta="Horizonte" ayuda="Días hacia adelante.">
                      <Entrada name="horizonte_dias" type="number" min={1} max={365} defaultValue={config.horizonte_dias} />
                    </Campo>
                  </div>
                  <Campo
                    etiqueta="Indicaciones del negocio"
                    ayuda="Reglas propias, en frases cortas: a quién saludar de usted, qué promoción mencionar, qué NO ofrecer. Se inyectan tal cual al prompt."
                  >
                    <AreaTexto
                      name="instrucciones_extra"
                      defaultValue={config.instrucciones_extra ?? ""}
                      rows={4}
                      placeholder={"Los martes hay dos por uno.\nSi preguntan por la terraza, di que no se aparta por telefono."}
                    />
                  </Campo>
                  <BotonEnviar>
                    Guardar configuración
                  </BotonEnviar>
            </Formulario>
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Cómo contesta"
              descripcion="Primera frase de cada llamada. Vacío usa la del giro."
              accion={config.saludo?.trim() ? <Insignia tono="alerta">Propio</Insignia> : null}
            />
            <p className="border-b border-linea px-4 py-4 text-[15px] leading-relaxed text-tinta">
              “{saludo(config, plantilla)}”
            </p>
            <Formulario accion={guardarSaludo} className="space-y-3 px-4 py-4">
              <AreaTexto
                name="saludo"
                defaultValue={config.saludo ?? ""}
                rows={2}
                placeholder={saludoDelGiro(plantilla, config.vertical).replaceAll("{nombre}", config.nombre)}
              />
              <p className="text-[12px] text-tinta-3">
                Puedes escribir <code className="font-mono">{"{nombre}"}</code> y se sustituye por el nombre del negocio.
              </p>
              <BotonEnviar>Guardar saludo</BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera
              titulo="Instrucciones que recibe"
              descripcion={
                propio
                  ? "Reescritas por ti. Vacía el campo para volver a las de fábrica."
                  : "Las de fábrica. Puedes reescribirlas y el agente usará las tuyas."
              }
              accion={
                <div className="flex items-center gap-2">
                  {propio ? <Insignia tono="alerta">Propias</Insignia> : null}
                  <Copiar texto={prompt} />
                </div>
              }
            />
            <Formulario accion={guardarPrompt} className="space-y-3 px-4 py-4">
              <AreaTexto
                name="prompt_base"
                defaultValue={propio || fabrica}
                rows={22}
                className="font-mono text-[11.5px] leading-[1.6]"
                spellCheck={false}
              />
              <p className="text-[12px] text-tinta-3">
                Aquí van las instrucciones de cómo habla y qué nunca hace. Los servicios, el horario,
                el catálogo y la fecha se agregan solos con lo que capturaste: no se escriben aquí.
              </p>
              <BotonEnviar>Guardar instrucciones</BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera
              titulo="Lo que recibe el agente"
              descripcion="Tus instrucciones más los bloques que se arman con tus datos."
              accion={<Copiar texto={prompt} />}
            />
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-[11.5px] leading-[1.6] text-tinta-2">
              {prompt}
            </pre>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
