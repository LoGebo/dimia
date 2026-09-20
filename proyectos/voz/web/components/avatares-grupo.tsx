import { AvatarAgente } from "@/components/avatar-agente";

export type MiembroCara = { id: string; nombre: string; avatar: string | null };

/** Las caras de un grupo, apiladas; hasta tres y un «+n». */
export function AvataresGrupo({ miembros, tamano = 44 }: { miembros: MiembroCara[]; tamano?: number }) {
  const vistos = miembros.slice(0, 3);
  const resto = miembros.length - vistos.length;
  const paso = Math.round(tamano * 0.42);
  const chico = Math.round(tamano * 0.68);
  return (
    <span className="relative inline-flex flex-none" style={{ width: tamano, height: tamano }}>
      {vistos.map((m, i) => (
        <span key={m.id} className="absolute" style={{ left: i * paso * 0.55, top: i % 2 === 0 ? 0 : tamano - chico, zIndex: i }}>
          <AvatarAgente nombre={m.nombre} avatar={m.avatar} tamano={chico} />
        </span>
      ))}
      {resto > 0 ? (
        <span className="numeros absolute right-0 bottom-0 flex items-center justify-center rounded-full bg-linea text-[10px] font-semibold text-tinta-2" style={{ width: chico * 0.7, height: chico * 0.7, zIndex: 5 }}>+{resto}</span>
      ) : null}
    </span>
  );
}
