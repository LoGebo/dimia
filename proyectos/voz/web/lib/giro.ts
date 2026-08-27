import type { Herramienta } from "@/lib/tipos";

export type GrupoSeccion = "operacion" | "configuracion" | "agente";
export type Seccion = { href: string; nombre: string; detalle: string; grupo: GrupoSeccion };

export const NOMBRE_GRUPO: Record<GrupoSeccion, string> = {
  operacion: "Operación",
  configuracion: "Configuración",
  agente: "Agente",
};
export type PasoAlta = { href: string; nombre: string };

export function secciones(herramientas: Herramienta[]): Seccion[] {
  const agenda = herramientas.includes("agendar");
  const pedidos = herramientas.includes("pedido");
  const recados = herramientas.includes("recado");

  const lista: Seccion[] = [
    { href: "/resumen", nombre: "Resumen", detalle: "Llamadas y desempeño", grupo: "operacion" },
    // Va arriba a proposito: es la pantalla que se abre todos los dias.
    { href: "/bandeja", nombre: "Bandeja", detalle: "Lo que te dijeron", grupo: "operacion" },
    { href: "/clientes", nombre: "Clientes", detalle: "Quién es quién", grupo: "operacion" },
  ];

  if (agenda) lista.push({ href: "/agenda", nombre: "Agenda", detalle: "Flujo del día", grupo: "operacion" });
  if (pedidos) lista.push({ href: "/pedidos", nombre: "Pedidos", detalle: "Lo que hay que sacar", grupo: "operacion" });
  if (recados) lista.push({ href: "/recados", nombre: "Recados", detalle: "Quién pidió que le marquen", grupo: "operacion" });
  if (agenda || pedidos) lista.push({ href: "/horarios", nombre: "Horarios", detalle: "Cuándo abres", grupo: "configuracion" });
  if (agenda) lista.push({ href: "/servicios", nombre: "Servicios", detalle: "Recursos y duración", grupo: "configuracion" });

  lista.push(
    { href: "/mensajes", nombre: "Mensajes", detalle: "Lo que sale por WhatsApp", grupo: "configuracion" },
    { href: "/catalogo", nombre: "Catálogo", detalle: "Lo que ofreces", grupo: "configuracion" },
    { href: "/conocimiento", nombre: "Respuestas", detalle: "Qué contesta", grupo: "agente" },
    { href: "/agente", nombre: "Agente", detalle: "Voz y transferencia", grupo: "agente" },
    { href: "/probar", nombre: "Probar", detalle: "Háblale en vivo", grupo: "agente" },
  );

  return lista;
}

export function rutasPanel(herramientas: Herramienta[]): string[] {
  return secciones(herramientas).map((s) => s.href);
}

export function permiteSeccion(herramientas: Herramienta[], href: string): boolean {
  return rutasPanel(herramientas).includes(href);
}

export function pasosAlta(herramientas: Herramienta[]): PasoAlta[] {
  const agenda = herramientas.includes("agendar");
  const pedidos = herramientas.includes("pedido");

  const lista: PasoAlta[] = [{ href: "/alta", nombre: "Negocio" }];

  if (agenda) {
    lista.push(
      { href: "/alta/recursos", nombre: "Recursos" },
      { href: "/alta/servicios", nombre: "Servicios" },
    );
  }
  if (pedidos) lista.push({ href: "/alta/menu", nombre: "Menú" });
  if (agenda || pedidos) lista.push({ href: "/alta/horario", nombre: "Horario" });

  lista.push({ href: "/alta/respuestas", nombre: "Respuestas" }, { href: "/alta/listo", nombre: "Listo" });

  return lista;
}

export function siguientePaso(herramientas: Herramienta[], actual: string): string {
  const lista = pasosAlta(herramientas);
  const indice = lista.findIndex((p) => p.href === actual);
  return lista[indice + 1]?.href ?? "/alta/listo";
}

export const HERRAMIENTAS_POR_DEFECTO: Herramienta[] = ["agendar", "recado"];
