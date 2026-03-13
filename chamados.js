
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function escapeHtml(t) {
    return String(t || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function formatarData(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
  }
  function formatarDataHora(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }
  function traduzirStatus(status) {
    const mapa = {aberto:"Aberto",open:"Aberto",aguardando_analise:"Aguardando análise",em_analise:"Em análise",em_andamento:"Em andamento",aguardando_cliente:"Aguardando cliente",finalizado:"Finalizado",cancelado:"Cancelado"};
    return mapa[String(status || "").toLowerCase()] || (status || "—");
  }
  function traduzirPrioridade(p) {
    const mapa = {baixa:"Baixa",normal:"Normal",alta:"Alta",critica:"Crítica","crítica":"Crítica"};
    return mapa[String(p || "").toLowerCase()] || "Normal";
  }
  function normalizarPrioridade(p) {
    const s = String(p || "").toLowerCase().trim();
    if (s === "baixa") return "baixa";
    if (s === "alta") return "alta";
    if (s === "critica" || s === "crítica") return "critica";
    return "normal";
  }
  function pesoPrioridade(p) {
    const s = normalizarPrioridade(p);
    if (s === "critica") return 1;
    if (s === "alta") return 2;
    if (s === "normal") return 3;
    return 4;
  }
  function badgeStatus(status) {
    const s = String(status || "").toLowerCase().trim();
    return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(traduzirStatus(s))}</span>`;
  }
  function badgePrioridade(prioridade) {
    const s = normalizarPrioridade(prioridade);
    return `<span class="priority-pill priority-${escapeHtml(s)}">${escapeHtml(traduzirPrioridade(s))}</span>`;
  }
  function caminhosMidia(ticket) {
    return [ticket.photo1_path,ticket.photo2_path,ticket.photo3_path,ticket.photo4_path,ticket.photo5_path,ticket.video1_path].filter(Boolean);
  }
  function ext(path) {
    const p = String(path || "").toLowerCase();
    const i = p.lastIndexOf(".");
    return i >= 0 ? p.slice(i + 1) : "";
  }
  function ehVideo(path) { return ["mp4","mov","avi","webm","m4v"].includes(ext(path)); }
  function ehImagem(path) { return ["jpg","jpeg","png","webp","gif","bmp","heic","heif"].includes(ext(path)); }
  function obterUrlMidia(path, sb) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    try { return sb.db.storage.from("tickets-media").getPublicUrl(path)?.data?.publicUrl || ""; } catch { return ""; }
  }
  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(texto);
    const ta = document.createElement("textarea");
    ta.value = texto; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
    return Promise.resolve();
  }
  function gerarTokenLocal() {
    return window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : "tk_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }
  function montarUrlPublica(nomeArquivo, params) {
    const cfg = window.sbConfig || {};
    let basePath = String(cfg.basePath || "").trim();
    const origin = window.location.origin;
    if (!basePath) {
      const partes = (window.location.pathname || "/").split("/").filter(Boolean);
      if (partes.length > 0) basePath = "/" + partes[0];
    }
    if (basePath && !basePath.startsWith("/")) basePath = "/" + basePath;
    const base = origin + (basePath || "");
    const url = new URL(base.replace(/\/+$/, "") + "/" + String(nomeArquivo || "").replace(/^\/+/, ""));
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== "") url.searchParams.set(k, String(v));
    });
    return url.toString();
  }

  function horasSlaPorPrioridade(priority) {
    const p = normalizarPrioridade(priority);
    if (p === "critica") return 4;
    if (p === "alta") return 24;
    if (p === "normal") return 48;
    return 72;
  }

  function calcularSla(ticket) {
    const status = String(ticket.status || "").toLowerCase();
    if (["finalizado", "cancelado"].includes(status)) {
      return { classe: "sla-ok", texto: "Encerrado", restanteHoras: null, vencido: false };
    }

    const createdAt = ticket.created_at ? new Date(ticket.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) {
      return { classe: "sla-ok", texto: "SLA sem base", restanteHoras: null, vencido: false };
    }

    const horas = horasSlaPorPrioridade(ticket.priority);
    const deadline = new Date(createdAt.getTime() + horas * 60 * 60 * 1000);
    const agora = new Date();
    const diffMs = deadline.getTime() - agora.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);

    if (diffHoras <= 0) {
      return {
        classe: "sla-vencido",
        texto: "SLA estourado",
        restanteHoras: diffHoras,
        vencido: true,
        deadline
      };
    }

    if (diffHoras <= 4) {
      return {
        classe: "sla-alerta",
        texto: `Vence em ${Math.ceil(diffHoras)}h`,
        restanteHoras: diffHoras,
        vencido: false,
        deadline
      };
    }

    return {
      classe: "sla-ok",
      texto: `SLA ${horas}h`,
      restanteHoras: diffHoras,
      vencido: false,
      deadline
    };
  }

  function injetarCss() {
    if (document.getElementById("css-kanban-chamados-sla-v1")) return;
    const st = document.createElement("style");
    st.id = "css-kanban-chamados-sla-v1";
    st.textContent = `
      .kanban-wrap{display:grid;grid-template-columns:1.4fr .9fr;gap:16px}
      .kanban-board{display:grid;grid-template-columns:repeat(5,minmax(220px,1fr));gap:14px;overflow:auto;padding-bottom:4px}
      .kanban-col{background:rgba(255,255,255,.02);border:1px solid rgba(108,152,232,.16);border-radius:14px;min-height:420px;display:flex;flex-direction:column}
      .kanban-head{padding:12px 14px;border-bottom:1px solid rgba(108,152,232,.12)}
      .kanban-title{font-weight:800;color:#eff6ff;display:flex;justify-content:space-between;gap:8px;align-items:center}
      .kanban-sub{font-size:12px;color:#9db3d6;margin-top:4px}
      .kanban-count{font-size:12px;color:#9db3d6;background:rgba(255,255,255,.04);padding:4px 8px;border-radius:999px}
      .kanban-body{padding:12px;display:flex;flex-direction:column;gap:10px;min-height:180px}
      .kanban-body.drag-over{background:rgba(61,134,255,.06)}
      .kanban-card{border-radius:14px;padding:12px;border:1px solid rgba(108,152,232,.16);background:rgba(255,255,255,.03);cursor:grab}
      .kanban-card.ticket-priority-baixa{box-shadow:inset 4px 0 0 #94a3b8}
      .kanban-card.ticket-priority-normal{box-shadow:inset 4px 0 0 #3d86ff}
      .kanban-card.ticket-priority-alta{box-shadow:inset 4px 0 0 #f6b73c}
      .kanban-card.ticket-priority-critica{box-shadow:inset 4px 0 0 #ff5d6c}
      .kanban-card.sla-alerta{border-color:rgba(246,183,60,.65)}
      .kanban-card.sla-vencido{border-color:rgba(255,93,108,.85); animation:slaPulse 1.5s infinite}
      @keyframes slaPulse {0%{box-shadow:inset 4px 0 0 #ff5d6c, 0 0 0 rgba(255,93,108,.0)}50%{box-shadow:inset 4px 0 0 #ff5d6c, 0 0 18px rgba(255,93,108,.25)}100%{box-shadow:inset 4px 0 0 #ff5d6c, 0 0 0 rgba(255,93,108,.0)}}
      .kanban-card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;margin-bottom:10px}
      .kanban-card-title{font-weight:800;color:#eff6ff;line-height:1.25}
      .kanban-card-meta{font-size:12px;color:#9db3d6}
      .kanban-card-desc{font-size:13px;color:#dce7f8;margin-top:10px}
      .kanban-empty{padding:18px;text-align:center;color:#8ea6ca;font-size:13px}
      .priority-pill,.sla-pill{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800;border:1px solid transparent}
      .priority-baixa{background:rgba(148,163,184,.12);border-color:rgba(148,163,184,.35);color:#d8dee7}
      .priority-normal{background:rgba(61,134,255,.12);border-color:rgba(61,134,255,.35);color:#dbeaff}
      .priority-alta{background:rgba(246,183,60,.12);border-color:rgba(246,183,60,.35);color:#ffe6ab}
      .priority-critica{background:rgba(255,93,108,.12);border-color:rgba(255,93,108,.35);color:#ffd5da}
      .sla-ok{background:rgba(20,195,142,.10);border-color:rgba(20,195,142,.32);color:#bff2df}
      .sla-alerta{background:rgba(246,183,60,.10);border-color:rgba(246,183,60,.32);color:#ffe6ab}
      .sla-vencido{background:rgba(255,93,108,.12);border-color:rgba(255,93,108,.45);color:#ffd5da}
      .detail-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .media-preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:10px}
      .midia-card{background:rgba(255,255,255,.03);border:1px solid rgba(108,152,232,.18);border-radius:12px;overflow:hidden;cursor:pointer}
      .midia-thumb{height:140px;background:#0b1b33;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .midia-thumb img,.midia-thumb video{width:100%;height:100%;object-fit:cover}
      .midia-meta{padding:10px 12px 12px}
      .midia-nome{font-size:12px;word-break:break-all;margin-bottom:6px;color:#eff6ff}
      .link-inline{color:#9cc4ff;font-size:12px;text-decoration:none}
      .modal-media{width:min(1080px, calc(100vw - 32px))}
      .media-viewer{min-height:60vh;max-height:78vh;background:#06101f;border:1px solid rgba(108,152,232,.16);border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .media-viewer img,.media-viewer video{max-width:100%;max-height:76vh;object-fit:contain}
      .mini-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px}
      .mini-card-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:6px}
      .mini-card-title{font-weight:700;color:#eff6ff}
      .mini-card-meta{font-size:12px;color:#9db3d6}
      .btn.btn-success{background:#14845f;color:#fff}
      .btn.btn-warning{background:#8a6612;color:#fff}
      .btn-mini{border:none;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;background:#25477a;color:#fff}
      .galeria-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      .galeria-indicador,.zoom-info{color:#9db3d6;font-size:12px}
      .detail-grid-priority{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .alerta-bar{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .alerta-chip{padding:8px 12px;border-radius:999px;font-weight:800;font-size:12px;border:1px solid rgba(255,255,255,.14)}
      .alerta-chip.alerta-vermelho{background:rgba(255,93,108,.12);border-color:rgba(255,93,108,.42);color:#ffd5da}
      .alerta-chip.alerta-amarelo{background:rgba(246,183,60,.12);border-color:rgba(246,183,60,.36);color:#ffe6ab}
      @media (max-width:1200px){.kanban-wrap{grid-template-columns:1fr}.kanban-board{grid-template-columns:repeat(5, minmax(260px,1fr));}}
    `;
    document.head.appendChild(st);
  }

  function abrirModalLinkPortal({ titulo, link, subtitulo }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal"><div class="modal-head"><div><div class="modal-title">${escapeHtml(titulo || "Link")}</div><div class="panel-sub">${escapeHtml(subtitulo || "")}</div></div><button class="btn btn-ghost" id="fecharModalLinkPortal">Fechar</button></div><div class="mini-card"><div class="mini-card-meta">Link</div><div style="word-break:break-all;margin-top:6px">${escapeHtml(link || "")}</div></div><div class="modal-actions"><button class="btn btn-secondary" id="copiarModalLinkPortal">Copiar Link</button><a class="btn btn-primary" href="${escapeHtml(link || "#")}" target="_blank" rel="noopener">Abrir Link</a></div></div>`;
    document.body.appendChild(backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalLinkPortal", backdrop).addEventListener("click", fechar);
    $("#copiarModalLinkPortal", backdrop).addEventListener("click", async () => { await copiarTexto(link || ""); alert("Link copiado."); });
  }

  function abrirModalNovoChamado(ctx, refreshLista) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head"><div><div class="modal-title">Novo Chamado</div><div class="panel-sub">Cadastre um novo chamado manualmente.</div></div><button class="btn btn-ghost" id="fecharModalNovoChamado">Fechar</button></div>
        <div class="alert error" id="erroModalNovoChamado"></div>
        <div class="grid-form">
          <div><label class="label">Cliente</label><input id="novoChamadoCliente" class="field" placeholder="Nome do cliente"></div>
          <div><label class="label">Telefone</label><input id="novoChamadoTelefone" class="field" placeholder="Telefone"></div>
          <div><label class="label">Prazo</label><input id="novoChamadoPrazo" class="field" type="date"></div>
          <div><label class="label">Status</label><select id="novoChamadoStatus" class="select"><option value="aberto">Aberto</option><option value="aguardando_analise">Aguardando análise</option><option value="em_analise">Em análise</option></select></div>
          <div><label class="label">Prioridade</label><select id="novoChamadoPrioridade" class="select"><option value="baixa">Baixa</option><option value="normal" selected>Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
          <div class="full"><label class="label">Descrição</label><textarea id="novoChamadoDescricao" class="textarea" placeholder="Descreva o problema relatado pelo cliente"></textarea></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" id="cancelarModalNovoChamado">Cancelar</button><button class="btn btn-primary" id="salvarModalNovoChamado">Salvar Chamado</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalNovoChamado", backdrop).addEventListener("click", fechar);
    $("#cancelarModalNovoChamado", backdrop).addEventListener("click", fechar);
    const erroBox = $("#erroModalNovoChamado", backdrop);
    $("#salvarModalNovoChamado", backdrop).addEventListener("click", async () => {
      erroBox.textContent = ""; erroBox.classList.remove("show");
      const client_name = $("#novoChamadoCliente", backdrop).value.trim();
      const client_phone = $("#novoChamadoTelefone", backdrop).value.trim() || null;
      const due_date = $("#novoChamadoPrazo", backdrop).value || null;
      const status = $("#novoChamadoStatus", backdrop).value || "aberto";
      const priority = $("#novoChamadoPrioridade", backdrop).value || "normal";
      const description = $("#novoChamadoDescricao", backdrop).value.trim();
      if (!client_name) { erroBox.textContent = "Informe o nome do cliente."; erroBox.classList.add("show"); return; }
      if (!description) { erroBox.textContent = "Informe a descrição do chamado."; erroBox.classList.add("show"); return; }
      const token = gerarTokenLocal();
      const ins = await ctx.sb.db.from("tickets").insert({ company_id: ctx.companyId, client_name, client_phone, description, due_date, status, priority, token });
      if (ins.error) { erroBox.textContent = ins.error.message || "Falha ao salvar chamado."; erroBox.classList.add("show"); return; }
      fechar(); if (typeof refreshLista === "function") await refreshLista(); alert("Chamado criado com sucesso.");
    });
  }

  function renderMidia(path, sb, idx) {
    const url = obterUrlMidia(path, sb);
    const nome = String(path || "").split("/").pop() || "arquivo";
    const tipo = ehVideo(path) ? "video" : (ehImagem(path) ? "imagem" : "arquivo");
    if (!url) return `<div class="midia-card"><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div></div></div>`;
    if (tipo === "imagem") return `<div class="midia-card" data-tipo="imagem" data-url="${escapeHtml(url)}" data-idx="${idx}"><div class="midia-thumb"><img src="${escapeHtml(url)}" alt="${escapeHtml(nome)}" loading="lazy"></div><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div><a class="link-inline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir imagem</a></div></div>`;
    if (tipo === "video") return `<div class="midia-card" data-tipo="video" data-url="${escapeHtml(url)}" data-idx="${idx}"><div class="midia-thumb"><video src="${escapeHtml(url)}" muted preload="metadata"></video></div><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div><a class="link-inline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir vídeo</a></div></div>`;
    return `<div class="midia-card"><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div></div></div>`;
  }

  function abrirVisualizadorMidia(url, isVideo) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal modal-media"><div class="modal-head"><div><div class="modal-title">Visualização da mídia</div></div><button class="btn btn-ghost" id="fecharModalMedia">Fechar</button></div><div class="media-viewer">${isVideo ? `<video src="${escapeHtml(url)}" controls autoplay></video>` : `<img src="${escapeHtml(url)}" alt="Mídia do chamado">`}</div></div>`;
    document.body.appendChild(backdrop);
    $("#fecharModalMedia", backdrop).addEventListener("click", () => document.body.removeChild(backdrop));
  }

  function abrirGaleriaImagens(imagens, idxInicial) {
    let idx = Math.max(0, Math.min(idxInicial || 0, imagens.length - 1));
    if (!imagens.length) return;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    function render() {
      const atual = imagens[idx];
      backdrop.innerHTML = `<div class="modal modal-media"><div class="modal-head"><div><div class="modal-title">Galeria de fotos</div><div class="panel-sub">${idx + 1} de ${imagens.length} • ${escapeHtml(atual.nome)}</div></div><button class="btn btn-ghost" id="fecharGaleria">Fechar</button></div><div class="galeria-toolbar"><div><button class="btn-mini" id="fotoAnterior">← Anterior</button> <button class="btn-mini" id="fotoProxima">Próxima →</button></div><div class="galeria-indicador">Use as setas do teclado</div></div><div class="media-viewer"><img src="${escapeHtml(atual.url)}" alt="${escapeHtml(atual.nome)}"></div></div>`;
      $("#fecharGaleria", backdrop).addEventListener("click", fechar);
      $("#fotoAnterior", backdrop).addEventListener("click", () => { idx = idx <= 0 ? imagens.length - 1 : idx - 1; render(); });
      $("#fotoProxima", backdrop).addEventListener("click", () => { idx = idx >= imagens.length - 1 ? 0 : idx + 1; render(); });
    }
    function onKey(e) {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowLeft") { idx = idx <= 0 ? imagens.length - 1 : idx - 1; render(); }
      if (e.key === "ArrowRight") { idx = idx >= imagens.length - 1 ? 0 : idx + 1; render(); }
    }
    function fechar() { document.removeEventListener("keydown", onKey); document.body.removeChild(backdrop); }
    document.body.appendChild(backdrop); document.addEventListener("keydown", onKey); render();
  }

  async function gerarOrcamento(ctx, ticket, refreshDetalhe) {
    if (!ticket || !ticket.id) return;
    if (!window.confirm("Deseja gerar um orçamento para este chamado agora?")) return;
    const r = await ctx.sb.db.rpc("create_quote_from_ticket", { p_ticket_id: ticket.id });
    if (r.error) return alert("Falha ao gerar orçamento: " + (r.error.message || r.error));
    alert("Orçamento gerado com sucesso.");
    await refreshDetalhe();
  }

  function abrirModalVisita(ctx, ticket, refreshDetalhe) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const d = new Date();
    const startDefault = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head"><div><div class="modal-title">Agendar Visita Técnica</div><div class="panel-sub">Use esta opção quando o vídeo e as fotos não forem suficientes para orçar.</div></div><button class="btn btn-ghost" id="fecharModalVisita">Fechar</button></div>
        <div class="alert error" id="erroModalVisita"></div>
        <div class="grid-form">
          <div><label class="label">Data e hora</label><input id="visitaInicio" class="field" type="datetime-local" value="${startDefault}"></div>
          <div><label class="label">Duração estimada (min)</label><input id="visitaDuracao" class="field" type="number" min="15" step="15" value="60"></div>
          <div><label class="label">Prioridade</label><select id="visitaPrioridade" class="select"><option value="baixa">Baixa</option><option value="normal" selected>Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></div>
          <div><label class="label">Endereço</label><input id="visitaEndereco" class="field" placeholder="Endereço da visita"></div>
          <div class="full"><label class="label">Observações técnicas</label><textarea id="visitaNotas" class="textarea" placeholder="Informações para o técnico, medidas, referência, acesso etc."></textarea></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" id="cancelarModalVisita">Cancelar</button><button class="btn btn-primary" id="salvarModalVisita">Salvar Visita</button></div>
      </div>`;
    document.body.appendChild(backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalVisita", backdrop).addEventListener("click", fechar);
    $("#cancelarModalVisita", backdrop).addEventListener("click", fechar);
    const erroBox = $("#erroModalVisita", backdrop);
    $("#salvarModalVisita", backdrop).addEventListener("click", async () => {
      erroBox.textContent = ""; erroBox.classList.remove("show");
      const startAt = $("#visitaInicio", backdrop).value;
      const estimated = Number($("#visitaDuracao", backdrop).value || 0);
      const priority = $("#visitaPrioridade", backdrop).value || "normal";
      const address = $("#visitaEndereco", backdrop).value.trim() || null;
      const notes = $("#visitaNotas", backdrop).value.trim() || null;
      if (!startAt) { erroBox.textContent = "Informe a data e hora da visita."; erroBox.classList.add("show"); return; }
      const ins = await ctx.sb.db.from("schedule_events").insert({ company_id: ctx.companyId, ticket_id: ticket.id, event_type: "visit", start_at: new Date(startAt).toISOString(), estimated_minutes: estimated || null, priority, address, notes });
      if (ins.error) { erroBox.textContent = ins.error.message || "Falha ao salvar visita."; erroBox.classList.add("show"); return; }
      fechar(); await refreshDetalhe(); alert("Visita técnica agendada com sucesso.");
    });
  }

  async function listarChamados(ctx) {
    injetarCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de chamados não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = { busca: "", prioridade: "", tickets: [], selecionado: null, historico: [], mensagens: [], visitas: [], orcamentos: [], linkPortalGeral: montarUrlPublica("ticket.html", { c: ctx.companyId, t: ctx.portalToken || "" }), linkAnexosAtual: "" };
    const statusCols = [
      { id: "aberto", titulo: "Abertos", sub: "Entrada e triagem inicial" },
      { id: "em_analise", titulo: "Em análise", sub: "Avaliação técnica / comercial" },
      { id: "em_andamento", titulo: "Em andamento", sub: "Execução interna ou em campo" },
      { id: "aguardando_cliente", titulo: "Aguardando cliente", sub: "Ação pendente do cliente" },
      { id: "finalizado", titulo: "Finalizados", sub: "Chamados encerrados" }
    ];

    alvo.innerHTML = `
      <div class="toolbar">
        <input id="filtroBuscaChamados" class="field" placeholder="Buscar por nome, telefone ou descrição" />
        <select id="filtroPrioridadeChamados" class="select">
          <option value="">Todas as prioridades</option><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option>
        </select>
        <button id="btnPortalCliente" class="btn btn-secondary">Link do Portal</button>
        <button id="btnNovoChamado" class="btn btn-primary">Novo Chamado</button>
      </div>
      <div id="alertaSlaBar" class="alerta-bar"></div>
      <div class="kanban-wrap">
        <div class="panel"><h2>Kanban operacional</h2><div class="panel-sub">Arraste o chamado entre as colunas para atualizar o status.</div><div id="kanbanBoard" class="kanban-board">${statusCols.map(col => `<div class="kanban-col"><div class="kanban-head"><div class="kanban-title"><span>${escapeHtml(col.titulo)}</span><span class="kanban-count" data-count="${col.id}">0</span></div><div class="kanban-sub">${escapeHtml(col.sub)}</div></div><div class="kanban-body" data-status="${col.id}"></div></div>`).join("")}</div></div>
        <div class="panel"><h2>Detalhe do chamado</h2><div class="panel-sub">Selecione um card para visualizar.</div><div id="detalheChamadoWrap" class="empty">Nenhum chamado selecionado.</div></div>
      </div>
    `;

    $("#filtroBuscaChamados", alvo).addEventListener("input", async e => { state.busca = e.target.value || ""; await carregarLista(); });
    $("#filtroPrioridadeChamados", alvo).addEventListener("change", async e => { state.prioridade = e.target.value || ""; await carregarLista(); });
    $("#btnNovoChamado", alvo).addEventListener("click", () => abrirModalNovoChamado(ctx, carregarLista));
    $("#btnPortalCliente", alvo).addEventListener("click", () => abrirModalLinkPortal({ titulo: "Link público para abertura de chamado", link: state.linkPortalGeral, subtitulo: "Envie este link para o cliente abrir o chamado, descrever o problema e depois anexar as fotos e o vídeo." }));

    await carregarLista();

    async function carregarLista() {
      const { data, error } = await ctx.sb.db.from("tickets").select("id, created_at, client_name, client_phone, description, status, priority, due_date, token, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, video1_path").eq("company_id", ctx.companyId);
      if (error) throw error;

      const busca = state.busca.trim().toLowerCase();
      state.tickets = (data || []).filter(item => {
        if (state.prioridade && normalizarPrioridade(item.priority) !== state.prioridade) return false;
        if (!busca) return true;
        const texto = [item.client_name, item.client_phone, item.description, item.status, item.priority].join(" ").toLowerCase();
        return texto.includes(busca);
      }).sort((a,b) => {
        const pa = pesoPrioridade(a.priority), pb = pesoPrioridade(b.priority);
        if (pa !== pb) return pa - pb;
        return String(b.created_at || "").localeCompare(String(a.created_at || ""));
      });

      renderAlertasSla();
      renderKanban();
      if (!state.selecionado && state.tickets.length) state.selecionado = state.tickets[0];
      await carregarDetalhe();
    }

    function renderAlertasSla() {
      const bar = $("#alertaSlaBar", alvo);
      const ativos = state.tickets.filter(t => !["finalizado","cancelado"].includes(String(t.status || "").toLowerCase()));
      const vencidos = ativos.filter(t => calcularSla(t).classe === "sla-vencido").length;
      const alerta = ativos.filter(t => calcularSla(t).classe === "sla-alerta").length;
      bar.innerHTML = `
        <div class="alerta-chip alerta-vermelho">SLA estourado: ${vencidos}</div>
        <div class="alerta-chip alerta-amarelo">Vencendo em até 4h: ${alerta}</div>
      `;
    }

    function renderKanban() {
      $all(".kanban-body", alvo).forEach(col => {
        const status = col.getAttribute("data-status");
        const items = state.tickets.filter(t => String(t.status || "") === status);
        const countEl = $(`[data-count="${status}"]`, alvo);
        if (countEl) countEl.textContent = String(items.length);
        col.innerHTML = items.length ? items.map(ticket => {
          const sla = calcularSla(ticket);
          return `<div class="kanban-card ticket-priority-${normalizarPrioridade(ticket.priority)} ${sla.classe}" draggable="true" data-id="${ticket.id}">
            <div class="kanban-card-head">
              <div><div class="kanban-card-title">${escapeHtml(ticket.client_name || "Sem nome")}</div><div class="kanban-card-meta">${escapeHtml(ticket.client_phone || "—")}</div></div>
              ${badgePrioridade(ticket.priority || "normal")}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${badgeStatus(ticket.status)}<span class="sla-pill ${sla.classe}">${escapeHtml(sla.texto)}</span></div>
            <div class="kanban-card-desc">${escapeHtml((ticket.description || "").slice(0, 110) || "Sem descrição")}</div>
            <div class="kanban-card-meta" style="margin-top:12px">Prazo: ${escapeHtml(formatarData(ticket.due_date))}</div>
          </div>`;
        }).join("") : `<div class="kanban-empty">Nenhum chamado.</div>`;
        prepararDropzone(col);
      });

      $all(".kanban-card", alvo).forEach(card => {
        card.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", card.getAttribute("data-id")); });
        card.addEventListener("click", async () => {
          const id = card.getAttribute("data-id");
          state.selecionado = state.tickets.find(t => t.id === id) || null;
          await carregarDetalhe();
        });
      });
    }

    function prepararDropzone(col) {
      col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", async e => {
        e.preventDefault(); col.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        const novoStatus = col.getAttribute("data-status");
        const ticket = state.tickets.find(t => t.id === id);
        if (!ticket || !novoStatus || ticket.status === novoStatus) return;
        const upd = await ctx.sb.db.from("tickets").update({ status: novoStatus }).eq("id", id).eq("company_id", ctx.companyId);
        if (upd.error) return alert("Falha ao mover chamado: " + (upd.error.message || upd.error));
        ticket.status = novoStatus;
        renderAlertasSla();
        renderKanban();
        state.selecionado = ticket;
        await carregarDetalhe();
      });
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheChamadoWrap", alvo);
      if (!state.selecionado) { wrap.innerHTML = `<div class="empty">Nenhum chamado selecionado.</div>`; return; }

      const [historicoResp, mensagensResp, visitasResp, quotesResp] = await Promise.all([
        ctx.sb.db.from("ticket_history").select("created_at, action, from_status, to_status, note").eq("ticket_id", state.selecionado.id).order("created_at", { ascending: false }),
        ctx.sb.db.from("ticket_messages").select("created_at, author_type, author_name, message, event_type").eq("ticket_id", state.selecionado.id).order("created_at", { ascending: false }),
        ctx.sb.db.from("schedule_events").select("id, event_type, start_at, priority, estimated_minutes, address, notes").eq("ticket_id", state.selecionado.id).order("start_at", { ascending: false }),
        ctx.sb.db.from("quotes").select("id, status, total, created_at, updated_at, version").eq("ticket_id", state.selecionado.id).order("created_at", { ascending: false })
      ]);
      state.historico = historicoResp.data || [];
      state.mensagens = mensagensResp.data || [];
      state.visitas = visitasResp.data || [];
      state.orcamentos = quotesResp.data || [];
      const midias = caminhosMidia(state.selecionado);
      const sla = calcularSla(state.selecionado);

      wrap.innerHTML = `
        <div class="detail-actions">
          <button id="btnGerarLinkAnexos" class="btn btn-primary">Gerar Link de Anexos</button>
          <button id="btnAgendarVisita" class="btn btn-warning">Agendar Visita Técnica</button>
          <button id="btnGerarOrcamento" class="btn btn-success">Gerar Orçamento</button>
          <button id="btnPortalGeralDetalhe" class="btn btn-ghost">Portal de Abertura</button>
        </div>
        <div class="detail-block"><h3>Dados</h3><div class="kv-list">
          <div class="muted">Cliente</div><div>${escapeHtml(state.selecionado.client_name || "Sem nome")}</div>
          <div class="muted">Telefone</div><div>${escapeHtml(state.selecionado.client_phone || "—")}</div>
          <div class="muted">Status</div><div>${badgeStatus(state.selecionado.status)}</div>
          <div class="muted">Prioridade</div><div class="detail-grid-priority">${badgePrioridade(state.selecionado.priority || "normal")}</div>
          <div class="muted">SLA</div><div><span class="sla-pill ${sla.classe}">${escapeHtml(sla.texto)}</span></div>
          <div class="muted">Prazo</div><div>${escapeHtml(formatarData(state.selecionado.due_date))}</div>
          <div class="muted">Criado em</div><div>${escapeHtml(formatarDataHora(state.selecionado.created_at))}</div>
          <div class="muted">Descrição</div><div>${escapeHtml(state.selecionado.description || "—")}</div>
        </div></div>
        <div class="separator"></div>
        <div class="detail-block"><h3>Links do Cliente</h3><div class="kv-list">
          <div class="muted">Link para abrir novo chamado</div><div><a class="link-inline" href="${escapeHtml(state.linkPortalGeral)}" target="_blank" rel="noopener">Abrir portal público</a></div>
          <div class="muted">Link de anexos deste chamado</div><div id="boxLinkAnexos">${state.linkAnexosAtual ? `<div class="link-box">${escapeHtml(state.linkAnexosAtual)}</div><div class="detail-actions"><button id="btnCopiarLinkAnexos" class="btn btn-secondary">Copiar Link</button><a class="btn btn-ghost" href="${escapeHtml(state.linkAnexosAtual)}" target="_blank" rel="noopener">Abrir</a></div>` : `<div class="empty">Clique em "Gerar Link de Anexos" para enviar este chamado ao cliente e permitir anexar fotos e vídeo.</div>`}</div>
        </div></div>
        <div class="separator"></div>
        <div class="detail-block"><div class="galeria-toolbar"><h3>Mídias</h3><div class="zoom-info">${midias.length ? "Clique na foto para ampliar e navegar." : ""}</div></div>${midias.length ? `<div class="media-grid media-preview-grid">${midias.map((m, idx) => renderMidia(m, ctx.sb, idx)).join("")}</div>` : `<div class="empty">Nenhuma mídia registrada.</div>`}</div>
        <div class="separator"></div>
        <div class="detail-block"><h3>Visitas Técnicas</h3>${state.visitas.length ? state.visitas.map(v => `<div class="mini-card"><div class="mini-card-top"><div class="mini-card-title">${escapeHtml(v.event_type || "visit")}</div><div>${badgePrioridade(v.priority || "normal")}</div></div><div class="mini-card-meta">Início: ${escapeHtml(formatarDataHora(v.start_at))}</div><div class="mini-card-meta">Duração estimada: ${escapeHtml(v.estimated_minutes || "—")} min</div><div class="mini-card-meta">Endereço: ${escapeHtml(v.address || "—")}</div><div>${escapeHtml(v.notes || "Sem observações")}</div></div>`).join("") : `<div class="empty">Nenhuma visita técnica agendada.</div>`}</div>
        <div class="separator"></div>
        <div class="detail-block"><h3>Orçamentos</h3>${state.orcamentos.length ? state.orcamentos.map(q => `<div class="mini-card"><div class="mini-card-top"><div class="mini-card-title">Orçamento v${escapeHtml(q.version || 1)}</div><div>${badgeStatus(q.status)}</div></div><div class="mini-card-meta">Criado em: ${escapeHtml(formatarDataHora(q.created_at))}</div><div class="mini-card-meta">Atualizado em: ${escapeHtml(formatarDataHora(q.updated_at))}</div><div><strong>Total:</strong> ${escapeHtml(new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(q.total||0)))}</div></div>`).join("") : `<div class="empty">Nenhum orçamento gerado para este chamado.</div>`}</div>
      `;

      $("#btnGerarLinkAnexos", wrap).addEventListener("click", async () => {
        if (!state.selecionado.token) return alert("Este chamado não possui token de cliente.");
        state.linkAnexosAtual = montarUrlPublica("portal-upload.html", { company_id: ctx.companyId, ticket_id: state.selecionado.id, ticket_token: state.selecionado.token });
        await carregarDetalhe();
        abrirModalLinkPortal({ titulo: "Link de anexos do chamado", link: state.linkAnexosAtual, subtitulo: "Envie esse link para o cliente anexar fotos e vídeo deste chamado específico." });
      });
      $("#btnPortalGeralDetalhe", wrap).addEventListener("click", () => abrirModalLinkPortal({ titulo: "Link público para abertura de chamado", link: state.linkPortalGeral, subtitulo: "Esse link cria um chamado novo e, ao final, o cliente já é levado para a tela de anexar fotos e vídeo." }));
      $("#btnAgendarVisita", wrap).addEventListener("click", () => abrirModalVisita(ctx, state.selecionado, carregarDetalhe));
      $("#btnGerarOrcamento", wrap).addEventListener("click", () => gerarOrcamento(ctx, state.selecionado, carregarDetalhe));
      const btnCopiar = $("#btnCopiarLinkAnexos", wrap);
      if (btnCopiar) btnCopiar.addEventListener("click", async () => { await copiarTexto(state.linkAnexosAtual); alert("Link copiado."); });

      const imagens = midias.filter(ehImagem).map(path => ({ path, url: obterUrlMidia(path, ctx.sb), nome: String(path || "").split("/").pop() || "imagem" })).filter(x => x.url);
      wrap.querySelectorAll(".midia-card").forEach(card => card.addEventListener("click", () => {
        const tipo = card.getAttribute("data-tipo");
        const url = card.getAttribute("data-url");
        const idx = Number(card.getAttribute("data-idx") || "0");
        if (!url) return;
        if (tipo === "imagem") return abrirGaleriaImagens(imagens, idx);
        if (tipo === "video") return abrirVisualizadorMidia(url, true);
      }));
    }
  }

  window.ModuloChamados = { listarChamados, formatarData, formatarDataHora };
})();
