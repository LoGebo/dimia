"use client";

import { useState } from "react";
import { BotonEnviar, Formulario } from "@/components/formulario";
import { SelectorGiro, type EstadoGiro } from "@/components/selector-giro";
import { Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { altaNegocio } from "@/lib/acciones";
import { ZONAS_HORARIAS, type PlantillaVertical } from "@/lib/tipos";

/**
 * El alta se cierra con candado: el botón no se activa hasta que lo obligatorio
 * está capturado. Así nadie manda el formulario para enterarse de qué faltaba.
 */
export function AltaNegocio({ plantillas }: { plantillas: PlantillaVertical[] }) {
  const [nombre, setNombre] = useState("");
  const [giro, setGiro] = useState<EstadoGiro>({ giro: plantillas[0]?.clave ?? "propio", propio: false, faltantes: [] });

  const faltantes = [...(nombre.trim() ? [] : ["el nombre del negocio"]), ...giro.faltantes];
  const listo = faltantes.length === 0;

  return (
    <Formulario accion={altaNegocio} className="space-y-4">
      <Campo etiqueta="Nombre del negocio" ayuda="Así se presenta el agente al contestar.">
        <Entrada
          name="nombre"
          required
          placeholder="Clínica Dental Sonrisa"
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </Campo>

      <SelectorGiro plantillas={plantillas} onCambio={setGiro} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Zona horaria">
          <Selector name="zona_horaria" defaultValue="America/Mexico_City">
            {ZONAS_HORARIAS.map((z) => (
              <option key={z} value={z}>
                {z.replace("America/", "").replace("_", " ")}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Número para transferir" ayuda="A dónde pasa las llamadas que no resuelve.">
          <Entrada name="telefono_escalamiento" placeholder="+52 55 1234 5678" />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-linea pt-4">
        <BotonEnviar disabled={!listo}>Crear negocio</BotonEnviar>
        <p className="text-[12px] text-tinta-3">
          {listo ? "Después configuras horarios, servicios y respuestas en el panel." : `Falta ${faltantes.join(" y ")}.`}
        </p>
      </div>
    </Formulario>
  );
}
