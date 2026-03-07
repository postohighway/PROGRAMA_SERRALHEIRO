// supabaseClient.js (SEM MODULES)
// Compatível com window.sbConfig e window.CONFIG.
// Requer o UMD do Supabase carregado antes no index.html.

(function () {
  function obterConfig() {
    var sbCfg = window.sbConfig || {};
    var legacyCfg = window.CONFIG || {};

    var url =
      sbCfg.url ||
      sbCfg.supabaseUrl ||
      legacyCfg.SUPABASE_URL ||
      legacyCfg.url ||
      "";

    var anonKey =
      sbCfg.anon ||
      sbCfg.supabaseAnonKey ||
      legacyCfg.SUPABASE_KEY ||
      legacyCfg.anon ||
      "";

    var defaultCompanyId =
      sbCfg.defaultCompanyId ||
      legacyCfg.DEFAULT_COMPANY_ID ||
      "";

    var basePath =
      sbCfg.basePath ||
      legacyCfg.basePath ||
      "";

    var portalToken =
      sbCfg.portalToken ||
      legacyCfg.portalToken ||
      "";

    return {
      url: String(url || "").trim(),
      anonKey: String(anonKey || "").trim(),
      defaultCompanyId: String(defaultCompanyId || "").trim(),
      basePath: String(basePath || "").trim(),
      portalToken: String(portalToken || "").trim()
    };
  }

  function normalizarConfigGlobal(cfg) {
    window.sbConfig = window.sbConfig || {};
    if (!window.sbConfig.url) window.sbConfig.url = cfg.url;
    if (!window.sbConfig.anon) window.sbConfig.anon = cfg.anonKey;
    if (!window.sbConfig.defaultCompanyId && cfg.defaultCompanyId) {
      window.sbConfig.defaultCompanyId = cfg.defaultCompanyId;
    }
    if (!window.sbConfig.basePath && cfg.basePath) {
      window.sbConfig.basePath = cfg.basePath;
    }
    if (!window.sbConfig.portalToken && cfg.portalToken) {
      window.sbConfig.portalToken = cfg.portalToken;
    }
  }

  var cfg = obterConfig();
  normalizarConfigGlobal(cfg);

  var lib = window.supabase;

  if (!lib || typeof lib.createClient !== "function") {
    console.error("[supabaseClient] ERRO: biblioteca UMD do Supabase não carregou.");
    window.sb = null;
    window.supabaseClient = null;
    return;
  }

  if (!cfg.url || !cfg.anonKey || cfg.anonKey.length < 30) {
    console.warn("[supabaseClient] URL/ANON não configurados. Verifique config.js/config.local.js");
    window.sb = null;
    window.supabaseClient = null;
    return;
  }

  if (window.supabaseClient) {
    window.sb = window.supabaseClient;
    console.log("[supabaseClient] Reuso: window.supabaseClient já existe.");
    return;
  }

  var client = lib.createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        "X-Client-Info": "serralheria-front"
      }
    }
  });

  window.supabaseClient = client;
  window.sb = client;

  console.log("[supabaseClient] OK: window.sb pronto", {
    url: cfg.url,
    companyId: cfg.defaultCompanyId || null,
    hasSession: !!client.auth
  });
})();
