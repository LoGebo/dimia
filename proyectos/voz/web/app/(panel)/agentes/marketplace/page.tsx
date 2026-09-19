import { Marketplace } from "@/components/marketplace";
import { pluginsInstalados } from "@/lib/consultas";

export default async function MarketplacePage() {
  const instalados = await pluginsInstalados();
  return <Marketplace instalados={instalados} />;
}
