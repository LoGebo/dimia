import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { NuevaCampana } from "@/components/nueva-campana";
import { Tarjeta } from "@/components/ui/primitivos";
import { alcanceCampana } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";

export default async function NuevaCampanaPagina() {
  const { giro } = await contexto();
  const [noShow, inactivos, pago] = await Promise.all([alcanceCampana("no_show", 30), alcanceCampana("inactivos", 90), alcanceCampana("recordatorio_pago", 0)]);
  // Los de 30 y 90 días son el arranque; el formulario los vuelve a pedir al cambiar los días.
  return (
    <>
      <Encabezado
        titulo="Nueva campaña"
        descripcion="Elige a quién, por dónde y qué decir. El agente hace el resto y aquí ves quién contestó y quién agendó."
        giro={giro.nombre}
        acciones={
          <Link href="/campanas" className="text-[12px] text-tinta-3 transition hover:text-acento">
            Todas las campañas
          </Link>
        }
      />
      <div className="px-5 py-5">
        <Tarjeta className="max-w-3xl px-5 py-5">
          <NuevaCampana alcances={{ no_show: noShow, inactivos, recordatorio_pago: pago }} />
        </Tarjeta>
      </div>
    </>
  );
}
