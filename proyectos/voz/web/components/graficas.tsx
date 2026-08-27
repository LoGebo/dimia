"use client";

import { useState } from "react";
import type { LlamadasPorDia, LlamadaPorHora, MotivoEscalamiento } from "@/lib/consultas";
import { DIAS_CORTOS } from "@/lib/tipos";

function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {series.map((s) => (
        <span key={s.nombre} className="flex items-center gap-1.5 text-[11px] text-tinta-2">
          <span className="h-2 w-2" style={{ background: s.color }} />
          {s.nombre}
        </span>
      ))}
    </div>
  );
}

export function GraficaLlamadas({ datos }: { datos: LlamadasPorDia[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const maximo = Math.max(1, ...datos.map((d) => d.total));
  const marcas = [0, Math.round(maximo / 2), maximo];

  return (
    <div className="px-4 pb-4 pt-3">
      <Leyenda
        series={[
          { nombre: "Resueltas por el agente", color: "var(--serie-1)" },
          { nombre: "Escaladas a una persona", color: "var(--serie-2)" },
        ]}
      />
      <div className="relative mt-4 flex gap-3">
        <div className="numeros flex h-[168px] w-7 flex-col justify-between text-right text-[10px] text-tinta-3">
          {[...marcas].reverse().map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-0 flex flex-col justify-between">
            {marcas.map((m) => (
              <div key={m} className="border-t border-linea" />
            ))}
          </div>
          <div className="relative flex h-[168px] items-end gap-[3px]">
            {datos.map((d, i) => {
              const resueltas = (d.resueltas / maximo) * 100;
              const escaladas = (d.escaladas / maximo) * 100;
              const otras = ((d.total - d.resueltas - d.escaladas) / maximo) * 100;
              return (
                <button
                  key={d.dia}
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                  onFocus={() => setActivo(i)}
                  onBlur={() => setActivo(null)}
                  className="group relative flex h-full flex-1 cursor-default flex-col justify-end outline-none"
                  aria-label={`${d.dia}: ${d.total} llamadas`}
                >
                  <span
                    className="absolute inset-0 transition group-hover:bg-tinta/[0.04] group-focus:bg-tinta/[0.04]"
                  />
                  <span
                    className="relative w-full"
                    style={{ height: `${escaladas}%`, background: "var(--serie-2)" }}
                  />
                  <span
                    className="relative w-full"
                    style={{
                      height: `${otras}%`,
                      background: "var(--linea-fuerte)",
                      marginTop: otras > 0 && escaladas > 0 ? 2 : 0,
                    }}
                  />
                  <span
                    className="relative w-full"
                    style={{
                      height: `${resueltas}%`,
                      background: "var(--serie-1)",
                      borderRadius: escaladas + otras === 0 ? "4px 4px 0 0" : 0,
                      marginTop: resueltas > 0 && escaladas + otras > 0 ? 2 : 0,
                    }}
                  />
                </button>
              );
            })}
          </div>
          {activo !== null && datos[activo] ? (
            <Globo
              indice={activo}
              total={datos.length}
              titulo={etiquetaFecha(datos[activo]!.dia)}
              filas={[
                ["Llamadas", datos[activo]!.total],
                ["Resueltas", datos[activo]!.resueltas],
                ["Escaladas", datos[activo]!.escaladas],
              ]}
            />
          ) : null}
          <div className="mt-1.5 flex gap-[3px]">
            {datos.map((d, i) => (
              <span key={d.dia} className="flex-1 text-center text-[10px] text-tinta-3">
                {i % Math.ceil(datos.length / 8) === 0 ? etiquetaDia(d.dia) : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Globo({
  indice,
  total,
  titulo,
  filas,
}: {
  indice: number;
  total: number;
  titulo: string;
  filas: [string, number][];
}) {
  const izquierda = ((indice + 0.5) / total) * 100;
  return (
    <div
      className="pointer-events-none absolute -top-2 z-10 w-max -translate-x-1/2 border border-linea bg-panel px-2.5 py-1.5"
      style={{ left: `${Math.min(88, Math.max(12, izquierda))}%` }}
    >
      <p className="text-[11px] font-medium text-tinta">{titulo}</p>
      {filas.map(([nombre, valor]) => (
        <p key={nombre} className="numeros text-[11px] text-tinta-2">
          {nombre}: <span className="font-medium text-tinta">{valor}</span>
        </p>
      ))}
    </div>
  );
}

function etiquetaFecha(dia: string): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(fecha);
}

function etiquetaDia(dia: string): string {
  const fecha = new Date(`${dia}T12:00:00Z`);
  return `${fecha.getUTCDate()}`;
}

export function GraficaMotivos({ datos }: { datos: MotivoEscalamiento[] }) {
  const maximo = Math.max(1, ...datos.map((d) => d.total));
  return (
    <ul className="space-y-2.5 px-4 py-4">
      {datos.map((d) => (
        <li key={d.motivo}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[12px] text-tinta-2">{d.motivo}</span>
            <span className="numeros text-[12px] font-medium text-tinta">{d.total}</span>
          </div>
          <div className="mt-1 h-1.5 bg-linea">
            <div
              className="h-1.5"
              style={{ width: `${(d.total / maximo) * 100}%`, background: "var(--serie-2)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GraficaHoras({ datos }: { datos: LlamadaPorHora[] }) {
  const porHora = new Map(datos.map((d) => [d.hora, d.total]));
  const horas = Array.from({ length: 16 }, (_, i) => i + 7);
  const maximo = Math.max(1, ...datos.map((d) => d.total));
  return (
    <div className="px-4 py-4">
      <div className="flex h-[92px] items-end gap-[3px]">
        {horas.map((h) => {
          const valor = porHora.get(h) ?? 0;
          return (
            <div key={h} className="group relative flex-1" title={`${h}:00 — ${valor} llamadas`}>
              <div
                className="w-full"
                style={{
                  height: `${Math.max(2, (valor / maximo) * 92)}px`,
                  background: valor === 0 ? "var(--linea)" : "var(--serie-1)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px]">
        {horas.map((h) => (
          <span key={h} className="numeros flex-1 text-center text-[10px] text-tinta-3">
            {h % 3 === 0 ? h : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OcupacionSemanal({ conteos }: { conteos: number[] }) {
  const maximo = Math.max(1, ...conteos);
  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden border border-linea bg-linea">
      {conteos.map((n, i) => (
        <div key={DIAS_CORTOS[i]} className="bg-panel px-2 py-2 text-center">
          <p className="text-[10px] text-tinta-3">{DIAS_CORTOS[i]}</p>
          <p className="numeros mt-1 text-[15px] font-semibold text-tinta">{n}</p>
          <div className="mx-auto mt-1.5 h-1 w-full bg-linea">
            <div
              className="h-1"
              style={{ width: `${(n / maximo) * 100}%`, background: "var(--serie-3)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
