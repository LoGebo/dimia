import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { usuarioActual } from "@/lib/auth";
import { conSesion } from "@/lib/db";
import { configuracionLivekit, urlHttp, variablesFaltantes } from "@/lib/livekit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(peticion: Request): Promise<NextResponse> {
  const configuracion = configuracionLivekit();
  if (!configuracion) {
    return NextResponse.json(
      { error: "livekit_sin_configurar", faltantes: variablesFaltantes() },
      { status: 503 },
    );
  }

  const usuario = await usuarioActual();
  if (!usuario) return NextResponse.json({ error: "sin_sesion" }, { status: 401 });

  const cuerpo = (await peticion.json().catch(() => ({}))) as { tenant_id?: string };
  const tenantId = cuerpo.tenant_id;
  if (!tenantId) return NextResponse.json({ error: "falta_tenant" }, { status: 400 });

  const membresia = await conSesion(usuario.id, (q) =>
    q<{ nombre: string }>(
      `select t.nombre from tenant_member m join tenant t on t.id = m.tenant_id
        where m.tenant_id = $1 and m.user_id = $2`,
      [tenantId, usuario.id],
    ),
  );
  if (membresia.length === 0) {
    return NextResponse.json({ error: "sin_acceso" }, { status: 403 });
  }

  const sala = `prueba-${tenantId}-${randomBytes(4).toString("hex")}`;
  const metadatos = JSON.stringify({ tenant_id: tenantId, origen: "panel" });

  const salas = new RoomServiceClient(
    urlHttp(configuracion.url),
    configuracion.apiKey,
    configuracion.apiSecret,
  );
  await salas.createRoom({
    name: sala,
    metadata: metadatos,
    emptyTimeout: 120,
    maxParticipants: 4,
  });

  const credencial = new AccessToken(configuracion.apiKey, configuracion.apiSecret, {
    identity: `panel-${usuario.id.slice(0, 8)}`,
    name: "Prueba del panel",
    ttl: "20m",
    metadata: metadatos,
  });
  credencial.addGrant({
    room: sala,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return NextResponse.json({
    token: await credencial.toJwt(),
    sala,
    url: configuracion.url,
  });
}
