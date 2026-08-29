import { Cobrar } from "@/components/cobrar";
import { Formulario } from "@/components/formulario";
import { ChipHerramienta } from "@/components/kit/chips-herramienta";
import { Estampa, type TonoOperacion } from "@/components/kit/operacion";
import { cambiarEstadoPedido } from "@/lib/acciones";
import { hora, moneda, telefono } from "@/lib/formato";
import type { EstadoPedido, Pedido, TipoPedido } from "@/lib/tipos";

const MINUTOS_NUEVO = 10;

const ESTADOS: Record<
  EstadoPedido,
  { nombre: string; tono: TonoOperacion; late: boolean }
> = {
  abierto: { nombre: "Sin cerrar", tono: "alerta", late: false },
  confirmado: { nombre: "En cocina", tono: "acento", late: true },
  entregado: { nombre: "Entregado", tono: "bueno", late: false },
  cancelado: { nombre: "Cancelado", tono: "critico", late: false },
};

const TIPOS: Record<TipoPedido, string> = {
  recoger: "Pasan por él",
  domicilio: "A domicilio",
  local: "Para comer aquí",
};

export function TableroPedidos({
  pedidos,
  zona,
  cobrados = new Map(),
}: {
  pedidos: Pedido[];
  zona: string;
  cobrados?: Map<string, string>;
}) {
  const ahora = Date.now();
  return (
    <div className="kit-revela grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
      {pedidos.map((p) => (
        <TarjetaPedido
          key={p.id}
          pedido={p}
          zona={zona}
          ahora={ahora}
          cobrado={cobrados.get(p.id) ?? null}
        />
      ))}
    </div>
  );
}

/**
 * La tarjeta se lee desde la cocina: código, cantidades y total grandes. El
 * acabado va en los filetes y los rótulos, no en el tamaño.
 */
