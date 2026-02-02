// app.js

import { Data } from "./data.js";

async function boot() {
  try {
    // 1. Inicializa Supabase e carrega sessão
    await Data.initFromSettings();

    // 2. Aguarda sessão estar pronta
    if (Data.supabase) {
      const { data } = await Data.supabase.auth.getSession();
      console.log("SESSION BOOT:", data?.session || null);
    }

    // 3. Só depois renderiza o app
    renderApp();

  } catch (err) {
    console.error("BOOT ERROR:", err);
    alert("Erro ao iniciar sistema: " + err.message);
  }
}

function renderApp() {
  console.log("APP RENDER OK");
  // seu código normal de renderização aqui
}

boot();
