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
    document.getElementById("conteudoContrato").style.display = "block";
    document.getElementById("nomeAssinante").placeholder = "Ex.: " + (data.customer_name || "Seu nome completo");
    initCanvas();
  }

  document.getElementById("btnLimpar").addEventListener("click", limparCanvas);

  document.getElementById("btnEnviarAssinatura").addEventListener("click", async () => {
    const nome = document.getElementById("nomeAssinante").value.trim();
    if (!nome) {
      alert("Informe seu nome completo.");
      return;
    }

    const signatureData = temAssinaturaNoCanvas() ? canvasToBase64() : null;

    document.getElementById("btnEnviarAssinatura").disabled = true;
    document.getElementById("btnEnviarAssinatura").textContent = "Enviando...";

    const r = await sb.rpc("public_submit_contract_signature", {
      p_token: token,
      p_signed_by: nome,
      p_signature_data: signatureData
    });

    const data = r.data;

    if (r.error) {
      document.getElementById("btnEnviarAssinatura").disabled = false;
      document.getElementById("btnEnviarAssinatura").textContent = "Confirmar e assinar";
      alert("Erro ao enviar: " + (r.error.message || r.error));
      return;
    }

    if (data && data.error) {
      document.getElementById("btnEnviarAssinatura").disabled = false;
      document.getElementById("btnEnviarAssinatura").textContent = "Confirmar e assinar";
      alert(data.error);
      return;
    }

    if (data && data.ok) {
      document.getElementById("conteudoContrato").style.display = "none";
      document.getElementById("sucessoMsg").style.display = "block";
      document.getElementById("sucessoMsg").classList.add("show");
    } else {
      document.getElementById("btnEnviarAssinatura").disabled = false;
      document.getElementById("btnEnviarAssinatura").textContent = "Confirmar e assinar";
      alert("Não foi possível processar a assinatura.");
    }
  });

  carregarContrato();
})();
