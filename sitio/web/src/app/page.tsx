import { Navegacion } from "@/componentes/Navegacion";
import { Hero } from "@/componentes/Hero";
import { Firma } from "@/componentes/Firma";
import { Practica } from "@/componentes/Practica";
import { Metodo } from "@/componentes/Metodo";
import { Carrusel } from "@/componentes/Carrusel";
import { Productos } from "@/componentes/Productos";
import { Garantia } from "@/componentes/Garantia";
import { Casos } from "@/componentes/Casos";
import { Socios } from "@/componentes/Socios";
import { Contacto } from "@/componentes/Contacto";
import { Pie } from "@/componentes/Pie";
import { Revelar } from "@/componentes/Revelar";
import { MOSTRAR_CARRUSEL } from "@/contenido/sitio";

export default function Inicio() {
  return (
    <>
      <Revelar />
      <Navegacion />
      <main>
        <Hero />
        <Firma />
        <Practica />
        <Metodo />
        {MOSTRAR_CARRUSEL && <Carrusel />}
        <Productos />
        <Garantia />
        <Casos />
        <Socios />
        <Contacto />
      </main>
      <Pie />
    </>
  );
}
