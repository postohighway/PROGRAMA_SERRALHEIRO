// supabaseClient.js (SEM MODULES)
// Requer: script UMD do supabase carregado antes (supabase.min.js)
// Requer: window.CONFIG definido antes (config.js / config.local.js)

(function () {
  const cfg = window.CONFIG || {};

  // Aceita os dois formatos:
  // 1) cfg.SUPABASE_URL / cfg.SUPABASE_KEY  (seu padrão atual)
  // 2) cfg.supabaseUrl / cfg.supabaseAnonKey (padrão alternativo)
  const url = cfg.SUPABASE_URL || cfg.supabaseUrl || "";
  const key = cfg.SUPABASE_KEY || cfg.supabaseAnonKey || "";

  const lib = window.supabase;

  function warn(msg) {
    console.warn("[supabaseClient] " + msg);
  }
  function err(msg) {
    console.error("[supabaseClient] " + msg);
  }

  if (!lib || typeof lib.createClient !== "function") {
    err("Biblioteca UMD do Supabase não carregou (supabase.min.js).");
    window.sb = null;
    return;
  }

  if (!url || !key) {
    warn("SUPABASE_URL/KEY ausentes. window.CONFIG não está definido ou está incompleto.");
    window.sb = null;
    return;
  }

  try {
    window.sb = lib.createClient(url, key);
    console.log("[supabaseClient] OK: sb inicializado.");
  } catch (e) {
    err("Falha ao criar client: " + (e && e.message ? e.message : e));
    window.sb = null;
  }
})();
