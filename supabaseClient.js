import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const GLOBAL_KEY = "__SERRALHERIA_SUPABASE_CLIENT__";

/**
 * Cria/retorna SEMPRE a mesma instância (singleton) para evitar:
 * "Multiple GoTrueClient instances detected..."
 */
export function createClientIfConfigured(url, key) {
  if (!url || !key) return null;

  const normalizedUrl = String(url).trim();
  const normalizedKey = String(key).trim();

  // Usa um "signature" simples para não misturar projetos/configs
  const signature = `${normalizedUrl}::${normalizedKey.slice(0, 16)}...`;

  const g = globalThis;
  if (g[GLOBAL_KEY] && g[GLOBAL_KEY].signature === signature && g[GLOBAL_KEY].client) {
    return g[GLOBAL_KEY].client;
  }

  try {
    const client = createClient(normalizedUrl, normalizedKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,

        // storageKey único por host+path (evita conflito com outros apps Supabase no mesmo domínio)
        storageKey: `serralheria_auth_${location.host}${location.pathname}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      },
      global: {
        headers: {
          "x-client-info": "serralheria-front",
        },
      },
    });

    g[GLOBAL_KEY] = { signature, client };
    return client;
  } catch (err) {
    console.error("Falha ao criar Supabase client:", err);
    return null;
  }
}
