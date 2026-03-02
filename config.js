// config.js (GitHub Pages) — compatível com qualquer supabaseClient.js
(function () {
  const SUPABASE_URL = "https://lnfaukysiiflparrciwz.supabase.co";

  // Cole a ANON KEY aqui (pode colar quebrada; ele normaliza)
  const SUPABASE_ANON_KEY_RAW = `
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmF1a3lzaWlmbHBhcnJjaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk4NDEsImV4cCI6MjA4MDQ0NTg0MX0.mFBYdGIsdI00cWeou_NgBx8nNejZJeKEwK84JVKafTI
`.trim();

  const SUPABASE_ANON_KEY = SUPABASE_ANON_KEY_RAW.replace(/\s+/g, "");

  const DEFAULT_COMPANY_ID = "4e44632d-15b0-484d-bc01-ec8bff2e2189";

  // Principal (seu padrão)
  window.sbConfig = {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    defaultCompanyId: DEFAULT_COMPANY_ID,

    // Uppercase (alguns clientes usam isso)
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    DEFAULT_COMPANY_ID,
  };

  // Aliases globais (OUTROS padrões comuns)
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
  window.DEFAULT_COMPANY_ID = DEFAULT_COMPANY_ID;

  window.supabaseUrl = SUPABASE_URL;
  window.supabaseAnonKey = SUPABASE_ANON_KEY;

  console.log("[config] OK", {
    hasUrl: !!SUPABASE_URL,
    anonLen: SUPABASE_ANON_KEY.length,
    defaultCompany: DEFAULT_COMPANY_ID,
  });
})();
