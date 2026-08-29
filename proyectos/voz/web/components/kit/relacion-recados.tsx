"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { TablaRegistros, useAvisos, type Columna } from "@/components/kit";
import { alternarRecado, type Estado } from "@/lib/acciones";
import { fechaCorta, hora, telefono } from "@/lib/formato";
import type { Recado } from "@/lib/tipos";

function BotonRecado({ atendido }: { atendido: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex h-7 items-center gap-1.5 px-2.5 text-[12px] font-medium transition-[filter,color,border-color] duration-150 disabled:opacity-50 ${
        atendido
          ? "border border-linea text-tinta-2 hover:border-linea-fuerte hover:text-tinta"
          : "bg-acento text-acento-tinta hover:brightness-110"
      }`}
    >
      {pending ? <i aria-hidden="true" className="late h-1.5 w-1.5 bg-current" /> : null}
      {atendido ? "Reabrir" : "Marcar atendido"}
    </button>
  );
}

/** Marca o reabre un recado y lo cuenta con un aviso apilado; la fila cambia sola al refrescar. */
function AccionRecado({ recado }: { recado: Recado }) {
  const { avisar } = useAvisos();
  const [, enviar] = useActionState(async (previo: Estado, fd: FormData) => {
    const resultado = await alternarRecado(previo, fd);
    const quien = recado.nombre ?? telefono(recado.telefono);
    if (resultado.error) {
      avisar({ titulo: "No se pudo cambiar el recado", detalle: resultado.error, tono: "critico", duracion: 6000 });
    } else if (recado.atendido) {
      avisar({ titulo: "Recado reabierto", detalle: `${quien} · ${recado.asunto}`, tono: "alerta" });
    } else {
      avisar({ titulo: "Recado atendido", detalle: `${quien} · ${recado.asunto}`, tono: "bueno" });
    }
    return resultado;
  }, {} as Estado);

  return (
    <form action={enviar} className="flex justify-end">
      <input type="hidden" name="id" value={recado.id} />
      <BotonRecado atendido={recado.atendido} />
    </form>
  );
}

/** Los recados como tabla de registros: cuándo, quién, a qué número y qué necesita. */
export function TablaRecados({ lista, zona, soloPendientes }: { lista: Recado[]; zona: string; soloPendientes: boolean }) {
  const columnas: Columna<Recado>[] = [
    {
      clave: "cuando",
      titulo: "Cuándo",
      ancho: "120px",
      valor: (r) => r.creado,
      render: (r) => (
        <span className="numeros flex flex-col py-2 leading-tight">
          <span className="text-[12.5px] text-tinta">{hora(r.creado, zona)}</span>
          <span className="text-[10.5px] text-tinta-3">{fechaCorta(r.creado, zona)}</span>
        </span>
      ),
    },
    {
      clave: "quien",
      titulo: "Quién",
      ancho: "200px",
      valor: (r) => r.nombre ?? "",
      render: (r) => (
        <span className="flex flex-col py-2 leading-tight">
          <span className={`font-medium ${r.atendido ? "text-tinta-2" : "text-tinta"}`}>{r.nombre ?? "Sin nombre"}</span>
          <span className="numeros text-[11.5px] text-tinta-3">{telefono(r.telefono)}</span>
        </span>
      ),
    },
    {
      clave: "asunto",
      titulo: "Qué necesita",
      valor: (r) => r.asunto,
      render: (r) => {
        const extras = Object.entries(r.campos).filter(([, valor]) => valor !== null && valor !== "");
        return (
          <span className="flex max-w-[560px] flex-col gap-0.5 py-2 whitespace-normal">
            <span className={`text-[13px] ${r.atendido ? "text-tinta-2" : "text-tinta"}`}>{r.asunto}</span>
            {r.detalle ? <span className="text-[12px] leading-snug text-tinta-3">{r.detalle}</span> : null}
            {extras.length > 0 ? (
              <span className="text-[11.5px] text-tinta-3">
                {extras.map(([clave, valor]) => `${clave}: ${String(valor)}`).join(" · ")}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      clave: "estado",
      titulo: "Estado",
      ancho: "110px",
      valor: (r) => (r.atendido ? "Atendido" : "Pendiente"),
      render: (r) => (
        <span className={`inline-flex items-center gap-1.5 text-[12px] ${r.atendido ? "text-bueno" : "text-alerta"}`}>
          <i aria-hidden="true" className={`h-1.5 w-1.5 ${r.atendido ? "bg-bueno" : "bg-alerta"}`} />
          {r.atendido ? "Atendido" : "Pendiente"}
        </span>
      ),
    },
    { clave: "accion", titulo: "", ancho: "140px", render: (r) => <AccionRecado recado={r} /> },
  ];

  return (
    <TablaRegistros<Recado>
      columnas={columnas}
      filas={lista}
      clave={(r) => r.id}
      ordenInicial={{ clave: "cuando", dir: "desc" }}
      vacio={{
        titulo: soloPendientes ? "Nada pendiente" : "Sin recados",
        detalle: "Cuando el agente no pueda resolver algo, toma nombre, teléfono y el asunto, y aquí lo vas a ver.",
      }}
      className="border-0"
    />
  );
}
