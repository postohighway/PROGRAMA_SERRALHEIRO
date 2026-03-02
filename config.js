// config.js (GitHub Pages) — compatível com supabaseClient.js (window.CONFIG)
(function () {
  const SUPABASE_URL = "https://lnfaukysiiflparrciwz.supabase.co";

  // Cole sua ANON KEY aqui (pode colar com quebra de linha; ele normaliza)
  const SUPABASE_KEY_RAW = `
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmF1a3lzaWlmbHBhcnJjaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk4NDEsImV4cCI6MjA4MDQ0NTg0MX0.mFBYdGIsdI00cWeou_NgBx8nNejZJeKEwK84JVKafTI
`.trim();

  const SUPABASE_KEY = SUPABASE_KEY_RAW.replace(/\s+/g, "");
  const DEFAULT_COMPANY_ID = "4e44632d-15b0-484d-bc01-ec8bff2e2189";

  // ✅ O que o supabaseClient.js realmente usa:
  window.CONFIG = {
    SUPABASE_URL,
    SUPABASE_KEY,
    DEFAULT_COMPANY_ID,
  };

  // Mantém seu padrão antigo também (não atrapalha)
  window.sbConfig = {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_KEY,
    defaultCompanyId: DEFAULT_COMPANY_ID,
    SUPABASE_URL,
    SUPABASE_ANON_KEY: SUPABASE_KEY,
    DEFAULT_COMPANY_ID,
  };

  console.log("[config] OK", {
    hasUrl: !!SUPABASE_URL,
    keyLen: SUPABASE_KEY.length,
    defaultCompany: DEFAULT_COMPANY_ID,
  });
})();
