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

  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ext(name) {
    const s = String(name || "").toLowerCase();
    const i = s.lastIndexOf(".");
    return i >= 0 ? s.slice(i + 1) : "";
  }

  function isAllowedImage(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    const extension = ext(file.name);
    return type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif"].includes(extension);
  }

  function isAllowedVideo(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    const extension = ext(file.name);
    const okType = type.startsWith("video/");
    return okType || ["mov", "mp4", "m4v", "webm", "avi", "qt", "hevc"].includes(extension) || type == "video/quicktime" || type == "application/octet-stream";
  }

  function sanitizeFileName(name) {
    const s = String(name || "arquivo")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    return s || "arquivo";
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
  const uploadToken = getParam("upload_token");

  const statusBox = document.getElementById("status");
  const contextoBox = document.getElementById("contextoChamado");
  const btn = document.getElementById("btnEnviarMidia");
  const endpoint = supabaseUrl.replace(/\/$/, "") + "/functions/v1/upload-ticket-media";

  function setStatus(msg, tipo) {
    statusBox.textContent = msg || "";
    statusBox.className = "status-box show " + (tipo || "");
  }

  async function carregarContexto() {
    if (!companyId) {
      setStatus("Link inválido. company_id ausente.", "error");
      return;
    }

    if (uploadToken) {
      const r = await sb.rpc("public_get_ticket_upload_context", {
        p_company_id: companyId,
        p_upload_token: uploadToken
      });

      if (r.error) {
        setStatus("Erro ao carregar contexto: " + (r.error.message || r.error), "error");
        return;
      }

      const dados = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
      if (!dados) {
        setStatus("Contexto do chamado não encontrado.", "error");
        return;
      }

      contextoBox.innerHTML = `
        <div><strong>Cliente:</strong> ${escapeHtml(dados.client_name || "—")}</div>
        <div><strong>Telefone:</strong> ${escapeHtml(dados.client_phone || "—")}</div>
        <div><strong>Descrição:</strong> ${escapeHtml(dados.description || "—")}</div>
      `;
      return;
    }

    if (!ticketId) {
      setStatus("Link inválido. ticket_id ausente.", "error");
      return;
    }

    const r = await sb
      .from("tickets")
      .select("client_name, client_phone, description")
      .eq("company_id", companyId)
      .eq("id", ticketId)
      .limit(1);

    if (r.error) {
      setStatus("Erro ao carregar contexto: " + (r.error.message || r.error), "error");
      return;
    }

    const dados = Array.isArray(r.data) ? (r.data[0] || null) : null;
    if (!dados) {
      setStatus("Chamado não encontrado para este link.", "error");
      return;
    }

    contextoBox.innerHTML = `
      <div><strong>Cliente:</strong> ${escapeHtml(dados.client_name || "—")}</div>
      <div><strong>Telefone:</strong> ${escapeHtml(dados.client_phone || "—")}</div>
      <div><strong>Descrição:</strong> ${escapeHtml(dados.description || "—")}</div>
    `;
  }

  function collectFiles() {
    const fotos = [];
    for (let i = 1; i <= 5; i++) {
      const input = document.getElementById("foto" + i);
      const file = input && input.files ? input.files[0] : null;
      if (!file) continue;

      if (!isAllowedImage(file)) {
        throw new Error("A foto " + i + " não está em formato suportado. Use JPG, PNG, WEBP ou HEIC.");
      }
      fotos.push({
        field: "photo" + i,
        file: new File([file], sanitizeFileName(file.name), { type: file.type || "image/jpeg" })
      });
    }

    const videoInput = document.getElementById("video1");
    const video = videoInput && videoInput.files ? videoInput.files[0] : null;
    let videoObj = null;

    if (video) {
      if (!isAllowedVideo(video)) {
        throw new Error("O vídeo não está em formato suportado. No iPhone, o .MOV (QuickTime) agora é aceito.");
      }
      videoObj = {
        field: "video1",
        file: new File([video], sanitizeFileName(video.name), {
          type: video.type || (ext(video.name) === "mov" ? "video/quicktime" : "video/mp4")
        })
      };
    }

    return { fotos, videoObj };
  }

  async function enviar() {
    if (!companyId) {
      setStatus("Link inválido: company_id ausente.", "error");
      return;
    }

    if (!ticketToken && !uploadToken) {
      setStatus("Link inválido: token ausente.", "error");
      return;
    }

    let files;
    try {
      files = collectFiles();
    } catch (erro) {
      setStatus(erro.message || String(erro), "error");
      return;
    }

    const fd = new FormData();
    fd.append("company_id", companyId);

    if (ticketId) fd.append("ticket_id", ticketId);
    if (ticketToken) fd.append("ticket_token", ticketToken);
    if (uploadToken) fd.append("upload_token", uploadToken);

    fd.append("token", ticketToken || uploadToken || "");
    fd.append("mode", uploadToken ? "upload_token" : "ticket_token");

    files.fotos.forEach((item) => fd.append(item.field, item.file));
    if (files.videoObj) fd.append(files.videoObj.field, files.videoObj.file);

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
        const fin = await sb.rpc("public_finalize_portal_upload", {
          p_company_id: companyId,
          p_ticket_id: ticketId,
          p_ticket_token: ticketToken
        });

        if (fin.error) {
          console.warn("Finalização do chamado falhou:", fin.error);
          setStatus("Anexos enviados com sucesso. O chamado foi registrado, mesmo que a finalização automática não tenha concluído.", "success");
          btn.textContent = "Enviado com sucesso";
          return;
        }
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

  async function carregarWhatsAppPlantao() {
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