// Límites diarios por cuenta. Solo para la cuenta con rol admin en
// app_metadata (ese campo no lo puede editar el propio usuario).
//   GET  -> lista de cuentas con su límite y lo que llevan hoy
//   POST {user_id, daily_neuron_limit} -> cambia el límite de una cuenta
import { withSupabase } from "npm:@supabase/server@1.9.2";
import { ErrorApp, fallo, leerJson, log, ok } from "../_shared/http.ts";
import { entero, uuid } from "../_shared/validar.ts";

const FUNCION = "admin-limites";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      const appMetadata = (ctx.jwtClaims?.app_metadata ?? {}) as Record<string, unknown>;
      if (appMetadata.role !== "admin") {
        throw new ErrorApp("solo_admin", 403, "Solo la cuenta administradora puede ver y cambiar límites.");
      }

      if (req.method === "POST") {
        const cuerpo = await leerJson(req);
        const userId = uuid(cuerpo.user_id, "user_id");
        const limite = entero(cuerpo.daily_neuron_limit, "daily_neuron_limit", 0, 10_000);
        const { data, error } = await ctx.supabaseAdmin
          .from("profiles")
          .update({ daily_neuron_limit: limite })
          .eq("id", userId)
          .select("id, daily_neuron_limit")
          .maybeSingle();
        if (error) throw new Error(`actualizar límite: ${error.message}`);
        if (!data) throw new ErrorApp("cuenta_no_encontrada", 404, "No existe esa cuenta.");
        log(FUNCION, "limite_cambiado", { limite });
        return ok(data);
      }

      if (req.method !== "GET") throw new ErrorApp("metodo", 405, "Usa GET para ver o POST para cambiar.");

      const inicioDia = new Date();
      inicioDia.setUTCHours(0, 0, 0, 0);
      const [{ data: perfiles, error }, { data: uso }] = await Promise.all([
        ctx.supabaseAdmin.from("profiles").select("id, display_name, daily_neuron_limit").order("created_at"),
        ctx.supabaseAdmin
          .from("ai_usage")
          .select("user_id, status, neurons, neurons_reserved")
          .gte("created_at", inicioDia.toISOString()),
      ]);
      if (error) throw new Error(`leer perfiles: ${error.message}`);

      const usadas = new Map<string, number>();
      for (const fila of uso ?? []) {
        const valor = fila.status === "error"
          ? Number(fila.neurons ?? 0)
          : Number(fila.neurons ?? fila.neurons_reserved);
        usadas.set(fila.user_id, (usadas.get(fila.user_id) ?? 0) + valor);
      }
      return ok({
        cuentas: (perfiles ?? []).map((p) => ({ ...p, usadas_hoy: usadas.get(p.id) ?? 0 })),
      });
    } catch (e) {
      return fallo(e, FUNCION);
    }
  }),
};
