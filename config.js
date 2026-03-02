// config.js (PRECISA estar no GitHub Pages)
window.sbConfig = {
  supabaseUrl: "https://lnfaukysiiflparrciwz.supabase.co",

  // Cole aqui a ANON KEY do Supabase (é um token longo, parece um JWT; NÃO é UUID).
  // IMPORTANTE: tem que ficar em UMA linha (sem quebra de linha).
  supabaseAnonKey: "COLE_AQUI_SUA_SUPABASE_ANON_KEY_REAL",

  // opcional, mas recomendado
  defaultCompanyId: "4e44632d-15b0-484d-bc01-ec8bff2e2189"
};

console.log("[config] OK", {
  hasUrl: !!window.sbConfig.supabaseUrl,
  anonLen: (window.sbConfig.supabaseAnonKey || "").length,
  defaultCompany: window.sbConfig.defaultCompanyId
});
