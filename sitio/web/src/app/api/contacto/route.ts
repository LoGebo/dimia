import { NextResponse } from "next/server";

export const runtime = "edge";

type Cuerpo = {
  nombre?: string;
  empresa?: string;
  contacto?: string;
  pagina?: string; // trampa para robots
};

function limpiar(valor: unknown, largo = 200): string {
  return typeof valor === "string" ? valor.trim().slice(0, largo) : "";
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(peticion: Request) {
  let cuerpo: Cuerpo;
  try {
    cuerpo = (await peticion.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ ok: false, mensaje: "Solicitud inválida." }, { status: 400 });
  }

  // Un robot llena el campo oculto. Se responde ok para no darle señal.
  if (limpiar(cuerpo.pagina)) {
    return NextResponse.json({ ok: true, mensaje: "Recibido." });
  }

  const nombre = limpiar(cuerpo.nombre, 120);
  const empresa = limpiar(cuerpo.empresa, 160);
  const contacto = limpiar(cuerpo.contacto, 160);

  if (!nombre || !empresa || !contacto) {
    return NextResponse.json(
      { ok: false, mensaje: "Faltan datos: nombre, empresa y un medio de contacto." },
      { status: 422 },
    );
  }

  const llave = process.env.RESEND_API_KEY;
  const remitente = process.env.CORREO_REMITENTE ?? "Dimia Consulting <onboarding@resend.dev>";
  const destino = process.env.CORREO_DESTINO ?? "hola@dimia.mx";

  // Sin llave el sitio no finge un envío exitoso: lo dice y ofrece la salida.
  if (!llave) {
    return NextResponse.json(
      {
        ok: false,
        codigo: "sin_configurar",
        mensaje: "El formulario todavía no está conectado a un destino.",
      },
      { status: 503 },
    );
  }

  const cuerpoCorreo = [
    `Nombre: ${escapar(nombre)}`,
    `Empresa: ${escapar(empresa)}`,
    `Contacto: ${escapar(contacto)}`,
  ].join("<br>");

  try {
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llave}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remitente,
        to: [destino],
        reply_to: contacto.includes("@") ? contacto : undefined,
        subject: `Demostración · ${nombre} · ${empresa}`,
        html: `<div style="font-family:ui-sans-serif,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0b0f17">
  <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#5a6478;margin:0 0 16px">Solicitud de demostración · dimia.mx</p>
  ${cuerpoCorreo}
</div>`,
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => "");
      console.error("Resend rechazó el envío:", respuesta.status, detalle);
      return NextResponse.json(
        { ok: false, mensaje: "No pudimos entregar el mensaje." },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      mensaje: "Recibimos su solicitud. Le contestamos el mismo día hábil.",
    });
  } catch (error) {
    console.error("Error al llamar a Resend:", error);
    return NextResponse.json({ ok: false, mensaje: "No pudimos entregar el mensaje." }, { status: 502 });
  }
}
