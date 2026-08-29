"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { apagarIntegracion, guardarIntegracion, guardarTerminalPredeterminada, probarIntegracion, type Estado } from "@/lib/acciones";
import { Aviso, Boton, Campo, Entrada, Insignia, Selector, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { CAMPOS_CREDENCIALES, CAPACIDADES, NOMBRE_PROVEEDOR, type Proveedor, type Terminal } from "@/lib/pagos/tipos";

const inicial: Estado = {};

const DESCRIPCION: Record<Proveedor, string> = {
  mercadopago: "Enlaces de pago y cobros en terminal Point desde el panel.",
  clip: "Enlaces de pago. Los cobros en la terminal Clip se concilian aparte.",
  stripe: "Enlaces de pago con tarjeta, nacional e internacional.",
};

export function TarjetaPasarela({
  proveedor,
  activo,
  guardadas,
  terminalPredeterminada,
  webhook,
}: {
  proveedor: Proveedor;
  activo: boolean;
  guardadas: string[];
  terminalPredeterminada: string;
  webhook: string;
}) {
  const [estado, enviar, enviando] = useActionState(guardarIntegracion, inicial);
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string; terminales?: Terminal[] } | null>(null);
  const [probando, empezar] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const cap = CAPACIDADES[proveedor];

  function probar() {
    empezar(async () => setPrueba(await probarIntegracion(proveedor)));
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(webhook);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  }

  return (
    <Tarjeta className="flex flex-col">
      <TarjetaCabecera
        titulo={NOMBRE_PROVEEDOR[proveedor]}
        descripcion={DESCRIPCION[proveedor]}
        accion={activo ? <Insignia tono="bueno">Conectada</Insignia> : <Insignia>Sin conectar</Insignia>}
      />
      <form action={enviar} className="space-y-3 px-5 py-4">
        <input type="hidden" name="proveedor" value={proveedor} />
        {CAMPOS_CREDENCIALES[proveedor].map((c) => (
          <Campo key={c.clave} etiqueta={c.nombre} ayuda={c.ayuda}>
            <Entrada
              name={c.clave}
              type={c.secreto ? "password" : "text"}
              autoComplete="off"
              placeholder={guardadas.includes(c.clave) ? "••••••••" : ""}
            />
          </Campo>
        ))}
        {estado.error ? <Aviso tono="error">{estado.error}</Aviso> : null}
        {estado.ok ? <Aviso tono="ok">{estado.ok}</Aviso> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Boton type="submit" variante="solido" disabled={enviando}>
            {enviando ? "Guardando…" : activo ? "Actualizar llaves" : "Conectar"}
          </Boton>
          {activo ? (
            <Boton type="button" onClick={probar} disabled={probando}>
              {probando ? "Probando…" : cap.terminal ? "Buscar terminales" : "Probar conexión"}
            </Boton>
          ) : null}
        </div>
      </form>

      {prueba ? (
        <div className="px-5 pb-4">
          <Aviso tono={prueba.ok ? "ok" : "error"}>{prueba.mensaje}</Aviso>
        </div>
      ) : null}

      {cap.terminal && activo ? (
        <form action={guardarTerminalPredeterminada} className="border-t border-linea px-5 py-4">
          <input type="hidden" name="proveedor" value={proveedor} />
          <Campo etiqueta="Terminal predeterminada" ayuda="La que se propone al cobrar. Pulsa «Buscar terminales» para verlas.">
            <div className="flex gap-2">
              <Selector name="terminal" defaultValue={terminalPredeterminada}>
                <option value="">Elegir al cobrar</option>
                {(prueba?.terminales ?? (terminalPredeterminada ? [{ id: terminalPredeterminada, nombre: terminalPredeterminada }] : [])).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </Selector>
              <Boton type="submit">Guardar</Boton>
            </div>
          </Campo>
        </form>
      ) : null}

      <div className="mt-auto border-t border-linea px-5 py-4">
        <p className="text-[13px] font-semibold text-tinta">Webhook</p>
        <p className="mt-0.5 text-[11.5px] text-tinta-3">Pégalo en el panel de {NOMBRE_PROVEEDOR[proveedor]} para que nos avise cada pago.</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="numeros min-w-0 flex-1 truncate rounded-lg border border-linea bg-panel-2 px-2.5 py-1.5 font-mono text-[11.5px] text-tinta-2">{webhook}</code>
          <button
            type="button"
            onClick={copiar}
            aria-label="Copiar webhook"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg border border-linea text-tinta-2 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta"
          >
            {copiado ? <Check size={16} className="text-bueno" /> : <Copy size={16} />}
          </button>
        </div>
        {activo ? (
          <form action={apagarIntegracion} className="mt-3">
            <input type="hidden" name="proveedor" value={proveedor} />
            <button type="submit" className="text-[12px] text-tinta-3 transition-colors duration-150 hover:text-critico">
              Desconectar
            </button>
          </form>
        ) : null}
      </div>
    </Tarjeta>
  );
}
