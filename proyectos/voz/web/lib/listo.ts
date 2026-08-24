import "server-only";

import { catalogo, faq, negocio, recursos, reglas, servicios } from "@/lib/consultas";
import type { Herramienta } from "@/lib/tipos";

export type Requisito = {
  clave: string;
  nombre: string;
  ayuda: string;
  ruta: string;
  listo: boolean;
};

export type Avance = {
  requisitos: Requisito[];
  cumplidos: number;
  total: number;
  porcentaje: number;
  completo: boolean;
  /** El número solo se activa cuando todo lo demás está en su lugar. */
  puedeActivarLinea: boolean;
  tieneNumero: boolean;
};

/**
 * Qué le falta al negocio para que el agente pueda contestar.
 *
 * Es la única fuente: la barra del panel, la pantalla del agente y el candado
 * del número de entrada leen de aquí. Antes vivía duplicada en dos pantallas y
 * ya habían empezado a divergir.
 */
export async function avance(herramientas: Herramienta[]): Promise<Avance> {
  const [config, listaRecursos, listaServicios, listaReglas, listaFaq, items] = await Promise.all([
    negocio(),
    recursos(),
    servicios(),
    reglas(),
    faq(),
    catalogo(),
  ]);

  const agenda = herramientas.includes("agendar");
  const pedidos = herramientas.includes("pedido");

  const requisitos: Requisito[] = [
    ...(agenda
      ? [
          {
            clave: "recursos",
            nombre: "Recursos",
            ayuda: "Quién o qué atiende: consultorios, mesas, estaciones.",
            ruta: "/servicios",
            listo: listaRecursos.some((r) => r.activo),
          },
          {
            clave: "servicios",
            nombre: "Servicios",
            ayuda: "Qué se agenda y cuánto dura.",
            ruta: "/servicios",
            listo: listaServicios.some((s) => s.activo),
          },
        ]
      : []),
    ...(pedidos
      ? [
          {
            clave: "menu",
            nombre: "Menú con precio",
            ayuda: "De aquí salen los totales de cada pedido.",
            ruta: "/catalogo",
            listo: items.some((i) => i.disponible && i.precio),
          },
        ]
      : []),
    ...(agenda || pedidos
      ? [
          {
            clave: "horario",
            nombre: "Horario",
            ayuda: "Cuándo abres. Sin esto no hay nada que ofrecer.",
            ruta: "/horarios",
            listo: listaReglas.some((r) => r.tipo === "disponible"),
          },
        ]
      : []),
    {
      clave: "respuestas",
      nombre: "Respuestas frecuentes",
      ayuda: "Ubicación, formas de pago, estacionamiento. Mínimo tres.",
      ruta: "/conocimiento",
      listo: listaFaq.length >= 3,
    },
    {
      clave: "transferir",
      nombre: "Número para transferir",
      ayuda: "A dónde pasa la llamada cuando el agente se rinde.",
      ruta: "/agente",
      listo: !!config.telefono_escalamiento,
    },
  ];

  const cumplidos = requisitos.filter((r) => r.listo).length;
  const total = requisitos.length;

  return {
    requisitos,
    cumplidos,
    total,
    porcentaje: total === 0 ? 100 : Math.round((cumplidos / total) * 100),
    completo: cumplidos === total,
    puedeActivarLinea: cumplidos === total,
    tieneNumero: !!config.telefono_entrada,
  };
}
