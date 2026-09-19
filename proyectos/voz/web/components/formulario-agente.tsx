"use client";

import { useActionState, useState } from "react";
import { crearAgente, type Estado } from "@/lib/acciones";
import { Aviso, Boton, Campo, Entrada, AreaTexto } from "@/components/ui/primitivos";

const PLANTILLAS = [
  { nombre: "Cotizador", trabajo: "Buscar proveedores, pedir precios y dejarlos anotados en Clientes.", reglas: "Siempre pide precio por la cantidad que le diga y el tiempo de entrega. Prefiere proveedores con factura. Nunca compra ni deja datos de tarjeta.", detalle: "busca y compara proveedores" },
  { nombre: "Cobranza", trabajo: "Recordar pagos pendientes por WhatsApp y registrar lo que entra.", reglas: "Un recordatorio amable, máximo dos por semana. Si la persona dice que ya pagó, lo anota y no insiste.", detalle: "recuerda y registra pagos" },
  { nombre: "", trabajo: "", reglas: "", detalle: "usted le dice qué hace", etiqueta: "Desde cero" },
];

const PERMISOS: { clave: string; nombre: string; base: boolean }[] = [
  { clave: "leer", nombre: "Leer agenda, clientes y cobros", base: true },
  { clave: "navegar", nombre: "Navegar y leer sitios", base: true },
  { clave: "anotar", nombre: "Anotar en Clientes", base: true },
  { clave: "escribir", nombre: "Escribir por WhatsApp o correo", base: false },
  { clave: "agendar", nombre: "Agendar o mover citas", base: false },
  { clave: "formularios", nombre: "Llenar formularios en sitios", base: false },
];

const inicial: Estado = {};

export function FormularioAgente() {
  const [estado, enviar, enviando] = useActionState(crearAgente, inicial);
  const [plantilla, setPlantilla] = useState(0);
  const [nombre, setNombre] = useState(PLANTILLAS[0]!.nombre);
  const [trabajo, setTrabajo] = useState(PLANTILLAS[0]!.trabajo);
  const [reglas, setReglas] = useState(PLANTILLAS[0]!.reglas);

  function elegir(i: number) {
    const p = PLANTILLAS[i]!;
    setPlantilla(i); setNombre(p.nombre); setTrabajo(p.trabajo); setReglas(p.reglas);
  }

  return (
    <form action={enviar} className="max-w-[620px]">
      <div className="space-y-5">
        <div>
          <span className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Empezar con</span>
          <div className="mt-2 grid grid-cols-3 gap-2.5">
            {PLANTILLAS.map((p, i) => (
              <button key={i} type="button" onClick={() => elegir(i)} aria-pressed={plantilla === i} className={`flex flex-col gap-1 border bg-panel px-3.5 py-3 text-left transition-colors duration-150 ${plantilla === i ? "border-tinta" : "border-linea hover:border-linea-fuerte"}`}>
                <span className="text-[13px] font-semibold text-tinta">{p.etiqueta ?? p.nombre}</span>
                <span className="text-[11px] text-tinta-2">{p.detalle}</span>
              </button>
            ))}
          </div>
        </div>
        <Campo etiqueta="Nombre">
          <Entrada name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Cotizador" />
        </Campo>
        <Campo etiqueta="Su trabajo, en una frase">
          <Entrada name="trabajo" value={trabajo} onChange={(e) => setTrabajo(e.target.value)} maxLength={200} placeholder="Buscar proveedores y anotar precios" />
        </Campo>
        <Campo etiqueta="Cómo lo quiere hecho" ayuda="Reglas, preferencias, lo que nunca debe hacer.">
          <AreaTexto name="reglas" value={reglas} onChange={(e) => setReglas(e.target.value)} rows={4} />
        </Campo>

        <div className="border-t border-linea pt-4">
          <span className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Hace sin preguntar</span>
          <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
            {PERMISOS.map((p) => (
              <label key={p.clave} className="flex items-center gap-2.5 py-2 text-[13px] text-tinta">
                <input type="checkbox" name={`permiso_${p.clave}`} defaultChecked={p.base} className="h-3.5 w-3.5 appearance-none border border-tinta checked:bg-tinta" />
                {p.nombre}
              </label>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-tinta-2">Lo que no está marcado lo pide antes de hacerlo. Comprar y pagar nunca se marcan: siempre pasan por usted.</p>
        </div>

        {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
        <div className="flex gap-2.5">
          <Boton type="submit" variante="secundario" disabled={enviando}>{enviando ? "Creando…" : "Crear agente"}</Boton>
          <a href="/agentes" className="inline-flex h-9 items-center border border-linea bg-panel px-3.5 text-[13px] text-tinta hover:border-linea-fuerte">Cancelar</a>
        </div>
      </div>

    </form>
  );
}
