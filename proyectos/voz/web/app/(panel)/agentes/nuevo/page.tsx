import { Encabezado } from "@/components/encabezado";
import { FormularioAgente } from "@/components/formulario-agente";
import { exigirSeccion } from "@/lib/sesion";

export default async function NuevoAgentePage() {
  await exigirSeccion("/agentes");
  return (
    <>
      <Encabezado titulo="Nuevo agente" descripcion="Ya sabe todo lo del negocio. Solo dígale quién es y qué hace." />
      <div className="px-5 py-5">
        <FormularioAgente />
      </div>
    </>
  );
}
