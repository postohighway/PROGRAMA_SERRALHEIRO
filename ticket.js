(function () {
  "use strict";

  function getParam(name) {
    try {
      const url = new URL(window.location.href);
      let value = url.searchParams.get(name);
      if (value) return value;
      if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        value = hashParams.get(name);
        if (value) return value;
      }
      const regex = new RegExp("[?&#]" + name + "=([^&#]*)", "i");
      const match = window.location.href.match(regex);
      if (match && match[1]) return decodeURIComponent(match[1]);
    } catch (_) {}
    return null;
  }

  function firstNonEmpty() {
    for (const value of arguments) {
      if (value != null && String(value).trim() !== "") return value;
    }
    return null;
  }

  const cfg = window.sbConfig || {};
  const supabaseUrl = firstNonEmpty(cfg.url, cfg.supabaseUrl);
  const supabaseAnonKey = firstNonEmpty(cfg.anon, cfg.supabaseAnonKey);

  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    alert("Configuração do portal não encontrada.");
    return;
  }

  const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

  async function submit() {
    const companyId = getParam("c");
    const portalToken = getParam("t");

    const name = document.getElementById("clientName").value.trim();
    const phone = document.getElementById("clientPhone").value.trim();
    const desc = document.getElementById("description").value.trim();
    const msg = document.getElementById("msgPortal");
    const btn = document.getElementById("btnEnviarPortal");

    msg.textContent = "";
    msg.classList.remove("show", "error", "success");

    if (!companyId || !portalToken) {
      msg.textContent = "Link inválido do portal.";
      msg.classList.add("show", "error");
      return;
    }

    if (!desc) {
      msg.textContent = "Descreva o problema para continuar.";
      msg.classList.add("show", "error");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Criando chamado...";

    const r = await sb.rpc("public_create_ticket_via_portal", {
      p_company_id: companyId,
      p_portal_token: portalToken,
      p_client_name: name || null,
      p_client_phone: phone || null,
      p_description: desc,
      p_due_date: null
    });

    if (r.error) {
      btn.disabled = false;
      btn.textContent = "Continuar para anexos";
      msg.textContent = "Erro ao criar chamado: " + (r.error.message || r.error);
      msg.classList.add("show", "error");
      return;
    }

    const dados = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
    if (!dados || !dados.ticket_id || !dados.ticket_token) {
      btn.disabled = false;
      btn.textContent = "Continuar para anexos";
      msg.textContent = "O sistema não retornou o token do chamado.";
      msg.classList.add("show", "error");
      return;
    }

    msg.textContent = "Chamado criado. Redirecionando para anexos...";
    msg.classList.add("show", "success");

    const url = new URL("./portal-upload.html", window.location.href);
    url.searchParams.set("company_id", companyId);
    url.searchParams.set("ticket_id", dados.ticket_id);
    url.searchParams.set("ticket_token", dados.ticket_token);
    url.searchParams.set("v", String(Date.now()));

    window.location.replace(url.toString());
  }

  document.getElementById("btnEnviarPortal").addEventListener("click", submit);

  async function carregarWhatsAppPlantao() {
    const companyId = getParam("c");
    if (!companyId) return;
    try {
      const r = await sb.from("company_settings")
        .select("setting_value")
        .eq("company_id", companyId)
        .eq("setting_key", "whatsapp_plantao")
        .maybeSingle();
      if (r.error || !r.data || !r.data.setting_value) return;
      const num = String(r.data.setting_value).replace(/\D/g, "");
      if (num.length < 12) return;
      const waNum = num.length >= 12 && num.startsWith("55") ? num : "55" + num;
      const link = "https://wa.me/" + waNum + "?text=" + encodeURIComponent("Preciso de atendimento urgente");
      const box = document.getElementById("whatsappPlantaoBox");
      const linkEl = document.getElementById("linkWhatsAppPlantao");
      if (box && linkEl) {
        linkEl.href = link;
        linkEl.textContent = "Falar no WhatsApp";
        box.style.display = "block";
      }
    } catch (_) {}
  }
  carregarWhatsAppPlantao();
})();
