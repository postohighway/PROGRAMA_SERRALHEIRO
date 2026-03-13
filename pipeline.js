
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
    st.textContent = `.pipe-wrap{display:grid;grid-template-columns:1.45fr .95fr;gap:16px}.pipe-board{display:grid;grid-template-columns:repeat(7,minmax(220px,1fr));gap:14px;overflow:auto;padding-bottom:4px}.pipe-col{background:rgba(255,255,255,.02);border:1px solid rgba(108,152,232,.16);border-radius:14px;min-height:420px;display:flex;flex-direction:column}.pipe-head{padding:12px 14px;border-bottom:1px solid rgba(108,152,232,.12);position:relative}.pipe-head:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:14px 0 0 14px;background:rgba(108,152,232,.22)}.pipe-col[data-stage="diagnostico"] .pipe-head:before,.pipe-col[data-stage="orcamento"] .pipe-head:before{background:#3d86ff}.pipe-col[data-stage="aprovacao"] .pipe-head:before{background:#f6b73c}.pipe-col[data-stage="aprovado"] .pipe-head:before{background:#5aa9ff}.pipe-col[data-stage="execucao"] .pipe-head:before{background:#14c38e}.pipe-col[data-stage="faturado"] .pipe-head:before{background:#a855f7}.pipe-col[data-stage="perdido"] .pipe-head:before{background:#ff5d6c}.pipe-title{font-weight:800;color:#eff6ff;display:flex;justify-content:space-between;gap:8px;align-items:center}.pipe-sub{font-size:12px;color:#9db3d6;margin-top:4px}.pipe-count{font-size:12px;color:#9db3d6;background:rgba(255,255,255,.04);padding:4px 8px;border-radius:999px}.pipe-body{padding:12px;display:flex;flex-direction:column;gap:10px;min-height:180px}.pipe-body.drag-over{background:rgba(61,134,255,.06)}.pipe-card{border-radius:14px;padding:12px;border:1px solid rgba(108,152,232,.16);background:rgba(255,255,255,.03);cursor:grab}.pipe-card.active{border-color:rgba(61,134,255,.55);box-shadow:0 10px 24px rgba(0,0,0,.18)}.pipe-card-title{font-weight:800;color:#eff6ff;line-height:1.25}.pipe-card-small{font-size:12px;color:#9db3d6}.pipe-card-desc{font-size:13px;color:#dce7f8;margin-top:10px}.pipe-card-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.flow-pill{display:inline-flex;align-items:center;justify-content:center;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:800;border:1px solid transparent}.flow-pill.budget{background:rgba(61,134,255,.10);border-color:rgba(61,134,255,.28);color:#dbeaff}.flow-pill.approval{background:rgba(246,183,60,.12);border-color:rgba(246,183,60,.32);color:#ffe6ab}.flow-pill.approved{background:rgba(46,144,250,.12);border-color:rgba(46,144,250,.32);color:#d9ecff}.flow-pill.os{background:rgba(20,195,142,.10);border-color:rgba(20,195,142,.30);color:#bff2df}.flow-pill.done{background:rgba(168,85,247,.12);border-color:rgba(168,85,247,.30);color:#ead8ff}.pipe-empty{padding:18px;text-align:center;color:#8ea6ca;font-size:13px}@media (max-width:1200px){.pipe-wrap{grid-template-columns:1fr}.pipe-board{grid-template-columns:repeat(7, minmax(260px,1fr));}}`;
    document.head.appendChild(st);
  }



  async function syncTicketStatusFromPipeline(ctx, ticketId, stage) {
    if (!ticketId) return;
    const s = String(stage || "").toLowerCase();
    let newStatus = null;
    if (s === "diagnostico" || s === "orcamento") newStatus = "em_analise";
    else if (s === "aprovacao") newStatus = "aguardando_cliente";
    else if (s === "aprovado" || s === "execucao") newStatus = "em_andamento";
    else if (s === "faturado") newStatus = "finalizado";
    if (!newStatus) return;
    const upd = await ctx.sb.db.from("tickets").update({ status: newStatus }).eq("company_id", ctx.companyId).eq("id", ticketId);
    if (upd.error) throw upd.error;
  }

  async function listarPipeline(ctx) {
    injectCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) return;

    const state = { busca: "", registros: [], selecionado: null, focoTicketId: null, abrirBudgetAoCarregar: false, budgetAbertoAutomaticamente: false };
    const stages = [
      { id: "diagnostico", titulo: "Diagnóstico", sub: "Levantamento inicial" },
      { id: "orcamento", titulo: "Orçamento", sub: "Montagem da proposta" },
      { id: "aprovacao", titulo: "Aprovação", sub: "Aguardando retorno do cliente" },
      { id: "aprovado", titulo: "Aprovado", sub: "Pronto para OS" },
      { id: "execucao", titulo: "Execução", sub: "OS em andamento" },
      { id: "faturado", titulo: "Faturado", sub: "Receita realizada" },
      { id: "perdido", titulo: "Perdido", sub: "Negócio perdido" }
    ];

    alvo.innerHTML = `<div class="toolbar"><input id="filtroBuscaPipeline" class="field" placeholder="Buscar por cliente, telefone ou descrição" /></div><div class="pipe-wrap"><div class="panel"><h2>Pipeline Comercial</h2><div class="panel-sub">Arraste os cards para avançar o negócio.</div><div class="pipe-board">${stages.map(col => `<div class="pipe-col" data-stage="${col.id}"><div class="pipe-head"><div class="pipe-title"><span>${escapeHtml(col.titulo)}</span><span class="pipe-count" data-pcount="${col.id}">0</span></div><div class="pipe-sub">${escapeHtml(col.sub)}</div></div><div class="pipe-body" data-stage="${col.id}"></div></div>`).join("")}</div></div><div class="panel"><h2>Detalhe Comercial</h2><div class="panel-sub">Selecione um card para visualizar.</div><div id="pipelineDetailWrap" class="empty">Nenhum registro selecionado.</div></div></div>`;

    $("#filtroBuscaPipeline", alvo).addEventListener("input", async e => { state.busca = e.target.value || ""; try {
      state.focoTicketId = sessionStorage.getItem("sgb_pipeline_focus_ticket_id") || null;
      state.abrirBudgetAoCarregar = sessionStorage.getItem("sgb_pipeline_open_budget") === "1";
      sessionStorage.removeItem("sgb_pipeline_focus_ticket_id");
      sessionStorage.removeItem("sgb_pipeline_open_budget");
    } catch (_) {}
    await carregar(); });
    await carregar();

    async function carregar() {
      const [pipe, budgets, tickets, workorders] = await Promise.all([
        ctx.sb.db.from("commercial_pipeline").select("id, company_id, ticket_id, stage, estimated_value, approved_value, status, created_at, updated_at").eq("company_id", ctx.companyId),
        ctx.sb.db.from("budgets").select("id, company_id, ticket_id, pipeline_id, client_name, client_phone, description, total, status, version, created_at, updated_at").eq("company_id", ctx.companyId),
        ctx.sb.db.from("tickets").select("id, client_name, client_phone, description, priority, status, created_at, due_date, customer_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("workorders").select("id, ticket_id, status, created_at").eq("company_id", ctx.companyId)
      ]);
      if (pipe.error) throw pipe.error;
      if (budgets.error) throw budgets.error;
      if (tickets.error) throw tickets.error;
      if (workorders.error) throw workorders.error;

      const budgetByPipeline = {};
      (budgets.data || []).forEach(b => { if (!budgetByPipeline[b.pipeline_id]) budgetByPipeline[b.pipeline_id] = []; budgetByPipeline[b.pipeline_id].push(b); });

      const ticketMap = {};
      (tickets.data || []).forEach(t => { ticketMap[t.id] = t; });
      const workorderByTicket = {};
      (workorders.data || []).forEach(w => { if (!workorderByTicket[w.ticket_id]) workorderByTicket[w.ticket_id] = []; workorderByTicket[w.ticket_id].push(w); });

      const busca = String(state.busca || "").trim().toLowerCase();
      state.registros = (pipe.data || []).map(p => {
        const ticket = ticketMap[p.ticket_id] || {};
        const list = (budgetByPipeline[p.id] || []).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        const latestBudget = list[0] || null;
        const workordersForTicket = (workorderByTicket[p.ticket_id] || []).sort((a,b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        return { ...p, ticket, latestBudget, workorders: workordersForTicket, client_name: latestBudget?.client_name || ticket.client_name || "Sem nome", client_phone: latestBudget?.client_phone || ticket.client_phone || "—", description: latestBudget?.description || ticket.description || "", value: p.approved_value || latestBudget?.total || p.estimated_value || 0 };
      }).filter(r => {
        if (!busca) return true;
        const text = [r.client_name, r.client_phone, r.description, r.stage].join(" ").toLowerCase();
        return text.includes(busca);
      });

      renderBoard();
      if (state.focoTicketId) {
        state.selecionado = state.registros.find(r => String(r.ticket_id || "") === String(state.focoTicketId)) || state.selecionado;
        state.focoTicketId = null;
      }
      if (!state.selecionado && state.registros.length) state.selecionado = state.registros[0];
      renderDetail();
      if (state.abrirBudgetAoCarregar && state.selecionado && state.selecionado.ticket && window.ModuloBudgets && typeof window.ModuloBudgets.abrirModalOrcamento === "function" && !state.budgetAbertoAutomaticamente) {
        state.budgetAbertoAutomaticamente = true;
        state.abrirBudgetAoCarregar = false;
        setTimeout(() => window.ModuloBudgets.abrirModalOrcamento(ctx, state.selecionado.ticket, carregar), 50);
      }
    }

    function renderBoard() {
      $all(".pipe-body", alvo).forEach(col => {
        const stage = col.getAttribute("data-stage");
        const items = state.registros.filter(r => String(r.stage || "") === stage);
        const count = $('[data-pcount="' + stage + '"]', alvo);
        if (count) count.textContent = String(items.length);
        col.innerHTML = items.length ? items.map(item => `<div class="pipe-card ${state.selecionado && state.selecionado.id === item.id ? "active" : ""}" draggable="true" data-id="${item.id}"><div class="pipe-card-title">${escapeHtml(item.client_name)}</div><div class="pipe-card-small">${escapeHtml(item.client_phone)}</div><div class="pipe-card-desc">${escapeHtml((item.description || "").slice(0, 120) || "Sem descrição")}</div><div class="pipe-card-chips">${item.latestBudget ? `<span class="flow-pill budget">Orçamento v${escapeHtml(item.latestBudget.version || 1)}</span>` : ''}${String(item.stage || '').toLowerCase() === 'aprovacao' ? `<span class="flow-pill approval">Aguardando cliente</span>` : ''}${String(item.stage || '').toLowerCase() === 'aprovado' ? `<span class="flow-pill approved">Pronto para OS</span>` : ''}${String(item.stage || '').toLowerCase() === 'execucao' || (item.workorders && item.workorders.length) ? `<span class="flow-pill os">OS criada</span>` : ''}${String(item.stage || '').toLowerCase() === 'faturado' ? `<span class="flow-pill done">Receita realizada</span>` : ''}</div><div class="pipe-card-small" style="margin-top:10px">Valor: ${money(item.value || 0)}</div><div class="pipe-card-small">Ticket: ${escapeHtml(item.ticket_id || "—")}</div></div>`).join("") : '<div class="pipe-empty">Nenhum registro.</div>';
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
        try {
          await syncTicketStatusFromPipeline(ctx, reg.ticket_id, novoStage);
        } catch (syncErr) {
          return alert("Pipeline movido, mas falhou ao sincronizar o chamado: " + (syncErr.message || syncErr));
        }
        reg.stage = novoStage;
        renderBoard();
        renderDetail();
      });
    }

    function renderDetail() {
      const wrap = $("#pipelineDetailWrap", alvo);
      if (!state.selecionado) { wrap.innerHTML = '<div class="empty">Nenhum registro selecionado.</div>'; return; }
      wrap.innerHTML = `<div class="mini-card"><div class="mini-card-top"><div class="mini-card-title">${escapeHtml(state.selecionado.client_name)}</div><div><span class="status-pill">${escapeHtml(stageLabel(state.selecionado.stage))}</span></div></div><div class="mini-card-meta">Telefone: ${escapeHtml(state.selecionado.client_phone)}</div><div class="mini-card-meta">Criado em: ${escapeHtml(fmtDate(state.selecionado.created_at))}</div><div class="mini-card-meta">Atualizado em: ${escapeHtml(fmtDate(state.selecionado.updated_at))}</div><div class="mini-card-meta">Valor atual: ${money(state.selecionado.value || 0)}</div><div class="pipe-card-chips" style="margin-top:12px">${state.selecionado.latestBudget ? `<span class="flow-pill budget">Orçamento v${escapeHtml(state.selecionado.latestBudget.version || 1)}</span>` : ''}${state.selecionado.workorders && state.selecionado.workorders.length ? `<span class="flow-pill os">OS ${escapeHtml(state.selecionado.workorders.length)}</span>` : ''}${String(state.selecionado.stage || '').toLowerCase() === 'faturado' ? `<span class="flow-pill done">Faturado</span>` : ''}</div><div style="margin-top:10px">${escapeHtml(state.selecionado.description || "Sem descrição")}</div></div><div class="modal-actions" style="margin-top:12px;"><button class="btn btn-primary" id="btnAbrirBudgetPipeline">Abrir orçamento</button></div>`;
      $("#btnAbrirBudgetPipeline", wrap).addEventListener("click", () => {
        if (window.ModuloBudgets && state.selecionado.ticket) window.ModuloBudgets.abrirModalOrcamento(ctx, state.selecionado.ticket, carregar);
        else alert("Módulo de orçamentos não carregado.");
      });
    }
  }

  window.ModuloPipeline = { listarPipeline };
})();
