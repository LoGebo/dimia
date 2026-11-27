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
  apartados: { titulo: string; parrafos: string[]; codigo?: string }[];
};

export const PUBLICACIONES: Publicacion[] = [
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
