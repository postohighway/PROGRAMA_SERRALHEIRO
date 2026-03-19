// config.local.js — sobrescreve config.js (opcional)
// Se config.js já tiver url, anon e defaultCompanyId válidos, eles são mantidos.
// Use este arquivo para alterar em ambiente local sem editar config.js.

window.sbConfig = window.sbConfig || {};
window.sbConfig.url = window.sbConfig.url || "COLOQUE_SUA_SUPABASE_URL";
window.sbConfig.anon = window.sbConfig.anon || "COLOQUE_SUA_SUPABASE_ANON_KEY";
window.sbConfig.defaultCompanyId = window.sbConfig.defaultCompanyId || "COLOQUE_SEU_COMPANY_ID_AQUI";

// Base path do GitHub Pages (se você hospeda em /NOME_REPO/)
// Ex: https://usuario.github.io/PROGRAMA_SERRALHEIRO/  -> basePath="/PROGRAMA_SERRALHEIRO"
window.sbConfig.basePath = window.sbConfig.basePath || "";
