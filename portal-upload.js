(function () {
  "use strict";

  const STORAGE_KEY = "sgb_portal_upload_params";

  function getParamFromUrl(name) {
    try {
      const url = new URL(window.location.href);

      let value = url.searchParams.get(name);
      if (value != null && String(value).trim() !== "") return String(value).trim();

      if (url.hash) {
        const hashLimpo = url.hash.replace(/^#/, "");
        const hashParams = new URLSearchParams(hashLimpo);
        value = hashParams.get(name);
        if (value != null && String(value).trim() !== "") return String(value).trim();
      }

      const regex = new RegExp("[?&#]" + name + "=([^&#]*)", "i");
      const match = window.location.href.match(regex);
      if (match && match[1]) return decodeURIComponent(match[1]).trim();
    } catch (_) {}

    return null;
  }

  function readStoredParams() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function storeParams(params) {
    try {
      const atual = readStoredParams();
      const merged = {
        company_id: params.company_id || atual.company_id || null,
        ticket_id: params.ticket_id || atual.ticket_id || null,
        ticket_token: params.ticket_token || atual.ticket_token || null,
        upload_token: params.upload_token || atual.upload_token || null
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }

  function getParam(name) {
    const byUrl = getParamFromUrl(name);
    if (byUrl) return byUrl;

    const stored = readStoredParams();
    if (stored && stored[name]) return stored[name];

    return null;
  }

  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const cfg = window.sbConfig || {};
  const supabaseUrl = cfg.url || cfg.supabaseUrl;
  const supabaseAnonKey = cfg.anon || cfg.supabaseAnonKey;

  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    alert("Configuração do portal não encontrada.");
    return;
  }

  const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  const endpoint = supabaseUrl.replace(/\/$/, "") + "/functions/v1/upload-ticket-media";

  let companyId = getParam("company_id");
  let ticketId = getParam("ticket_id");
  let ticketToken = getParam("ticket_token");
  let uploadToken = getParam("upload_token");

  storeParams({
    company_id: companyId,
    ticket_id: ticketId,
    ticket_token: ticketToken,
    upload_token: uploadToken
  });

  companyId = getParam("company_id");
  ticketId = getParam("ticket_id");
  ticketToken = getParam("ticket_token");
  uploadToken = getParam("upload_token");

  const statusBox = document.getElementById("status");
  const contextoBox = document.getElementById("contextoChamado");
  const btn = document.getElementById("btnEnviarMidia");

  function setStatus(msg, tipo) {
    statusBox.textContent = msg || "";
    statusBox.className = "status-box show " + (tipo || "");
  }

  async function carregarContexto() {

    if (!companyId) {
      setStatus("Link inválido. company_id ausente.", "error");
      return;
    }

    if (!ticketId || !ticketToken) {
      setStatus("Link inválido. ticket ou token ausente.", "error");
      return;
    }

    try {
      const r = await sb
        .from("tickets")
        .select("client_name, client_phone, description")
        .eq("company_id", companyId)
        .eq("id", ticketId)
        .eq("token", ticketToken)
        .maybeSingle();

      if (r.error) {
        setStatus("Erro ao carregar chamado: " + (r.error.message || r.error), "error");
        return;
      }

      const dados = r.data;

      if (!dados) {
        setStatus("Chamado não encontrado para este link.", "error");
        return;
      }

      contextoBox.innerHTML = `
        <div><strong>Cliente:</strong> ${escapeHtml(dados.client_name || "—")}</div>
        <div><strong>Telefone:</strong> ${escapeHtml(dados.client_phone || "—")}</div>
        <div><strong>Descrição:</strong> ${escapeHtml(dados.description || "—")}</div>
      `;

    } catch (erro) {
      setStatus("Erro ao carregar chamado: " + (erro.message || erro), "error");
    }
  }

  async function enviar() {

    companyId = getParam("company_id");
    ticketId = getParam("ticket_id");
    ticketToken = getParam("ticket_token");
    uploadToken = getParam("upload_token");

    if (!companyId || !ticketToken) {
      setStatus("Link inválido: token ausente.", "error");
      return;
    }

    const fd = new FormData();
    fd.append("company_id", companyId);

    if (ticketId) fd.append("ticket_id", ticketId);
    if (ticketToken) fd.append("ticket_token", ticketToken);
    if (uploadToken) fd.append("upload_token", uploadToken);

    fd.append("token", ticketToken || uploadToken || "");
    fd.append("mode", uploadToken ? "upload_token" : "ticket_token");

    for (let i = 1; i <= 5; i++) {
      const input = document.getElementById("foto" + i);
      const arquivo = input && input.files ? input.files[0] : null;
      if (arquivo) fd.append("photo" + i, arquivo);
    }

    const videoInput = document.getElementById("video1");
    const video = videoInput && videoInput.files ? videoInput.files[0] : null;
    if (video) fd.append("video1", video);

    btn.disabled = true;
    btn.textContent = "Enviando anexos...";
    setStatus("Enviando anexos, aguarde...", "info");

    try {

      const res = await fetch(endpoint, {
        method: "POST",
        body: fd
      });

      const texto = await res.text();

      if (!res.ok) {
        setStatus("Falha no envio: HTTP " + res.status + " - " + texto, "error");
        btn.disabled = false;
        btn.textContent = "Enviar anexos";
        return;
      }

      if (ticketToken && ticketId) {
        await sb.rpc("public_finalize_portal_upload", {
          p_company_id: companyId,
          p_ticket_id: ticketId,
          p_ticket_token: ticketToken
        });
      }

      setStatus("Anexos enviados com sucesso.", "success");
      btn.textContent = "Enviado com sucesso";

    } catch (erro) {

      setStatus("Erro ao enviar: " + (erro.message || erro), "error");
      btn.disabled = false;
      btn.textContent = "Enviar anexos";

    }
  }

  document.getElementById("btnEnviarMidia").addEventListener("click", enviar);

  window.addEventListener("pageshow", function () {
    storeParams({
      company_id: getParam("company_id"),
      ticket_id: getParam("ticket_id"),
      ticket_token: getParam("ticket_token"),
      upload_token: getParam("upload_token")
    });
  });

  carregarContexto();

})();