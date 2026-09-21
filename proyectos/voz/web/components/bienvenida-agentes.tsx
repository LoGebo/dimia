"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { conectarCodex, crearAgenteVacio, estadoCodex } from "@/lib/acciones";

/**
 * Primera vez en Agentes: tres pasos y a trabajar. Cuenta → ChatGPT →
 * primer agente. Sin cifras ni promesas; solo lo que hay que hacer.
 */
export function BienvenidaAgentes({ negocio, verRecepcion }: { negocio: string; verRecepcion: () => void }) {
  const router = useRouter();
  const [codex, setCodex] = useState<"cargando" | "sin_conectar" | "pendiente" | "conectado">("cargando");
  const [codigo, setCodigo] = useState<{ codigo: string; url: string } | null>(null);
  const [pendiente, empezar] = useTransition();

  useEffect(() => { void estadoCodex().then((e) => setCodex(e.estado)); }, []);
  useEffect(() => {
    if (!codigo) return;
    const t = setInterval(async () => {
      const e = await estadoCodex();
      if (e.estado === "conectado") { setCodex("conectado"); setCodigo(null); }
    }, 4000);
    return () => clearInterval(t);
  }, [codigo]);

  async function conectar() {
    const r = await conectarCodex();
    if (!("error" in r)) setCodigo(r);
  }

  function crear() {
    empezar(async () => {
      const r = await crearAgenteVacio();
      if (r.id) { router.refresh(); window.history.pushState(null, "", `/agentes/${r.id}`); }
    });
  }

  const listo = codex === "conectado";
  return (
    <section className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-[560px]">
        <h1 className="text-[26px] font-semibold text-tinta">Sus agentes, para {negocio}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-tinta-2">Cada agente tiene su propia computadora y piensa con su cuenta de ChatGPT. Usted le dice qué hacer y ve su pantalla mientras trabaja.</p>

        <ol className="mt-8 space-y-4">
          <li className={`rounded-2xl border p-5 ${listo ? "border-linea" : "border-acento/40 bg-acento-suave/40"}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[16px] font-semibold text-tinta"><span className="mr-2 text-tinta-3">1</span>Conecte su ChatGPT</p>
              {listo ? <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bueno text-paper"><Check size={14} strokeWidth={3} /></span> : null}
            </div>
            {listo ? <p className="mt-1 text-[13.5px] text-tinta-3">Conectada. Todos sus agentes la usan.</p> : codigo ? (
              <div className="mt-3">
                <p className="text-[14px] text-tinta">Abra <a href={codigo.url} target="_blank" rel="noreferrer" className="underline">{codigo.url.replace("https://", "")}</a> e ingrese este código:</p>
                <p className="numeros mt-2 text-[28px] font-semibold tracking-wider text-tinta">{codigo.codigo}</p>
                <p className="mt-1 text-[13px] text-tinta-3">Si ChatGPT pide «habilitar la autorización con código de dispositivo», actívela en chatgpt.com → Ajustes → Seguridad y vuelva a pulsar Conectar.</p>
              </div>
            ) : (
              <>
                <p className="mt-1 text-[13.5px] leading-relaxed text-tinta-2">Sirve un plan Plus o Pro. Se conecta una vez; sus agentes piensan con ella y Dimia no guarda su contraseña.</p>
                <button type="button" onClick={conectar} disabled={codex === "cargando"} className="mt-3 h-10 rounded-full bg-acento px-5 text-[14px] font-semibold text-acento-tinta hover:brightness-110 disabled:opacity-60">Conectar ChatGPT</button>
              </>
            )}
          </li>
          <li className={`rounded-2xl border p-5 ${listo ? "border-acento/40 bg-acento-suave/40" : "border-linea opacity-70"}`}>
            <p className="text-[16px] font-semibold text-tinta"><span className="mr-2 text-tinta-3">2</span>Cree su primer agente</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-tinta-2">Le pregunta para qué lo quiere y se pone nombre y trabajo. Luego, en Marketplace, dele Dimia (sus citas y cobros), WhatsApp o su Google.</p>
            <button type="button" onClick={crear} disabled={!listo || pendiente} className="mt-3 h-10 rounded-full bg-tinta px-5 text-[14px] font-semibold text-paper hover:brightness-110 disabled:opacity-40">Crear agente</button>
          </li>
          <li className="rounded-2xl border border-linea p-5 opacity-70">
            <p className="text-[16px] font-semibold text-tinta"><span className="mr-2 text-tinta-3">3</span>Pídale algo</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-tinta-2">«¿Cómo va el día?», «busca tres proveedores de…», «arma la cotización para…». Verá su pantalla a la derecha y podrá tomar el control.</p>
          </li>
        </ol>

        <p className="mt-8 text-[13px] text-tinta-3">Recepción ya contesta llamadas, WhatsApp e Instagram; <button type="button" onClick={verRecepcion} className="underline hover:text-tinta">hable con Recepción</button> cuando quiera.</p>
      </div>
    </section>
  );
}
