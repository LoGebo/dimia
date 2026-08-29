import { headers } from "next/headers";
import { Encabezado } from "@/components/encabezado";
import { TarjetaPasarela } from "@/components/pasarela";
import { datos } from "@/lib/sesion";
import { contexto } from "@/lib/sesion";
import { PROVEEDORES, urlWebhook, type Proveedor } from "@/lib/pagos";

export const metadata = { title: "Pagos" };

type Fila = { proveedor: Proveedor; activo: boolean; credenciales: Record<string, string>; config: Record<string, string>; actualizado: string };

/**
 * Ajustes → Pagos: conectar las pasarelas y terminales del negocio. Cada
 * tarjeta guarda sus llaves, prueba la conexión y, si hay terminales, deja
 * elegir la predeterminada.
 */
export default async function Pagos() {
  const { negocioId } = await contexto();
  const filas = await datos((q, id) =>
    q<Fila>(`select proveedor, activo, credenciales, config, actualizado from integracion where tenant_id = $1`, [id]),
  );
  const h = await headers();
  const origen = process.env.PANEL_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"}`;

  return (
    <>
      <Encabezado
        titulo="Pagos"
        descripcion="Conecta la terminal o la pasarela que ya usas; cada cobro se registra solo y el agente puede mandar enlaces de pago."
      />
      <div className="grid gap-4 xl:grid-cols-3">
        {PROVEEDORES.map((p) => {
          const f = filas.find((x) => x.proveedor === p);
          return (
            <TarjetaPasarela
              key={p}
              proveedor={p}
              activo={!!f?.activo}
              guardadas={Object.keys(f?.credenciales ?? {})}
              terminalPredeterminada={f?.config.terminal ?? ""}
              webhook={urlWebhook(origen, p, negocioId)}
            />
          );
        })}
      </div>
    </>
  );
}
