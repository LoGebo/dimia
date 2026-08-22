import { Paso } from "@/components/paso";
import { EditorHorario } from "@/components/editor-horario";
import { Tarjeta } from "@/components/ui/primitivos";
import { recursos, reglas } from "@/lib/consultas";
import { siguientePaso } from "@/lib/giro";
import { exigirPasoAlta } from "@/lib/sesion";

export default async function AltaHorario() {
  const giro = await exigirPasoAlta("/alta/horario");
  const [listaRecursos, listaReglas] = await Promise.all([recursos(), reglas()]);
  return (
    <Paso
      titulo="¿A qué horas abres?"
      descripcion={
        giro.herramientas.includes("pedido")
          ? "Arrastra sobre la cuadrícula para pintar tu semana. Fuera de estas horas el agente avisa que están cerrados en vez de tomar el pedido."
          : "Arrastra sobre la cuadrícula para pintar tu semana. Usa un preajuste y ajústalo. El agente jamás ofrece un horario fuera de esto."
      }
      siguiente={siguientePaso(giro.herramientas, "/alta/horario")}
    >
      <Tarjeta>
        <EditorHorario reglas={listaReglas} recursos={listaRecursos.filter((r) => r.activo)} />
      </Tarjeta>
    </Paso>
  );
}
