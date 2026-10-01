import { redirect } from "next/navigation";

// El seguimiento vive ahora en el engrane de la Vendedora (y se le puede pedir en su chat).
export default function PaginaSeguimiento() {
  redirect("/agentes/vendedora?ajustes=1");
}
