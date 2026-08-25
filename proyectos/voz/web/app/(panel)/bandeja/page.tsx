import { Vacio } from "@/components/ui/primitivos";

export default function BandejaVacia() {
  return (
    <div className="flex h-full items-center justify-center px-6 py-16">
      <Vacio
        titulo="Elige una conversación"
        detalle="A la izquierda está todo lo que entró, lo más reciente arriba."
      />
    </div>
  );
}
