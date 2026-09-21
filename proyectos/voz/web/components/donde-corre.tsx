"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { dondeAgente, estadoLocal, type EstadoLocal } from "@/lib/acciones";

/**
 * Dónde corre el agente: en la computadora de Dimia (siempre encendida) o en la del dueño
 * (su Mac, con sus archivos y programas; solo trabaja cuando está prendida).
 */
export function DondeCorre({ agenteId, nombre, donde, alCambiar }: { agenteId: string; nombre: string; donde: "dimia" | "local"; alCambiar: (d: "dimia" | "local") => void }) {
  const [estado, setEstado] = useState<EstadoLocal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [verComando, setVerComando] = useState(false);
  const [pendiente, empezar] = useTransition();

  useEffect(() => {
    if (donde !== "local") { setEstado(null); return; }
    let vivo = true;
    const leer = () => { void estadoLocal(agenteId).then((e) => { if (vivo) setEstado(e); }); };
    leer();
    const t = setInterval(leer, 10000);
    return () => { vivo = false; clearInterval(t); };
  }, [agenteId, donde]);

  // Aviso del navegador cuando la Mac se conecta (si el dueño lo permitió).
  const antes = useRef<boolean | null>(null);
  useEffect(() => {
    if (!estado) return;
    if (antes.current === false && estado.conectada && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`${nombre} ya corre en su Mac`, { body: estado.host ? `Conectada · ${estado.host}` : "Conectada" });
    }
    antes.current = estado.conectada;
  }, [estado, nombre]);

  function cambiar(d: "dimia" | "local") {
    if (d === donde) return;
    setError(null);
    if (d === "local" && typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    empezar(async () => {
      const r = await dondeAgente(agenteId, d);
      if (r.error) { setError(r.error); return; }
      alCambiar(r.donde);
      setEstado(r);
      // Baja el instalador: al abrirlo, Terminal hace todo; el dueño no escribe nada.
      if (d === "local" && r.descarga && !r.host) window.location.assign(r.descarga);
    });
  }

  async function copiar() {
    if (!estado?.comando) return;
    try { await navigator.clipboard.writeText(estado.comando); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch {}
  }

  const opcion = (d: "dimia" | "local", titulo: string, detalle: string) => (
    <button type="button" onClick={() => cambiar(d)} disabled={pendiente} aria-pressed={donde === d} className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ${donde === d ? "border-tinta bg-linea/50" : "border-linea hover:bg-linea/40"}`}>
      <span className={`mt-1 flex h-4 w-4 flex-none items-center justify-center rounded-full border ${donde === d ? "border-tinta bg-tinta text-paper" : "border-linea-fuerte"}`}>{donde === d ? <Check size={10} strokeWidth={3} /> : null}</span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-tinta">{titulo}</span>
        <span className="block text-[12.5px] leading-snug text-tinta-3">{detalle}</span>
      </span>
    </button>
  );

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-tinta-2">Dónde corre</p>
      {opcion("dimia", "En la computadora de Dimia", "Siempre encendida. Tiene su propio escritorio y usted ve su pantalla.")}
      {opcion("local", "En esta computadora", `${nombre} abre archivos y usa los programas de su Mac. Cada acción que escribe pide su visto bueno. Solo trabaja con la Mac prendida.`)}
      {error ? <p className="text-[13px] text-critico">{error}</p> : null}
      {donde === "local" ? (
        <div className="rounded-xl bg-linea/50 p-3">
          {estado?.conectada ? (
            <p className="flex items-center gap-2 text-[13px] text-tinta"><i aria-hidden="true" className="h-2 w-2 rounded-full bg-bueno" />Conectada{estado.host ? ` · ${estado.host}` : ""}</p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[13px] text-tinta"><i aria-hidden="true" className="h-2 w-2 rounded-full bg-tinta-3" />{estado?.host ? `Fuera de línea · ${estado.host}` : "Sin conectar"}</p>
              {estado?.comando && !estado.host ? (
                <>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-tinta-2">Se descargó <span className="font-medium text-tinta">Instalar-Dimia.command</span>. Ábralo desde Descargas: Terminal instala todo y esta tarjeta cambia a «Conectada» sola. La primera vez macOS pide clic derecho → Abrir.</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                    {estado.descarga ? <a href={estado.descarga} className="text-acento hover:underline">Volver a descargar</a> : null}
                    <button type="button" onClick={() => setVerComando((v) => !v)} className="text-tinta-3 hover:text-tinta">{verComando ? "Ocultar el comando" : "Prefiero pegar un comando en Terminal"}</button>
                  </div>
                  {verComando ? (
                    <div className="mt-1.5 flex items-stretch gap-1.5">
                      <code className="numeros min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-panel px-2.5 py-2 text-[12px] text-tinta-2">{estado.comando}</code>
                      <button type="button" onClick={copiar} aria-label="Copiar" className="flex w-9 flex-none items-center justify-center rounded-lg bg-panel text-tinta-2 hover:text-tinta">{copiado ? <Check size={15} /> : <Copy size={15} />}</button>
                    </div>
                  ) : null}
                  <p className="mt-2 text-[12px] text-tinta-3">Instala Hermes en su Mac y lo deja corriendo al iniciar sesión. macOS le pedirá permiso de Accesibilidad y Grabación de pantalla.</p>
                </>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
