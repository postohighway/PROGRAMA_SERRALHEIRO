(function () {
  "use strict";

  function getParam(name) {
    try {
      const url = new URL(window.location.href);
      let v = url.searchParams.get(name);
      if (v) return v;
      if (url.hash) {
        const hp = new URLSearchParams(url.hash.replace(/^#/, ""));
        v = hp.get(name);
        if (v) return v;
      }
      const m = window.location.href.match(new RegExp("[?&#]" + name + "=([^&#]*)", "i"));
      return m ? decodeURIComponent(m[1] || "") : null;
    } catch (_) {}
    return null;
  }

  const cfg = window.sbConfig || {};
  const supabaseUrl = cfg.url || cfg.supabaseUrl;
  const supabaseAnonKey = cfg.anon || cfg.supabaseAnonKey;

  if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
    document.getElementById("erroInicial").textContent = "Configuração do portal não encontrada.";
    document.getElementById("erroInicial").style.display = "block";
    document.getElementById("erroInicial").classList.add("show");
    return;
  }

  const sb = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
  const token = getParam("t") || getParam("token");

  if (!token) {
    document.getElementById("erroInicial").textContent = "Link inválido. O link de assinatura deve conter o parâmetro t= ou token=.";
    document.getElementById("erroInicial").style.display = "block";
    document.getElementById("erroInicial").classList.add("show");
    return;
  }

  let contractData = null;
  let canvas = null;
  let ctx = null;
  let drawing = false;
  let lastX = 0, lastY = 0;

  function initCanvas() {
    canvas = document.getElementById("canvasAssinatura");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    }

    function start(e) { e.preventDefault(); drawing = true; const p = getPos(e); lastX = p.x; lastY = p.y; }
    function move(e) {
      e.preventDefault();
      if (!drawing) return;
      const p = getPos(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
    }
    function stop(e) { e.preventDefault(); drawing = false; }

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop, { passive: false });
  }

  function limparCanvas() {
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function canvasToBase64() {
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
  }

  function temAssinaturaNoCanvas() {
    if (!ctx || !canvas) return false;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i + 3] > 10) return true;
    }
    return false;
  }

  async function carregarContrato() {
    const r = await sb.rpc("public_get_contract_for_signature", { p_token: token });
    const data = r.data;

    if (r.error) {
      document.getElementById("erroInicial").textContent = "Erro: " + (r.error.message || r.error);
      document.getElementById("erroInicial").style.display = "block";
      document.getElementById("erroInicial").classList.add("show");
      return;
    }

    if (data && data.error) {
      document.getElementById("erroInicial").textContent = data.error;
      document.getElementById("erroInicial").style.display = "block";
      document.getElementById("erroInicial").classList.add("show");
      return;
    }

    if (!data || !data.ok) {
      document.getElementById("erroInicial").textContent = "Contrato não encontrado.";
      document.getElementById("erroInicial").style.display = "block";
      document.getElementById("erroInicial").classList.add("show");
      return;
    }

    contractData = data;
    document.getElementById("nomeContrato").textContent = data.name || "Contrato de Prestação de Serviços";
    document.getElementById("textoContrato").textContent = data.contract_content || "Conteúdo do contrato.";

    const idBox = document.getElementById("idClienteResumo");
    if (idBox) {
      const parts = [];
      if (data.customer_name) parts.push("<strong>Contratante:</strong> " + String(data.customer_name));
      if (data.customer_document) parts.push("<strong>CPF/CNPJ:</strong> " + String(data.customer_document));
      if (data.customer_phone) parts.push("<strong>Tel.:</strong> " + String(data.customer_phone));
      if (data.customer_email) parts.push("<strong>E-mail:</strong> " + String(data.customer_email));
      if (parts.length) {
        idBox.innerHTML = parts.join("<br>");
        idBox.style.display = "block";
      }
    }

    document.getElementById("conteudoContrato").style.display = "block";
    document.getElementById("nomeAssinante").placeholder = "Ex.: " + (data.customer_name || "Nome completo");
    initCanvas();
  }

  document.getElementById("btnLimpar").addEventListener("click", limparCanvas);

  document.getElementById("btnEnviarAssinatura").addEventListener("click", async () => {
    const nome = document.getElementById("nomeAssinante").value.trim();
    if (!nome || nome.length < 3) {
      alert("Informe seu nome completo (mínimo 3 caracteres).");
      return;
    }

    const aceite = document.getElementById("aceiteTermo");
    if (!aceite || !aceite.checked) {
      alert("Marque a declaração de que leu e aceita o contrato integralmente.");
      return;
    }

    if (!temAssinaturaNoCanvas()) {
      alert("Desenhe sua assinatura manuscrita no quadro branco (obrigatório para registro da assinatura eletrônica).");
      return;
    }

    const signatureData = canvasToBase64();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (_) {}

    document.getElementById("btnEnviarAssinatura").disabled = true;
    document.getElementById("btnEnviarAssinatura").textContent = "Registrando...";

    const r = await sb.rpc("public_submit_contract_signature", {
      p_token: token,
      p_signed_by: nome,
      p_signature_data: signatureData,
      p_accepted_terms: true,
      p_user_agent: ua.slice(0, 2000),
      p_client_timezone: tz.slice(0, 120)
    });

    const data = r.data;

    if (r.error) {
      document.getElementById("btnEnviarAssinatura").disabled = false;
      document.getElementById("btnEnviarAssinatura").textContent = "Confirmar leitura e assinar";
      alert("Erro ao enviar: " + (r.error.message || r.error));
      return;
    }

    if (data && data.error) {
      document.getElementById("btnEnviarAssinatura").disabled = false;
      document.getElementById("btnEnviarAssinatura").textContent = "Confirmar leitura e assinar";
      alert(data.error);
      return;
    }

    if (data && data.ok) {
      document.getElementById("conteudoContrato").style.display = "none";
      document.getElementById("sucessoMsg").style.display = "block";
      document.getElementById("sucessoMsg").classList.add("show");
    } else {
      document.getElementById("btnEnviarAssinatura").disabled = false;
      document.getElementById("btnEnviarAssinatura").textContent = "Confirmar leitura e assinar";
      alert("Não foi possível processar a assinatura.");
    }
  });

  carregarContrato();
})();
