import { IconoDimia } from "@/components/marca";

// Mercado Pago y Clip regresan aquí tanto si el pago pasó como si no: el
// enlace trae ?estado= (y Mercado Pago agrega su propio status).
const TEXTOS = {
  ok: {
    titulo: "Gracias por su pago",
    detalle: "Ya quedó registrado. Si el negocio le confirmó una cita o un pedido, recibirá el aviso por WhatsApp.",
  },
  fallo: {
    titulo: "El pago no se completó",
    detalle: "Puede intentarlo de nuevo con el mismo enlace o escribirle al negocio por WhatsApp.",
  },
  pendiente: {
    titulo: "Su pago está en proceso",
    detalle: "En cuanto se confirme queda registrado. Si el negocio le confirmó una cita o un pedido, recibirá el aviso por WhatsApp.",
  },
  neutro: {
    titulo: "Gracias",
    detalle: "Si su pago se completó, el negocio ya lo tiene registrado y le avisará por WhatsApp.",
  },
};

/** A donde vuelve el cliente después de pagar por enlace. */
export default async function Gracias({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; status?: string }>;
}) {
  const { estado, status } = await searchParams;
  const clave =
    estado === "ok" || status === "approved"
      ? "ok"
      : estado === "fallo" || status === "rejected"
        ? "fallo"
        : estado === "pendiente" || status === "pending" || status === "in_process"
          ? "pendiente"
          : "neutro";
  const texto = TEXTOS[clave];
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="aparece-escala w-full max-w-md rounded-2xl border border-linea bg-panel px-8 py-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-acento-suave text-tinta">
          <IconoDimia tamano={28} />
        </span>
        <h1 className="mt-5 text-[22px] font-extrabold text-tinta">{texto.titulo}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-tinta-2">{texto.detalle}</p>
      </div>
    </main>
  );
}
