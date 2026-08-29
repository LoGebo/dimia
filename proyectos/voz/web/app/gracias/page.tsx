import { IconoDimia } from "@/components/marca";

/** A donde vuelve el cliente después de pagar por enlace. */
export default function Gracias() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="aparece-escala w-full max-w-md rounded-2xl border border-linea bg-panel px-8 py-10 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-acento-suave text-tinta">
          <IconoDimia tamano={28} />
        </span>
        <h1 className="mt-5 text-[22px] font-extrabold text-tinta">Gracias por su pago</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-tinta-2">
          Ya quedó registrado. Si el negocio le confirmó una cita o un pedido, recibirá el aviso por WhatsApp.
        </p>
      </div>
    </main>
  );
}
