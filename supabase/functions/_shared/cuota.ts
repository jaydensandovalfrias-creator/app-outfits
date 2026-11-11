// Reserva y liquidación de cuota de IA (tabla ai_usage).
import { ErrorApp, log } from "./http.ts";

export type Tipo = "etiquetar" | "analizar" | "verlo" | "recomendar";
export type Proveedor = "cloudflare" | "nvidia";

// Cliente admin mínimo (el de supabase-js lo cumple).
interface ClienteAdmin {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from(tabla: string): {
    update(valores: Record<string, unknown>): {
      eq(col: string, val: unknown): PromiseLike<{ error: { message?: string } | null }>;
    };
  };
}

// La cuota se reinicia a las 00:00 UTC, que son las 18:00 en el centro de México.
const REINICIO = "Se reinicia a las 6 de la tarde (hora del centro de México).";

const MENSAJES: Record<string, string> = {
  limite_por_minuto: "Vas muy rápido. Espera un minuto y vuelve a intentar.",
  limite_llamadas_dia: `Llegaste al máximo de usos de IA de hoy. ${REINICIO}`,
  cuota_usuario: `Ya usaste tu cuota de imágenes de hoy. ${REINICIO}`,
  cuota_global: `La familia ya usó toda la cuota de imágenes de hoy. ${REINICIO}`,
};

/** Reserva la llamada si cabe en los límites. Devuelve el id del registro. */
export async function reservar(
  admin: ClienteAdmin,
  userId: string,
  tipo: Tipo,
  proveedor: Proveedor,
  neuronas: number,
): Promise<number> {
  const { data, error } = await admin.rpc("reservar_llamada_ia", {
    p_user: userId,
    p_kind: tipo,
    p_provider: proveedor,
    p_neuronas: neuronas,
  });
  if (error) {
    const codigo = Object.keys(MENSAJES).find((c) => (error.message ?? "").includes(c));
    if (codigo) throw new ErrorApp(codigo, 429, MENSAJES[codigo]);
    throw new Error(`reservar_llamada_ia: ${error.message}`);
  }
  return Number(data);
}

/** Cierra el registro con el costo real (o 0 si falló sin cobrar). */
export async function liquidar(
  admin: ClienteAdmin,
  id: number,
  estado: "ok" | "error",
  neuronas: number | null,
  detalle?: string,
): Promise<void> {
  const { error } = await admin
    .from("ai_usage")
    .update({
      status: estado,
      neurons: neuronas,
      detail: detalle ? detalle.slice(0, 300) : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) log("cuota", "liquidar_fallo", { id, detalle: error.message });
}
