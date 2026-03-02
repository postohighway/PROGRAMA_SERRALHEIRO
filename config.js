// config.js (GitHub Pages) — compatível com supabaseClient.js
(function () {
  const SUPABASE_URL = "https://lnfaukysiiflparrciwz.supabase.co";

  // Cole sua ANON KEY aqui (pode colar com quebra de linha: ele normaliza)
  const SUPABASE_ANON_KEY_RAW = `
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmF1a3lzaWlmbHBhcnJjaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk4NDEsImV4cCI6MjA4MDQ0NTg0MX0.mFBYdGIsdI00cWeou_NgBx8nNejZJeKEwK84JVKafTI
`.trim();

  const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_RAW.replace(/\s+/g, "");

  const DEFAULT_COMPANY_ID = "4e44632d-15b0-484d-bc01-ec8bff2e2189";

  // Seu padrão atual (mantém)
  window.sbConfig = {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    defaultCompanyId: DEFAULT_COMPANY_ID,

    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    DEFAULT_COMPANY_ID,
  };

  // ✅ Compatibilidade: muitos supabaseClient.js leem globais diretas
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.DEFAULT_COMPANY_ID = DEFAULT_COMPANY_ID;

  // Mais aliases comuns (não atrapalha ninguém)
  window.supabaseUrl = SUPABASE_URL;
  window.supabaseAnonKey = SUPABASE_ANON_KEY;

  console.log("[config] OK", {
    hasUrl: !!SUPABASE_URL,
    anonLen: SUPABASE_ANON_KEY.length,
    defaultCompany: DEFAULT_COMPANY_ID,
  });
})();
