import type { Grafica } from "@/componentes/lab/Graficas";

/** Contenido de /laboratorio. Para publicar algo nuevo, agregue un objeto a PUBLICACIONES. */

export type Diagrama =
  | "refuerzo" | "sinteticos" | "retro" | "receta"
  | "comparar" | "juez" | "ab" | "monitor"
  | "montaje" | "capas"
  | "perimetro" | "puerta" | "registro" | "gasto";

export type Fase = {
  id: string;
  nombre: string;
  titular: string;
  tarjetas: { diagrama: Diagrama; titulo: string; texto: string; puntos: string[] }[];
};

export const LABORATORIO = {
  titular: "Sea dueño de su inteligencia.",
  entrada:
    "Montamos su infraestructura de inteligencia artificial, ajustamos modelos con sus datos y cambiamos la forma de trabajar de su empresa.",
} as const;

export const FASES: Fase[] = [
  {
    id: "montar",
    nombre: "Montar",
    titular: "Le montamos la infraestructura de inteligencia artificial.",
    tarjetas: [
      {
        diagrama: "montaje",
        titulo: "Servidores o nube privada",
        texto: "Dimensionamos, instalamos y configuramos el equipo donde van a correr sus modelos.",
        puntos: ["Diseño según su carga", "Instalación y puesta en marcha"],
      },
      {
        diagrama: "capas",
        titulo: "La plataforma completa",
        texto: "Datos, modelos, accesos y aplicaciones conectados, con su equipo capacitado para usarlos.",
        puntos: ["Operación continua", "Acompañamiento a su equipo"],
      },
    ],
  },
  {
    id: "adaptar",
    nombre: "Adaptar",
    titular: "Un modelo que aprende de su operación.",
    tarjetas: [
      {
        diagrama: "refuerzo",
        titulo: "Ajuste con aprendizaje por refuerzo",
        texto: "Su empresa define qué es una buena respuesta. El modelo se entrena para acercarse a ese criterio.",
        puntos: ["Recompensas según sus reglas", "Ajuste por preferencias"],
      },
      {
        diagrama: "sinteticos",
        titulo: "Datos sintéticos",
        texto: "Cuando hay pocos ejemplos, generamos más a partir de sus guías y los revisa su equipo.",
        puntos: ["Generados desde sus documentos", "Revisión humana"],
      },
      {
        diagrama: "retro",
        titulo: "Retroalimentación de producción",
        texto: "Las respuestas que su equipo corrige regresan al siguiente entrenamiento.",
        puntos: ["Correcciones registradas", "Ciclos de mejora"],
      },
      {
        diagrama: "receta",
        titulo: "Recetas a la medida",
        texto: "Cada entrenamiento queda escrito como código que se puede repetir y auditar.",
        puntos: ["Versiones documentadas", "Resultados reproducibles"],
      },
    ],
  },
  {
    id: "evaluar",
    nombre: "Evaluar",
    titular: "Ningún cambio sale sin pasar sus pruebas.",
    tarjetas: [
      {
        diagrama: "comparar",
        titulo: "Comparación de modelos",
        texto: "Modelos abiertos, comerciales y el suyo responden los mismos casos.",
        puntos: ["Mismos casos para todos", "Costo y calidad lado a lado"],
      },
      {
        diagrama: "juez",
        titulo: "Jueces de inteligencia artificial",
        texto: "Un juez califica cada respuesta con los criterios que a su negocio le importan.",
        puntos: ["Criterios propios", "Muestras revisadas por personas"],
      },
      {
        diagrama: "ab",
        titulo: "Pruebas A/B",
        texto: "La versión nueva atiende primero a una parte del tráfico.",
        puntos: ["Despliegue gradual", "Regreso a la versión anterior"],
      },
      {
        diagrama: "monitor",
        titulo: "Monitoreo en producción",
        texto: "Se vigila cómo responde el modelo cada día y se avisa cuando se desvía.",
        puntos: ["Registro de cada interacción", "Avisos por desviación"],
      },
    ],
  },
  {
    id: "servir",
    nombre: "Servir",
    titular: "Corre donde usted decide.",
    tarjetas: [
      {
        diagrama: "perimetro",
        titulo: "En su infraestructura",
        texto: "En sus servidores o en su nube privada. Sus datos no salen de ahí.",
        puntos: ["Modelos de pesos abiertos", "Servidores propios o nube privada"],
      },
      {
        diagrama: "puerta",
        titulo: "Una sola puerta de acceso",
        texto: "Todos sus equipos entran por el mismo punto, que decide qué modelo atiende.",
        puntos: ["Permisos por equipo", "Cambio de modelo sin cambiar sistemas"],
      },
      {
        diagrama: "registro",
        titulo: "Registro de cada consulta",
        texto: "Quién preguntó, a qué modelo, con qué información y cuándo.",
        puntos: ["Bitácora consultable", "Evidencia para auditoría"],
      },
      {
        diagrama: "gasto",
        titulo: "Límites de gasto",
        texto: "Cada área tiene un tope. Al acercarse, se avisa.",
        puntos: ["Topes por área", "Avisos anticipados"],
      },
    ],
  },
];

