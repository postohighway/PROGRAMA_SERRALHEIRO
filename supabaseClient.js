(function () {
  var cfg = window.sbConfig || {};
  var url = cfg.url || cfg.supabaseUrl || "";
  var anon = cfg.anon || cfg.supabaseAnonKey || "";
  var lib = window.supabase;

  if (!lib || typeof lib.createClient !== "function") {
    console.error("[supabaseClient] biblioteca do Supabase não carregou.");
    window.sb = null;
    return;
  }

  if (!url || !anon) {
    console.error("[supabaseClient] URL/ANON não configurados.");
    window.sb = null;
    return;
  }

  if (window.sb) {
    console.log("[supabaseClient] cliente reaproveitado.");
    return;
  }

  window.sb = lib.createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Client-Info": "sgb-serralheria-front"
      }
    }
  });

  console.log("[supabaseClient] OK. window.sb pronto");
})();
