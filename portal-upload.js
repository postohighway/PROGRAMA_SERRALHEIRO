(function () {
  "use strict";

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
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
  const companyId = getParam("company_id");
  const ticketId = getParam("ticket_id");
  const ticketToken = getParam("ticket_token");

  const statusBox = document.getElementById("status");
  const contextoBox = document.getElementById("contextoChamado");
  const btn = document.getElementById("btnEnviarMidia");

  const endpoint = supabaseUrl.replace(/\/$/, "") + "/functions/v1/upload-ticket-media";

  function setStatus(msg, tipo) {
    statusBox.textContent = msg || "";
    statusBox.className = "status-box show " + (tipo || "");
  }

  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function carregarContexto() {
    if (!companyId || !ticketId) {
      setStatus("Link inválido. company_id ou ticket_id ausente.", "error");
      return;
    }

    const r = await sb
      .from("tickets")
      .select("client_name, client_phone, description")
      .eq("company_id", companyId)
      .eq("id", ticketId)
      .single();

    if (r.error) {
      setStatus("Erro ao carregar contexto: " + (r.error.message || r.error), "error");
      return;
    }

    const dados = r.data || {};
    contextoBox.innerHTML = `
      <div><strong>Cliente:</strong> ${escapeHtml(dados.client_name || "—")}</div>
      <div><strong>Telefone:</strong> ${escapeHtml(dados.client_phone || "—")}</div>
      <div><strong>Descrição:</strong> ${escapeHtml(dados.description || "—")}</div>
    `;
  }

  async function enviar() {
    if (!companyId || !ticketId || !ticketToken) {
      setStatus("Link inválido: company_id, ticket_id ou ticket_token ausente.", "error");
      return;
    }

    const fd = new FormData();
    fd.append("company_id", companyId);
    fd.append("ticket_id", ticketId);
    fd.append("ticket_token", ticketToken);
    fd.append("token", ticketToken);
    fd.append("mode", "ticket_token");

    for (let i = 1; i <= 5; i++) {
      const arquivo = document.getElementById("foto" + i).files[0];
      if (arquivo) fd.append("photo" + i, arquivo);
    }

    const video = document.getElementById("video1").files[0];
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

      const fin = await sb.rpc("public_finalize_portal_upload", {
        p_company_id: companyId,
        p_ticket_id: ticketId,
        p_ticket_token: ticketToken
      });

      if (fin.error) {
        setStatus("Arquivos enviados, mas a finalização do chamado falhou: " + (fin.error.message || fin.error), "error");
        btn.disabled = false;
        btn.textContent = "Enviar anexos";
        return;
      }

      setStatus("Anexos enviados com sucesso. Obrigado!", "success");
      btn.textContent = "Enviado com sucesso";
    } catch (erro) {
      setStatus("Erro ao enviar: " + (erro.message || erro), "error");
      btn.disabled = false;
      btn.textContent = "Enviar anexos";
    }
  }

  document.getElementById("btnEnviarMidia").addEventListener("click", enviar);
  carregarContexto();
})();