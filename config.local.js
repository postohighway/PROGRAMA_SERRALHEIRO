// config.local.js
// IMPORTANTE: este arquivo PRECISA estar no GitHub Pages (mesma pasta do index.html).
// O ANON KEY é público (client-side). NÃO coloque SERVICE_ROLE aqui.

window.sbConfig = window.sbConfig || {};

window.sbConfig.url = window.sbConfig.url || "COLOQUE_SUA_SUPABASE_URL";
window.sbConfig.anon = window.sbConfig.anon || "COLOQUE_SUA_SUPABASE_ANON_KEY";

// Opcional (mas recomendado)
window.sbConfig.defaultCompanyId = window.sbConfig.defaultCompanyId || "COLOQUE_SEU_COMPANY_ID_AQUI";
window.sbConfig.portalToken = window.sbConfig.portalToken || "COLOQUE_SEU_PORTAL_TOKEN_AQUI";

// Base path do GitHub Pages (se você hospeda em /NOME_REPO/)
// Ex: https://usuario.github.io/PROGRAMA_SERRALHEIRO/  -> basePath="/PROGRAMA_SERRALHEIRO"
window.sbConfig.basePath = window.sbConfig.basePath || "";
