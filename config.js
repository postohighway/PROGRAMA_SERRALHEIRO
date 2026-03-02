// config.js 
(function () {
  const SUPABASE_URL = 'https://lnfaukysiiflparrciwz.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmF1a3lzaWlmbHBhcnJjaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk4NDEsImV4cCI6MjA4MDQ0NTg0MX0.mFBYdGIsdI00cWeou_NgBx8nNejZJeKEwK84JVKafTI',

  const DEFAULT_COMPANY_ID = "4e44632d-15b0-484d-bc01-ec8bff2e2189";

  window.sbConfig = {
    // formatos comuns (camelCase)
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    defaultCompanyId: DEFAULT_COMPANY_ID,

    // formatos alternativos (alguns arquivos usam uppercase)
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    DEFAULT_COMPANY_ID,
  };

  console.log("[config] OK", {
    hasUrl: !!window.sbConfig.supabaseUrl,
    anonLen: (window.sbConfig.supabaseAnonKey || "").length,
    defaultCompany: window.sbConfig.defaultCompanyId,
  });
})();
