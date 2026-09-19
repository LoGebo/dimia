"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { IconoAgente } from "@/components/icono-agente";
import { crearAgente, type Estado } from "@/lib/acciones";
import { Aviso } from "@/components/ui/primitivos";

const ROLES = [
  { nombre: "Cotizador", trabajo: "Busca proveedores, pide precios y los anota en Clientes.", reglas: "Pide precio por la cantidad que le diga y el tiempo de entrega. Prefiere proveedores con factura. Nunca compra ni deja datos de tarjeta." },
  { nombre: "Cobranza", trabajo: "Recuerda pagos pendientes por WhatsApp y registra lo que entra.", reglas: "Un recordatorio amable, máximo dos por semana. Si dicen que ya pagaron, lo anota y no insiste." },
  { nombre: "Seguimiento", trabajo: "Escribe a quien no ha vuelto y le ofrece cita.", reglas: "Solo a quien lleva más de 60 días sin venir. Un mensaje, sin insistir." },
  { nombre: "Nuevo", trabajo: "", reglas: "", etiqueta: "Desde cero" },
];

const PERMISOS: { clave: string; nombre: string; base: boolean }[] = [
  { clave: "leer", nombre: "Leer el panel", base: true },
  { clave: "navegar", nombre: "Navegar sitios", base: true },
  { clave: "anotar", nombre: "Anotar en Clientes", base: true },
  { clave: "escribir", nombre: "Escribir a clientes", base: false },
  { clave: "agendar", nombre: "Mover citas", base: false },
  { clave: "formularios", nombre: "Llenar formularios", base: false },
];

const inicial: Estado = {};

/**
 * Alta de un agente: se elige un rol (o ninguno), se le da nombre y trabajo,
 * y se marca lo que puede hacer sin preguntar. Lo demás no se pregunta.
 */
export function FormularioAgente() {
  const [estado, enviar, enviando] = useActionState(crearAgente, inicial);
  const [rol, setRol] = useState(0);
  const [nombre, setNombre] = useState(ROLES[0]!.nombre);
  const [trabajo, setTrabajo] = useState(ROLES[0]!.trabajo);
  const [reglas, setReglas] = useState(ROLES[0]!.reglas);
  const [permisos, setPermisos] = useState<Set<string>>(new Set(PERMISOS.filter((p) => p.base).map((p) => p.clave)));

  function elegir(i: number) {
    const r = ROLES[i]!;
    setRol(i);
    setNombre(r.etiqueta ? "" : r.nombre);
    setTrabajo(r.trabajo);
    setReglas(r.reglas);
  }

  function alternar(clave: string) {
    setPermisos((prev) => {
      const nx = new Set(prev);
      if (nx.has(clave)) nx.delete(clave);
      else nx.add(clave);
      return nx;
    });
  }

  const campo = "w-full border-0 border-b border-linea bg-transparent px-0 py-2 text-tinta outline-none transition-colors duration-150 placeholder:text-tinta-3 focus:border-acento";

  return (
    <form action={enviar} className="mx-auto max-w-[560px] space-y-9 py-4">
      <fieldset className="space-y-3">
        <legend className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Rol</legend>
        <div className="grid grid-cols-4 gap-2">
          {ROLES.map((r, i) => (
            <button
              key={r.nombre}
              type="button"
              onClick={() => elegir(i)}
              aria-pressed={rol === i}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-4 transition-[border-color,background-color] duration-150 ${rol === i ? "border-acento bg-acento-suave/40" : "border-linea hover:border-linea-fuerte"}`}
            >
              <IconoAgente nombre={r.nombre} trabajo={r.trabajo} tamano={40} />
              <span className="text-[12.5px] font-medium text-tinta">{r.etiqueta ?? r.nombre}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-6">
        <label className="block">
          <span className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Nombre</span>
          <input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} placeholder="Cómo le va a decir" autoComplete="off" className={`${campo} text-[20px] font-semibold`} />
        </label>
        <label className="block">
          <span className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Trabajo</span>
          <input name="trabajo" value={trabajo} onChange={(e) => setTrabajo(e.target.value)} maxLength={200} placeholder="Una frase: qué hace" autoComplete="off" className={`${campo} text-[15px]`} />
        </label>
        <label className="block">
          <span className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Cómo lo quiere hecho</span>
          <textarea name="reglas" value={reglas} onChange={(e) => setReglas(e.target.value)} rows={3} placeholder="Reglas, gustos, lo que nunca debe hacer. Opcional." className={`${campo} resize-none text-[14px] leading-relaxed`} />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="numeros text-[10px] tracking-[0.14em] text-laton uppercase">Hace sin preguntar</legend>
        <div className="flex flex-wrap gap-2">
          {PERMISOS.map((p) => {
            const si = permisos.has(p.clave);
            return (
              <button
                key={p.clave}
                type="button"
                onClick={() => alternar(p.clave)}
                aria-pressed={si}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-[background-color,border-color,color] duration-150 ${si ? "border-tinta bg-tinta text-paper" : "border-linea text-tinta-2 hover:border-linea-fuerte hover:text-tinta"}`}
              >
                {si ? <Check size={14} strokeWidth={2.5} /> : null}
                {p.nombre}
              </button>
            );
          })}
        </div>
        {PERMISOS.map((p) => (permisos.has(p.clave) ? <input key={p.clave} type="hidden" name={`permiso_${p.clave}`} value="on" /> : null))}
        <p className="text-[12px] text-tinta-3">Lo demás lo pregunta antes. Comprar y pagar siempre pasan por usted.</p>
      </fieldset>

      {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}

      <div className="flex items-center gap-5 pt-2">
        <button type="submit" disabled={enviando} className="inline-flex h-11 items-center gap-2.5 rounded-full bg-acento px-6 text-[14px] font-semibold text-acento-tinta transition-[filter,transform] duration-150 hover:brightness-110 active:scale-[0.98] disabled:bg-linea disabled:text-tinta-3">
          {enviando ? "Creando…" : `Crear ${nombre.trim() || "agente"}`}
        </button>
        <Link href="/agentes" className="text-[13px] text-tinta-3 hover:text-tinta">Cancelar</Link>
      </div>
    </form>
  );
}
