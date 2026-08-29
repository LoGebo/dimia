import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Copiar } from "@/components/copiar";
import { AreaTexto, Campo, Entrada, Insignia, Selector, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { eliminarLinea, guardarLinea, guardarNegocio, guardarPrompt, guardarResenas, guardarSaludo } from "@/lib/acciones";
import { ConfiguracionCerebro, ConfiguracionVoz } from "@/components/voz";
import { campanas, catalogo, faq, lineas, negocio, plantillaActual, recursos, reglas, servicios } from "@/lib/consultas";
import { baseDeFabrica, construirPrompt, saludo } from "@/lib/prompt";
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
  const [plantilla, listaLineas, listaCampanas] = await Promise.all([plantillaActual(config.vertical), lineas(), campanas()]);

  const tiposCatalogo = [...new Set(items.filter((i) => i.disponible).map((i) => i.tipo))];
  const prompt = construirPrompt({
    negocio: config,
    servicios: listaServicios,
    faq: listaFaq,
    plantilla,
    tiposCatalogo: tiposCatalogo.map((t) => etiquetaTipo(t, true).toLowerCase()),
    catalogo: items,
    catalogoTotal: items.filter((i) => i.disponible).length,
  });
  const fabrica = baseDeFabrica(config.vertical, plantilla);
  const propio = config.prompt_base?.trim() ?? "";
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");
  const progreso = await avance(giro.herramientas);

  return (
    <>
      <Encabezado
        titulo="Negocio y agente"
        descripcion="Los datos del negocio, cómo suena el agente y a dónde pasa las llamadas que no resuelve."
        giro={giro.nombre}
      />
      <div className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Listo para contestar"
              descripcion={progreso.completo ? "Todo en su lugar." : `Faltan ${progreso.total - progreso.cumplidos} de ${progreso.total}.`}
              accion={
                <span className="numeros text-[13px] text-tinta">
                  {progreso.cumplidos}
                  <span className="text-tinta-3">/{progreso.total}</span>
                </span>
              }
            />
            <ul className="divide-y divide-linea">
              {progreso.requisitos.map((r) => (
                <li key={r.clave} className="transition-colors duration-150 hover:bg-panel-2">
                  <Link href={r.ruta} className="flex items-center gap-3 px-4 py-2">
                    <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${r.listo ? "bg-bueno" : "late bg-alerta"}`} />
                    <span className="min-w-0 flex-1 text-[13px] text-tinta">
                      {r.nombre}
                      <span className="block text-[11.5px] text-tinta-3">{r.ayuda}</span>
                    </span>
                    <span
                      className={`text-[11.5px] ${r.listo ? "text-bueno" : "text-alerta"}`}
                    >
                      {r.listo ? "Listo" : "Falta"}
                    </span>
                  </Link>
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
              <ConfiguracionCerebro proveedor={config.llm_proveedor} modelo={config.llm_modelo} />
              <ConfiguracionVoz proveedor={config.tts_proveedor} vozId={config.voz_id} ajustes={config.tts_ajustes} />
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
                  <Entrada name="telefono_escalamiento" defaultValue={config.telefono_escalamiento ?? ""} placeholder="+52..." />
                </Campo>
                <Campo
                  etiqueta="Número de entrada"
                  ayuda={
                    progreso.puedeActivarLinea || config.telefono_entrada
                      ? "El número al que llaman tus clientes. Al guardarlo, el agente empieza a contestar."
                      : `Se desbloquea cuando esté todo listo: faltan ${progreso.total - progreso.cumplidos} de ${progreso.total}.`
                  }
                >
                  <Entrada
                    name="telefono_entrada"
                    defaultValue={config.telefono_entrada ?? ""}
                    placeholder={progreso.puedeActivarLinea || config.telefono_entrada ? "+52..." : "Con candado"}
                    disabled={!progreso.puedeActivarLinea && !config.telefono_entrada}
                  />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo
                  etiqueta="Cuenta de Instagram"
                  ayuda="El ID de tu cuenta profesional. Sin esto, los mensajes de Instagram no saben de qué negocio son."
                >
                  <Entrada name="instagram_id" defaultValue={config.instagram_id ?? ""} placeholder="1784140..." />
                </Campo>
                <Campo etiqueta="Página de Facebook" ayuda="El ID de la página que recibe los mensajes de Messenger.">
                  <Entrada name="messenger_page_id" defaultValue={config.messenger_page_id ?? ""} placeholder="1020000..." />
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
              <BotonEnviar>Guardar configuración</BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera titulo="Reseñas" descripcion="Después de cada cita atendida, el agente pregunta por WhatsApp cómo le fue." />
            <Formulario accion={guardarResenas} className="space-y-3 px-4 py-4">
              <label className="flex items-center gap-2 text-[13px] text-tinta">
                <input type="checkbox" name="resena_activa" defaultChecked={config.resena_activa} className="h-3.5 w-3.5 accent-[var(--acento)]" />
                Preguntar cómo le fue
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Esperar (min)" ayuda="Después de marcar atendida.">
                  <Entrada name="resena_espera_min" type="number" min={15} max={1440} step={15} defaultValue={config.resena_espera_min} />
                </Campo>
                <Campo etiqueta="Liga de Google" ayuda="A quien califique 4 o 5 se le manda.">
                  <Entrada name="resena_url" type="url" defaultValue={config.resena_url ?? ""} placeholder="https://g.page/r/..." />
                </Campo>
              </div>
              <BotonEnviar>Guardar reseñas</BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera titulo="Líneas por campaña" descripcion="Un número extra por anuncio. Quien marque ahí queda atribuido a ese origen." />
            {listaLineas.length > 0 ? (
              <ul className="divide-y divide-linea border-b border-linea">
                {listaLineas.map((l) => (
                  <li key={l.id} className="flex h-9 items-center gap-3 px-4 transition-colors duration-150 hover:bg-panel-2">
                    <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${l.activo ? "bg-bueno" : "bg-tinta-3"}`} />
                    <span className="numeros text-[12px] text-tinta">{l.telefono}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-tinta-2">{l.etiqueta}</span>
                    <Formulario accion={eliminarLinea} silencioso>
                      <input type="hidden" name="id" value={l.id} />
                      <button className="text-[11px] text-tinta-3 transition-colors duration-150 hover:text-critico">Quitar</button>
                    </Formulario>
                  </li>
                ))}
              </ul>
            ) : null}
            <Formulario accion={guardarLinea} className="space-y-3 px-4 py-4" reiniciar>
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Número" ayuda="E.164, con +52.">
                  <Entrada name="telefono" placeholder="+5255..." required />
                </Campo>
                <Campo etiqueta="Origen" ayuda="Anuncio, volante, Google.">
                  <Entrada name="etiqueta" placeholder="anuncio facebook" required />
                </Campo>
              </div>
              {listaCampanas.length > 0 ? (
                <Campo etiqueta="Campaña" ayuda="Opcional, para ligar el número a una campaña.">
                  <Selector name="campana_id" defaultValue="">
                    <option value="">Ninguna</option>
                    {listaCampanas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
              ) : null}
              <BotonEnviar>Agregar línea</BotonEnviar>
            </Formulario>
          </Tarjeta>
        </div>

        <div className="space-y-4">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Cómo contesta"
              descripcion="La primera frase de cada llamada. Edítala aquí; vacía, el agente usa la del giro."
              accion={config.saludo?.trim() ? <Insignia tono="alerta">Propio</Insignia> : null}
            />
            <Formulario accion={guardarSaludo} className="space-y-3 px-4 py-4">
              <AreaTexto
                name="saludo"
                defaultValue={config.saludo ?? ""}
                rows={2}
                placeholder={saludo(config, plantilla)}
                className="text-[17px] leading-relaxed"
                aria-label="Saludo del agente"
              />
              <p className="text-[12px] text-tinta-3">
                Escribe <code>{"{nombre}"}</code> donde vaya el nombre del negocio.
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
                className="text-[11.5px] leading-[1.6]"
                spellCheck={false}
              />
              <p className="text-[12px] text-tinta-3">
                Aquí van las instrucciones de cómo habla y qué nunca hace. Los servicios, el horario, el catálogo y la
                fecha se agregan solos con lo que capturaste: no se escriben aquí.
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
            <pre className="max-h-[420px] overflow-auto px-4 py-4 text-[11.5px] leading-[1.6] whitespace-pre-wrap text-tinta-2">
              {prompt}
            </pre>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
