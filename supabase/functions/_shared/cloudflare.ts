// Cliente de Cloudflare Workers AI para flux-2-klein-4b.
// Entrada multipart/form-data; referencias input_image_0..3 menores a 512 px;
// respuesta JPEG en base64 dentro de result.image.
import { deBase64, type Imagen } from "./imagen.ts";

const MODELO = "@cf/black-forest-labs/flux-2-klein-4b";

/** Neuronas aproximadas de una pasada (medido: 117.71 con 3 referencias). */
export function estimarNeuronas(referencias: number, ancho: number, alto: number): number {
  const bloquesSalida = Math.ceil(ancho / 512) * Math.ceil(alto / 512);
  return Math.ceil(referencias * 5.37 + bloquesSalida * 26.05) + 5;
}

export class ErrorCloudflare extends Error {
  constructor(public readonly status: number, detalle: string) {
    super(detalle);
  }
}

export async function generar(
  prompt: string,
  referencias: Imagen[],
  ancho: number,
  alto: number,
): Promise<{ jpeg: Uint8Array; neuronas: number | null }> {
  const cuenta = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!cuenta || !token) throw new Error("faltan los secretos de Cloudflare");
  if (referencias.length > 4) throw new Error("flux-2-klein-4b acepta máximo 4 referencias");

  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", String(ancho));
  form.append("height", String(alto));
  referencias.forEach((ref, i) => {
    form.append(`input_image_${i}`, new Blob([ref.bytes.slice()], { type: ref.tipo }), `referencia_${i}`);
  });

  const respuesta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${cuenta}/ai/run/${MODELO}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const neuronas = Number(respuesta.headers.get("cf-ai-neurons"));
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !cuerpo?.success || typeof cuerpo?.result?.image !== "string") {
    const errores = JSON.stringify(cuerpo?.errors ?? []).slice(0, 200);
    throw new ErrorCloudflare(respuesta.status, `cloudflare ${respuesta.status}: ${errores}`);
  }
  return { jpeg: deBase64(cuerpo.result.image), neuronas: Number.isFinite(neuronas) ? neuronas : null };
}
