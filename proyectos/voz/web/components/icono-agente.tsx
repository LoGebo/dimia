import { BadgeDollarSign, Headset, type LucideIcon, Search, Sparkles, Truck } from "lucide-react";
import { IconoDimia } from "@/components/marca";

/**
 * El ícono de un agente, como los de iOS: cuadrado de esquinas muy suaves,
 * un degradado de un solo color y un símbolo blanco. El símbolo sale del
 * trabajo; el color, del nombre, para que cada agente se distinga siempre.
 */
const COLORES = [
  ["#3b6ff0", "#1f47c4"], // azul
  ["#2fb886", "#12805c"], // verde
  ["#c8a45c", "#a8853f"], // latón
  ["#f08a5d", "#c4392f"], // coral
  ["#8b6cf0", "#5b3fc4"], // violeta
];

function simbolo(nombre: string, trabajo: string): LucideIcon {
  const t = `${nombre} ${trabajo}`.toLowerCase();
  if (/recepci|contesta|llamada|whatsapp/.test(t)) return Headset;
  if (/cotiz|proveedor|precio|busca/.test(t)) return Search;
  if (/cobr|pago|factur/.test(t)) return BadgeDollarSign;
  if (/entrega|envío|envio|reparto|pedido/.test(t)) return Truck;
  return Sparkles;
}

function color(nombre: string): [string, string] {
  let h = 0;
  for (const c of nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  if (/recepci/i.test(nombre)) return COLORES[0] as [string, string];
  if (/^nuevo$/i.test(nombre.trim())) return ["#8b95a8", "#5a6478"];
  return COLORES[1 + (h % (COLORES.length - 1))] as [string, string];
}

export function IconoAgente({ nombre, trabajo = "", tamano = 40 }: { nombre: string; trabajo?: string; tamano?: number }) {
  // Recepción es la casa: lleva el logotipo, tinta profunda y hueso, como la app.
  if (/recepci/i.test(nombre)) {
    return (
      <span
        aria-hidden="true"
        className="flex flex-none items-center justify-center"
        style={{ width: tamano, height: tamano, borderRadius: Math.round(tamano * 0.24), background: "#0b0f17", color: "#eef1f7", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.18)" }}
      >
        <IconoDimia tamano={Math.round(tamano * 0.56)} />
      </span>
    );
  }
  const Simbolo = simbolo(nombre, trabajo);
  const [claro, oscuro] = color(nombre);
  return (
    <span
      aria-hidden="true"
      className="flex flex-none items-center justify-center text-white"
      style={{
        width: tamano,
        height: tamano,
        borderRadius: Math.round(tamano * 0.24),
        background: `linear-gradient(180deg, ${claro} 0%, ${oscuro} 100%)`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 1px 2px rgba(0,0,0,0.18)",
      }}
    >
      <Simbolo size={Math.round(tamano * 0.5)} strokeWidth={2} />
    </span>
  );
}
