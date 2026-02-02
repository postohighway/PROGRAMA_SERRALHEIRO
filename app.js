// app.js

import { Data } from "./data.js";

let BOOT_READY = false;

async function boot() {
  try {
    console.log("BOOT START");

    await Data.initFromSettings();

    if (Data.supabase) {
      const { data } = await Data.supabase.auth.getSession();
      console.log("SESSION:", data?.session || null);
    }

    BOOT_READY = true;
    console.log("BOOT READY");

    renderApp();

  } catch (err) {
    console.error("BOOT ERROR:", err);
    alert("Erro ao iniciar sistema: " + err.message);
  }
}

function ensureBoot() {
  if (!BOOT_READY) {
    throw new Error("Sistema ainda inicializando. Aguarde 1 segundo e tente novamente.");
  }
}

function renderApp() {
  console.log("APP RENDER");

  // EXEMPLO: amarre o botão salvar
  const btn = document.querySelector("#btnSalvar");
  if (btn) {
    btn.onclick = async () => {
      try {
        ensureBoot();
        await salvarLancamento();
      } catch (e) {
        alert(e.message);
      }
    };
  }
}

// SUA FUNÇÃO REAL DE SALVAR
async function salvarLancamento() {
  const payload = {
    type: "receber",
    desc: "teste",
    amount: 100,
    due_date: "2026-02-02",
    status: "aberto",
  };

  await Data.txs.create(payload);
  alert("Salvo com sucesso");
}

boot();
