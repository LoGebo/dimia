import { Navegacion } from "@/componentes/Navegacion";
import { Hero } from "@/componentes/Hero";
import { Carrusel } from "@/componentes/Carrusel";
import { Firma } from "@/componentes/Firma";
import { Productos } from "@/componentes/Productos";
import { Metodo } from "@/componentes/Metodo";
import { Practica } from "@/componentes/Practica";
import { Planes } from "@/componentes/Planes";
import { Preguntas } from "@/componentes/Preguntas";
import { Contacto } from "@/componentes/Contacto";
import { Pie } from "@/componentes/Pie";
import { MOSTRAR_CARRUSEL } from "@/contenido/sitio";

export default function Inicio() {
  return (
    <>
      <Navegacion />
      <main>
        <Hero />
        {MOSTRAR_CARRUSEL && <Carrusel />}
        <Firma />
        <Productos />
        <Metodo />
        <Practica />
        <Planes />
        <Preguntas />
        <Contacto />
      </main>
      <Pie />
    </>
  );
}
