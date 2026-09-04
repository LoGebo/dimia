from channels.whatsapp.deterministas import elegir

BIENVENIDA = {"tipo": "bienvenida", "disparador": None, "respuesta": "¡Hola! Soy el asistente de Dimia."}
PRECIOS = {"tipo": "palabra", "disparador": "precio, planes, cuánto cuesta", "respuesta": "Los planes van de $1,490 a $4,990."}
HORARIO = {"tipo": "palabra", "disparador": "horario", "respuesta": "Atendemos de 9 a 6."}
REGLAS = [BIENVENIDA, PRECIOS, HORARIO]


def test_bienvenida_solo_en_conversacion_nueva():
    assert elegir(REGLAS, "hola", conversacion_abierta=False) == BIENVENIDA["respuesta"]
    assert elegir(REGLAS, "hola", conversacion_abierta=True) is None


def test_palabra_ignora_acentos_y_mayusculas():
    assert elegir(REGLAS, "¿Qué PRECIÓ tienen?", conversacion_abierta=True) == PRECIOS["respuesta"]
    # el disparador con acento tambien atrapa el mensaje sin acento
    assert elegir(REGLAS, "cuanto cuesta?", conversacion_abierta=True) == PRECIOS["respuesta"]
    assert elegir(REGLAS, "y el horário?", conversacion_abierta=True) == HORARIO["respuesta"]


def test_disparador_multiple_por_coma():
    assert elegir(REGLAS, "me pasas los planes", conversacion_abierta=True) == PRECIOS["respuesta"]


def test_sin_regla_cae_al_modelo():
    assert elegir(REGLAS, "quiero agendar una demo", conversacion_abierta=True) is None


def test_regla_rota_no_truena():
    assert elegir([{"tipo": "palabra", "disparador": "  ,, ", "respuesta": "x"}], "hola", True) is None
    assert elegir([], "hola", False) is None
    assert elegir(REGLAS, "", False) is None
