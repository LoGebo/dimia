import { loadFont as cargarNewsreader } from "@remotion/google-fonts/Newsreader";
import { loadFont as cargarArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as cargarMono } from "@remotion/google-fonts/IBMPlexMono";

const newsreader = cargarNewsreader("normal", { weights: ["300", "400"], subsets: ["latin"] });
const archivo = cargarArchivo("normal", { weights: ["400", "500", "600", "800"], subsets: ["latin"] });
const mono = cargarMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const titular = newsreader.fontFamily;
export const interfaz = archivo.fontFamily;
export const cifras = mono.fontFamily;

export const esperarFuentes = () =>
  Promise.all([newsreader.waitUntilDone(), archivo.waitUntilDone(), mono.waitUntilDone()]);
