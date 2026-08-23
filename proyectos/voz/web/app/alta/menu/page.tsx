import { Paso } from "@/components/paso";
import { FormularioItem } from "@/components/item-catalogo";
import { Insignia, Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { catalogo, negocio, recursos } from "@/lib/consultas";
import { moneda } from "@/lib/formato";
import { siguientePaso } from "@/lib/giro";
import { exigirPasoAlta } from "@/lib/sesion";
import { etiquetaTipo, TIPOS_POR_VERTICAL } from "@/lib/tipos";

export default async function AltaMenu() {
  const giro = await exigirPasoAlta("/alta/menu");
  const [config, items, listaRecursos] = await Promise.all([negocio(), catalogo(), recursos()]);

  const sugeridos = TIPOS_POR_VERTICAL[config.vertical] ?? ["platillo", "bebida"];
  const tipos = [...new Set([...sugeridos, ...items.map((i) => i.tipo)])];
  const sinPrecio = items.filter((i) => !i.precio).length;

  return (
    <Paso
      titulo="Carga tu menú"
      descripcion="Esto es lo que el agente puede ofrecer y cobrar. Cada cosa necesita precio: sin él no la puede agregar a un pedido. Los alias son las palabras con las que la gente lo pide de verdad — “pastor”, “con todo”, “de a diez”."
      siguiente={siguientePaso(giro.herramientas, "/alta/menu")}
      puedeSaltar={items.length === 0}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta>
          <TarjetaCabecera titulo="Agregar al menú" />
          <div className="px-4 py-4">
            <FormularioItem
              tipos={tipos}
              recursos={listaRecursos.filter((r) => r.activo)}
              tipoInicial={tipos[0]}
            />
          </div>
        </Tarjeta>

        <Tarjeta>
          <TarjetaCabecera
            titulo={`${items.length} en el menú`}
            descripcion={sinPrecio > 0 ? `${sinPrecio} todavía sin precio` : "Todos tienen precio."}
          />
          {items.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-tinta-3">Aún no agregas nada.</p>
          ) : (
            <ul className="divide-y divide-linea">
              {items.map((i) => (
                <li key={i.id} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-tinta">{i.nombre}</span>
                    <span className="block truncate text-[11px] text-tinta-3">
                      {etiquetaTipo(i.tipo)}
                      {i.alias.length > 0 ? ` · ${i.alias.join(", ")}` : ""}
                    </span>
                  </span>
                  {i.precio ? (
                    <span className="numeros text-[12px] text-tinta-2">{moneda(i.precio)}</span>
                  ) : (
                    <Insignia tono="alerta">Sin precio</Insignia>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </Paso>
  );
}
