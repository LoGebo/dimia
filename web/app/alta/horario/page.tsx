import { Paso } from "@/components/paso";
import { EditorHorario } from "@/components/editor-horario";
import { Tarjeta } from "@/components/ui/primitivos";
import { recursos, reglas } from "@/lib/consultas";

export default async function AltaHorario() {
  const [listaRecursos, listaReglas] = await Promise.all([recursos(), reglas()]);
  return (
    <Paso
      titulo="¿A qué horas abres?"
      descripcion="Arrastra sobre la cuadrícula para pintar tu semana. Usa un preajuste y ajústalo. El agente jamás ofrece un horario fuera de esto."
      siguiente="/alta/respuestas"
    >
      <Tarjeta>
        <EditorHorario reglas={listaReglas} recursos={listaRecursos.filter((r) => r.activo)} />
      </Tarjeta>
    </Paso>
  );
}
