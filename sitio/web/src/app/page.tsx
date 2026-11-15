import { Navegacion } from "@/componentes/Navegacion";
import { Hero } from "@/componentes/Hero";
import { Carrusel } from "@/componentes/Carrusel";
import { Declaracion } from "@/componentes/Declaracion";
import { Capitulo } from "@/componentes/Capitulo";
import { Conversacion } from "@/componentes/Conversacion";
import { Dia } from "@/componentes/Dia";
import { Garantia } from "@/componentes/Garantia";
import { Confirma } from "@/componentes/Confirma";
import { Firma } from "@/componentes/Firma";
import { Metodo } from "@/componentes/Metodo";
import { Practica } from "@/componentes/Practica";
import { Planes } from "@/componentes/Planes";
import { Preguntas } from "@/componentes/Preguntas";
import { Contacto } from "@/componentes/Contacto";
import { Pie } from "@/componentes/Pie";
import { CAPITULOS, MOSTRAR_CARRUSEL } from "@/contenido/sitio";
import css from "./page.module.css";

export default function Inicio() {
  return (
    <>
      <Navegacion />
      <main>
        <Hero />
        {MOSTRAR_CARRUSEL && <Carrusel />}
        <Declaracion />

        <Capitulo id="agente" {...CAPITULOS.contesta}>
          <Conversacion />
        </Capitulo>

        <Capitulo id="agenda" {...CAPITULOS.agenda} tono="laton">
          <div className={css.bento}>
            <Dia />
            <Garantia />
          </div>
        </Capitulo>

        <Capitulo id="confirma" {...CAPITULOS.confirma} tono="papel">
          <Confirma />
        </Capitulo>


        <Firma />
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
