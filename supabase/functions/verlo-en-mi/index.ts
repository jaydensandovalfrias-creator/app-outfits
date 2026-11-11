// "Verlo en mí": genera la foto realista con flux-2-klein-4b.
// Referencias: cuerpo + cabeza + prendas (máximo 4 por pasada). Si hay
// arriba, abajo y calzado se hacen dos pasadas:
//   1. cuerpo + cabeza + arriba + abajo
//   2. resultado + cabeza + calzado
// El pegado de la cabeza original y la corrección de color se hacen en el
// navegador (fase 3) con la foto completa.
import { withSupabase } from "npm:@supabase/server@1.9.2";
import { Image } from "jsr:@matmen/imagescript@1.3.0";
import { ErrorApp, fallo, leerJson, log, ok } from "../_shared/http.ts";
import { descargar, type Imagen, inspeccionar } from "../_shared/imagen.ts";
import { liquidar, reservar } from "../_shared/cuota.ts";
import { ErrorCloudflare, estimarNeuronas, generar } from "../_shared/cloudflare.ts";
import { entero, rutaPropia } from "../_shared/validar.ts";

const FUNCION = "verlo-en-mi";
const ANCHO = 768;
const ALTO = 1024;
const ORDINALES = ["first", "second", "third", "fourth"];
const NOMBRE_EN: Record<string, string> = { arriba: "top", abajo: "bottom", calzado: "shoes" };

interface Prenda {
  id: number;
  category: "arriba" | "abajo" | "calzado";
  ref_path: string;
}

function promptVestir(prendas: string[]): string {
  // Imagen 1: persona; imagen 2: cabeza; 3 y 4: prendas.
  const lista = prendas.map((p, i) => `the ${NOMBRE_EN[p]} from the ${ORDINALES[i + 2]} image`).join(" and ");
  return `Dress the person from the first image in ${lista}. ` +
    "The face and hair must match the second image exactly. " +
    "Keep the body shape, pose and background from the first image unchanged. Full body photo.";
}

const PROMPT_CALZADO = "Put the shoes from the third image on the person from the first image. " +
  "The face and hair must match the second image exactly. " +
  "Keep the clothes, body shape, pose and background from the first image unchanged. Full body photo.";

