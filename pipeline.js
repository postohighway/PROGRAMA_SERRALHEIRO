
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function escapeHtml(t) {
    return String(t || "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function moeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }
  function formatarDataHora(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }
  function traduzirStage(s) {
    const mapa = {
      diagnostico:"Diagnóstico",
      orcamento:"Orçamento",
      aprovacao:"Aguardando aprovação",
      aprovado:"Aprovado",
      execucao:"Em execução",
      faturado:"Faturado",
      perdido:"Perdido"
    };
    return mapa[String(s || "").toLowerCase()] || (s || "—");
  }
  function ensureCss() {
    if (document.getElementById("css-pipeline-v1")) return;
    const st = document.createElement("style");
    st.id = "css-pipeline-v1";
    st.textContent = `
      .pipeline-wrap{display:grid;grid-template-columns:1.4fr .9fr;gap:16px}
      .pipe-board{display:grid;grid-template-columns:repeat(7,minmax(220px,1fr));gap:14px;overflow:auto;padding-bottom:4px}
      .pipe-col{background:rgba(255,255,255,.02);border:1px solid rgba(108,152,232,.16);border-radius:14px;min-height:360px;display:flex;flex-direction:column}
      .pipe-head{padding:12px 14px;border-bottom:1px solid rgba(108,152,232,.12)}
      .pipe-title{font-weight:800;color:#eff6ff;display:flex;justify-content:space-between;gap:8px}
      .pipe-sub{font-size:12px;color:#9db3d6;margin-top:4px}
      .pipe-count{font-size:12px;color:#9db3d6;background:rgba(255,255,255,.04);padding:4px 8px;border-radius:999px}
      .pipe-body{padding:12px;display:flex;flex-direction:column;gap:10px;min-height:180px}
      .pipe-body.drag-over{background:rgba(61,134,255,.06)}
      .pipe-card{border-radius:14px;padding:12px;border:1px solid rgba(108,152,232,.16);background:rgba(255,255,255,.03);cursor:grab}
      .pipe-name{font-weight:800;color:#eff6ff}
      .pipe-mini{font-size:12px;color:#9db3d6}
      .pipe-desc{font-size:13px;color:#dce7f8;margin-top:8px}
      .pipe-empty{padding:18px;text-align:center;color:#8ea6ca;font-size:13px}
      .pipe-kpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
      @media (max-width:1200px){.pipeline-wrap{grid-template-columns:1fr}.pipe-board{grid-template-columns:repeat(7,minmax(260px,1fr));}.pipe-kpi{grid-template-columns:repeat(2,minmax(0,1fr));}}
    `;
    document.head.appendChild(st);
  }

  async function renderizarPipeline(ctx) {
    ensureCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área do pipeline não encontrada.");

    const stages = [
      { id:"diagnostico", sub:"Oportunidade identificada" },
      { id:"orcamento", sub:"Em elaboração" },
      { id:"aprovacao", sub:"Aguardando cliente" },
      { id:"aprovado", sub:"Pronto para OS" },
      { id:"execucao", sub:"Serviço em curso" },
      { id:"faturado", sub:"Receita concluída" },
      { id:"perdido", sub:"Negócio perdido" }
    ];
    const state = { rows: [], selected: null };

    alvo.innerHTML = `
      <div class="pipe-kpi">
        <div class="card"><div class="card-label">Em negociação</div><div class="card-value" id="kpiPipeNegociacao">R$ 0,00</div></div>
        <div class="card"><div class="card-label">Aprovado</div><div class="card-value" id="kpiPipeAprovado">R$ 0,00</div></div>
        <div class="card"><div class="card-label">Faturado</div><div class="card-value" id="kpiPipeFaturado">R$ 0,00</div></div>
        <div class="card"><div class="card-label">Taxa de avanço</div><div class="card-value" id="kpiPipeTaxa">0%</div></div>
      </div>
      <div class="pipeline-wrap">
        <div class="panel">
          <h2>Pipeline Comercial</h2>
          <div class="panel-sub">Arraste o card para mover a oportunidade entre as etapas.</div>
          <div class="pipe-board" id="pipeBoard">
            ${stages.map(s => `<div class="pipe-col"><div class="pipe-head"><div class="pipe-title"><span>${traduzirStage(s.id)}</span><span class="pipe-count" data-pcount="${s.id}">0</span></div><div class="pipe-sub">${escapeHtml(s.sub)}</div></div><div class="pipe-body" data-stage="${s.id}"></div></div>`).join("")}
          </div>
        </div>
        <div class="panel">
          <h2>Detalhe comercial</h2>
          <div class="panel-sub">Selecione um card para visualizar o funil.</div>
          <div id="pipeDetail" class="empty">Nenhuma oportunidade selecionada.</div>
        </div>
      </div>
    `;

    await load();

    async function load() {
      const [pipeResp, budgetsResp, soResp, ticketsResp] = await Promise.all([
        ctx.sb.db.from("commercial_pipeline").select("id, ticket_id, stage, estimated_value, approved_value, status, created_at, updated_at").eq("company_id", ctx.companyId).order("created_at", { ascending: false }),
        ctx.sb.db.from("budgets").select("id, ticket_id, pipeline_id, client_name, client_phone, description, total, status, created_at, approved_at").eq("company_id", ctx.companyId).order("created_at", { ascending: false }),
        ctx.sb.db.from("service_orders").select("id, ticket_id, budget_id, pipeline_id, status, technician, scheduled_date, completed_at, created_at").eq("company_id", ctx.companyId).order("created_at", { ascending: false }),
        ctx.sb.db.from("tickets").select("id, client_name, client_phone, description, status").eq("company_id", ctx.companyId)
      ]);
      if (pipeResp.error) throw pipeResp.error;
      if (budgetsResp.error) throw budgetsResp.error;
      if (soResp.error) throw soResp.error;
      if (ticketsResp.error) throw ticketsResp.error;

      const tickets = {};
      (ticketsResp.data || []).forEach(t => tickets[t.id] = t);

      state.rows = (pipeResp.data || []).map(p => {
        const budget = (budgetsResp.data || []).find(b => b.pipeline_id === p.id) || null;
        const os = (soResp.data || []).find(o => o.pipeline_id === p.id) || null;
        const ticket = tickets[p.ticket_id] || {};
        return {
          ...p,
          ticket,
          budget,
          os,
          client_name: budget?.client_name || ticket.client_name || "Cliente",
          client_phone: budget?.client_phone || ticket.client_phone || "—",
          description: budget?.description || ticket.description || ""
        };
      });

      renderKpis();
      renderBoard();
      if (!state.selected && state.rows.length) state.selected = state.rows[0];
      renderDetail();
    }

    function renderKpis() {
      const negociacao = state.rows.filter(x => ["orcamento","aprovacao"].includes(x.stage)).reduce((a,b)=>a+Number(b.estimated_value || b.budget?.total || 0),0);
      const aprovado = state.rows.filter(x => ["aprovado","execucao"].includes(x.stage)).reduce((a,b)=>a+Number(b.approved_value || b.estimated_value || b.budget?.total || 0),0);
      const faturado = state.rows.filter(x => x.stage === "faturado").reduce((a,b)=>a+Number(b.approved_value || b.estimated_value || b.budget?.total || 0),0);
      const taxaBase = state.rows.filter(x => ["aprovado","execucao","faturado"].includes(x.stage)).length;
      const taxa = state.rows.length ? Math.round((taxaBase / state.rows.length) * 100) : 0;
      $("#kpiPipeNegociacao", alvo).textContent = moeda(negociacao);
      $("#kpiPipeAprovado", alvo).textContent = moeda(aprovado);
      $("#kpiPipeFaturado", alvo).textContent = moeda(faturado);
      $("#kpiPipeTaxa", alvo).textContent = taxa + "%";
    }

    function renderBoard() {
      $all(".pipe-body", alvo).forEach(col => {
        const stage = col.getAttribute("data-stage");
        const items = state.rows.filter(r => r.stage === stage);
        const count = $(`[data-pcount="${stage}"]`, alvo);
        if (count) count.textContent = String(items.length);
        col.innerHTML = items.length ? items.map(r => `
          <div class="pipe-card" draggable="true" data-id="${r.id}">
            <div class="pipe-name">${escapeHtml(r.client_name)}</div>
            <div class="pipe-mini">${escapeHtml(r.client_phone || "—")}</div>
            <div class="pipe-desc">${escapeHtml((r.description || "").slice(0,110))}</div>
            <div class="pipe-mini" style="margin-top:10px">Valor: ${escapeHtml(moeda(r.approved_value || r.estimated_value || r.budget?.total || 0))}</div>
          </div>
        `).join("") : `<div class="pipe-empty">Nenhuma oportunidade.</div>`;
        bindDrop(col);
      });

      $all(".pipe-card", alvo).forEach(card => {
        card.addEventListener("dragstart", e => e.dataTransfer.setData("text/plain", card.getAttribute("data-id")));
        card.addEventListener("click", () => {
          state.selected = state.rows.find(x => x.id === card.getAttribute("data-id")) || null;
          renderDetail();
        });
      });
    }

    function bindDrop(col) {
      col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
      col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
      col.addEventListener("drop", async e => {
        e.preventDefault();
        col.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain");
        const stage = col.getAttribute("data-stage");
        const row = state.rows.find(x => x.id === id);
        if (!row || !stage || row.stage === stage) return;

        const upd = await ctx.sb.db.from("commercial_pipeline").update({ stage, updated_at: new Date().toISOString() }).eq("id", id).eq("company_id", ctx.companyId);
        if (upd.error) return alert("Falha ao mover etapa: " + (upd.error.message || upd.error));

        row.stage = stage;
        if (row.budget && stage === "aprovado") {
          await ctx.sb.db.from("budgets").update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.budget.id).eq("company_id", ctx.companyId);
          row.budget.status = "approved";
        }
        if (row.budget && stage === "execucao") {
          if (!row.os) {
            const so = await ctx.sb.db.from("service_orders").insert({
              company_id: ctx.companyId,
              ticket_id: row.ticket_id,
              budget_id: row.budget.id,
              pipeline_id: row.id,
              status: "pending"
            }).select("id, status, technician, scheduled_date, completed_at, created_at").single();
            if (!so.error) row.os = so.data;
          }
          await ctx.sb.db.from("budgets").update({ status: "converted", updated_at: new Date().toISOString() }).eq("id", row.budget.id).eq("company_id", ctx.companyId);
          row.budget.status = "converted";
        }
        if (stage === "faturado") {
          row.approved_value = row.approved_value || row.estimated_value || row.budget?.total || 0;
          await ctx.sb.db.from("commercial_pipeline").update({ approved_value: row.approved_value }).eq("id", row.id).eq("company_id", ctx.companyId);
        }

        renderKpis();
        renderBoard();
        state.selected = row;
        renderDetail();
      });
    }

    function renderDetail() {
      const wrap = $("#pipeDetail", alvo);
      if (!state.selected) {
        wrap.innerHTML = `<div class="empty">Nenhuma oportunidade selecionada.</div>`;
        return;
      }
      const r = state.selected;
      wrap.innerHTML = `
        <div class="mini-card">
          <div class="mini-card-top"><div class="mini-card-title">${escapeHtml(r.client_name)}</div><div>${escapeHtml(traduzirStage(r.stage))}</div></div>
          <div class="mini-card-meta">Telefone: ${escapeHtml(r.client_phone || "—")}</div>
          <div class="mini-card-meta">Criado em: ${escapeHtml(formatarDataHora(r.created_at))}</div>
          <div style="margin-top:10px">${escapeHtml(r.description || "Sem descrição")}</div>
        </div>
        <div class="mini-card">
          <div class="mini-card-title">Financeiro comercial</div>
          <div class="mini-card-meta">Estimado</div><div>${escapeHtml(moeda(r.estimated_value || r.budget?.total || 0))}</div>
          <div class="mini-card-meta" style="margin-top:8px">Aprovado</div><div>${escapeHtml(moeda(r.approved_value || 0))}</div>
        </div>
        <div class="mini-card">
          <div class="mini-card-title">Orçamento</div>
          <div class="mini-card-meta">Status</div><div>${escapeHtml(r.budget?.status || "Sem orçamento")}</div>
          <div class="mini-card-meta" style="margin-top:8px">Total</div><div>${escapeHtml(moeda(r.budget?.total || 0))}</div>
        </div>
        <div class="mini-card">
          <div class="mini-card-title">Ordem de Serviço</div>
          <div class="mini-card-meta">Status</div><div>${escapeHtml(r.os?.status || "Não criada")}</div>
          <div class="mini-card-meta" style="margin-top:8px">Técnico</div><div>${escapeHtml(r.os?.technician || "—")}</div>
        </div>
      `;
    }
  }

  window.ModuloPipelineComercial = { renderizarPipeline };
  window.ModuloOrcamentos = { listarOrcamentos: renderizarPipeline };
})();
