import { Marketplace } from "@/components/marketplace";
import { catalogoAgentes } from "@/lib/acciones";
import { agentes } from "@/lib/consultas";

export default async function MarketplacePage() {
  const [catalogo, lista] = await Promise.all([catalogoAgentes(), agentes()]);
  return <Marketplace catalogo={catalogo} agentes={lista.filter((a) => a.trabajo).map((a) => ({ id: a.id, nombre: a.nombre, avatar: a.avatar }))} />;
}
