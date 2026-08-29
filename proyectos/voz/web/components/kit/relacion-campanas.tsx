"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Formulario } from "@/components/formulario";
import { FilaTarea, FilasTarea, MarcaExito, TablaRegistros, TarjetaInsight, useAvisos, type Columna, type EstadoTarea, type Filtro, type Insight } from "@/components/kit";
import { Boton } from "@/components/ui/primitivos";
import { cambiarEstadoCampana, excluirContacto } from "@/lib/acciones";
import { fechaCorta, hora, telefono } from "@/lib/formato";
import { NOMBRE_ESTADO_CONTACTO, NOMBRE_TIPO_CAMPANA, type Campana, type CampanaContacto, type EstadoContacto } from "@/lib/tipos";

type TonoFila = "pendiente" | "en-curso" | "hecho" | "pausa";

const CUADRO: Record<TonoFila, string> = {
  pendiente: "bg-tinta-3",
  "en-curso": "late bg-acento",
  hecho: "bg-bueno",
  pausa: "bg-alerta",
};

const ROTULO: Record<Campana["estado"], { texto: string; tono: TonoFila; clase: string }> = {
  borrador: { texto: "Borrador", tono: "pendiente", clase: "text-tinta-3" },
  activa: { texto: "Activa", tono: "en-curso", clase: "text-acento" },
  pausada: { texto: "Pausada", tono: "pausa", clase: "text-alerta" },
  terminada: { texto: "Terminada", tono: "hecho", clase: "text-bueno" },
};

/** Lista de campañas con el patrón de Task Rows: filete entre filas y rótulo mono arriba. */
export function FilasCampana({ children, rotulo, conteo }: { children: ReactNode; rotulo: string; conteo?: number }) {
  return (
    <div className="border border-linea bg-panel">
      <p className="flex items-baseline gap-2 border-b border-linea px-4 py-2">
        <span className="text-[13px] font-medium text-tinta">{rotulo}</span>
        {conteo !== undefined ? <span className="numeros font-mono text-[11px] text-tinta-3">{conteo}</span> : null}
      </p>
      <ul className="divide-y divide-linea">{children}</ul>
    </div>
  );
}

/**
 * Una campaña como tarea en curso: cuadrado de estado, avance, rótulo y
 * acciones; se despliega para ver qué pasó con cada tramo de personas.
 */
