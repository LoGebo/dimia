import { Encabezado } from "@/components/encabezado";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { Prototipo } from "@/components/ventas/prototipo";
import { exigirSeccion } from "@/lib/sesion";

// Ejemplo ilustrativo: en producción sale de los interesados del negocio.
const EMBUDO = [
  { nombre: "Interesados", n: 120 },
  { nombre: "Contactados", n: 86 },
  { nombre: "Calificados", n: 51 },
  { nombre: "Con cita", n: 34 },
  { nombre: "Asistieron", n: 27 },
];
const ORIGENES = [
  { nombre: "Anuncio «Limpieza dental»", citas: 14 },
  { nombre: "WhatsApp directo", citas: 11 },
  { nombre: "Formulario de la página", citas: 9 },
];

export default async function Resultados() {
  const giro = await exigirSeccion("/ventas/resultados");
  const max = EMBUDO[0]!.n;
  return (
    <>
      <Encabezado
        titulo="Resultados"
        descripcion="Cuántos interesados se volvieron citas, qué tan rápido se les contestó y cuánto costó cada cita que sí ocurrió."
        giro={giro.nombre}
      />
      <Prototipo />
      <div className="grid gap-5 p-5 lg:grid-cols-3">
        {[
          { titulo: "Tiempo al primer contacto", cifra: "18 s", nota: "La mitad se contactó en 18 s o menos; el 90 %, en 41 s." },
          { titulo: "Costo por cita que sí ocurrió", cifra: "[ dato por confirmar ]", nota: "Llamadas, mensajes y anuncios entre citas a las que sí llegaron." },
          { titulo: "Pasados a una persona", cifra: "9", nota: "2 bajas · calidad de WhatsApp: verde." },
        ].map((k) => (
          <Tarjeta key={k.titulo} className="p-5">
            <div className="text-[12.5px] text-tinta-2">{k.titulo}</div>
            <div className="mt-1 text-[28px] font-bold tabular-nums text-tinta">{k.cifra}</div>
            <div className="mt-1 text-[12.5px] text-tinta-3">{k.nota}</div>
          </Tarjeta>
        ))}
        <Tarjeta className="lg:col-span-2">
          <TarjetaCabecera titulo="Del interesado a la cita" descripcion="Últimos 30 días" />
          <div className="space-y-3 p-5">
            {EMBUDO.map((e, n) => (
              <div key={e.nombre} className="flex items-center gap-3 text-[13.5px]">
                <span className="w-28 text-tinta-2">{e.nombre}</span>
                <div className="h-6 flex-1 bg-panel-2"><div className="h-6 bg-acento" style={{ width: `${(e.n / max) * 100}%` }} /></div>
                <span className="w-10 text-right font-semibold tabular-nums text-tinta">{e.n}</span>
                <span className="w-12 text-right tabular-nums text-tinta-3">{n ? `${Math.round((e.n / EMBUDO[n - 1]!.n) * 100)} %` : ""}</span>
              </div>
            ))}
          </div>
        </Tarjeta>
        <Tarjeta>
          <TarjetaCabecera titulo="De dónde vienen las citas" />
          <ul className="space-y-2 p-5 text-[13.5px]">
            {ORIGENES.map((o) => (
              <li key={o.nombre} className="flex justify-between gap-3"><span className="text-tinta-2">{o.nombre}</span><span className="font-semibold tabular-nums text-tinta">{o.citas}</span></li>
            ))}
          </ul>
        </Tarjeta>
      </div>
    </>
  );
}