/** Reduce el resultado para usarlo como referencia (menor a 512 px). */
async function comoReferencia(jpeg: Uint8Array): Promise<Imagen> {
  const img = await Image.decode(jpeg);
  if (!(img instanceof Image)) throw new Error("resultado no es una imagen fija");
  img.resize(Image.RESIZE_AUTO, 511);
  const bytes = await img.encodeJPEG(90);
  const info = inspeccionar(bytes);
  if (!info) throw new Error("no se pudo reducir el resultado");
  return { bytes, ...info };
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    const inicio = Date.now();
    try {
      const userId = ctx.userClaims!.id;
      const cuerpo = await leerJson(req);
      const ids = {
        arriba: entero(cuerpo.top_id, "top_id", 1, Number.MAX_SAFE_INTEGER, true),
        abajo: entero(cuerpo.bottom_id, "bottom_id", 1, Number.MAX_SAFE_INTEGER, true),
        calzado: entero(cuerpo.shoes_id, "shoes_id", 1, Number.MAX_SAFE_INTEGER, true),
      };
      const pedidos = Object.values(ids).filter((v): v is number => v !== null);
      if (pedidos.length === 0) {
        throw new ErrorApp("sin_prendas", 400, "Elige al menos una prenda para probártela.");
      }

      // Perfil y prendas con el cliente del usuario: RLS garantiza que son suyas.
      const { data: perfil } = await ctx.supabase
        .from("profiles")
        .select("body_ref_path, head_ref_path, body_photo_consent_at")
        .eq("id", userId)
        .single();
      if (!perfil?.body_photo_consent_at || !perfil.body_ref_path || !perfil.head_ref_path) {
        throw new ErrorApp("sin_foto", 409, "Primero sube tu foto de cuerpo completo desde tu perfil.");
      }
      const { data: filas, error: errorPrendas } = await ctx.supabase
        .from("garments")
        .select("id, category, ref_path")
        .in("id", pedidos);
      if (errorPrendas) throw new Error(`leer prendas: ${errorPrendas.message}`);
      const prendas = new Map((filas as Prenda[]).map((p) => [p.id, p]));
      for (const [ranura, id] of Object.entries(ids)) {
        if (id === null) continue;
        const prenda = prendas.get(id);
        if (!prenda) throw new ErrorApp("prenda_no_encontrada", 404, "Una de las prendas ya no está en tu vestidor.");
        if (prenda.category !== ranura) {
          throw new ErrorApp("prenda_mal_ubicada", 400, `La prenda ${id} no es de tipo "${ranura}".`);
        }
      }

      const [persona, cabeza] = await Promise.all([
        descargar(ctx.supabase, "cuerpos", rutaPropia(perfil.body_ref_path, "body_ref_path", userId), true),
        descargar(ctx.supabase, "cuerpos", rutaPropia(perfil.head_ref_path, "head_ref_path", userId), true),
      ]);
      const ranuras = (["arriba", "abajo", "calzado"] as const).filter((r) => ids[r] !== null);
      const refsPrendas = new Map<string, Imagen>();
      await Promise.all(ranuras.map(async (r) => {
        const p = prendas.get(ids[r]!)!;
        refsPrendas.set(r, await descargar(ctx.supabase, "prendas", rutaPropia(p.ref_path, "ref_path", userId), true));
      }));

      // Una pasada si todo cabe en 4 referencias; dos si van arriba + abajo + calzado.
      const dosPasadas = ranuras.length === 3;
      const pasada1 = dosPasadas ? ["arriba", "abajo"] : [...ranuras];
      const estimado = estimarNeuronas(2 + pasada1.length, ANCHO, ALTO) +
        (dosPasadas ? estimarNeuronas(3, ANCHO, ALTO) : 0);

      const reserva = await reservar(ctx.supabaseAdmin, userId, "verlo", "cloudflare", estimado);
      const { data: prueba, error: errorPrueba } = await ctx.supabaseAdmin
        .from("tryons")
        .insert({ user_id: userId, top_id: ids.arriba, bottom_id: ids.abajo, shoes_id: ids.calzado })
        .select("id")
        .single();
      if (errorPrueba || !prueba) {
        await liquidar(ctx.supabaseAdmin, reserva, "error", 0, "no se creó el registro");
        throw new Error(`crear tryon: ${errorPrueba?.message}`);
      }

      let gastadas = 0;
      try {
        const r1 = await generar(
          promptVestir(pasada1),
          [persona, cabeza, ...pasada1.map((r) => refsPrendas.get(r)!)],
          ANCHO,
          ALTO,
        );
        gastadas += r1.neuronas ?? estimarNeuronas(2 + pasada1.length, ANCHO, ALTO);
        let final = r1.jpeg;

        if (dosPasadas) {
          const intermedio = await comoReferencia(r1.jpeg);
          const r2 = await generar(PROMPT_CALZADO, [intermedio, cabeza, refsPrendas.get("calzado")!], ANCHO, ALTO);
          gastadas += r2.neuronas ?? estimarNeuronas(3, ANCHO, ALTO);
          final = r2.jpeg;
        }

        const ruta = `${userId}/${prueba.id}.jpg`;
        const { error: errorSubir } = await ctx.supabaseAdmin.storage
          .from("resultados")
          .upload(ruta, final, { contentType: "image/jpeg", upsert: false });
        if (errorSubir) throw new Error(`subir resultado: ${errorSubir.message}`);

        await ctx.supabaseAdmin.from("tryons").update({
          status: "listo",
          result_path: ruta,
          neurons: gastadas,
          finished_at: new Date().toISOString(),
        }).eq("id", prueba.id);
        await liquidar(ctx.supabaseAdmin, reserva, "ok", gastadas);

        // URL firmada corta: suficiente para mostrarla y descargarla.
        const { data: firmada } = await ctx.supabase.storage.from("resultados").createSignedUrl(ruta, 600);
        const segundos = Math.round((Date.now() - inicio) / 100) / 10;
        log(FUNCION, "ok", { pasadas: dosPasadas ? 2 : 1, neuronas: gastadas, segundos });
        return ok({
          tryon_id: prueba.id,
          result_path: ruta,
          url: firmada?.signedUrl ?? null,
          neuronas: gastadas,
          pasadas: dosPasadas ? 2 : 1,
          segundos,
        });
      } catch (e) {
        const detalle = e instanceof Error ? e.message : String(e);
        await ctx.supabaseAdmin.from("tryons").update({
          status: "error",
          neurons: gastadas,
          error: detalle.slice(0, 300),
          finished_at: new Date().toISOString(),
        }).eq("id", prueba.id);
        await liquidar(ctx.supabaseAdmin, reserva, "error", gastadas, detalle);
        if (e instanceof ErrorCloudflare) {
          throw new ErrorApp(
            "generacion_fallida",
            502,
            "No se pudo generar la imagen. No se te cobró la parte que falló; intenta de nuevo.",
          );
        }
        throw e;
      }
    } catch (e) {
      return fallo(e, FUNCION);
    }
  }),
};
