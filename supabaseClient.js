// supabaseClient.js
// Inicializa window.sb (Supabase client) usando as chaves do config.local.js.
// Se der "No API key found in request", 99% é porque este arquivo OU o config.local.js
// não está carregando no GitHub Pages (404 / nome errado / path errado).

(function () {
  try {
    const cfg = window.sbConfig || {};
    const url = cfg.url;
    const anon = cfg.anon;

    if (!url || !anon || /COLOQUE_/i.test(url) || /COLOQUE_/i.test(anon)) {
      console.warn("[supabaseClient] URL/ANON não configurados. Verifique config.local.js");
      window.sb = null;
      return;
    }

    if (!window.supabase || !window.supabase.createClient) {
      console.error("[supabaseClient] supabase UMD não carregou (cdn).");
      window.sb = null;
      return;
    }

    window.sb = window.supabase.createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        headers: {
          // defensivo: apikey sempre presente
          apikey: anon,
        },
      },
    });

    console.log("[supabaseClient] OK. window.sb pronto");
  } catch (e) {
    console.error("[supabaseClient] ERRO:", e);
    window.sb = null;
  }
})();