function TarjetaPedido({
  pedido,
  zona,
  ahora,
  cobrado,
}: {
  pedido: Pedido;
  zona: string;
  ahora: number;
  cobrado: string | null;
}) {
  const minutos = Math.max(
    0,
    Math.round((ahora - new Date(pedido.creado).getTime()) / 60000),
  );
  const pendiente =
    pedido.estado === "abierto" || pedido.estado === "confirmado";
  const nuevo = pendiente && minutos < MINUTOS_NUEVO;
  const estado = ESTADOS[pedido.estado];
  const cosas = pedido.items.reduce((s, i) => s + i.cantidad, 0);

  return (
    <article
      className={`flex flex-col border border-linea border-t-2 bg-panel ${
        nuevo
          ? "border-t-acento"
          : pedido.estado === "abierto"
            ? "border-t-alerta"
            : pedido.estado === "entregado"
              ? "border-t-bueno"
              : "border-t-linea-fuerte"
      } ${pedido.estado === "cancelado" ? "opacity-60" : ""}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-linea px-4 py-3">
        <div className="min-w-0">
          <p className="numeros text-[30px] leading-none font-medium tracking-[0.12em] text-tinta">
            {pedido.codigo}
          </p>
          <p className="numeros mt-2 text-[12px] text-tinta-3">
            {hora(pedido.creado, zona)} · hace {minutos < 60 ? `${minutos} min` : minutos < 1440 ? `${Math.round(minutos / 60)} h` : `${Math.round(minutos / 1440)} d`}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
          <Estampa tono={estado.tono} late={estado.late}>
            {estado.nombre}
          </Estampa>
          {nuevo ? <Estampa tono="acento">Nuevo</Estampa> : null}
        </div>
      </header>

      <div className="border-b border-linea px-4 py-2.5">
        <p className="truncate text-[17px] font-semibold text-tinta">
          {pedido.cliente_nombre ?? "Sin nombre todavía"}
        </p>
        <p className="numeros text-[13px] text-tinta-2">
          {telefono(pedido.telefono)}
        </p>
        <p className="mt-1.5 flex items-center gap-2 text-[15px] font-medium text-tinta">
          <i
            aria-hidden="true"
            className={`h-1.5 w-1.5 flex-none ${pedido.tipo === "domicilio" ? "bg-acento" : "bg-tinta-3"}`}
          />
          {TIPOS[pedido.tipo]}
        </p>
        {pedido.tipo === "domicilio" ? (
          <p
            className={`mt-0.5 pl-3.5 text-[15px] ${pedido.direccion ? "text-tinta-2" : "text-alerta"}`}
          >
            {pedido.direccion ?? "Falta la dirección"}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-b border-linea px-4 py-1.5">
        <span className="text-[12px] text-tinta-2">Lo que pidió</span>
        <span className="numeros text-[11px] text-tinta-3">
          {cosas} {cosas === 1 ? "cosa" : "cosas"}
        </span>
      </div>
      <ul className="flex-1 divide-y divide-linea">
        {pedido.items.map((item, i) => (
          <li
            key={`${item.nombre}-${i}`}
            className="flex items-baseline gap-3 px-4 py-2"
          >
            <span className="numeros w-9 shrink-0 text-[22px] leading-none font-medium text-tinta">
              {item.cantidad}×
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] leading-tight text-tinta">
                {item.nombre}
              </span>
              {item.notas ? (
                <span className="mt-0.5 block border-l-2 border-alerta pl-2 text-[14px] leading-tight font-medium text-alerta">
                  {item.notas}
                </span>
              ) : null}
            </span>
            <span className="numeros shrink-0 text-[14px] text-tinta-2">
              {moneda(item.subtotal)}
            </span>
          </li>
        ))}
        {pedido.items.length === 0 ? (
          <li className="flex items-center gap-2 px-4 py-3 text-[14px] text-tinta-3">
            <i aria-hidden="true" className="h-1.5 w-1.5 bg-linea-fuerte" />
            Todavía no le agregaron nada.
          </li>
        ) : null}
      </ul>

      {pedido.notas ? (
        <p className="border-t border-linea px-4 py-2 text-[14px] leading-snug text-tinta-2">
          {pedido.notas}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-linea bg-panel-2 px-4 py-3">
        {cobrado ? (
          <ChipHerramienta estado="hecho">Cobrado</ChipHerramienta>
        ) : (
          <span className="text-[12.5px] text-tinta-2">Total</span>
        )}
        <span
          className={`numeros text-[26px] leading-none font-medium tracking-[-0.02em] ${cobrado ? "text-bueno" : "text-tinta"}`}
        >
          {moneda(cobrado ?? pedido.total)}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-linea px-4 py-3">
        {pedido.estado === "abierto" ? (
          <BotonEstado id={pedido.id} estado="confirmado" tono="acento">
            Pasar a cocina
          </BotonEstado>
        ) : null}
        {pedido.estado === "confirmado" ? (
          <BotonEstado id={pedido.id} estado="entregado" tono="bueno">
            Marcar entregado
          </BotonEstado>
        ) : null}
        {pedido.estado !== "cancelado" &&
        !cobrado &&
        pedido.items.length > 0 &&
        Number(pedido.total) > 0 ? (
          <Cobrar
            pedidoId={pedido.id}
            concepto={`Pedido ${pedido.codigo}`}
            montoSugerido={pedido.total}
            etiqueta="Cobrar"
          />
        ) : null}
        {pendiente ? (
          <BotonEstado id={pedido.id} estado="cancelado" tono="critico">
            Cancelar
          </BotonEstado>
        ) : (
          <BotonEstado id={pedido.id} estado="confirmado" tono="neutro">
            Regresar a cocina
          </BotonEstado>
        )}
      </div>
    </article>
  );
}

const TONOS = {
  acento: "bg-acento text-acento-tinta border-transparent hover:brightness-110",
  bueno: "bg-bueno text-white border-transparent hover:brightness-110",
  critico: "bg-transparent text-tinta-2 border-linea-fuerte hover:border-critico hover:text-critico",
  neutro: "bg-panel text-tinta-2 border-linea-fuerte hover:bg-panel-2",
} as const;

function BotonEstado({
  id,
  estado,
  tono,
  children,
}: {
  id: string;
  estado: EstadoPedido;
  tono: keyof typeof TONOS;
  children: string;
}) {
  return (
    <Formulario
      accion={cambiarEstadoPedido}
      className={tono === "critico" || tono === "neutro" ? "" : "flex-1"}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <button
        className={`inline-flex h-11 w-full items-center justify-center border px-4 text-[15px] font-semibold transition-[filter,background-color] duration-150 ${TONOS[tono]}`}
      >
        {children}
      </button>
    </Formulario>
  );
}
