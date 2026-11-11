// Analiza la foto de cuerpo para recomendar colores, cortes y largos.
// Solo corre si el usuario ya dio su consentimiento de foto y de análisis.
import { withSupabase } from "npm:@supabase/server@1.9.2";
import { ErrorApp, fallo, log, ok } from "../_shared/http.ts";
import { comoDataUrl, descargar } from "../_shared/imagen.ts";
import { liquidar, reservar } from "../_shared/cuota.ts";
import { chatJson, MODELO_VISION } from "../_shared/nvidia.ts";
import { listaIA, opcionIA, rutaPropia, textoIA } from "../_shared/validar.ts";

const FUNCION = "analizar-cuerpo";

const PROMPT =
  "Eres asesor de imagen para una app familiar de ropa. Analiza la foto solo para recomendar ropa. " +
  "Reglas: lenguaje neutral y respetuoso; no hables de peso, belleza ni defectos; no adivines edad ni datos sensibles; " +
  "describe proporciones solo en términos de cómo queda la ropa. " +
  "Responde SOLO un objeto JSON con estas claves: " +
  '"tono_piel" (descripción breve en español), "subtono" ("calido", "frio" o "neutro"), ' +
  '"colores_favorecen" (lista de 4 a 8 colores en español), "colores_evitar" (lista de 0 a 5 colores), ' +
  '"proporciones" (objeto con "torso": "corto", "medio" o "largo"; "piernas": "cortas", "medias" o "largas"; ' +
  '"hombros": "angostos", "medios" o "anchos"), ' +
  '"cortes_recomendados" (lista de 3 a 6 cortes o siluetas de ropa), ' +
  '"largos_recomendados" (lista de 2 a 5 consejos de largo de prenda), ' +
  '"notas" (una frase con el consejo principal). Sin texto fuera del JSON.';

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const inicio = Date.now();
    try {
      if (req.method !== "POST") throw new ErrorApp("metodo", 405, "Esta función solo acepta POST.");
      const userId = ctx.userClaims!.id;

      const { data: perfil, error } = await ctx.supabase
        .from("profiles")
        .select("body_ref_path, body_photo_consent_at, analysis_consent_at")
        .eq("id", userId)
        .single();
      if (error || !perfil) throw new ErrorApp("perfil_no_encontrado", 404, "No encontramos tu perfil.");
      if (!perfil.body_photo_consent_at || !perfil.analysis_consent_at) {
        throw new ErrorApp(
          "sin_consentimiento",
          403,
          "Antes del análisis necesitas aceptar el aviso de la foto de cuerpo y del análisis.",
        );
      }
      if (!perfil.body_ref_path) {
        throw new ErrorApp("sin_foto", 409, "Primero sube tu foto de cuerpo completo.");
      }
      const ruta = rutaPropia(perfil.body_ref_path, "body_ref_path", userId);
      const imagen = await descargar(ctx.supabase, "cuerpos", ruta, true);

      const reserva = await reservar(ctx.supabaseAdmin, userId, "analizar", "nvidia", 0);
      try {
        const { datos, modelo } = await chatJson([MODELO_VISION], [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: comoDataUrl(imagen) } },
            ],
          },
        ], 700);

        const prop = (datos.proporciones ?? {}) as Record<string, unknown>;
        const analisis = {
          tono_piel: textoIA(datos.tono_piel, 80),
          subtono: opcionIA(datos.subtono, ["calido", "frio", "neutro"] as const),
          colores_favorecen: listaIA(datos.colores_favorecen, 8, 30),
          colores_evitar: listaIA(datos.colores_evitar, 5, 30),
          proporciones: {
            torso: opcionIA(prop.torso, ["corto", "medio", "largo"] as const),
            piernas: opcionIA(prop.piernas, ["cortas", "medias", "largas"] as const),
            hombros: opcionIA(prop.hombros, ["angostos", "medios", "anchos"] as const),
          },
          cortes_recomendados: listaIA(datos.cortes_recomendados, 6, 80),
          largos_recomendados: listaIA(datos.largos_recomendados, 5, 100),
          notas: textoIA(datos.notas, 200),
          modelo,
        };

        const { error: errorGuardar } = await ctx.supabaseAdmin
          .from("profiles")
          .update({ body_analysis: analisis, body_analysis_at: new Date().toISOString() })
          .eq("id", userId);
        if (errorGuardar) throw new Error(`guardar análisis: ${errorGuardar.message}`);

        await liquidar(ctx.supabaseAdmin, reserva, "ok", 0);
        log(FUNCION, "ok", { modelo, ms: Date.now() - inicio });
        return ok({ analisis });
      } catch (e) {
        await liquidar(ctx.supabaseAdmin, reserva, "error", 0, e instanceof Error ? e.message : String(e));
        throw e;
      }
    } catch (e) {
      return fallo(e, FUNCION);
    }
  }),
};
