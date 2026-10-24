import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

/**
 * Cliente con la clave secreta: saltea RLS y las políticas de Storage. Usalo solo en
 * el servidor y solo para lo que los vecinos no pueden hacer por su cuenta (hoy, subir
 * y compensar las fotos de un reporte ya reclamado). Nunca lo uses para leer o escribir
 * en nombre de un vecino: para eso está el cliente con su sesión.
 */
export function createAdminClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en el servidor.");
  }
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
