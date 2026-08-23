"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarHorario, type ReglaNueva } from "@/lib/acciones";
import { Aviso, Boton, Selector } from "@/components/ui/primitivos";
import { horaHablada, horaDeMinutos, minutosDeHora } from "@/lib/formato";
import { DIAS_CORTOS, type Recurso, type Regla } from "@/lib/tipos";

const INICIO_MIN = 6 * 60;
const FIN_MIN = 24 * 60;
const PASO = 30;
const FILAS = (FIN_MIN - INICIO_MIN) / PASO;

type Pincel = "disponible" | "bloqueo" | "borrar";
type Celda = "disponible" | "bloqueo" | null;
type Rejilla = Record<string, Celda[][]>;

const GLOBAL = "negocio";

function rejillaVacia(): Celda[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: FILAS }, () => null as Celda));
}

function desdeReglas(reglas: Regla[], claves: string[]): Rejilla {
  const rejilla: Rejilla = {};
  for (const clave of claves) rejilla[clave] = rejillaVacia();

  const recurrentes = reglas.filter((r) => r.dia_semana !== null && r.tipo !== "festivo");
  for (const orden of ["disponible", "bloqueo"] as const) {
    for (const regla of recurrentes.filter((r) => r.tipo === orden)) {
      const clave = regla.resource_id ?? GLOBAL;
      const celdas = rejilla[clave];
      const dia = celdas?.[regla.dia_semana!];
      if (!dia) continue;
      const desde = Math.max(0, (minutosDeHora(regla.hora_inicio) - INICIO_MIN) / PASO);
      const hasta = Math.min(FILAS, (minutosDeHora(regla.hora_fin) - INICIO_MIN) / PASO);
      for (let i = Math.floor(desde); i < Math.ceil(hasta); i++) dia[i] = orden;
    }
  }
  return rejilla;
}

function haciaReglas(rejilla: Rejilla): ReglaNueva[] {
  const salida: ReglaNueva[] = [];
  for (const [clave, dias] of Object.entries(rejilla)) {
    const resource_id = clave === GLOBAL ? null : clave;
    dias.forEach((celdas, dia_semana) => {
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
          hora_inicio: horaDeMinutos(INICIO_MIN + cursor * PASO),
          hora_fin: horaDeMinutos(INICIO_MIN + fin * PASO),
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
  const claves = useMemo(() => [GLOBAL, ...recursos.map((r) => r.id)], [recursos]);
  const [rejilla, setRejilla] = useState<Rejilla>(() => desdeReglas(reglas, claves));
  const [alcance, setAlcance] = useState<string>(GLOBAL);
  const [pincel, setPincel] = useState<Pincel>("disponible");
  const [pintando, setPintando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  const celdas = rejilla[alcance] ?? rejillaVacia();

  function pintar(dia: number, fila: number) {
    setRejilla((previa) => {
      const copia: Rejilla = { ...previa };
      const dias = (copia[alcance] ?? rejillaVacia()).map((d) => [...d]);
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
      const dias = (previa[alcance] ?? rejillaVacia()).map((d) => [...d]);
      const modelo = dias[dia];
      if (!modelo) return previa;
      for (let i = 0; i < 5; i++) dias[i] = [...modelo];
      return { ...previa, [alcance]: dias };
    });
    setSucio(true);
  }

  function preajuste(desde: number, hasta: number, diasHabiles: number) {
    setRejilla((previa) => {
      const dias = rejillaVacia();
      for (let d = 0; d < diasHabiles; d++) {
        const columna = dias[d]!;
        for (let i = (desde * 60 - INICIO_MIN) / PASO; i < (hasta * 60 - INICIO_MIN) / PASO; i++) {
          columna[i] = "disponible";
        }
      }
      return { ...previa, [alcance]: dias };
    });
    setSucio(true);
  }

  function guardar() {
    iniciar(async () => {
      const resultado = await guardarHorario(haciaReglas(rejilla));
      setMensaje(resultado.ok ?? resultado.error ?? null);
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
        <div className="flex overflow-hidden rounded-md border border-linea">
          {(
            [
              ["disponible", "Abierto"],
              ["bloqueo", "Bloqueo"],
              ["borrar", "Borrar"],
            ] as const
          ).map(([valor, etiqueta]) => (
            <button
              key={valor}
              onClick={() => setPincel(valor)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs transition ${
                pincel === valor ? "bg-acento-suave font-medium text-acento" : "bg-panel text-tinta-2 hover:bg-panel-2"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-sm ${
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
        <span className="numeros ml-auto text-xs text-tinta-3">{totalHoras.toFixed(1)} h por semana</span>
        <Boton variante="solido" onClick={guardar} disabled={!sucio || guardando}>
          {guardando ? "Guardando…" : "Guardar horario"}
        </Boton>
      </div>

      {mensaje ? (
        <div className="px-4 pt-3">
          <Aviso tono="ok">{mensaje}</Aviso>
        </div>
      ) : null}

      <div className="overflow-x-auto px-4 py-4">
        <div className="min-w-[620px]">
          <div className="grid grid-cols-[46px_repeat(7,1fr)] gap-x-1">
            <span />
            {DIAS_CORTOS.map((d, i) => (
              <button
                key={d}
                onClick={() => aplicarATodos(i)}
                title="Copiar este día a lunes-viernes"
                className="pb-1.5 text-center text-[11px] font-medium text-tinta-2 transition hover:text-acento"
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
                    {horaHablada(INICIO_MIN + fila * PASO)}
                  </div>
                ) : (
                  <div key={fila} className="h-[13px]" />
                ),
              )}
            </div>
            {celdas.map((dia, indiceDia) => (
              <div key={indiceDia} className="overflow-hidden rounded border border-linea">
                {dia.map((celda, fila) => (
                  <div
                    key={fila}
                    role="gridcell"
                    aria-label={`${DIAS_CORTOS[indiceDia]} ${horaDeMinutos(INICIO_MIN + fila * PASO)}`}
                    onMouseDown={() => {
                      setPintando(true);
                      pintar(indiceDia, fila);
                    }}
                    onMouseEnter={() => pintando && pintar(indiceDia, fila)}
                    className={`h-[13px] cursor-crosshair border-b transition-colors ${
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
        Arrastra para pintar. Azul es horario abierto; naranja es un bloqueo dentro del horario (comida, junta).
        Un día sin azul queda cerrado. Haz clic en el nombre del día para copiarlo a toda la semana laboral.
      </p>
    </div>
  );
}
