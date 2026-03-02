// config.js (COMMITAR no GitHub Pages)
// Correção: evita quebra por newline no supabaseAnonKey (SyntaxError).
// Também tolera colar a chave com espaços/linhas acidentalmente.

(function () {
  const SUPABASE_URL = "https://lnfaukysiiflparrciwz.supabase.co";

  // Cole aqui sua ANON KEY do Supabase.
  // Se você colar com quebras de linha, o código abaixo normaliza com segurança.
  const RAW_ANON = `
COLE_SUA_SUPABASE_ANON_KEY_AQUI
`.trim();

  // Se alguém colou duas coisas (ex: UUID + UUID) em linhas diferentes,
  // vamos separar e não concatenar.
  const parts = RAW_ANON.split(/\s+/).filter(Boolean);

  // Heurística: se tiver 2+ "tokens" e eles parecem UUID, usamos:
  // parts[0] = anonKey; parts[1] = defaultCompanyId
  const looksLikeUUID = (s) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

  let supabaseAnonKey = RAW_ANON;
  let defaultCompanyId = "4e44632d-15b0-484d-bc01-ec8bff2e2189"; // mantém seu padrão atual

  if (parts.length >= 2 && looksLikeUUID(parts[0]) && looksLikeUUID(parts[1])) {
    supabaseAnonKey = parts[0];
    defaultCompanyId = parts[1];
  } else {
    // normaliza whitespaces internos (bom pra key JWT colada com linha quebrada)
    supabaseAnonKey = RAW_ANON.replace(/\s+/g, "");
  }

  window.sbConfig = {
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey,
    defaultCompanyId,
  };

  console.log("[config] OK", {
    hasUrl: !!window.sbConfig.supabaseUrl,
    anonLen: (window.sbConfig.supabaseAnonKey || "").length,
    defaultCompany: window.sbConfig.defaultCompanyId,
  });
})();
