
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function escapeHtml(t) { return String(t || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
  function money(v) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0)); }
  function fmtDate(v) { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR"); }
  function stageLabel(s) { const map = { diagnostico:"Diagnóstico", orcamento:"Orçamento", aprovacao:"Aprovação", aprovado:"Aprovado", execucao:"Execução", faturado:"Faturado", perdido:"Perdido" }; return map[String(s || "").toLowerCase()] || (s || "—"); }
  function injectCss() {
    if (document.getElementById("css-pipeline-stable-v1")) return;
    const st = document.createElement("style");
    st.id = "css-pipeline-stable-v1";
    st.textContent = ".pipe-wrap{display:grid;grid-template-columns:1.45fr .95fr;gap:16px}.pipe-board{display:grid;grid-template-columns:repeat(7,minmax(220px,1fr));gap:14px;overflow:auto;padding-bottom:4px}.pipe-col{background:rgba(255,255,255,.02);border:1px solid rgba(108,152,232,.16);border-radius:14px;min-height:420px;display:flex;flex-direction:column}.pipe-head{padding:12px 14px;border-bottom:1px solid rgba(108,152,232,.12)}.pipe-title{font-weight:800;color:#eff6ff;display:flex;justify-content:space-between;gap:8px;align-items:center}.pipe-sub{font-size:12px;color:#9db3d6;margin-top:4px}.pipe-count{font-size:12px;color:#9db3d6;background:rgba(255,255,255,.04);padding:4px 8px;border-radius:999px}.pipe-body{padding:12px;display:flex;flex-direction:column;gap:10px;min-height:180px}.pipe-body.drag-over{background:rgba(61,134,255,.06)}.pipe-card{border-radius:14px;padding:12px;border:1px solid rgba(108,152,232,.16);background:rgba(255,255,255,.03);cursor:grab}.pipe-card-title{font-weight:800;color:#eff6ff;line-height:1.25}.pipe-card-small{font-size:12px;color:#9db3d6}.pipe-card-desc{font-size:13px;color:#dce7f8;margin-top:10px}.pipe-empty{padding:18px;text-align:center;color:#8ea6ca;font-size:13px}@media (max-width:1200px){.pipe-wrap{grid-template-columns:1fr}.pipe-board{grid-template-columns:repeat(7, minmax(260px,1fr));}}";
    document.head.appendChild(st);
  }

  async function listarPipeline(ctx) {
    injectCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) return;

    const state = { busca: "", registros: [], selecionado: null };
    const stages = [
      { id: "diagnostico", titulo: "Diagnóstico", sub: "Levantamento inicial" },
      { id: "orcamento", titulo: "Orçamento", sub: "Montagem da proposta" },
      { id: "aprovacao", titulo: "Aprovação", sub: "Aguardando retorno do cliente" },
      { id: "aprovado", titulo: "Aprovado", sub: "Pronto para OS" },
      { id: "execucao", titulo: "Execução", sub: "OS em andamento" },
      { id: "faturado", titulo: "Faturado", sub: "Receita realizada" },
      { id: "perdido", titulo: "Perdido", sub: "Negócio perdido" }
    ];

    alvo.innerHTML = `<div class="toolbar"><input id="filtroBuscaPipeline" class="field" placeholder="Buscar por cliente, telefone ou descrição" /></div><div class="pipe-wrap"><div class="panel"><h2>Pipeline Comercial</h2><div class="panel-sub">Arraste os cards para avançar o negócio.</div><div class="pipe-board">${stages.map(col => `<div class="pipe-col"><div class="pipe-head"><div class="pipe-title"><span>${escapeHtml(col.titulo)}</span><span class="pipe-count" data-pcount="${col.id}">0</span></div><div class="pipe-sub">${escapeHtml(col.sub)}</div></div><div class="pipe-body" data-stage="${col.id}"></div></div>`).join("")}</div></div><div class="panel"><h2>Detalhe Comercial</h2><div class="panel-sub">Selecione um card para visualizar.</div><div id="pipelineDetailWrap" class="empty">Nenhum registro selecionado.</div></div></div>`;

    $("#filtroBuscaPipeline", alvo).addEventListener("input", async e => { state.busca = e.target.value || ""; await carregar(); });
    await carregar();

    async function carregar() {
      const pipe = await ctx.sb.db.from("commercial_pipeline").select("id, company_id, ticket_id, stage, estimated_value, approved_value, status, created_at, updated_at").eq("company_id", ctx.companyId);
      if (pipe.error) throw pipe.error;
      const budgets = await ctx.sb.db.from("budgets").select("id, company_id, ticket_id, pipeline_id, client_name, client_phone, description, total, status, version, created_at, updated_at").eq("company_id", ctx.companyId);
      if (budgets.error) throw budgets.error;
      const tickets = await ctx.sb.db.from("tickets").select("id, client_name, client_phone, description, priority, status, created_at, due_date, customer_id").eq("company_id", ctx.companyId);
      if (tickets.error) throw tickets.error;

      const budgetByPipeline = {};
      (budgets.data || []).forEach(b => { if (!budgetByPipeline[b.pipeline_id]) budgetByPipeline[b.pipeline_id] = []; budgetByPipeline[b.pipeline_id].push(b); });

      const ticketMap = {};
      (tickets.data || []).forEach(t => { ticketMap[t.id] = t; });

      const busca = String(state.busca || "").trim().toLowerCase();
      state.registros = (pipe.data || []).map(p => {
        const ticket = ticketMap[p.ticket_id] || {};
        const list = (budgetByPipeline[p.id] || []).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        const latestBudget = list[0] || null;
        return { ...p, ticket, latestBudget, client_name: latestBudget?.client_name || ticket.client_name || "Sem nome", client_phone: latestBudget?.client_phone || ticket.client_phone || "—", description: latestBudget?.description || ticket.description || "", value: p.approved_value || latestBudget?.total || p.estimated_value || 0 };
      }).filter(r => {
        if (!busca) return true;
        const text = [r.client_name, r.client_phone, r.description, r.stage].join(" ").toLowerCase();
        return text.includes(busca);
      });

      renderBoard();
      if (!state.selecionado && state.registros.length) state.selecionado = state.registros[0];
      renderDetail();
    }

    function renderBoard() {
      $all(".pipe-body", alvo).forEach(col => {
        const stage = col.getAttribute("data-stage");
        const items = state.registros.filter(r => String(r.stage || "") === stage);
        const count = $('[data-pcount="' + stage + '"]', alvo);
        if (count) count.textContent = String(items.length);
        col.innerHTML = items.length ? items.map(item => `<div class="pipe-card" draggable="true" data-id="${item.id}"><div class="pipe-card-title">${escapeHtml(item.client_name)}</div><div class="pipe-card-small">${escapeHtml(item.client_phone)}</div><div class="pipe-card-desc">${escapeHtml((item.description || "").slice(0, 120) || "Sem descrição")}</div><div class="pipe-card-small" style="margin-top:10px">Valor: ${money(item.value || 0)}</div><div class="pipe-card-small">Ticket: ${escapeHtml(item.ticket_id || "—")}</div></div>`).join("") : '<div class="pipe-empty">Nenhum registro.</div>';
        prepareDropzone(col);
      });
      $all(".pipe-card", alvo).forEach(card => {
        card.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", card.getAttribute("data-id")));
        card.addEventListener("click", () => { const id = card.getAttribute("data-id"); state.selecionado = state.registros.find(r => r.id === id) || null; renderDetail(); });
      });
    }

    function prepareDropzone(col) {
      col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", async e => {
        e.preventDefault();
        col.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        const novoStage = col.getAttribute("data-stage");
        const reg = state.registros.find(r => r.id === id);
        if (!reg || !novoStage || reg.stage === novoStage) return;
        const upd = await ctx.sb.db.from("commercial_pipeline").update({ stage: novoStage, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", ctx.companyId);
        if (upd.error) return alert("Falha ao mover pipeline: " + (upd.error.message || upd.error));
        reg.stage = novoStage;
        renderBoard();
        renderDetail();
      });
    }

    function renderDetail() {
      const wrap = $("#pipelineDetailWrap", alvo);
      if (!state.selecionado) { wrap.innerHTML = '<div class="empty">Nenhum registro selecionado.</div>'; return; }
      wrap.innerHTML = `<div class="mini-card"><div class="mini-card-top"><div class="mini-card-title">${escapeHtml(state.selecionado.client_name)}</div><div><span class="status-pill">${escapeHtml(stageLabel(state.selecionado.stage))}</span></div></div><div class="mini-card-meta">Telefone: ${escapeHtml(state.selecionado.client_phone)}</div><div class="mini-card-meta">Criado em: ${escapeHtml(fmtDate(state.selecionado.created_at))}</div><div class="mini-card-meta">Atualizado em: ${escapeHtml(fmtDate(state.selecionado.updated_at))}</div><div class="mini-card-meta">Valor atual: ${money(state.selecionado.value || 0)}</div><div style="margin-top:10px">${escapeHtml(state.selecionado.description || "Sem descrição")}</div></div><div class="modal-actions" style="margin-top:12px;"><button class="btn btn-primary" id="btnAbrirBudgetPipeline">Abrir orçamento</button></div>`;
      $("#btnAbrirBudgetPipeline", wrap).addEventListener("click", () => {
        if (window.ModuloBudgets && state.selecionado.ticket) window.ModuloBudgets.abrirModalOrcamento(ctx, state.selecionado.ticket, carregar);
        else alert("Módulo de orçamentos não carregado.");
      });
    }
  }

  window.ModuloPipeline = { listarPipeline };
})();
