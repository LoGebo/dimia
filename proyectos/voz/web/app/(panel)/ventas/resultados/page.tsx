import { Encabezado } from "@/components/encabezado";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { exigirSeccion } from "@/lib/sesion";
import { resultados } from "@/lib/ventas";

export const dynamic = "force-dynamic";

const CANAL: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", sms: "SMS" };

export default async function Resultados() {
  const giro = await exigirSeccion("/ventas/resultados");
  const r = await resultados(30);
  const embudo = [
    { nombre: "Interesados", n: r.interesados },
    { nombre: "Contactados", n: r.contactados },
    { nombre: "Contestaron", n: r.contestaron },
    { nombre: "Con cita", n: r.conCita },
  ];
  const max = Math.max(1, r.interesados);
  return (
    <>
      <Encabezado
        titulo="Resultados"
        descripcion="Cuántos interesados se volvieron citas y qué tan rápido se les contestó. Últimos 30 días."
        giro={giro.nombre}
      />
      <div className="grid gap-5 p-5 lg:grid-cols-3">
        {[
          { titulo: "Tiempo al primer contacto", cifra: r.p50 === null ? "—" : `${r.p50} s`, nota: r.p90 === null ? "Todavía sin datos." : `La mitad se contestó en ${r.p50} s o menos; el 90 %, en ${r.p90} s.` },
          { titulo: "Se volvieron cita", cifra: r.interesados ? `${Math.round((r.conCita / r.interesados) * 100)} %` : "—", nota: `${r.conCita} de ${r.interesados} interesados.` },
          { titulo: "Pasados a una persona", cifra: String(r.porPersona), nota: `${r.bajas} ${r.bajas === 1 ? "baja" : "bajas"} · ${r.perdidos} sin respuesta.` },
        ].map((k) => (
          <Tarjeta key={k.titulo} className="p-5">
            <div className="text-[12.5px] text-tinta-2">{k.titulo}</div>
            <div className="mt-1 text-[28px] font-bold tabular-nums text-tinta">{k.cifra}</div>
            <div className="mt-1 text-[12.5px] text-tinta-3">{k.nota}</div>
          </Tarjeta>
        ))}
        <Tarjeta className="lg:col-span-2">
          <TarjetaCabecera titulo="Del interesado a la cita" descripcion="Costo por cita: llega con la voz y los anuncios (fase 2)." />
          <div className="space-y-3 p-5">
            {embudo.map((e, n) => (
              <div key={e.nombre} className="flex items-center gap-3 text-[13.5px]">
                <span className="w-28 text-tinta-2">{e.nombre}</span>
                <div className="h-6 flex-1 bg-panel-2"><div className="h-6 bg-acento" style={{ width: `${(e.n / max) * 100}%` }} /></div>
                <span className="w-10 text-right font-semibold tabular-nums text-tinta">{e.n}</span>
                <span className="w-12 text-right tabular-nums text-tinta-3">{n && embudo[n - 1]!.n ? `${Math.round((e.n / embudo[n - 1]!.n) * 100)} %` : ""}</span>
              </div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta>
          <TarjetaCabecera titulo="Por canal" />
          <ul className="space-y-2 p-5 text-[13.5px]">
            {r.porCanal.length === 0 ? <li className="text-tinta-3">Todavía sin interesados.</li> : null}
            {r.porCanal.map((o) => (
              <li key={o.canal} className="flex justify-between gap-3"><span className="text-tinta-2">{CANAL[o.canal] ?? o.canal}</span><span className="tabular-nums text-tinta"><b>{o.citas}</b> citas de {o.interesados}</span></li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
