import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { Campo, Entrada, Selector, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { eliminarRegla, guardarAusencia } from "@/lib/acciones";
import { ausencias, negocio, productividadEquipo, recursos } from "@/lib/consultas";
import { fechaCorta, isoDia, moneda, sumarDias, telefono } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";

const RANGOS = [7, 30, 90] as const;

export default async function Equipo({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const giro = await exigirSeccion("/equipo");
  const parametros = await searchParams;
  const dias = RANGOS.find((r) => String(r) === parametros.dias) ?? 30;
  const config = await negocio();
  const hoy = isoDia(new Date(), config.zona_horaria);
  const desde = sumarDias(hoy, -(dias - 1));
  const [lista, produccion, faltas] = await Promise.all([recursos(), productividadEquipo(desde, hoy), ausencias()]);
  const personas = lista.filter((r) => r.tipo === "persona");
  const porPersona = produccion.filter((p) => p.tipo === "persona");
  const cobrado = porPersona.reduce((s, p) => s + Number(p.cobrado), 0);
  const comisiones = porPersona.reduce((s, p) => s + Number(p.comision), 0);
  const atendidas = porPersona.reduce((s, p) => s + p.atendidas, 0);

  return (
    <>
      <Encabezado
        titulo="Equipo"
        descripcion="Quién atiende, cuánto produce y cuándo no está. Las personas se dan de alta en Servicios como recurso de tipo persona."
        giro={giro.nombre}
        acciones={
          <div className="flex overflow-hidden border border-linea bg-panel">
            {RANGOS.map((r) => (
              <Link
                key={r}
                href={`/equipo?dias=${r}`}
                className={`px-2.5 py-1 text-xs transition ${r === dias ? "bg-acento-suave font-medium text-acento" : "text-tinta-2 hover:bg-panel-2"}`}
              >
                {r} d
              </Link>
            ))}
          </div>
        }
      />
      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra etiqueta="Personas que atienden" valor={String(personas.length)} glifo={Glifos.personas} />
          <Cifra etiqueta={`Citas atendidas en ${dias} días`} valor={String(atendidas)} glifo={Glifos.reloj} />
          <Cifra etiqueta="Cobrado por sus citas" valor={moneda(cobrado)} glifo={Glifos.dinero} tono="bueno" />
          <Cifra etiqueta="Comisiones del periodo" valor={moneda(comisiones)} glifo={Glifos.dinero} pildora={comisiones > 0 ? "por pagar" : undefined} tono="alerta" />
        </TiraIndicadores>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Tarjeta>
            <TarjetaCabecera titulo="Producción por persona" descripcion={`Del ${fechaCorta(`${desde}T12:00:00Z`, "UTC")} al ${fechaCorta(`${hoy}T12:00:00Z`, "UTC")}. Lo cobrado es lo registrado en Cobros.`} />
            {porPersona.length === 0 ? (
              <Vacio
                titulo="Nadie marcado como persona"
                detalle="En Servicios, edita un recurso y elige «Una persona». Desde ahí se le pone teléfono, comisión y ausencias."
                accion={<Link href="/servicios" className="mt-2 text-[13px] font-medium text-acento hover:underline">Ir a Servicios →</Link>}
              />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-linea">
                    <th className="etiqueta px-4 py-2.5 text-left font-normal">Persona</th>
                    <th className="etiqueta px-4 py-2.5 text-right font-normal">Citas</th>
                    <th className="etiqueta px-4 py-2.5 text-right font-normal">Atendidas</th>
                    <th className="etiqueta px-4 py-2.5 text-right font-normal">Faltas</th>
                    <th className="etiqueta px-4 py-2.5 text-right font-normal">Cobrado</th>
                    <th className="etiqueta px-4 py-2.5 text-right font-normal">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {porPersona.map((p) => {
                    const persona = personas.find((x) => x.id === p.resource_id);
                    return (
                      <tr key={p.resource_id}>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-tinta">{p.nombre}</p>
                          <p className="numeros font-mono text-[11px] text-tinta-3">
                            {persona?.telefono ? telefono(persona.telefono) : ""}
                            {p.comision_pct ? `${persona?.telefono ? " · " : ""}${Number(p.comision_pct)} %` : ""}
                          </p>
                        </td>
                        <td className="numeros px-4 py-2.5 text-right font-mono">{p.citas}</td>
                        <td className="numeros px-4 py-2.5 text-right font-mono">{p.atendidas}</td>
                        <td className={`numeros px-4 py-2.5 text-right font-mono ${p.no_asistio > 0 ? "text-critico" : "text-tinta-3"}`}>{p.no_asistio}</td>
                        <td className="numeros px-4 py-2.5 text-right font-mono">{moneda(p.cobrado)}</td>
                        <td className="numeros px-4 py-2.5 text-right font-mono text-alerta">{moneda(p.comision)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Tarjeta>

          <div className="space-y-4">
            <Tarjeta>
              <TarjetaCabecera titulo="Ausencia" descripcion="Vacaciones, curso, enfermedad. El agente deja de ofrecer a esa persona esos días." />
              <Formulario accion={guardarAusencia} className="space-y-3 px-4 pb-4" reiniciar>
                <Campo etiqueta="Quién">
                  <Selector name="resource_id" defaultValue={personas[0]?.id ?? ""}>
                    {personas.filter((r) => r.activo).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </Selector>
                </Campo>
                <div className="grid grid-cols-2 gap-3">
                  <Campo etiqueta="Desde">
                    <Entrada name="desde" type="date" defaultValue={hoy} required />
                  </Campo>
                  <Campo etiqueta="Hasta">
                    <Entrada name="hasta" type="date" defaultValue={hoy} />
                  </Campo>
                </div>
                <Campo etiqueta="Motivo">
                  <Entrada name="motivo" placeholder="Vacaciones" />
                </Campo>
                <BotonEnviar>Bloquear días</BotonEnviar>
              </Formulario>
            </Tarjeta>

            <Tarjeta>
              <TarjetaCabecera titulo="Próximas ausencias" />
              {faltas.length === 0 ? (
                <Vacio titulo="Todos disponibles" />
              ) : (
                <ul className="divide-y divide-linea">
                  {faltas.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                      <span className="numeros w-16 font-mono text-[12px] text-tinta-2">{fechaCorta(`${a.fecha}T12:00:00Z`, "UTC")}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-tinta">
                        {lista.find((r) => r.id === a.resource_id)?.nombre ?? "Todo el negocio"}
                        {a.motivo ? <span className="text-tinta-3"> · {a.motivo}</span> : null}
                      </span>
                      <Formulario accion={eliminarRegla}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-[11px] text-tinta-3 transition hover:text-critico">Quitar</button>
                      </Formulario>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>
        </div>
      </div>
    </>
  );
}
