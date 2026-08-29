"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarHorario, type ReglaNueva } from "@/lib/acciones";
import { MarcaExito, useAvisos } from "@/components/kit";
import { Aviso, Boton, Selector } from "@/components/ui/primitivos";
import { horaHablada, horaDeMinutos, minutosDeHora } from "@/lib/formato";
import { DIAS_CORTOS, type Recurso, type Regla } from "@/lib/tipos";

const INICIO_HABITUAL = 6 * 60;
const FIN_MIN = 24 * 60;
const PASO = 30;

type Pincel = "disponible" | "bloqueo" | "borrar";
type Celda = "disponible" | "bloqueo" | null;
type Rejilla = Record<string, Celda[][]>;

const GLOBAL = "negocio";

/** La rejilla arranca a las 6, o antes si alguna regla ya empieza antes: nada se recorta al guardar. */
function inicioDe(reglas: Regla[]): number {
  const minimo = Math.min(INICIO_HABITUAL, ...reglas.filter((r) => r.dia_semana !== null).map((r) => minutosDeHora(r.hora_inicio)));
  return Math.floor(minimo / 60) * 60;
}

function rejillaVacia(filas: number): Celda[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: filas }, () => null as Celda));
}

function desdeReglas(reglas: Regla[], claves: string[], inicio: number): Rejilla {
  const FILAS = (FIN_MIN - inicio) / PASO;
  const rejilla: Rejilla = {};
  for (const clave of claves) rejilla[clave] = rejillaVacia(FILAS);

  const recurrentes = reglas.filter((r) => r.dia_semana !== null && r.tipo !== "festivo");
  for (const orden of ["disponible", "bloqueo"] as const) {
    for (const regla of recurrentes.filter((r) => r.tipo === orden)) {
      const clave = regla.resource_id ?? GLOBAL;
      const celdas = rejilla[clave];
      const dia = celdas?.[regla.dia_semana!];
      if (!dia) continue;
      const desde = Math.max(0, (minutosDeHora(regla.hora_inicio) - inicio) / PASO);
      const hasta = Math.min(FILAS, (minutosDeHora(regla.hora_fin) - inicio) / PASO);
      for (let i = Math.floor(desde); i < Math.ceil(hasta); i++) dia[i] = orden;
    }
  }
  return rejilla;
}

function haciaReglas(rejilla: Rejilla, inicio: number): ReglaNueva[] {
  const salida: ReglaNueva[] = [];
  for (const [clave, dias] of Object.entries(rejilla)) {
    const resource_id = clave === GLOBAL ? null : clave;
    dias.forEach((celdas, dia_semana) => {
      const FILAS = celdas.length;
      let cursor = 0;
      while (cursor < FILAS) {
        const valor = celdas[cursor];
        if (!valor) {
          cursor++;
          continue;
        }
        let fin = cursor;
        while (fin < FILAS && celdas[fin] === valor) fin++;
        salida.push({
          resource_id,
          tipo: valor,
          dia_semana,
          fecha: null,
          hora_inicio: horaDeMinutos(inicio + cursor * PASO),
          hora_fin: horaDeMinutos(inicio + fin * PASO),
        });
        cursor = fin;
      }
      const abierto = celdas.some((c) => c === "disponible");
      if (!abierto && resource_id === null) {
        salida.push({
          resource_id: null,
          tipo: "festivo",
          dia_semana,
          fecha: null,
          hora_inicio: "00:00",
          hora_fin: "23:59",
        });
      }
    });
  }
  return salida;
}

const COLOR: Record<NonNullable<Celda>, string> = {
  disponible: "bg-acento",
  bloqueo: "bg-serie-2",
};

