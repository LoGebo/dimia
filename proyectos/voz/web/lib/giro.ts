import type { Herramienta } from "@/lib/tipos";

export type Seccion = { href: string; nombre: string; detalle: string };
export type PasoAlta = { href: string; nombre: string };

export function secciones(herramientas: Herramienta[]): Seccion[] {
  const agenda = herramientas.includes("agendar");
  const pedidos = herramientas.includes("pedido");
  const recados = herramientas.includes("recado");

  const lista: Seccion[] = [
    { href: "/resumen", nombre: "Resumen", detalle: "Llamadas y desempeño" },
    // Va arriba a proposito: es la pantalla que se abre todos los dias.
    { href: "/bandeja", nombre: "Bandeja", detalle: "Lo que te dijeron" },
  ];

  if (agenda) lista.push({ href: "/agenda", nombre: "Agenda", detalle: "Reservas del día" });
  if (pedidos) lista.push({ href: "/pedidos", nombre: "Pedidos", detalle: "Lo que hay que sacar" });
  if (recados) lista.push({ href: "/recados", nombre: "Recados", detalle: "Quién pidió que le marquen" });
  if (agenda || pedidos) lista.push({ href: "/horarios", nombre: "Horarios", detalle: "Cuándo abres" });
  if (agenda) lista.push({ href: "/servicios", nombre: "Servicios", detalle: "Recursos y duración" });

  lista.push(
    { href: "/mensajes", nombre: "Mensajes", detalle: "Lo que sale por WhatsApp" },
    { href: "/catalogo", nombre: "Catálogo", detalle: "Lo que ofreces" },
    { href: "/conocimiento", nombre: "Respuestas", detalle: "Qué contesta" },
    { href: "/agente", nombre: "Agente", detalle: "Voz y transferencia" },
    { href: "/probar", nombre: "Probar", detalle: "Háblale en vivo" },
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
