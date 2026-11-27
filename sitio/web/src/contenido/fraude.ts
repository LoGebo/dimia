// Cifras tomadas de los archivos de evaluación y de los registros de entrenamiento (octubre 2026).
// Intervalos: Wilson al 95%. Gráficas y tabla salen de aquí.
export const EXAMEN = { fraude: 32, limpios: 26 };

export type Fila = {
  modelo: string;
  propio?: boolean;
  detectados: number;
  icDeteccion: [number, number];
  alarmas: number;
  icAlarmas: [number, number];
  precision: number;
  cobertura: number;
  ilegibles: number;
};

export const FILAS: Fila[] = [
  { modelo: "Qwen3.5-9B ajustado", propio: true, detectados: 25, icDeteccion: [61.2, 89.0], alarmas: 2, icAlarmas: [2.1, 24.1], precision: 0.93, cobertura: 0.72, ilegibles: 5 },
  { modelo: "Qwen3.5-27B ajustado", propio: true, detectados: 25, icDeteccion: [61.2, 89.0], alarmas: 5, icAlarmas: [8.5, 37.9], precision: 0.88, cobertura: 0.72, ilegibles: 5 },
  { modelo: "Claude Opus 4.5", detectados: 25, icDeteccion: [61.2, 89.0], alarmas: 19, icAlarmas: [53.9, 86.3], precision: 0.6, cobertura: 0.63, ilegibles: 0 },
  { modelo: "Claude Sonnet 5.5", detectados: 20, icDeteccion: [45.3, 77.1], alarmas: 8, icAlarmas: [16.5, 50.0], precision: 0.77, cobertura: 0.51, ilegibles: 0 },
  { modelo: "Qwen3.5-9B base", detectados: 22, icDeteccion: [51.4, 82.0], alarmas: 19, icAlarmas: [53.9, 86.3], precision: 0.53, cobertura: 0.57, ilegibles: 2 },
  { modelo: "Qwen3.5-27B base", detectados: 20, icDeteccion: [45.3, 77.1], alarmas: 15, icAlarmas: [38.9, 74.5], precision: 0.61, cobertura: 0.52, ilegibles: 2 },
];

type Serie = [epoca: number, perdida: number][];
const pasos = [0.172, 0.345, 0.517, 0.69, 0.862, 1.034, 1.207, 1.379, 1.552, 1.724, 1.897, 2.069, 2.241, 2.414, 2.586, 2.759, 2.931];
const serie = (v: number[]): Serie => v.map((p, i) => [pasos[i], p]);

export const PERDIDA: { modelo: string; entrenamiento: Serie; examen: Serie }[] = [
  {
    modelo: "Qwen3.5-9B",
    entrenamiento: serie([0.4899, 0.4132, 0.4336, 0.4087, 0.3444, 0.37, 0.2412, 0.2773, 0.2322, 0.2931, 0.2624, 0.169, 0.1689, 0.175, 0.1591, 0.1718, 0.1496]),
    examen: [[1, 0.2909], [2, 0.2841], [3, 0.3201]],
  },
  {
    modelo: "Qwen3.5-27B",
    entrenamiento: serie([0.459, 0.37, 0.3754, 0.3427, 0.2888, 0.3135, 0.2048, 0.2425, 0.1937, 0.2582, 0.2101, 0.1314, 0.1345, 0.122, 0.1156, 0.1314, 0.1188]),
    examen: [[1, 0.2611], [2, 0.2627], [3, 0.2865]],
  },
];
