"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export type Paso = { herramienta: string; detalle?: string; ms?: number; ok?: boolean };

/** Herramienta → cómo se le dice al dueño (gerundio para «está…», pretérito para «lo que hizo»). */
const HERRAMIENTAS: [RegExp, { grupo: string; haciendo: string; hizo: string }][] = [
  [/^mcp__dimia__(citas|disponibilidad|buscar_cita)$/, { grupo: "Agenda", haciendo: "revisando la agenda", hizo: "Revisó la agenda" }],
  [/^mcp__dimia__(buscar_cliente|clientes_sin_volver)$/, { grupo: "Clientes", haciendo: "buscando clientes", hizo: "Buscó clientes" }],
  [/^mcp__dimia__cobros$/, { grupo: "Cobros", haciendo: "revisando los cobros", hizo: "Revisó los cobros" }],
  [/^mcp__dimia__servicios$/, { grupo: "Servicios", haciendo: "consultando los servicios", hizo: "Consultó los servicios" }],
  [/^mcp__dimia__(consultar|esquema)$/, { grupo: "Datos del negocio", haciendo: "consultando los datos del negocio", hizo: "Consultó los datos del negocio" }],
  [/^mcp__dimia__agendar_cita$/, { grupo: "Agenda", haciendo: "agendando una cita", hizo: "Agendó una cita" }],
  [/^mcp__dimia__cancelar_cita$/, { grupo: "Agenda", haciendo: "cancelando una cita", hizo: "Canceló una cita" }],
  [/^mcp__dimia__anotar_recado$/, { grupo: "Recados", haciendo: "dejando un recado", hizo: "Dejó un recado" }],
  [/^mcp__dimia__registrar_pago$/, { grupo: "Cobros", haciendo: "registrando un pago", hizo: "Registró un pago" }],
  [/^mcp__whatsapp__/, { grupo: "WhatsApp", haciendo: "mandando un WhatsApp", hizo: "Mandó un WhatsApp" }],
  [/^mcp__google__gmail_enviar$/, { grupo: "Gmail", haciendo: "enviando un correo", hizo: "Envió un correo" }],
  [/^mcp__google__gmail_/, { grupo: "Gmail", haciendo: "leyendo el correo", hizo: "Leyó el correo" }],
  [/^mcp__google__calendar_/, { grupo: "Calendario", haciendo: "revisando el calendario", hizo: "Revisó el calendario" }],
  [/^mcp__google__drive_/, { grupo: "Drive", haciendo: "buscando en Drive", hizo: "Buscó en Drive" }],
  [/^mcp__notion__/, { grupo: "Notion", haciendo: "revisando Notion", hizo: "Revisó Notion" }],
  [/^mcp__slack__publicar/, { grupo: "Slack", haciendo: "publicando en Slack", hizo: "Publicó en Slack" }],
  [/^mcp__slack__/, { grupo: "Slack", haciendo: "leyendo Slack", hizo: "Leyó Slack" }],
  [/^mcp__github__crear_/, { grupo: "GitHub", haciendo: "escribiendo en GitHub", hizo: "Escribió en GitHub" }],
  [/^mcp__github__/, { grupo: "GitHub", haciendo: "leyendo el repositorio", hizo: "Leyó el repositorio" }],
  [/^mcp__higgsfield__/, { grupo: "Higgsfield", haciendo: "generando con Higgsfield", hizo: "Generó con Higgsfield" }],
  [/^mcp__navegador_rapido__|^browser_navigate$/, { grupo: "Navegador", haciendo: "navegando en internet", hizo: "Navegó en internet" }],
  [/^browser_/, { grupo: "Navegador", haciendo: "usando el navegador", hizo: "Usó el navegador" }],
  [/^web_search$/, { grupo: "Internet", haciendo: "buscando en internet", hizo: "Buscó en internet" }],
  [/^web_extract$/, { grupo: "Internet", haciendo: "leyendo una página", hizo: "Leyó una página" }],
  [/^terminal$/, { grupo: "Terminal", haciendo: "corriendo un comando", hizo: "Corrió un comando" }],
  [/^(read_file|search_files|list_dir)$/, { grupo: "Archivos", haciendo: "leyendo archivos", hizo: "Leyó archivos" }],
  [/^(write_file|patch|edit_file|create_file)$/, { grupo: "Archivos", haciendo: "escribiendo un archivo", hizo: "Escribió un archivo" }],
  [/^computer_use/, { grupo: "Computadora", haciendo: "usando la computadora", hizo: "Usó la computadora" }],
  [/^execute_code|^code_execution/, { grupo: "Código", haciendo: "corriendo código", hizo: "Corrió código" }],
  [/^cronjob/, { grupo: "Rutinas", haciendo: "ajustando una rutina", hizo: "Ajustó una rutina" }],
  [/^skill/, { grupo: "Habilidad", haciendo: "consultando una habilidad", hizo: "Consultó una habilidad" }],
  [/^memory/, { grupo: "Memoria", haciendo: "recordando", hizo: "Recordó algo" }],
  [/^todo/, { grupo: "Plan", haciendo: "organizando el plan", hizo: "Organizó el plan" }],
  [/^delegate_task/, { grupo: "Ayudantes", haciendo: "delegando tareas", hizo: "Delegó tareas" }],
  [/^vision/, { grupo: "Imagen", haciendo: "mirando una imagen", hizo: "Miró una imagen" }],
];

