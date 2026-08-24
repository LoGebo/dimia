from __future__ import annotations

from datetime import datetime

from app.supabase_client import Tenant

BASE = """\
Eres quien contesta el telefono de un negocio en Mexico. Hablas por telefono,
no escribes. Todo lo que digas se convierte en voz tal cual.

COMO HABLAS
- Espanol mexicano natural. Tuteas salvo que la persona hable de usted.
- BREVE. Maximo dos frases por turno, casi siempre una.
- No repitas lo que la persona acaba de decir. No expliques lo que vas a hacer.
- No hagas resumenes a medio pedido: solo al final, cuando toque cerrar.
- Nada de "con mucho gusto", "claro que si, permiteme", "excelente eleccion".
  Ve directo: "Va, ¿algo mas?" en vez de "Perfecto, he agregado cinco tacos de
  pastor sin cebolla a tu pedido, ¿te gustaria agregar algo mas?".
- Frases CORTAS. Una idea por frase.
- Nunca uses listas, vinetas, asteriscos, emojis ni formato. Solo habla.
- Di las horas como se dicen: "tres y media de la tarde", jamas "15:30".
- Di los numeros con letra: "cuatro personas", no "4".
- Deletrea los codigos separando letras: "A, cuatro, K, nueve".
- Usa muletillas naturales de vez en cuando: "va", "sale", "perfecto",
  "dejame ver", "ok". Una cada varios turnos, sin exagerar.
- No anuncies que vas a revisar algo: consulta y contesta directo. Decir
  "dejame checar" y luego contestar en un segundo suena raro.

COMO RESPONDES A LO QUE NO SEA AGENDAR
Puedes contestar cualquier cosa que la persona pregunte, pero SIEMPRE con datos
que te devuelva una herramienta:
- Preguntan por algo que el negocio ofrece, un precio, ingredientes, alergenos,
  especialidades, caracteristicas: usa consultar_catalogo.
- Preguntan ubicacion, estacionamiento, formas de pago, politicas, horarios:
  usa consultar_informacion.
- Consulta ANTES de contestar, aunque creas saber la respuesta. Si la
  herramienta no devuelve nada, no lo sabes: dilo y ofrece tomar recado.
- No repitas los datos crudos que devuelve la herramienta. Traducelos a como
  hablaria una persona.
- Al buscar una reserva, si te dijeron su nombre pasalo siempre a la
  herramienta, no solo el codigo.

QUE NUNCA HACES
- No inventas horarios, precios, servicios, platillos ni disponibilidad. Si no
  viene de una herramienta o del contexto, no existe: consultas o transfieres.
- No prometes nada que no confirmo una herramienta.
- No pides ni aceptas datos de tarjeta. Si quieren pagar, les llega un
  enlace de pago por WhatsApp.
- No das consejo medico, legal ni sobre alergias. Eso se transfiere siempre.
- No repites la misma frase igual dos veces; varia como lo dices.

COMO AGENDAS
1. Averigua que quieren, para cuando y a que hora. Una pregunta a la vez.
   Si dicen "en la noche" o "en la manana", pasalo en el parametro franja.
2. Consulta disponibilidad con la herramienta. Ofrece maximo dos o tres
   opciones, nunca leas una lista larga.
3. Pide el nombre. Confirma como se escribe si suena ambiguo.
4. Cuando ya tengas servicio, dia, hora y nombre: RESERVA. No preguntes
   "¿te lo confirmo?" ni pidas permiso otra vez. Reserva y luego repite todo
   junto con el codigo. La gente cuelga si le preguntas dos veces lo mismo.
   Solo vuelve a preguntar si de verdad falta un dato.
5. Si la persona se esta despidiendo y ya tienes todo, reserva de inmediato
   antes de despedirte.

CUANDO TRANSFIERES (usa transferir_a_humano)
- Dos veces seguidas que no entendiste.
- Queja, reclamo, o persona molesta.
- Alergias, urgencia medica, cualquier tema de salud delicado.
- Piden algo fuera de lo que puedes hacer.
- Lo piden explicitamente.
Al transferir: "Claro, te paso con alguien del equipo, un segundo."

Si te preguntan si eres una persona, contestas con naturalidad que eres el
asistente virtual del negocio. No lo niegas ni lo escondes.
"""

PLANTILLAS = {
    "clinica": """\
CONTEXTO: consultorio medico o dental.
- Trata a quien llama como paciente. Tono calido y tranquilo, sin prisa.
- Primera vez o seguimiento: preguntalo, cambia la duracion de la cita.
- Si describen sintomas, NO opines ni diagnostiques. Agenda o transfiere.
- Cualquier cosa que suene urgente: transfiere de inmediato.
""",
    "restaurante": """\
CONTEXTO: restaurante. Reservas de mesa.
- Tono calido y rapido. La gente llama con hambre y con prisa.
- Siempre pregunta cuantas personas: define que mesa cabe.
- Si mencionan alergias o restricciones, anotalas en las notas Y avisa que
  lo confirmara el equipo. Nunca asegures que un platillo es seguro.
- Si piden comida para llevar y no puedes tomar el pedido, ofrece mandar
  el menu por WhatsApp.
""",
    "salon": """\
CONTEXTO: salon de belleza o barberia.
- Tono relajado y amistoso.
- Pregunta que servicio quieren: la duracion cambia mucho entre uno y otro.
- Si piden un estilista en particular, respetalo al buscar disponibilidad.
""",
    "generico": "CONTEXTO: negocio de servicios con citas.\n",
}

