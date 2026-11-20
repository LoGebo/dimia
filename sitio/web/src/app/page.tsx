import { Navegacion } from "@/componentes/Navegacion";
import { Hero } from "@/componentes/Hero";
import { Carrusel } from "@/componentes/Carrusel";
import { Seccion } from "@/componentes/Seccion";
import { Funciones } from "@/componentes/Funciones";
import { Conversacion } from "@/componentes/Conversacion";
import { Confirma } from "@/componentes/Confirma";
import { Garantia } from "@/componentes/Garantia";
import { Dia } from "@/componentes/Dia";
import { Integraciones, Pasos } from "@/componentes/Pasos";
import { Planes } from "@/componentes/Planes";
import { Practica } from "@/componentes/Practica";
import { Preguntas } from "@/componentes/Preguntas";
import { Contacto } from "@/componentes/Contacto";
import { Pie } from "@/componentes/Pie";
import {
  FUNCIONES,
  GIROS,
  INTEGRACIONES,
  MOSTRAR_CARRUSEL,
  PASOS,
  WHATSAPP,
} from "@/contenido/sitio";
import css from "./page.module.css";

/*
 * Estructura de venta, en el orden en que un dueño decide:
 * qué es · qué hace · si sirve para mi giro · cómo confirma · con qué se conecta ·
 * cómo empiezo · cuánto cuesta · dudas · contacto.
 */
export default function Inicio() {
  return (
    <>
      <Navegacion />
      <main>
        <Hero />
        {MOSTRAR_CARRUSEL && <Carrusel />}

        <Seccion id="funciones" rotulo="Qué hace" titular={FUNCIONES.titular} entrada={FUNCIONES.entrada} centrada>
          <Funciones />
        </Seccion>

        <Seccion id="giros" rotulo="Por giro" titular={GIROS.titular} entrada={GIROS.entrada}>
          <Conversacion />
        </Seccion>

        <Seccion id="whatsapp" rotulo="Confirmación" titular={WHATSAPP.titular} entrada={WHATSAPP.entrada} tono="papel">
          <Confirma />
        </Seccion>

        <Seccion
          id="agenda"
          rotulo="Agenda"
          titular="Contesta a cualquier hora y nunca encima dos citas."
          entrada="Antes de dar un horario, el agente revisa su agenda. Si ya está ocupado, ofrece el siguiente libre en la misma llamada."
        >
          <div className={css.bento}>
            <Dia />
            <Garantia />
          </div>
        </Seccion>

        <Seccion id="integraciones" rotulo="Conexiones" titular={INTEGRACIONES.titular} entrada={INTEGRACIONES.entrada} centrada tono="papel">
          <Integraciones />
        </Seccion>

        <Seccion id="pasos" rotulo="Cómo empezar" titular={PASOS.titular} entrada={PASOS.entrada} centrada>
          <Pasos />
        </Seccion>

        <Planes />
        <Practica />
        <Preguntas />
        <Contacto />
      </main>
      <Pie />
    </>
  );
}