export type Publicacion = {
  slug: string;
  tipo: "Proyecto" | "Experimento" | "Benchmark" | "Nota";
  titulo: string;
  resumen: string;
  apartados: {
    titulo: string;
    parrafos: string[];
    flujo?: string[];
    graficas?: Grafica[];
    codigo?: string;
  }[];
};

export const PUBLICACIONES: Publicacion[] = [
  {
    slug: "su-inteligencia-en-deteccion-de-fraude",
    tipo: "Benchmark",
    titulo: "Nuestro modelo de 9B igualó a Claude Opus 4.5 detectando fraude, con 2 falsas alarmas contra 19",
    resumen:
      "Lo desarrollamos en Dimia. En nuestra prueba con 58 historiales sintéticos, un modelo pequeño ajustado encontró 25 de 32 casos con fraude, la misma cifra que Claude Opus 4.5.",
    apartados: [
      {
        titulo: "Resumen",
        parrafos: [
          "En Dimia desarrollamos un revisor de gastos de personal: diseñamos los datos, ajustamos el modelo y construimos la evaluación. La base es Qwen3.5-9B, de pesos abiertos y 9 mil millones de parámetros. En el mismo examen y con la misma instrucción, igualó a Claude Opus 4.5 en detección y levantó 2 falsas alarmas en 26 casos limpios, contra 19.",
          "Abajo están el método y las cifras completas.",
        ],
        graficas: ["alarmas", "deteccion"],
      },
      {
        titulo: "El problema",
        parrafos: [
          "Las reglas revisan un recibo a la vez. Hay fraudes que solo se ven al leer el mes completo de una persona: cada recibo cumple, el conjunto no. Por ejemplo, una compra que parece normal y se repite en varias tiendas durante tres semanas.",
          "Un revisor así tiene que encontrar el patrón sin acusar a quien hizo todo bien. Cada falsa alarma es tiempo de su equipo revisando algo que estaba correcto.",
        ],
      },
      {
        titulo: "Por qué un modelo propio",
        parrafos: [
          "Un revisor de gastos lee nombres, montos, viajes y comidas de su personal. Con un modelo de pesos abiertos, la empresa puede correrlo en su propia infraestructura, decidir con qué se ajusta y conservar la versión que ya probó, sin depender de los cambios de un proveedor.",
          "Eso es ser dueño de su inteligencia. La pregunta era si un modelo pequeño, ajustado a una sola tarea, alcanza para hacerla.",
        ],
      },
      {
        titulo: "La arquitectura que construimos",
        parrafos: [
          "El modelo es la segunda línea. Primero, código determinista revisa cada recibo. Después, el modelo lee el mes de cada persona: los recibos que pasaron y los resúmenes calculados por código. Solo puede mandar a revisión; nunca aprueba ni rechaza.",
        ],
        flujo: [
          "Recibos del mes",
          "Reglas deterministas, recibo por recibo",
          "Resumen del mes calculado por código",
          "Modelo ajustado busca patrones",
          "Revisión de una persona",
        ],
        codigo: `{"escalate": [{"receipt_id": "R-07", "reason": "..."}]}`,
      },
      {
        titulo: "Los datos que generamos",
        parrafos: [
          "Generamos 290 historiales sintéticos: 162 con fraude y 128 limpios. El código fija el esqueleto de cada mes (recibos, fechas, viajes, idioma) a partir de la misma distribución para ambas clases. Modelos de lenguaje escriben el texto y cada historial se valida contra las reglas.",
          "232 historiales se usaron para entrenar (130 con fraude, 102 limpios) y 58 para examinar (32 y 26). La separación se hizo por esquema de fraude: los del examen no se usaron para entrenar, aunque algunos se les parecen.",
          "Antes de entrenar medimos si rasgos superficiales, como montos o tipo de gasto, bastan para adivinar la respuesta. Nuestro umbral era un área bajo la curva (AUROC) de 0.60 o menos. La versión anterior de los datos dio 0.876; esta dio 0.657. Mejoró, pero no pasa.",
        ],
      },
      {
        titulo: "Cómo lo entrenamos",
        parrafos: [
          "Hicimos el ajuste con adaptadores (QLoRA) sobre el modelo comprimido a 4 bits, en una sola tarjeta A100 de 80 GB. El modelo de 9B tardó 795 segundos, unos 13 minutos. El de 27B, 2,333 segundos, unos 39 minutos.",
        ],
        codigo: `modelos base       Qwen3.5-9B · Qwen3.5-27B
método             QLoRA 4 bits (nf4), bf16
adaptador          rango 16 · alfa 32 · dropout 0.05
capas ajustadas    q, k, v, o, gate, up, down
épocas             3
tasa               2e-4
lote               2, acumulado en 4 pasos
longitud máxima    6,000 tokens
pérdida            solo sobre la respuesta
semilla            2026`,
      },
      {
        titulo: "Curvas de entrenamiento",
        parrafos: [
          "En la tercera época la pérdida de examen sube mientras la de entrenamiento sigue bajando: señal de sobreajuste. Evaluamos el modelo final, sin elegir la mejor época.",
          "Un detalle que costó un intento: la primera corrida calculaba la pérdida sobre todo el texto y el modelo detectó 0 de 32. Al calcularla solo sobre la respuesta, aprendió la tarea.",
        ],
        graficas: ["perdida"],
      },
      {
        titulo: "Cómo medimos",
        parrafos: [
          "Un caso con fraude cuenta como detectado si el modelo señala al menos un recibo sembrado. Un caso limpio cuenta como falsa alarma si señala cualquiera.",
          "Todos recibieron la misma instrucción, sin ejemplos, con temperatura cero o sin muestreo. Los modelos de Claude y los Qwen base se consultaron por API, con hasta 3,000 tokens de respuesta. Los ajustados corrieron en la tarjeta de entrenamiento, con un tope de 300.",
        ],
      },
      {
        titulo: "Resultados completos",
        parrafos: [
          "Frente a Opus 4.5, la detección es un empate: cada uno encontró 4 casos que el otro no. En falsas alarmas hubo 17 casos limpios que solo Opus marcó y ninguno al revés (prueba exacta de McNemar, p < 0.001).",
          "Frente a Claude Sonnet 5.5, el modelo ajustado de 9B detectó 25 contra 20 y tuvo 2 falsas alarmas contra 8. Con esta muestra, ninguna de las dos diferencias es estadísticamente significativa (p = 0.23 y p = 0.07). No probamos Claude Opus 5.5.",
          "El modelo de 27B no superó al de 9B.",
        ],
        graficas: ["tabla"],
      },
      {
        titulo: "Costo",
        parrafos: [
          "El ajuste del modelo de 9B tomó unos 13 minutos de una tarjeta.",
          "Como referencia, consultar los 58 historiales por API costó 0.56 dólares con Claude Opus 4.5 y 0.01 con Qwen3.5-9B base. Esa segunda cifra es del modelo sin ajustar en un proveedor externo, no del nuestro.",
        ],
      },
      {
        titulo: "Qué significa para su empresa",
        parrafos: [
          "En una tarea bien definida, vale la pena medir un modelo propio antes de pagar por el más grande. El orden importa: primero el examen, después el ajuste, y la decisión con las cifras a la vista.",
          "Alcance de la prueba: 58 historiales sintéticos, generados con el mismo método que los de entrenamiento. No es una evaluación independiente ni con gastos reales.",
        ],
      },
    ],
  },
  {
    slug: "como-evaluamos-el-agente-de-voz",
    tipo: "Experimento",
    titulo: "Cómo evaluamos un agente de voz antes de cambiarlo",
    resumen: "Un modelo hace de cliente, otro contesta, y la calificación sale de lo que quedó en la base de datos.",
    apartados: [
      {
        titulo: "El problema",
        parrafos: [
          "Cambiar una instrucción o un modelo puede mejorar un tipo de llamada y descomponer otro. Revisar unas cuantas conversaciones a mano no lo detecta.",
        ],
      },
      {
        titulo: "El método",
        parrafos: [
          "Un modelo de lenguaje hace el papel del cliente, con una persona y un objetivo. Conversa por texto contra el agente, que usa las mismas instrucciones y las mismas herramientas que en producción, sobre una base de datos real.",
          "Cada caso crea un negocio desechable, siembra su agenda, corre la llamada y borra todo al terminar.",
          "Al colgar se revisa el estado final de la base: si la cita quedó, con qué servicio, qué día y a nombre de quién. Un caso pasa solo si cumple todas sus reglas.",
        ],
      },
      {
        titulo: "Qué medimos",
        parrafos: [
          "Tareas resueltas, llamadas resueltas sin una persona, transferencias correctas e incorrectas, frases que el agente no debía decir y turnos por tarea.",
        ],
      },
    ],
  },
  {
    slug: "una-agenda-que-no-se-encima",
    tipo: "Proyecto",
    titulo: "Una agenda que no admite dos citas en el mismo horario",
    resumen: "La regla vive en la base de datos, no en las instrucciones del modelo.",
    apartados: [
      {
        titulo: "El problema",
        parrafos: [
          "Dos llamadas simultáneas pueden pedir el mismo horario. Si la disponibilidad la decide el modelo, tarde o temprano ofrece un lugar ocupado.",
        ],
      },
      {
        titulo: "La solución",
        parrafos: ["Una restricción de exclusión en Postgres impide que dos citas confirmadas del mismo recurso se traslapen."],
        codigo: `alter table booking
  add constraint booking_sin_traslape
  exclude using gist (
    resource_id with =,
    tstzrange(inicio, fin, '[)') with &&
  )
  where (estado = 'confirmada');`,
      },
      {
        titulo: "El resultado en la llamada",
        parrafos: ["Si el horario ya está tomado, la base rechaza la escritura y el agente ofrece el siguiente libre sin colgar."],
      },
    ],
  },
];
