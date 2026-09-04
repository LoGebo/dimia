import type { Herramienta } from "@/lib/tipos";

export type Pestana = { href: string; nombre: string };
export type Seccion = { href: string; nombre: string; detalle: string; pestanas: Pestana[] };

/**
 * Cinco lugares, con nombres de a pie. Cada uno agrupa pantallas como pestañas;
 * el menú no crece aunque el producto crezca.
 */
export function secciones(herramientas: Herramienta[]): Seccion[] {
  const agenda = herramientas.includes("agendar");
  const pedidos = herramientas.includes("pedido");
  const recados = herramientas.includes("recado");

  const hoy: Pestana[] = [{ href: "/hoy", nombre: "Hoy" }];
  if (agenda) hoy.push({ href: "/agenda", nombre: "Agenda" });
  if (pedidos) hoy.push({ href: "/pedidos", nombre: "Pedidos" });

  const mensajes: Pestana[] = [{ href: "/bandeja", nombre: "Conversaciones" }];
  if (recados) mensajes.push({ href: "/recados", nombre: "Recados" });

  const clientes: Pestana[] = [
    { href: "/clientes", nombre: "Clientes" },
    { href: "/campanas", nombre: "Campañas" },
  ];

  const dinero: Pestana[] = [];
  if (agenda || pedidos) dinero.push({ href: "/cobros", nombre: "Cobros" });
  dinero.push({ href: "/resumen", nombre: "Informe" });

  const ajustes: Pestana[] = [{ href: "/agente", nombre: "Negocio y agente" }];
  if (agenda || pedidos) ajustes.push({ href: "/horarios", nombre: "Horarios" });
  ajustes.push({ href: "/whatsapp", nombre: "WhatsApp" }, { href: "/pagos", nombre: "Pagos" });
  if (agenda) ajustes.push({ href: "/servicios", nombre: "Servicios" }, { href: "/equipo", nombre: "Equipo" });
  ajustes.push(
    { href: "/catalogo", nombre: "Catálogo" },
    { href: "/conocimiento", nombre: "Respuestas" },
    { href: "/mensajes", nombre: "Avisos" },
    { href: "/probar", nombre: "Probar" },
  );

  return [
    { href: "/hoy", nombre: "Hoy", detalle: "Lo que pasa ahora", pestanas: hoy },
    { href: "/bandeja", nombre: "Mensajes", detalle: "Lo que te dijeron", pestanas: mensajes },
    { href: "/clientes", nombre: "Clientes", detalle: "Quién es quién", pestanas: clientes },
    { href: dinero[0]!.href, nombre: "Dinero", detalle: "Lo que entra", pestanas: dinero },
    { href: "/agente", nombre: "Ajustes", detalle: "Cómo trabaja el negocio", pestanas: ajustes },
  ];
}

/** La sección a la que pertenece una ruta, para el menú y las pestañas. */
export function seccionDe(herramientas: Herramienta[], ruta: string): Seccion | undefined {
  return secciones(herramientas).find((s) => s.pestanas.some((p) => ruta === p.href || ruta.startsWith(`${p.href}/`)));
}

export function rutasPanel(herramientas: Herramienta[]): string[] {
  return secciones(herramientas).flatMap((s) => s.pestanas.map((p) => p.href));
}

export function permiteSeccion(herramientas: Herramienta[], href: string): boolean {
  return rutasPanel(herramientas).includes(href);
}

export const HERRAMIENTAS_POR_DEFECTO: Herramienta[] = ["agendar", "recado"];