export function describir(herramienta: string): { grupo: string; haciendo: string; hizo: string } {
  for (const [re, d] of HERRAMIENTAS) if (re.test(herramienta)) return d;
  const limpio = herramienta.replace(/^mcp__[a-z_]+?__/, "").replaceAll("_", " ");
  return { grupo: limpio, haciendo: `usando ${limpio}`, hizo: `Usó ${limpio}` };
}

/** El «preview» de Hermes son los argumentos; se deja lo legible, sin llaves ni comillas. */
export function detalleCorto(detalle?: string): string {
  if (!detalle) return "";
  const limpio = detalle.replace(/^[a-z_]+\(/i, "").replace(/\)$/, "").replace(/[{}"[\]]/g, "").replace(/\b(sql|query|url|texto|consulta|dia|repo|canal|para|asunto|id)\s*[:=]\s*/gi, "").replace(/\s+/g, " ").trim();
  return limpio.length > 90 ? `${limpio.slice(0, 88)}…` : limpio;
}

const ms = (n?: number) => (n == null ? "" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)} s`);

/** Lo que está haciendo el agente ahora: una lista viva de pasos; el último late. */
export function ActividadEnVivo({ pasos }: { pasos: Paso[] }) {
  if (!pasos.length) return null;
  const visibles = pasos.slice(-5);
  return (
    <ol className="ml-8 flex w-full max-w-[520px] flex-col gap-1 border-l border-linea pl-3">
      {pasos.length > 5 ? <li className="text-[11.5px] text-tinta-3">{pasos.length - 5} pasos antes</li> : null}
      {visibles.map((p, i) => {
        const d = describir(p.herramienta);
        const enCurso = p.ms == null;
        return (
          <li key={i} className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
            <span className="flex h-3.5 w-3.5 flex-none items-center justify-center self-center">
              {enCurso ? <i aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-acento" /> : p.ok === false ? <X size={11} className="text-critico" /> : <Check size={11} className="text-bueno" />}
            </span>
            <span className={enCurso ? "text-tinta" : "text-tinta-2"}>{enCurso ? d.haciendo.replace(/^./, (c) => c.toUpperCase()) : d.hizo}</span>
            {p.detalle ? <span className="numeros min-w-0 truncate text-[12px] text-tinta-3">{detalleCorto(p.detalle)}</span> : null}
            {!enCurso ? <span className="numeros ml-auto flex-none text-[11px] text-tinta-3">{ms(p.ms)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Después de contestar: «Lo que hizo · n pasos», plegado. */
export function ActividadHecha({ pasos }: { pasos: Paso[] }) {
  const [abierto, setAbierto] = useState(false);
  if (!pasos.length) return null;
  const grupos = Array.from(new Set(pasos.map((p) => describir(p.herramienta).grupo))).slice(0, 4);
  const total = pasos.reduce((s, p) => s + (p.ms ?? 0), 0);
  return (
    <div className="max-w-[520px]">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex items-center gap-1.5 rounded-full text-[12px] text-tinta-3 transition-colors duration-100 hover:text-tinta">
        <ChevronDown size={13} className={`transition-transform duration-150 ${abierto ? "" : "-rotate-90"}`} />
        {pasos.length} {pasos.length === 1 ? "paso" : "pasos"} · {grupos.join(", ")}{total ? <span className="numeros"> · {ms(total)}</span> : null}
      </button>
      {abierto ? (
        <ol className="mt-1.5 flex flex-col gap-1 border-l border-linea pl-3">
          {pasos.map((p, i) => {
            const d = describir(p.herramienta);
            return (
              <li key={i} className="flex min-w-0 items-baseline gap-2 text-[12.5px]">
                <span className="flex h-3.5 w-3.5 flex-none items-center justify-center self-center">{p.ok === false ? <X size={11} className="text-critico" /> : <Check size={11} className="text-bueno" />}</span>
                <span className="text-tinta-2">{d.hizo}</span>
                {p.detalle ? <span className="numeros min-w-0 truncate text-[12px] text-tinta-3">{detalleCorto(p.detalle)}</span> : null}
                <span className="numeros ml-auto flex-none text-[11px] text-tinta-3">{ms(p.ms)}</span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
