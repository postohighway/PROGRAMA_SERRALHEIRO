// supabaseClient.js (SEM MODULES)
// Requer: script UMD do supabase carregado antes (supabase.min.js)
// Requer: window.CONFIG definido antes (config.local.js)

(function () {
  const cfg = window.CONFIG || {};
  const url = cfg.SUPABASE_URL;
  const key = cfg.SUPABASE_KEY;

  // O UMD expõe um objeto global "supabase" com createClient
  const lib = window.supabase;

  if (!lib || typeof lib.createClient !== "function") {
    console.error("[supabaseClient] ERRO: biblioteca UMD do Supabase não carregou.");
    window.sb = null;
    window.supabaseClient = null;
    return;
  }

  if (!url || !key || String(key).length < 30) {
    console.warn("[supabaseClient] Aviso: SUPABASE_URL/KEY ausentes. (rodará em mock se seu Data permitir)");
    window.sb = null;
    window.supabaseClient = null;
    return;
  }

  // Evita “Multiple GoTrueClient instances” reaproveitando se já existir
  if (window.supabaseClient) {
    window.sb = window.supabaseClient;
    console.log("[supabaseClient] Reuso: window.supabaseClient já existe.");
    return;
  }

  const client = lib.createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Client-Info": "serralheria-front",
      },
    },
  });

  window.supabaseClient = client;
  window.sb = client; // apelido curto pro console

  console.log("[supabaseClient] OK: window.sb pronto");
})();