export function FilaCampana({ campana: c, zona }: { campana: Campana; zona: string }) {
  const [abierta, setAbierta] = useState(false);
  const r = ROTULO[c.estado];
  const hechas = c.total - c.pendientes;
  const avance = c.total > 0 ? Math.round((hechas / c.total) * 100) : 0;
  const pasos: { texto: string; dato: number; tono?: string }[] = [
    { texto: "Contactadas", dato: c.enviados },
    { texto: "Contestaron", dato: c.contestados, tono: "text-bueno" },
    { texto: "Agendaron", dato: c.agendaron, tono: "text-bueno" },
    { texto: "Sin respuesta", dato: c.sin_respuesta, tono: "text-alerta" },
    { texto: "Fallaron", dato: c.fallidos, tono: "text-critico" },
    { texto: "Por contactar", dato: c.pendientes },
  ];

  return (
    <li className="transition-colors duration-150 hover:bg-panel-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-label={abierta ? "Ocultar detalle" : "Ver detalle"}
          className="flex h-6 w-6 flex-none items-center justify-center text-tinta-3 transition-colors duration-150 hover:text-tinta"
        >
          <i aria-hidden="true" className={`h-1.5 w-1.5 ${CUADRO[r.tono]}`} />
        </button>
        <div className="min-w-[200px] flex-1">
          <Link href={`/campanas/${c.id}`} className="text-[13px] font-medium text-tinta transition-colors duration-150 hover:text-acento">
            {c.nombre}
          </Link>
          <p className="text-[11.5px] text-tinta-3">
            {NOMBRE_TIPO_CAMPANA[c.tipo].nombre} · {c.canal === "llamada" ? "llamada" : "WhatsApp"} · {fechaCorta(c.creado, zona)}
          </p>
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <div className="h-[3px] flex-1 bg-linea" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}>
            <div className="kit-barra h-full bg-acento" style={{ width: `${avance}%`, transitionDuration: "600ms" }} />
          </div>
          <span className="numeros w-14 text-right font-mono text-[11px] text-tinta-2">
            {hechas}/{c.total}
          </span>
        </div>
        <div className="numeros hidden gap-3 font-mono text-[11px] md:flex">
          <span className="text-tinta-2">{c.contestados} contestaron</span>
          <span className={c.agendaron > 0 ? "text-bueno" : "text-tinta-3"}>{c.agendaron} agendaron</span>
        </div>
        <span className={`w-20 text-right text-[12px] ${r.clase}`}>{r.texto}</span>
        <div className="flex w-[84px] justify-end gap-1">
          {c.estado === "borrador" || c.estado === "pausada" ? (
            <Formulario accion={cambiarEstadoCampana}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="estado" value="activa" />
              <Boton variante="solido" className="!h-7">Activar</Boton>
            </Formulario>
          ) : null}
          {c.estado === "activa" ? (
            <Formulario accion={cambiarEstadoCampana}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="estado" value="pausada" />
              <Boton variante="fantasma" className="!h-7">Pausar</Boton>
            </Formulario>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setAbierta((v) => !v)}
          aria-expanded={abierta}
          aria-label={abierta ? "Ocultar detalle" : "Ver detalle"}
          className={`font-mono text-[11px] text-tinta-3 transition-transform duration-150 ${abierta ? "rotate-90" : ""}`}
        >
          ›
        </button>
      </div>
      <div
        className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
        style={{ gridTemplateRows: abierta ? "1fr" : "0fr", opacity: abierta ? 1 : 0 }}
      >
        <div className="overflow-hidden">
          <ul className="mb-3 ml-[26px] grid gap-x-6 border-l border-linea pl-4 sm:grid-cols-2 lg:grid-cols-3">
            {pasos.map((p) => (
              <li key={p.texto} className="flex items-center justify-between gap-3 py-1 text-[12px] text-tinta-2">
                <span>{p.texto}</span>
                <span className={`numeros font-mono text-[11.5px] ${p.dato > 0 && p.tono ? p.tono : "text-tinta-3"}`}>{p.dato}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

const TONO_CONTACTO: Record<EstadoContacto, { cuadro: string; texto: string }> = {
  pendiente: { cuadro: "bg-tinta-3", texto: "text-tinta-3" },
  en_curso: { cuadro: "late bg-acento", texto: "text-acento" },
  enviado: { cuadro: "bg-acento", texto: "text-acento" },
  contestado: { cuadro: "bg-bueno", texto: "text-bueno" },
  agendo: { cuadro: "bg-bueno", texto: "text-bueno" },
  sin_respuesta: { cuadro: "bg-alerta", texto: "text-alerta" },
  rechazo: { cuadro: "bg-alerta", texto: "text-alerta" },
  fallido: { cuadro: "bg-critico", texto: "text-critico" },
  excluido: { cuadro: "bg-linea-fuerte", texto: "text-tinta-3" },
};

export function EstadoContactoRotulo({ estado }: { estado: EstadoContacto }) {
  const t = TONO_CONTACTO[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] ${t.texto}`}>
      <i aria-hidden="true" className={`h-1.5 w-1.5 ${t.cuadro}`} />
      {NOMBRE_ESTADO_CONTACTO[estado]}
    </span>
  );
}

/** Las personas de una campaña: orden, filtro por lo que pasó y «Excluir» sin salir de la tabla. */
export function TablaContactos({ contactos, zona }: { contactos: CampanaContacto[]; zona: string }) {
  const columnas: Columna<CampanaContacto>[] = [
    {
      clave: "persona",
      titulo: "Persona",
      valor: (p) => p.cliente_nombre ?? "",
      render: (p) => (
        <span className="flex flex-col leading-tight">
          <Link href={`/clientes/${p.cliente_id}`} className="font-medium text-tinta transition-colors duration-150 hover:text-acento">
            {p.cliente_nombre ?? "Sin nombre"}
          </Link>
          <span className="numeros font-mono text-[11px] text-tinta-3">{p.cliente_telefono ? telefono(p.cliente_telefono) : "—"}</span>
        </span>
      ),
    },
    {
      clave: "resultado",
      titulo: "Qué dijo",
      valor: (p) => p.resultado ?? "",
      render: (p) => (
        <span className="block max-w-[360px] truncate text-[12px] text-tinta-2" title={p.resultado ?? ""}>
          {p.resultado ?? ""}
        </span>
      ),
    },
    {
      clave: "intento",
      titulo: "Último intento",
      ancho: "150px",
      valor: (p) => p.ultimo_intento ?? "",
      render: (p) => (
        <span className="numeros font-mono text-[11.5px] text-tinta-3">
          {p.ultimo_intento ? `${fechaCorta(p.ultimo_intento, zona)} ${hora(p.ultimo_intento, zona)}` : `intento ${p.intentos}`}
        </span>
      ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      ancho: "150px",
      valor: (p) => NOMBRE_ESTADO_CONTACTO[p.estado],
      render: (p) => <EstadoContactoRotulo estado={p.estado} />,
    },
    {
      clave: "accion",
      titulo: "",
      ancho: "80px",
      render: (p) =>
        p.estado === "pendiente" || p.estado === "sin_respuesta" ? (
          <Formulario accion={excluirContacto}>
            <input type="hidden" name="id" value={p.id} />
            <button className="h-7 px-2 text-[12px] text-tinta-3 transition-colors duration-150 hover:text-critico">Excluir</button>
          </Formulario>
        ) : null,
    },
  ];

  const filtros: Filtro<CampanaContacto>[] = [
    { clave: "pendientes", nombre: "Por contactar", pasa: (p) => p.estado === "pendiente" || p.estado === "en_curso" || p.estado === "enviado" },
    { clave: "contestaron", nombre: "Contestaron", tono: "bueno", pasa: (p) => p.estado === "contestado" || p.estado === "agendo" },
    { clave: "agendaron", nombre: "Agendaron", tono: "bueno", pasa: (p) => p.estado === "agendo" },
    { clave: "sin", nombre: "Sin respuesta", tono: "alerta", pasa: (p) => p.estado === "sin_respuesta" },
    { clave: "no", nombre: "No quisieron o falló", tono: "alerta", pasa: (p) => p.estado === "rechazo" || p.estado === "fallido" },
  ];

  return (
    <TablaRegistros<CampanaContacto>
      columnas={columnas}
      filas={contactos}
      clave={(p) => p.id}
      filtros={filtros}
      ordenInicial={{ clave: "intento", dir: "desc" }}
      vacio={{ titulo: "Nadie todavía", detalle: "Agrega personas desde la derecha o cambia el criterio de la campaña." }}
      className="border-0"
    />
  );
}

/** El avance de la campaña como tareas: cada tramo con su estado y lo que pasó dentro. */
export function AvanceCampana({ campana: c, zona, rechazos }: { campana: Campana; zona: string; rechazos: number }) {
  const contactadas = c.enviados;
  const porContactar = c.pendientes;
  const activa = c.estado === "activa";
  const estadoContacto: EstadoTarea = porContactar === 0 && c.total > 0 ? "hecho" : activa ? "en-curso" : "pendiente";
  const estadoRespuesta: EstadoTarea = c.contestados > 0 ? "hecho" : contactadas > 0 ? (activa ? "en-curso" : "pendiente") : "pendiente";
  const estadoCitas: EstadoTarea = c.agendaron > 0 ? "hecho" : c.contestados > 0 ? (activa ? "en-curso" : "pendiente") : "pendiente";
  const estadoFallos: EstadoTarea = c.fallidos > 0 ? "fallo" : "hecho";
  return (
    <FilasTarea rotulo="Avance">
      <FilaTarea
        estado={c.total > 0 ? "hecho" : "pendiente"}
        titulo="Personas en la lista"
        dato={String(c.total)}
        pasos={[
          { texto: "Criterio", dato: NOMBRE_TIPO_CAMPANA[c.tipo].nombre },
          { texto: "Creada", dato: fechaCorta(c.creado, zona) },
        ]}
      />
      <FilaTarea
        estado={estadoContacto}
        titulo={c.canal === "llamada" ? "Marcar a cada una" : "Mandar el mensaje"}
        dato={`${contactadas} de ${c.total}`}
        pasos={[
          { texto: "Por contactar", dato: String(porContactar) },
          { texto: "Ventana", dato: `${c.ventana_inicio.slice(0, 5)}–${c.ventana_fin.slice(0, 5)}` },
          { texto: "Intentos por persona", dato: String(c.max_intentos) },
        ]}
      />
      <FilaTarea
        estado={estadoRespuesta}
        titulo="Respuestas"
        dato={`${c.contestados} de ${contactadas}`}
        pasos={[
          { texto: "Sin respuesta", dato: String(c.sin_respuesta) },
          { texto: "Se reintenta", dato: "al día siguiente" },
        ]}
      />
      <FilaTarea estado={estadoCitas} titulo="Citas agendadas" dato={String(c.agendaron)} />
      {c.fallidos > 0 || rechazos > 0 ? (
        <FilaTarea
          estado={estadoFallos}
          titulo="No se pudo contactar o no quisieron"
          dato={String(c.fallidos + rechazos)}
          pasos={[
            { texto: "Falló el contacto", dato: String(c.fallidos) },
            { texto: "Pidieron no volver a llamar", dato: String(rechazos) },
          ]}
        />
      ) : null}
    </FilasTarea>
  );
}

/** Los resultados de una campaña en tres lecturas, con la serie de sus contactos por día. */
export function ResultadosCampana({ campana: c, contactos, zona }: { campana: Campana; contactos: CampanaContacto[]; zona: string }) {
  const porDia = (pasa: (p: CampanaContacto) => boolean) => {
    const cuenta = new Map<string, number>();
    for (const p of contactos) {
      if (!p.ultimo_intento || !pasa(p)) continue;
      const d = fechaCorta(p.ultimo_intento, zona);
      cuenta.set(d, (cuenta.get(d) ?? 0) + 1);
    }
    const dias = Array.from(cuenta.keys());
    let suma = 0;
    const serie = [0, ...dias.map((d) => (suma += cuenta.get(d) ?? 0))];
    return serie.length > 1 ? serie : [0, 0];
  };
  const tasa = c.enviados > 0 ? Math.round((c.contestados / c.enviados) * 100) : 0;
  const insights: Insight[] = [
    {
      id: "agendaron",
      titulo: "Citas que trajo esta campaña",
      cifra: String(c.agendaron),
      unidad: c.agendaron === 1 ? "cita" : "citas",
      variacion: { texto: `${c.contestados} contestaron`, tono: c.contestados > 0 ? "bueno" : "neutro" },
      serie: porDia((p) => p.estado === "agendo"),
      nota: c.agendaron > 0 ? "Cada una se ve en la agenda con el rastro de la campaña." : "Todavía ninguna; el agente sigue en la ventana de horario.",
      accion: c.agendaron > 0 ? { texto: "Ver en la agenda", href: "/agenda" } : undefined,
    },
    {
      id: "respuesta",
      titulo: "De cada 100 personas contactadas, contestaron",
      cifra: String(tasa),
      unidad: "%",
      variacion: { texto: `${c.enviados} contactadas`, tono: "neutro" },
      serie: porDia((p) => p.estado === "contestado" || p.estado === "agendo"),
      nota: c.sin_respuesta > 0 ? `${c.sin_respuesta} sin respuesta; se reintentan al día siguiente.` : "Nadie quedó sin respuesta.",
    },
    {
      id: "pendientes",
      titulo: "Personas que faltan por contactar",
      cifra: String(c.pendientes),
      unidad: c.pendientes === 1 ? "persona" : "personas",
      variacion: { texto: c.estado === "activa" ? "campaña activa" : ROTULO[c.estado].texto.toLowerCase(), tono: c.pendientes > 0 && c.estado === "activa" ? "alerta" : "neutro" },
      serie: porDia(() => true),
      nota: `Sale de ${c.ventana_inicio.slice(0, 5)} a ${c.ventana_fin.slice(0, 5)}, hasta ${c.max_intentos} ${c.max_intentos === 1 ? "intento" : "intentos"} por persona.`,
    },
  ];
  return <TarjetaInsight rotulo="Resultados" insights={insights} />;
}

const LLAVE_CREADA = "campana-creada";

export function recordarCampanaCreada(nombre: string) {
  try {
    sessionStorage.setItem(LLAVE_CREADA, nombre);
  } catch {}
}

/** Al llegar desde «Crear campaña», dibuja la marca de éxito y apila el aviso una sola vez. */
export function MarcaCampanaCreada({ nombre }: { nombre: string }) {
  const { avisar } = useAvisos();
  const [creada, setCreada] = useState(false);
  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = sessionStorage.getItem(LLAVE_CREADA);
      if (guardado !== null) sessionStorage.removeItem(LLAVE_CREADA);
    } catch {}
    if (guardado === null || guardado !== nombre) return;
    setCreada(true);
    avisar({ titulo: "Campaña creada", detalle: `${nombre} · en borrador hasta que la actives`, tono: "bueno" });
  }, [nombre, avisar]);
  if (!creada) return null;
  return <MarcaExito texto="Campaña creada" tamano={18} />;
}

/** Las campañas como tabla de registros: avance, respuesta, citas y estado; se activa o pausa desde la fila. */
export function TablaCampanas({ lista, zona }: { lista: Campana[]; zona: string }) {
  const router = useRouter();
  const columnas: Columna<Campana>[] = [
    {
      clave: "nombre",
      titulo: "Campaña",
      valor: (c) => c.nombre,
      render: (c) => (
        <span className="flex flex-col py-1 leading-tight">
          <Link href={`/campanas/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-tinta transition-colors duration-150 group-hover:text-acento">
            {c.nombre}
          </Link>
          <span className="text-[11.5px] text-tinta-3">
            {NOMBRE_TIPO_CAMPANA[c.tipo].nombre} · {c.canal === "llamada" ? "llamada" : "WhatsApp"}
          </span>
        </span>
      ),
    },
    {
      clave: "avance",
      titulo: "Avance",
      ancho: "220px",
      valor: (c) => (c.total > 0 ? (c.total - c.pendientes) / c.total : 0),
      render: (c) => {
        const hechas = c.total - c.pendientes;
        const avance = c.total > 0 ? Math.round((hechas / c.total) * 100) : 0;
        return (
          <span className="flex items-center gap-3">
            <span className="h-[3px] w-24 bg-linea" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}>
              <span className="block h-full bg-acento" style={{ width: `${avance}%` }} />
            </span>
            <span className="numeros font-mono text-[11.5px] text-tinta-2">
              {hechas}/{c.total}
            </span>
          </span>
        );
      },
    },
    {
      clave: "contestaron",
      titulo: "Contestaron",
      numerica: true,
      ancho: "110px",
      valor: (c) => c.contestados,
      render: (c) => <span className={c.contestados > 0 ? "" : "text-tinta-3"}>{c.contestados}</span>,
    },
    {
      clave: "agendaron",
      titulo: "Agendaron",
      numerica: true,
      ancho: "100px",
      valor: (c) => c.agendaron,
      render: (c) => <span className={c.agendaron > 0 ? "text-bueno" : "text-tinta-3"}>{c.agendaron}</span>,
    },
    {
      clave: "creado",
      titulo: "Creada",
      ancho: "90px",
      valor: (c) => new Date(c.creado).getTime(),
      render: (c) => <span className="numeros font-mono text-[12px] text-tinta-2">{fechaCorta(c.creado, zona)}</span>,
    },
    {
      clave: "estado",
      titulo: "Estado",
      ancho: "110px",
      valor: (c) => ROTULO[c.estado].texto,
      render: (c) => {
        const r = ROTULO[c.estado];
        return (
          <span className={`inline-flex items-center gap-1.5 text-[12px] ${r.clase}`}>
            <i aria-hidden="true" className={`h-1.5 w-1.5 ${CUADRO[r.tono]}`} />
            {r.texto}
          </span>
        );
      },
    },
    {
      clave: "accion",
      titulo: "",
      ancho: "96px",
      render: (c) => (
        <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          {c.estado === "borrador" || c.estado === "pausada" ? (
            <Formulario accion={cambiarEstadoCampana} silencioso>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="estado" value="activa" />
              <Boton variante="solido" className="!h-7">Activar</Boton>
            </Formulario>
          ) : c.estado === "activa" ? (
            <Formulario accion={cambiarEstadoCampana} silencioso>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="estado" value="pausada" />
              <Boton variante="fantasma" className="!h-7">Pausar</Boton>
            </Formulario>
          ) : null}
        </span>
      ),
    },
  ];

  const filtros: Filtro<Campana>[] = (["activa", "borrador", "pausada", "terminada"] as Campana["estado"][])
    .filter((e) => lista.some((c) => c.estado === e))
    .map((e) => ({ clave: e, nombre: ROTULO[e].texto + "s", tono: e === "activa" ? "acento" : e === "pausada" ? "alerta" : e === "terminada" ? "bueno" : "neutro", pasa: (c) => c.estado === e }));

  return (
    <TablaRegistros<Campana>
      columnas={columnas}
      filas={lista}
      clave={(c) => c.id}
      filtros={filtros.length > 1 ? filtros : undefined}
      ordenInicial={{ clave: "creado", dir: "desc" }}
      alClic={(c) => router.push(`/campanas/${c.id}`)}
      vacio={{ titulo: "Todavía no hay campañas", detalle: "La primera que conviene: recuperar a quien faltó a su cita. Toma un minuto crearla." }}
      className="self-start"
    />
  );
}
