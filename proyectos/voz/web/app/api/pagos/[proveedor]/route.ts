import { NextResponse } from "next/server";
import { elevado } from "@/lib/db";
import { esProveedor, pasarela, type Credenciales } from "@/lib/pagos";

export const dynamic = "force-dynamic";

/**
 * Aquí llegan los avisos de las pasarelas. Se guardan tal cual, se verifica la
 * firma, se confirma el estado con el proveedor y solo entonces se marca el
 * pago. Siempre responde 200 para que la pasarela no reintente en bucle;
 * lo que falle queda en `pago_evento.error`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ proveedor: string }> }) {
  const { proveedor } = await params;
  if (!esProveedor(proveedor)) return NextResponse.json({ ok: false }, { status: 404 });

  const url = new URL(req.url);
  const crudo = await req.text();
  let cuerpo: unknown = {};
  try {
    cuerpo = crudo ? JSON.parse(crudo) : {};
  } catch {}
  const tenantParam = url.searchParams.get("t");

  const eventoId = await elevado(async (q) => {
    const r = await q<{ id: string }>(
      `insert into pago_evento (proveedor, tenant_id, tipo, cuerpo)
       values ($1, $2, $3, $4::jsonb) returning id`,
      [proveedor, tenantParam, tipoDe(cuerpo, url), JSON.stringify(cuerpo)],
    );
    return r[0]!.id;
  });

  try {
    await elevado(async (q) => {
      let tenantId = tenantParam;
      let integracion: { credenciales: Credenciales } | undefined;
      if (tenantId) {
        integracion = (
          await q<{ credenciales: Credenciales }>(
            `select credenciales from integracion where tenant_id = $1 and proveedor = $2 and activo`,
            [tenantId, proveedor],
          )
        )[0];
      }
      // Sin negocio en la URL (Stripe manda a un solo endpoint por cuenta): se busca por el pago referido.
      if (!integracion) {
        const pagoId = pagoIdCrudo(cuerpo);
        if (pagoId) {
          const fila = (
            await q<{ tenant_id: string; credenciales: Credenciales }>(
              `select p.tenant_id, i.credenciales from pago p join integracion i on i.tenant_id = p.tenant_id and i.proveedor = $2 and i.activo
                where p.id = $1`,
              [pagoId, proveedor],
            )
          )[0];
          if (fila) {
            tenantId = fila.tenant_id;
            integracion = fila;
          }
        }
      }
      if (!tenantId || !integracion) throw new Error("negocio sin integración activa");

      const p = pasarela(proveedor);
      if (!p.verificarWebhook(integracion.credenciales, crudo, req.headers, url)) throw new Error("firma inválida");
      const lectura = await p.interpretarWebhook(integracion.credenciales, cuerpo, req.headers, url);
      if (!lectura) {
        await q(`update pago_evento set procesado = true, tenant_id = $2 where id = $1`, [eventoId, tenantId]);
        return;
      }

      if (lectura.estado === "pagado" || lectura.estado === "cancelado") {
        const nuevo = lectura.estado === "pagado" ? "pagado" : "cancelado";
        await q(
          `update pago
              set estado = $3::pago_estado,
                  pagado_en = case when $3 = 'pagado' then coalesce(pagado_en, now()) else pagado_en end,
                  referencia_externa = coalesce($4, referencia_externa),
                  datos = datos || jsonb_build_object('evento', $5::text, 'monto_confirmado', $6::numeric)
            where tenant_id = $1
              and estado = 'pendiente'
              and (id = $2::uuid or referencia_externa = $4 or datos->>'intento' = $4)`,
          [tenantId, lectura.pagoId, nuevo, lectura.referencia, eventoId, lectura.monto ?? null],
        );
      }
      await q(`update pago_evento set procesado = true, tenant_id = $2, referencia = $3 where id = $1`, [eventoId, tenantId, lectura.referencia]);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await elevado((q) => q(`update pago_evento set error = $2 where id = $1`, [eventoId, msg.slice(0, 500)]));
  }

  return NextResponse.json({ ok: true });
}

/** Mercado Pago valida el endpoint con GET al configurarlo. */
export async function GET() {
  return NextResponse.json({ ok: true });
}

function tipoDe(cuerpo: unknown, url: URL): string | null {
  const b = (cuerpo ?? {}) as Record<string, unknown>;
  return (b.type as string) ?? (b.topic as string) ?? (b.action as string) ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? null;
}

function pagoIdCrudo(cuerpo: unknown): string | null {
  const b = (cuerpo ?? {}) as { data?: { object?: { metadata?: { pago_id?: string } } }; metadata?: { external_reference?: string; pago_id?: string }; external_reference?: string };
  const candidato = b.data?.object?.metadata?.pago_id ?? b.metadata?.pago_id ?? b.metadata?.external_reference ?? b.external_reference ?? null;
  return candidato && /^[0-9a-f-]{36}$/i.test(candidato) ? candidato : null;
}