export function EditorHorario({ reglas, recursos }: { reglas: Regla[]; recursos: Recurso[] }) {
  const router = useRouter();
  const { avisar } = useAvisos();
  const claves = useMemo(() => [GLOBAL, ...recursos.map((r) => r.id)], [recursos]);
  const inicio = useMemo(() => inicioDe(reglas), [reglas]);
  const FILAS = (FIN_MIN - inicio) / PASO;
  const [rejilla, setRejilla] = useState<Rejilla>(() => desdeReglas(reglas, claves, inicio));
  const [alcance, setAlcance] = useState<string>(GLOBAL);
  const [pincel, setPincel] = useState<Pincel>("disponible");
  const [pintando, setPintando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [mensaje, setMensaje] = useState<{ tono: "ok" | "error"; texto: string; vez: number } | null>(null);
  const [guardando, iniciar] = useTransition();

  const celdas = rejilla[alcance] ?? rejillaVacia(FILAS);

  function pintar(dia: number, fila: number) {
    setRejilla((previa) => {
      const copia: Rejilla = { ...previa };
      const dias = (copia[alcance] ?? rejillaVacia(FILAS)).map((d) => [...d]);
      const columna = dias[dia];
      if (!columna) return previa;
      columna[fila] = pincel === "borrar" ? null : pincel;
      copia[alcance] = dias;
      return copia;
    });
    setSucio(true);
    setMensaje(null);
  }

  function aplicarATodos(dia: number) {
    setRejilla((previa) => {
      const dias = (previa[alcance] ?? rejillaVacia(FILAS)).map((d) => [...d]);
      const modelo = dias[dia];
      if (!modelo) return previa;
      for (let i = 0; i < 5; i++) dias[i] = [...modelo];
      return { ...previa, [alcance]: dias };
    });
    setSucio(true);
  }

  function preajuste(desde: number, hasta: number, diasHabiles: number) {
    setRejilla((previa) => {
      const dias = rejillaVacia(FILAS);
      for (let d = 0; d < diasHabiles; d++) {
        const columna = dias[d]!;
        for (let i = (desde * 60 - inicio) / PASO; i < (hasta * 60 - inicio) / PASO; i++) {
          columna[i] = "disponible";
        }
      }
      return { ...previa, [alcance]: dias };
    });
    setSucio(true);
  }

  function guardar() {
    iniciar(async () => {
      const resultado = await guardarHorario(haciaReglas(rejilla, inicio), recursos.map((r) => r.id));
      if (resultado.error) {
        setMensaje({ tono: "error", texto: resultado.error, vez: Date.now() });
        return;
      }
      if (resultado.ok) {
        setMensaje({ tono: "ok", texto: resultado.ok, vez: Date.now() });
        avisar({ titulo: resultado.ok, detalle: `${totalHoras.toFixed(1)} h por semana`, tono: "bueno" });
      }
      setSucio(false);
      router.refresh();
    });
  }

  const totalHoras = celdas
    .map((dia) => dia.filter((c) => c === "disponible").length * (PASO / 60))
    .reduce((a, b) => a + b, 0);

  return (
    <div onMouseUp={() => setPintando(false)} onMouseLeave={() => setPintando(false)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-linea px-4 py-2.5">
        <Selector value={alcance} onChange={(e) => setAlcance(e.target.value)} className="w-auto">
          <option value={GLOBAL}>Todo el negocio</option>
          {recursos.map((r) => (
            <option key={r.id} value={r.id}>
              Solo {r.nombre}
            </option>
          ))}
        </Selector>
        <div role="group" aria-label="Pincel" className="flex border border-linea">
          {(
            [
              ["disponible", "Abierto"],
              ["bloqueo", "Bloqueo"],
              ["borrar", "Borrar"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              type="button"
              aria-pressed={pincel === valor}
              onClick={() => setPincel(valor)}
              className={`flex h-[30px] items-center gap-1.5 px-2.5 text-xs transition-colors duration-150 ${
                pincel === valor ? "bg-acento-suave font-medium text-acento" : "bg-panel text-tinta-2 hover:bg-panel-2"
              }`}
            >
              <span
                className={`h-2 w-2 ${
                  valor === "disponible" ? "bg-acento" : valor === "bloqueo" ? "bg-serie-2" : "border border-linea-fuerte"
                }`}
              />
              {etiqueta}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <Boton onClick={() => preajuste(9, 19, 5)}>9–19 L-V</Boton>
          <Boton onClick={() => preajuste(13, 23, 6)}>13–23 L-S</Boton>
        </div>
        <span className="numeros ml-auto text-xs text-tinta-3">
          <span className="text-tinta">{totalHoras.toFixed(1)}</span> h por semana
        </span>
        {mensaje?.tono === "ok" && !sucio ? <MarcaExito key={mensaje.vez} tamano={16} /> : null}
        {sucio ? (
          <span className="flex items-center gap-1.5 text-[10px] tracking-[0.16em] text-alerta uppercase">
            <i aria-hidden="true" className="late h-1.5 w-1.5 bg-current" />
            Sin guardar
          </span>
        ) : null}
        <Boton variante="solido" onClick={guardar} disabled={!sucio || guardando} aria-busy={guardando}>
          {guardando ? <i aria-hidden="true" className="late h-1.5 w-1.5 bg-current" /> : null}
          {guardando ? "Guardando…" : "Guardar horario"}
        </Boton>
      </div>

      {mensaje?.tono === "error" ? (
        <div className="px-4 pt-3">
          <Aviso tono="error">{mensaje.texto}</Aviso>
        </div>
      ) : null}

      <div className="overflow-x-auto px-4 py-4">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[46px_repeat(7,1fr)] gap-x-1">
            <span />
            {DIAS_CORTOS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => aplicarATodos(i)}
                title="Copiar este día a lunes-viernes"
                className="pb-1.5 text-center text-[11px] font-medium text-tinta-2 transition-colors duration-150 hover:text-acento"
              >
                {d}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[46px_repeat(7,1fr)] gap-x-1 select-none">
            <div className="relative">
              {Array.from({ length: FILAS }).map((_, fila) =>
                fila % 2 === 0 ? (
                  <div key={fila} className="numeros h-[13px] text-right text-[10px] leading-[13px] text-tinta-3">
                    {horaHablada(inicio + fila * PASO)}
                  </div>
                ) : (
                  <div key={fila} className="h-[13px]" />
                ),
              )}
            </div>
            {celdas.map((dia, indiceDia) => (
              <div key={indiceDia} className="overflow-hidden border border-linea">
                {dia.map((celda, fila) => (
                  <div
                    key={fila}
                    role="gridcell"
                    aria-label={`${DIAS_CORTOS[indiceDia]} ${horaDeMinutos(inicio + fila * PASO)}`}
                    onMouseDown={() => {
                      setPintando(true);
                      pintar(indiceDia, fila);
                    }}
                    onMouseEnter={() => pintando && pintar(indiceDia, fila)}
                    className={`h-[13px] cursor-crosshair border-b transition-colors duration-150 ${
                      celda ? "border-transparent" : fila % 2 === 1 ? "border-linea" : "border-transparent"
                    } ${celda ? COLOR[celda] : "bg-panel-2 hover:bg-linea"}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="border-t border-linea px-4 py-2.5 text-[11px] text-tinta-3">
        Arrastra para pintar. Azul es horario abierto; latón es un bloqueo dentro del horario (comida, junta). Un día sin
        azul queda cerrado. Haz clic en el nombre del día para copiarlo a toda la semana laboral.
      </p>
    </div>
  );
}
