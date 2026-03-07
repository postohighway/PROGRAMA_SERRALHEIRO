(function () {
  "use strict";

  function firstNonEmpty() {
    for (const value of arguments) {
      if (value != null && String(value).trim() !== "") return value;
    }
    return null;
  }

  const cfg = window.sbConfig || window.CONFIG || {};
  const url = firstNonEmpty(cfg.url, cfg.supabaseUrl, cfg.SUPABASE_URL);
  const anon = firstNonEmpty(cfg.anon, cfg.supabaseAnonKey, cfg.SUPABASE_KEY, cfg.supabaseKey);
  const companyId = firstNonEmpty(cfg.defaultCompanyId, cfg.companyId, cfg.COMPANY_ID);
  const portalToken = firstNonEmpty(cfg.portalToken, cfg.PORTAL_TOKEN);

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("[supabaseClient] Biblioteca do Supabase não carregou.");
    window.sb = null;
    return;
  }

  if (!url || !anon) {
    console.error("[supabaseClient] URL/ANON não configurados.");
    window.sb = null;
    return;
  }

  const client = window.supabase.createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Client-Info": "sgb-serralheria-front",
      },
    },
  });

  window.sb = {
    db: client,
    client,
    url,
    companyId,
    portalToken,
    hasSession: false,
  };

  client.auth.getSession().then(({ data }) => {
    window.sb.hasSession = !!data.session;
    console.log("[supabaseClient] OK. window.sb pronto", {
      url: window.sb.url,
      companyId: window.sb.companyId,
      hasSession: window.sb.hasSession,
    });
  }).catch(() => {
    console.log("[supabaseClient] OK. window.sb pronto");
  });
})();
