// config.local.js
// ESTE ARQUIVO PRECISA ESTAR NO GIT (GitHub Pages) para funcionar.

window.sbConfig = {
  supabaseUrl: "COLOQUE_SUA_SUPABASE_URL",
  supabaseAnonKey: "COLOQUE_SUA_SUPABASE_ANON_KEY",

  // opcional, mas recomendado (seu company do sistema)
  defaultCompanyId: "4e44632d-15b0-484d-bc01-ec8bff2e2189",

  // opcional: se você usa portal token em algum fluxo
  portalToken: "COLOQUE_SEU_PORTAL_TOKEN"
};

console.log("[config.local] OK", {
  hasUrl: !!window.sbConfig.supabaseUrl,
  anonLen: (window.sbConfig.supabaseAnonKey || "").length,
  defaultCompany: window.sbConfig.defaultCompanyId
});
