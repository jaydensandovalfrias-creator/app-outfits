// Validación de entradas. Todo lo que llega del cliente pasa por aquí.
import { ErrorApp } from "./http.ts";

// Quita caracteres de control (deja saltos de línea) y espacios sobrantes.
function limpiar(texto: string): string {
  return texto.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
}

export function texto(valor: unknown, campo: string, max: number, opcional: true): string | null;
export function texto(valor: unknown, campo: string, max: number, opcional?: false): string;
export function texto(valor: unknown, campo: string, max: number, opcional = false): string | null {
  if (valor === undefined || valor === null || valor === "") {
    if (opcional) return null;
    throw new ErrorApp("dato_faltante", 400, `Falta el campo "${campo}".`);
  }
  if (typeof valor !== "string") {
    throw new ErrorApp("dato_invalido", 400, `El campo "${campo}" debe ser texto.`);
  }
  const limpio = limpiar(valor);
  if (limpio.length > max) {
    throw new ErrorApp("dato_invalido", 400, `El campo "${campo}" admite como máximo ${max} caracteres.`);
  }
  if (!limpio) {
    if (opcional) return null;
    throw new ErrorApp("dato_faltante", 400, `Falta el campo "${campo}".`);
  }
  return limpio;
}

export function entero(valor: unknown, campo: string, min: number, max: number, opcional: true): number | null;
export function entero(valor: unknown, campo: string, min: number, max: number, opcional?: false): number;
export function entero(valor: unknown, campo: string, min: number, max: number, opcional = false): number | null {
  if (valor === undefined || valor === null) {
    if (opcional) return null;
    throw new ErrorApp("dato_faltante", 400, `Falta el campo "${campo}".`);
  }
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < min || valor > max) {
    throw new ErrorApp("dato_invalido", 400, `El campo "${campo}" debe ser un entero entre ${min} y ${max}.`);
  }
  return valor;
}

export function uuid(valor: unknown, campo: string): string {
  if (typeof valor !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) {
    throw new ErrorApp("dato_invalido", 400, `El campo "${campo}" no es un identificador válido.`);
  }
  return valor.toLowerCase();
}

/** Ruta de Storage dentro de la carpeta del usuario, sin subir de nivel. */
export function rutaPropia(valor: unknown, campo: string, userId: string): string {
  const ruta = texto(valor, campo, 200);
  if (!ruta.startsWith(`${userId}/`) || ruta.includes("..") || ruta.includes("//")) {
    throw new ErrorApp("ruta_ajena", 403, `La ruta de "${campo}" no pertenece a tu cuenta.`);
  }
  return ruta;
}

/** Recorta un valor que viene de la IA a texto corto o null. */
export function textoIA(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const limpio = limpiar(valor).slice(0, max);
  return limpio || null;
}

/** Lista de textos cortos que viene de la IA. */
export function listaIA(valor: unknown, maxElementos: number, maxLargo: number): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((v) => textoIA(v, maxLargo))
    .filter((v): v is string => v !== null)
    .slice(0, maxElementos);
}

export function opcionIA<T extends string>(valor: unknown, opciones: readonly T[]): T | null {
  return typeof valor === "string" && (opciones as readonly string[]).includes(valor) ? (valor as T) : null;
}
