# Evaluación del agente

A 200,000 llamadas/mes, 1% de fallo son 2,000 llamadas malas. Esta suite existe
para que cambiar un prompt o un modelo sea una decisión con evidencia y no una
apuesta.

Un LLM hace de **cliente** con una persona y un objetivo. Conversa por texto
contra el agente, que corre con el **mismo system prompt** (`app/prompt.py`) y
las **mismas cinco herramientas** que en producción, contra Postgres real.
Al colgar, los jueces revisan el **estado final de la base**: si la reserva
quedó, con qué servicio, qué día y a nombre de quién. Lo que el agente *dijo*
solo se revisa para alucinaciones.

## Correr

```bash
export PG_DSN=postgresql://usuario@localhost:5432/agenda_test   # con migraciones + seed

# 1. sin red ni llave: arnés determinista (LLM guionado). Esto corre en cada commit.
pytest tests/test_evals.py -q

# 2. con llave: arnés real contra la API
export ANTHROPIC_API_KEY=...
python -m evals --json reportes/ultima.json

# solo un subconjunto (por id o por etiqueta)
python -m evals --filtro escalamiento alucinacion

# cliente guionado (barato y determinista) contra el agente real
python -m evals --cliente-guion

# regresión: guardar y comparar
python -m evals --guardar-baseline v1
python -m evals --comparar-baseline v1 --umbral-exito 0.9
```

Cada escenario clona el tenant semilla (`clinica` o `restaurante`) en un tenant
desechable, siembra el estado inicial, corre la llamada y borra todo. Nunca toca
los datos del seed ni deja basura.

### Códigos de salida (CI)

| código | significado |
|---|---|
| 0 | todo pasó los umbrales |
| 2 | métrica bajo umbral (`--umbral-exito`, `--umbral-containment`, `--max-alucinaciones`, `--max-escalamiento-incorrecto`) |
| 3 | regresión contra el baseline |
| 4 | configuración: sin escenarios o sin `ANTHROPIC_API_KEY` |

### Métricas

`task success rate` (rúbrica completa en verde), `containment rate` (resueltas
sin humano entre las que no debían escalar), escalamiento correcto / incorrecto
/ faltante, alucinaciones detectadas y turnos por tarea.

## Agregar un escenario

Un documento YAML en `evals/escenarios/*.yaml` (varios por archivo, separados
por `---`):

```yaml
id: restaurante_mesa_grande
descripcion: grupo de ocho un viernes
tenant: restaurante                  # clinica | restaurante
etiquetas: [feliz]
telefono_cliente: "+5215522223333"
estado_inicial:
  dia: proximo_viernes               # +N | manana | proximo_<dia> | AAAA-MM-DD
  llenar_dia: false                  # true = agenda saturada ese día
  reservas:                          # reservas que ya existían al llamar
    - {servicio: Reservacion, dia: proximo_viernes, hora: "20:00", nombre: Ernesto, personas: 2}
ruido:                               # errores de transcripción inyectados
  probabilidad: 1.0
  sustituciones: {mesa: meza, cuatro: cuadro}
persona: |
  Quién llama, qué quiere y cómo se comporta. Lo lee el LLM cliente.
guion:                               # respaldo determinista, usado con --cliente-guion
  - "Quiero mesa para ocho el {dia}"
  - "Confirmo, gracias [COLGAR]"
max_turnos: 12
rubrica:
  - {tipo: reserva_creada, servicio: Reservacion, dia: proximo_viernes, personas: 8}
  - {tipo: escalo, esperado: false}
```

Placeholders en `persona` y `guion`: `{dia}`, `{fecha}`, `{dia_siguiente}`,
`{fecha_siguiente}`.

Marcas de conducta que puede emitir el cliente (guionado o real):
`[COLGAR]` termina la llamada, `[SILENCIO]` simula una pausa larga,
`[INTERRUMPE]` corta la frase del agente a media palabra.

### Rúbricas disponibles

| tipo | verifica |
|---|---|
| `reserva_creada` | fila en `booking` de esta llamada: `servicio`, `dia`, `dia_relativo`, `hora`, `personas`, `nombre_contiene`, `notas_contienen`, `estado` |
| `sin_reserva_nueva` | la llamada no dejó reservas confirmadas |
| `reserva_cancelada` | `cantidad` de reservas en estado `cancelada` (por `codigo` o `telefono`) |
| `escalo` | `esperado: true/false`, opcional `motivo_contiene` |
| `sin_frases` | ninguno de los `patrones` (regex, sin acentos) aparece en lo que dijo el agente — **esto cuenta como alucinación** |
| `menciona` | los `patrones` aparecen (`modo: todos` o `alguno`) |
| `max_turnos` | la tarea se resolvió en `turnos` o menos |
| `usa_herramienta` | `nombre` de la herramienta, `esperado: true/false` |

Un escenario pasa solo si **todas** sus reglas pasan.

## Piezas

```
llm.py           protocolo del cliente LLM: Anthropic real o guionado (sin red)
herramientas.py  las 5 herramientas del agente, mismas firmas y mismas respuestas
entorno.py       clona el tenant, siembra el estado inicial, limpia al terminar
simulador.py     el bucle de la conversación: cliente ↔ agente ↔ herramientas ↔ Postgres
escenarios/      los casos, en YAML
jueces.py        rúbricas contra el estado final de la base
metricas.py      task success, containment, escalamiento, alucinaciones, turnos
reporte.py       tabla en consola + JSON
baseline.py      guardar una corrida y comparar contra ella
```
