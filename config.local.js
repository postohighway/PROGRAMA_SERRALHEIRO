// config.local.js (NÃO COMMITAR)
(function () {
  window.CONFIG = {
    SUPABASE_URL: 'https://lnfaukysiiflparrciwz.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxuZmF1a3lzaWlmbHBhcnJjaXd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4Njk4NDEsImV4cCI6MjA4MDQ0NTg0MX0.mFBYdGIsdI00cWeou_NgBx8nNejZJeKEwK84JVKafTI',
    // opcional: se quiser forçar um company default
    DEFAULT_COMPANY_ID: "4e44632d-15b0-484d-bc01-ec8bff2e2189",
  };

  console.log("[config.local] OK", {
    hasUrl: !!window.CONFIG.SUPABASE_URL,
    anonLen: (window.CONFIG.SUPABASE_KEY || "").length,
    defaultCompany: window.CONFIG.DEFAULT_COMPANY_ID || null,
  });
})();
