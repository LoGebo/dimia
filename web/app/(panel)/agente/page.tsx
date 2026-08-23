import { Encabezado } from "@/components/encabezado";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Copiar } from "@/components/copiar";
import { AreaTexto, Campo, Entrada, Insignia, Selector, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { guardarNegocio } from "@/lib/acciones";
import { ConfiguracionCerebro, ConfiguracionVoz } from "@/components/voz";
import { catalogo, faq, negocio, plantillaActual, recursos, reglas, servicios } from "@/lib/consultas";
import { construirPrompt, saludo } from "@/lib/prompt";
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
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");
  const revisiones = [
    ...(agenda
      ? [
          { nombre: "Recursos dados de alta", listo: listaRecursos.some((r) => r.activo) },
          { nombre: "Al menos un servicio activo", listo: listaServicios.some((s) => s.activo) },
        ]
      : []),
    ...(pedidos ? [{ nombre: "Menú con precio", listo: items.some((i) => i.disponible && i.precio) }] : []),
    ...(agenda || pedidos
      ? [{ nombre: "Horario de la semana", listo: listaReglas.some((r) => r.tipo === "disponible") }]
      : []),
    { nombre: "Respuestas frecuentes", listo: listaFaq.length >= 3 },
    { nombre: "Número para transferir", listo: !!config.telefono_escalamiento },
    { nombre: "Número de entrada asignado", listo: !!config.telefono_entrada },
    { nombre: "Catálogo con items disponibles", listo: items.some((i) => i.disponible) },
  ];
  const pendientes = revisiones.filter((r) => !r.listo).length;

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
              descripcion={pendientes === 0 ? "Todo configurado." : `${pendientes} cosas por resolver.`}
            />
            <ul className="divide-y divide-linea">
              {revisiones.map((r) => (
                <li key={r.nombre} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-[13px] text-tinta-2">{r.nombre}</span>
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
                    <Campo etiqueta="Número de entrada" ayuda="El que marca tu cliente.">
                      <Entrada name="telefono_entrada" defaultValue={config.telefono_entrada ?? ""} placeholder="+52..." />
                    </Campo>
                    <Campo etiqueta="Transferir a" ayuda="A dónde pasa las llamadas difíciles.">
                      <Entrada
                        name="telefono_escalamiento"
                        defaultValue={config.telefono_escalamiento ?? ""}
                        placeholder="+52..."
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
            <TarjetaCabecera titulo="Cómo contesta" descripcion="Primera frase de cada llamada." />
            <p className="px-4 py-4 text-[15px] leading-relaxed text-tinta">“{saludo(config, plantilla)}”</p>
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera
              titulo="Instrucciones que recibe"
              descripcion="Se arman solas con lo que capturaste. No se editan a mano."
              accion={<Copiar texto={prompt} />}
            />
            <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-[11.5px] leading-[1.6] text-tinta-2">
              {prompt}
            </pre>
          </Tarjeta>
        </div>
      </div>
    </>
  );
}
