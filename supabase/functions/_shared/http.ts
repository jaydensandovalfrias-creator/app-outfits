// Respuestas, errores y logs comunes a todas las funciones.

/** Error que se puede mostrar al usuario: código estable + mensaje en español. */
export class ErrorApp extends Error {
  constructor(
    public readonly codigo: string,
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export function ok(datos: unknown, status = 200): Response {
  return Response.json(datos, { status });
}

/** Convierte cualquier error en una respuesta. Los internos no filtran detalles. */
export function fallo(e: unknown, funcion: string): Response {
  if (e instanceof ErrorApp) {
    log(funcion, "rechazo", { codigo: e.codigo, status: e.status });
    return Response.json({ error: e.codigo, mensaje: e.message }, { status: e.status });
  }
  const detalle = e instanceof Error ? e.message : String(e);
  log(funcion, "error_interno", { detalle: detalle.slice(0, 300) });
  return Response.json(
    { error: "interno", mensaje: "Algo falló de nuestro lado. Intenta de nuevo en un momento." },
    { status: 500 },
  );
}

/** Lee un cuerpo JSON pequeño. Solo acepta POST y objetos. */
export async function leerJson(req: Request, maxBytes = 8_000): Promise<Record<string, unknown>> {
  if (req.method !== "POST") {
    throw new ErrorApp("metodo", 405, "Esta función solo acepta POST.");
  }
  const texto = await req.text();
  if (new TextEncoder().encode(texto).length > maxBytes) {
    throw new ErrorApp("cuerpo_grande", 413, "La petición es demasiado grande.");
  }
  let valor: unknown;
  try {
    valor = texto ? JSON.parse(texto) : {};
  } catch {
    throw new ErrorApp("json_invalido", 400, "El cuerpo de la petición no es JSON válido.");
  }
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) {
    throw new ErrorApp("json_invalido", 400, "El cuerpo de la petición debe ser un objeto JSON.");
  }
  return valor as Record<string, unknown>;
}

/** Log estructurado sin datos personales (se ve en los logs de Edge Functions). */
export function log(funcion: string, evento: string, datos: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ funcion, evento, ...datos }));
}