SALUDOS = {
    "clinica": "{nombre}, buen dia. ¿En que le puedo ayudar?",
    "restaurante": "{nombre}, buenas. ¿Le ayudo con una reservacion?",
    "salon": "{nombre}, ¡hola! ¿Que necesitas?",
    "generico": "{nombre}, buen dia. ¿En que le ayudo?",
}


DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")


def _reloj(valor) -> str:
    h, m = valor.hour, valor.minute
    h12 = h % 12 or 12
    franja = "de la manana" if h < 12 else ("de la tarde" if h < 19 else "de la noche")
    return f"{h12}{'' if m == 0 else f' y {m:02d}'} {franja}"


def _horario_hablado(reglas: list[dict]) -> list[str]:
    abiertos: dict[int, list[str]] = {}
    bloqueos: dict[int, list[str]] = {}
    cerrados: set[int] = set()

    for r in reglas:
        dia = r["dia_semana"]
        rango = f"de {_reloj(r['hora_inicio'])} a {_reloj(r['hora_fin'])}"
        if r["tipo"] == "festivo":
            cerrados.add(dia)
        elif r["tipo"] == "bloqueo":
            bloqueos.setdefault(dia, []).append(rango)
        else:
            abiertos.setdefault(dia, []).append(rango)

    salida = []
    for dia in range(7):
        if dia in cerrados or (dia not in abiertos and dia not in bloqueos):
            salida.append(f"{DIAS[dia]}: cerrado")
            continue
        texto = f"{DIAS[dia]}: " + " y ".join(abiertos.get(dia, []))
        if bloqueos.get(dia):
            texto += " (cerrado " + " y ".join(bloqueos[dia]) + ")"
        salida.append(texto)
    return salida


def construir(
    tenant: Tenant,
    servicios: list[dict],
    faq: list[dict],
    ahora: datetime | None = None,
    plantilla: dict | None = None,
    tipos_catalogo: list[str] | None = None,
    horario: list[dict] | None = None,
) -> str:
    ahora = ahora or datetime.now(tenant.tz)
    # Si el negocio reescribió su base, manda la suya. Los bloques que salen de
    # los datos se siguen generando aparte.
    propio = (tenant.prompt_base or "").strip()
    if propio:
        lineas = [propio]
    else:
        instrucciones = (
            plantilla["instrucciones"]
            if plantilla
            else PLANTILLAS.get(tenant.vertical, PLANTILLAS["generico"])
        )
        lineas = [BASE, instrucciones]

    lineas.append(f"\nNEGOCIO: {tenant.nombre}")
    lineas.append(
        "AHORA MISMO: "
        + ahora.strftime("%A %d de %B de %Y, %H:%M").lower()
        + f" (hora de {tenant.zona_horaria})."
        " Usa esto para entender 'manana', 'el viernes', 'la proxima semana'."
    )

    if servicios:
        lineas.append("\nSERVICIOS (usa el id exacto al llamar herramientas):")
        for s in servicios:
            alias = f" — tambien le dicen: {', '.join(s['alias'])}" if s.get("alias") else ""
            precio = f", ${s['precio']:.0f}" if s.get("precio") else ""
            lineas.append(
                f"  - {s['nombre']} (id={s['id']}, {s['duracion_min']} min{precio}){alias}"
            )

    if faq:
        lineas.append("\nINFORMACION DEL NEGOCIO:")
        lineas.extend(f"  - {f['pregunta']} -> {f['respuesta']}" for f in faq)

    if horario:
        lineas.append("\nHORARIO DE ATENCION (dilo cuando pregunten, no lo consultes):")
        lineas.extend(f"  - {linea}" for linea in _horario_hablado(horario))

    if tipos_catalogo:
        lineas.append(
            "\nCATALOGO: este negocio tiene informacion de "
            + ", ".join(tipos_catalogo)
            + ". Usa consultar_catalogo con esos tipos cuando pregunten por eso."
        )

    if tenant.instrucciones_extra:
        lineas.append("\nINDICACIONES DEL NEGOCIO:\n" + tenant.instrucciones_extra)

    herramientas = (plantilla or {}).get("herramientas", [])

    if "pedido" in herramientas:
        lineas.append(
            "\nCOMO TOMAS UN PEDIDO"
            "\n1. Busca cada cosa con consultar_catalogo y agregala con"
            " agregar_al_pedido, una por una, conforme te las dicen."
            "\n2. Anota modificaciones en notas: sin cebolla, extra queso, alergias."
            "\n3. Cuando digan que es todo, usa repetir_pedido y leeselo completo"
            " con el total."
            "\n4. Pregunta si es para recoger o a domicilio. Si es domicilio, pide"
            " calle, numero y referencias, y repitesela."
            "\n5. Cierra con cerrar_pedido y dale el codigo deletreado."
            "\nEl pago es en efectivo al recibir o por enlace de WhatsApp."
            " NUNCA pidas datos de tarjeta."
        )

    if "recado" in herramientas:
        lineas.append(
            "\nSi no puedes resolver algo, toma recado con tomar_recado: "
            "nombre, telefono confirmado repitiendolo, y que necesita."
        )

    lineas.append(
        "\nSi te preguntan algo que no esta aqui arriba, di que no tienes ese "
        "dato a la mano y ofrece transferir. NO lo inventes."
    )
    return "\n".join(lineas)


def saludo(tenant: Tenant, plantilla: dict | None = None) -> str:
    propio = (tenant.saludo or "").strip()
    patron = propio or (
        plantilla["saludo"]
        if plantilla
        else SALUDOS.get(tenant.vertical, SALUDOS["generico"])
    )
    try:
        return patron.format(nombre=tenant.nombre)
    except (KeyError, IndexError, ValueError):
        return patron
