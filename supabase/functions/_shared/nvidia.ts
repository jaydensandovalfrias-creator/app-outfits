// Cliente de NVIDIA (API compatible con OpenAI). Modelos con Free Endpoint
// confirmados en build.nvidia.com el 2026-11-11.
import { ErrorApp, log } from "./http.ts";

const URL_NVIDIA = "https://integrate.api.nvidia.com/v1/chat/completions";

export const MODELO_VISION = "nvidia/nemotron-3.5-super-vl-120b-a12b";
// El de texto es el más rápido; si falla, el de visión también responde texto.
export const MODELOS_TEXTO = ["nvidia/nemotron-3.5-lightning-30b-a3b", MODELO_VISION];

export type Parte =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export interface Mensaje {
  role: "system" | "user";
  content: string | Parte[];
}

/** Saca el primer objeto JSON de la respuesta del modelo. */
export function extraerJson(texto: unknown): Record<string, unknown> | null {
  if (typeof texto !== "string") return null;
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    const valor = JSON.parse(texto.slice(inicio, fin + 1));
    return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

/**
 * Pide una respuesta JSON. Prueba los modelos en orden y pasa al siguiente si
 * uno falla del lado de NVIDIA (5xx, tiempo agotado o respuesta sin JSON).
 */
export async function chatJson(
  modelos: string[],
  mensajes: Mensaje[],
  maxTokens: number,
): Promise<{ datos: Record<string, unknown>; modelo: string }> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) throw new Error("falta el secreto NVIDIA_API_KEY");

  for (const modelo of modelos) {
    let respuesta: Response;
    try {
      respuesta = await fetch(URL_NVIDIA, {
        method: "POST",
        signal: AbortSignal.timeout(45_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelo,
          messages: mensajes,
          max_tokens: maxTokens,
          temperature: 0.2,
          // Sin razonamiento: respuestas directas y más rápidas.
          chat_template_kwargs: { enable_thinking: false },
        }),
      });
    } catch (e) {
      log("nvidia", "sin_respuesta", { modelo, detalle: String(e).slice(0, 200) });
      continue;
    }
    if (respuesta.status === 429) {
      await respuesta.body?.cancel();
      throw new ErrorApp("ia_ocupada", 503, "El servicio de IA está saturado. Intenta de nuevo en un minuto.");
    }
    if (respuesta.status >= 500) {
      log("nvidia", "error_proveedor", { modelo, status: respuesta.status });
      await respuesta.body?.cancel();
      continue;
    }
    if (!respuesta.ok) {
      throw new Error(`nvidia ${respuesta.status}: ${(await respuesta.text()).slice(0, 200)}`);
    }
    const cuerpo = await respuesta.json();
    const datos = extraerJson(cuerpo?.choices?.[0]?.message?.content);
    if (datos) return { datos, modelo };
    log("nvidia", "respuesta_sin_json", { modelo });
  }
  throw new ErrorApp("ia_no_disponible", 503, "El servicio de IA no respondió. Intenta de nuevo en unos minutos.");
}
