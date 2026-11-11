// Propone etiquetas para una prenda recién subida. No guarda nada: el
// cliente muestra la propuesta y el usuario confirma o corrige.
import { withSupabase } from "npm:@supabase/server@1.9.2";
import { fallo, leerJson, log, ok } from "../_shared/http.ts";
import { comoDataUrl, descargar } from "../_shared/imagen.ts";
import { liquidar, reservar } from "../_shared/cuota.ts";
import { chatJson, MODELO_VISION } from "../_shared/nvidia.ts";
import { opcionIA, rutaPropia, textoIA } from "../_shared/validar.ts";

const FUNCION = "etiquetar-prenda";
const CATEGORIAS = ["arriba", "abajo", "calzado"] as const;
const TEMPORADAS = ["calor", "templado", "frio", "cualquiera"] as const;

const PROMPT =
  "Eres el asistente de un vestidor. Mira la prenda de la imagen y responde SOLO un objeto JSON con estas claves: " +
  '"category" ("arriba" para playeras, camisas, sudaderas, chamarras o vestidos; "abajo" para pantalones, shorts o faldas; ' +
  '"calzado" para tenis, zapatos o sandalias), "name" (nombre corto en español, máximo 5 palabras), ' +
  '"color" (color principal en español), "color_hex" (#RRGGBB del color principal), ' +
  '"style" (una o dos palabras: casual, deportivo, formal, streetwear, elegante...), ' +
  '"season" ("calor", "templado", "frio" o "cualquiera"), "formality" (entero de 1 a 5, 1 muy relajado y 5 muy formal). ' +
  "Sin texto fuera del JSON.";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const inicio = Date.now();
    try {
      const userId = ctx.userClaims!.id;
      const cuerpo = await leerJson(req);
      const ruta = rutaPropia(cuerpo.ref_path, "ref_path", userId);

      // Cliente del usuario: las políticas de Storage también protegen.
      const imagen = await descargar(ctx.supabase, "prendas", ruta, true);

      const reserva = await reservar(ctx.supabaseAdmin, userId, "etiquetar", "nvidia", 0);
      try {
        const { datos, modelo } = await chatJson([MODELO_VISION], [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: comoDataUrl(imagen) } },
            ],
          },
        ], 300);
        await liquidar(ctx.supabaseAdmin, reserva, "ok", 0);

        const hex = textoIA(datos.color_hex, 7);
        const formalidad = Number(datos.formality);
        const sugerencia = {
          category: opcionIA(datos.category, CATEGORIAS),
          name: textoIA(datos.name, 80),
          color: textoIA(datos.color, 40),
          color_hex: hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null,
          style: textoIA(datos.style, 40),
          season: opcionIA(datos.season, TEMPORADAS),
          formality: Number.isInteger(formalidad) && formalidad >= 1 && formalidad <= 5 ? formalidad : null,
        };
        log(FUNCION, "ok", { modelo, ms: Date.now() - inicio });
        return ok({ sugerencia, modelo });
      } catch (e) {
        await liquidar(ctx.supabaseAdmin, reserva, "error", 0, e instanceof Error ? e.message : String(e));
        throw e;
      }
    } catch (e) {
      return fallo(e, FUNCION);
    }
  }),
};
