import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/**
 * Só cria o client se URL e KEY forem válidos.
 * Caso contrário, retorna null e o sistema cai para modo mock.
 */
export function createClientIfConfigured(url, key){
  if(!url || !key) return null;
  try{
    return createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }catch{
    return null;
  }
}
