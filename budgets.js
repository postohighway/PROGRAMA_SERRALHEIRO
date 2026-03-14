(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }
  function escapeHtml(t) {
    return String(t || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function money(v) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0)); }
  function percent(v) { return `${Number(v || 0).toFixed(2).replace(".", ",")}%`; }
  function parseNumber(v) { const n = Number(String(v || "").replace(",", ".")); return Number.isFinite(n) ? n : 0; }
  function fmtDateTime(v) { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR"); }
  function budgetStatusLabel(s) { const map = { draft:"Rascunho", sent:"Enviado", approved:"Aprovado", rejected:"Recusado", converted:"Convertido" }; return map[String(s || "").toLowerCase()] || (s || "—"); }
  function stageLabel(s) { const map = { diagnostico:"Diagnóstico", orcamento:"Orçamento", aprovacao:"Aprovação", aprovado:"Aprovado", execucao:"Execução", faturado:"Faturado", perdido:"Perdido" }; return map[String(s || "").toLowerCase()] || (s || "—"); }
  function badge(txt) { return `<span class="status-pill">${escapeHtml(txt)}</span>`; }

  function injectCss() {
    if (document.getElementById("css-budgets-margin-v3")) return;
    const st = document.createElement("style");
    st.id = "css-budgets-margin-v3";
    st.textContent = `.budget-items-table{width:100%;border-collapse:collapse;margin-top:10px}.budget-items-table th,.budget-items-table td{padding:10px;border-bottom:1px solid rgba(108,152,232,.12);vertical-align:top}.budget-items-table th{font-size:12px;color:#9db3d6;text-align:left}.budget-row-actions{display:flex;gap:8px;justify-content:flex-end}.budget-top-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.budget-mini-list{display:flex;flex-direction:column;gap:10px}.budget-mini-card{padding:12px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.02)}.budget-mini-top{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px}.budget-small{font-size:12px;color:#9db3d6}.budget-grid{display:grid;grid-template-columns:1.25fr .9fr;gap:16px}.catalog-picker-list{display:flex;flex-direction:column;gap:10px;margin-top:12px;max-height:55vh;overflow:auto}.catalog-picker-card{padding:12px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.02);cursor:pointer}.catalog-picker-card:hover{border-color:rgba(61,134,255,.45)}.catalog-picker-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.budget-source-badge{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(61,134,255,.12);border:1px solid rgba(61,134,255,.28);color:#dbeaff}.budget-resumo{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px;padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.03)}.budget-resumo-label{color:#9db3d6}.budget-resumo-value{font-weight:800;color:#eff6ff}.budget-alert{margin-top:12px;padding:12px;border-radius:12px;border:1px solid rgba(255,93,108,.38);background:rgba(255,93,108,.10);color:#ffd5da;font-weight:800;display:none}.budget-alert.show{display:block}.budget-margin-ok{color:#bff2df}.budget-margin-bad{color:#ffd5da}@media (max-width:1100px){.budget-grid{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }

  async function ensurePipeline(ctx, ticket) {
    const existing = await ctx.sb.db.from("commercial_pipeline").select("id, stage, estimated_value, approved_value, status").eq("company_id", ctx.companyId).eq("ticket_id", ticket.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
    const ins = await ctx.sb.db.from("commercial_pipeline").insert({ company_id: ctx.companyId, ticket_id: ticket.id, stage: "orcamento", estimated_value: 0, status: "ativo" }).select("id, stage, estimated_value, approved_value, status").single();
    if (ins.error) throw ins.error;
    return ins.data;
  }

  async function loadBudgets(ctx, ticketId) {
    const r = await ctx.sb.db.from("budgets").select("id, company_id, ticket_id, pipeline_id, customer_id, client_name, client_phone, description, subtotal, discount_value, total, total_cost, margin_value, margin_percent, status, version, created_at, updated_at, approved_at").eq("company_id", ctx.companyId).eq("ticket_id", ticketId).order("created_at", { ascending: false });
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function loadBudgetItems(ctx, budgetId) {
    const r = await ctx.sb.db.from("budget_items").select("id, company_id, budget_id, item_type, description, quantity, unit_price, cost_price, total_price, sort_order, created_at").eq("company_id", ctx.companyId).eq("budget_id", budgetId).order("sort_order", { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function loadCatalog(ctx) {
    const r = await ctx.sb.db.from("products_services").select("id, item_type, category, name, description, unit, sale_price, cost_price, is_active").eq("company_id", ctx.companyId).eq("is_active", true).order("name", { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  async function upsertBudget(ctx, payload, items) {
    const budgetPayload = {
      company_id: ctx.companyId, ticket_id: payload.ticket_id, pipeline_id: payload.pipeline_id, customer_id: payload.customer_id || null,
      client_name: payload.client_name || null, client_phone: payload.client_phone || null, description: payload.description || null,
      subtotal: payload.subtotal || 0, discount_value: payload.discount_value || 0, total: payload.total || 0,
      total_cost: payload.total_cost || 0, margin_value: payload.margin_value || 0, margin_percent: payload.margin_percent || 0,
      status: payload.status || "draft", version: payload.version || 1
    };
    let budgetId = payload.id || null;
    if (budgetId) {
      const upd = await ctx.sb.db.from("budgets").update({ ...budgetPayload, updated_at: new Date().toISOString() }).eq("id", budgetId).eq("company_id", ctx.companyId).select("id").single();
      if (upd.error) throw upd.error;
    } else {
      const ins = await ctx.sb.db.from("budgets").insert(budgetPayload).select("id").single();
      if (ins.error) throw ins.error;
      budgetId = ins.data.id;
    }
    const del = await ctx.sb.db.from("budget_items").delete().eq("company_id", ctx.companyId).eq("budget_id", budgetId);
    if (del.error) throw del.error;
    if (items.length) {
      const rows = items.map((item, idx) => ({
        company_id: ctx.companyId, budget_id: budgetId, item_type: item.item_type, description: item.description, quantity: item.quantity,
        unit_price: item.unit_price, cost_price: item.cost_price || 0, total_price: item.total_price, sort_order: idx + 1
      }));
      const insItems = await ctx.sb.db.from("budget_items").insert(rows);
      if (insItems.error) throw insItems.error;
    }
    const newStage = payload.status === "approved" ? "aprovado" : payload.status === "rejected" ? "perdido" : payload.status === "sent" ? "aprovacao" : "orcamento";
    const updPipe = await ctx.sb.db.from("commercial_pipeline").update({ stage: newStage, estimated_value: payload.total || 0, approved_value: payload.status === "approved" ? (payload.total || 0) : null, updated_at: new Date().toISOString() }).eq("company_id", ctx.companyId).eq("id", payload.pipeline_id);
    if (updPipe.error) throw updPipe.error;
    return budgetId;
  }

  async function convertBudgetToServiceOrder(ctx, budget, ticket) {
    const existing = await ctx.sb.db
      .from("workorders")
      .select("id, status")
      .eq("company_id", ctx.companyId)
      .eq("budget_id", budget.id)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data.id;

    const ins = await ctx.sb.db
      .from("workorders")
      .insert({
        company_id: ctx.companyId,
        ticket_id: ticket.id,
        budget_id: budget.id,
        client_id: ticket.customer_id || budget.customer_id || null,
        source: "budget",
        status: "aberta",
        desc: "OS criada a partir de orçamento aprovado.",
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();
    if (ins.error) throw ins.error;

    await ctx.sb.db
      .from("budgets")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", budget.id)
      .eq("company_id", ctx.companyId);

    if (budget.pipeline_id) {
      const updPipe = await ctx.sb.db
        .from("commercial_pipeline")
        .update({ stage: "execucao", updated_at: new Date().toISOString() })
        .eq("id", budget.pipeline_id)
        .eq("company_id", ctx.companyId);
      if (updPipe.error) throw updPipe.error;
    }

    return ins.data.id;
  }

  function renderBudgetsResumoHtml(budgets) {
    if (!budgets || !budgets.length) return '<div class="empty">Nenhum orçamento gerado.</div>';
    return budgets.map(b => `<div class="mini-card"><div class="mini-card-top"><div class="mini-card-title">Orçamento v${escapeHtml(b.version || 1)}</div><div>${badge(budgetStatusLabel(b.status))}</div></div><div class="mini-card-meta">Criado em: ${escapeHtml(fmtDateTime(b.created_at))}</div><div class="mini-card-meta">Atualizado em: ${escapeHtml(fmtDateTime(b.updated_at))}</div><div><strong>Total venda:</strong> ${money(b.total || 0)}</div><div><strong>Total custo:</strong> ${money(b.total_cost || 0)}</div><div><strong>Margem:</strong> ${money(b.margin_value || 0)} • ${percent(b.margin_percent || 0)}</div></div>`).join("");
  }

  function abrirModalCatalogoOrcamento(ctx, onSelect) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal" style="width:min(980px, calc(100vw - 32px));"><div class="modal-head"><div><div class="modal-title">Adicionar do Catálogo</div><div class="panel-sub">Selecione um produto ou serviço ativo para lançar no orçamento.</div></div><button class="btn btn-ghost" id="fecharModalCatalogoBudget">Fechar</button></div><div class="alert error" id="erroModalCatalogoBudget"></div><div class="toolbar"><input id="catalogBudgetBusca" class="field" placeholder="Buscar por nome, categoria ou descrição" /><select id="catalogBudgetTipo" class="select"><option value="">Todos os tipos</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select></div><div id="catalogBudgetLista" class="catalog-picker-list"></div></div>`;
    document.body.appendChild(backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalCatalogoBudget", backdrop).addEventListener("click", fechar);
    const erro = $("#erroModalCatalogoBudget", backdrop);
    const lista = $("#catalogBudgetLista", backdrop);
    const state = { all: [], busca: "", tipo: "" };
    $("#catalogBudgetBusca", backdrop).addEventListener("input", e => { state.busca = e.target.value || ""; render(); });
    $("#catalogBudgetTipo", backdrop).addEventListener("change", e => { state.tipo = e.target.value || ""; render(); });

    function render() {
      const busca = String(state.busca || "").trim().toLowerCase();
      const items = state.all.filter(item => {
        if (state.tipo && item.item_type !== state.tipo) return false;
        if (!busca) return true;
        const txt = [item.name, item.category, item.description, item.unit].join(" ").toLowerCase();
        return txt.includes(busca);
      });
      if (!items.length) { lista.innerHTML = '<div class="empty">Nenhum item encontrado.</div>'; return; }
      lista.innerHTML = items.map(item => `<div class="catalog-picker-card" data-id="${item.id}"><div class="catalog-picker-top"><div><div class="mini-card-title">${escapeHtml(item.name)}</div><div class="budget-small">${escapeHtml(item.category || "Sem categoria")} • ${escapeHtml(item.unit || "un")}</div></div><div>${badge(item.item_type === "servico" ? "Serviço" : "Produto")}</div></div><div class="budget-small">${escapeHtml(item.description || "Sem descrição")}</div><div class="budget-small" style="margin-top:8px">Venda: ${money(item.sale_price || 0)} • Custo: ${money(item.cost_price || 0)}</div></div>`).join("");
      $all(".catalog-picker-card", lista).forEach(card => card.addEventListener("click", () => {
        const id = card.getAttribute("data-id");
        const item = state.all.find(x => x.id === id);
        if (!item) return;
        if (typeof onSelect === "function") onSelect(item);
        fechar();
      }));
    }

    (async function init() {
      try { state.all = await loadCatalog(ctx); render(); }
      catch (e) { erro.textContent = e.message || String(e); erro.classList.add("show"); }
    })();
  }

  function abrirModalOrcamento(ctx, ticket, refreshAfter) {
    injectCss();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal" style="width:min(1220px, calc(100vw - 32px));"><div class="modal-head"><div><div class="modal-title">Orçamento do Chamado</div><div class="panel-sub">${escapeHtml(ticket.client_name || "Sem nome")} — ${escapeHtml(ticket.description || "")}</div></div><button class="btn btn-ghost" id="fecharModalBudget">Fechar</button></div><div class="alert error" id="erroModalBudget"></div><div class="budget-grid"><div><div class="grid-form"><div><label class="label">Cliente</label><input id="budgetClientName" class="field" /></div><div><label class="label">Telefone</label><input id="budgetClientPhone" class="field" /></div><div class="full"><label class="label">Descrição geral</label><textarea id="budgetDescription" class="textarea" placeholder="Escopo do serviço / observações do orçamento"></textarea></div></div><div class="budget-top-actions"><button class="btn btn-secondary" id="btnAddServico">+ Serviço livre</button><button class="btn btn-secondary" id="btnAddProduto">+ Produto livre</button><button class="btn btn-primary" id="btnAddCatalogo">+ Adicionar do catálogo</button><button class="btn btn-secondary" id="btnNovoRascunho">Novo rascunho</button></div><div id="budgetItemsWrap"></div><div class="budget-resumo"><div class="budget-resumo-label">Subtotal venda</div><div class="budget-resumo-value" id="budgetSubtotal">R$ 0,00</div><div class="budget-resumo-label">Desconto</div><div><input id="budgetDiscount" class="field" type="number" step="0.01" min="0" value="0"></div><div class="budget-resumo-label">Total venda</div><div class="budget-resumo-value" id="budgetTotal">R$ 0,00</div><div class="budget-resumo-label">Total custo</div><div class="budget-resumo-value" id="budgetCost">R$ 0,00</div><div class="budget-resumo-label">Margem</div><div class="budget-resumo-value" id="budgetMarginValue">R$ 0,00</div><div class="budget-resumo-label">Margem %</div><div class="budget-resumo-value" id="budgetMarginPercent">0,00%</div></div><div id="budgetAlert" class="budget-alert">ATENÇÃO: orçamento com venda abaixo do custo.</div><div class="modal-actions" style="margin-top:14px;"><button class="btn btn-secondary" id="btnSalvarRascunho">Salvar rascunho</button><button class="btn btn-primary" id="btnEnviarOrcamento">Marcar como enviado</button><button class="btn btn-success" id="btnAprovarOrcamento">Aprovar</button><button class="btn btn-warning" id="btnConverterOs">Converter em OS</button><button class="btn btn-ghost" id="btnRejeitarOrcamento">Rejeitar</button></div></div><div><h3 style="margin-top:0;">Histórico de Orçamentos</h3><div id="budgetHistoryWrap" class="budget-mini-list"></div></div></div></div>`;
    document.body.appendChild(backdrop);

    const erroBox = $("#erroModalBudget", backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalBudget", backdrop).addEventListener("click", fechar);

    const state = { pipeline: null, budgets: [], currentBudgetId: null, items: [] };
    const clientName = $("#budgetClientName", backdrop);
    const clientPhone = $("#budgetClientPhone", backdrop);
    const description = $("#budgetDescription", backdrop);
    const discount = $("#budgetDiscount", backdrop);
    const itemsWrap = $("#budgetItemsWrap", backdrop);
    const historyWrap = $("#budgetHistoryWrap", backdrop);
    const subtotalEl = $("#budgetSubtotal", backdrop);
    const totalEl = $("#budgetTotal", backdrop);
    const costEl = $("#budgetCost", backdrop);
    const marginValueEl = $("#budgetMarginValue", backdrop);
    const marginPercentEl = $("#budgetMarginPercent", backdrop);
    const alertEl = $("#budgetAlert", backdrop);

    function setError(msg) { erroBox.textContent = msg || ""; erroBox.classList.toggle("show", !!msg); }

    function recalc() {
      state.items.forEach(item => {
        item.quantity = parseNumber(item.quantity);
        item.unit_price = parseNumber(item.unit_price);
        item.cost_price = parseNumber(item.cost_price);
        item.total_price = Number((item.quantity * item.unit_price).toFixed(2));
        item.total_cost = Number((item.quantity * item.cost_price).toFixed(2));
      });
      const subtotal = state.items.reduce((acc, item) => acc + Number(item.total_price || 0), 0);
      const totalCost = state.items.reduce((acc, item) => acc + Number(item.total_cost || 0), 0);
      const disc = parseNumber(discount.value);
      const total = Math.max(0, subtotal - disc);
      const marginValue = Number((total - totalCost).toFixed(2));
      const marginPercent = total > 0 ? Number(((marginValue / total) * 100).toFixed(2)) : 0;
      subtotalEl.textContent = money(subtotal);
      totalEl.textContent = money(total);
      costEl.textContent = money(totalCost);
      marginValueEl.textContent = money(marginValue);
      marginPercentEl.textContent = percent(marginPercent);
      marginValueEl.classList.toggle("budget-margin-bad", marginValue < 0);
      marginValueEl.classList.toggle("budget-margin-ok", marginValue >= 0);
      marginPercentEl.classList.toggle("budget-margin-bad", marginValue < 0);
      marginPercentEl.classList.toggle("budget-margin-ok", marginValue >= 0);
      alertEl.classList.toggle("show", marginValue < 0);
      return { subtotal, total, discount_value: disc, total_cost: totalCost, margin_value: marginValue, margin_percent: marginPercent };
    }

    function renderItems() {
      if (!state.items.length) { itemsWrap.innerHTML = '<div class="empty">Nenhum item adicionado.</div>'; recalc(); return; }
      itemsWrap.innerHTML = `<table class="budget-items-table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Qtd</th><th>Venda</th><th>Custo</th><th>Total</th><th>Margem</th><th></th></tr></thead><tbody>${state.items.map((item, idx) => {
        const marginItem = Number((Number(item.total_price || 0) - Number(item.total_cost || 0)).toFixed(2));
        const marginCls = marginItem < 0 ? "budget-margin-bad" : "budget-margin-ok";
        return `<tr><td><div style="display:flex;flex-direction:column;gap:6px"><select class="select js-item-type" data-idx="${idx}"><option value="servico" ${item.item_type === "servico" ? "selected" : ""}>Serviço</option><option value="produto" ${item.item_type === "produto" ? "selected" : ""}>Produto</option></select>${item.catalog_id ? '<span class="budget-source-badge">Catálogo</span>' : '<span class="budget-source-badge" style="background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.16)">Livre</span>'}</div></td><td><input class="field js-item-desc" data-idx="${idx}" value="${escapeHtml(item.description || "")}">${item.catalog_label ? `<div class="budget-small" style="margin-top:6px">${escapeHtml(item.catalog_label)}</div>` : ""}</td><td><input class="field js-item-qty" data-idx="${idx}" type="number" step="0.001" min="0" value="${escapeHtml(item.quantity || 1)}"></td><td><input class="field js-item-unit" data-idx="${idx}" type="number" step="0.01" min="0" value="${escapeHtml(item.unit_price || 0)}"></td><td><input class="field js-item-cost" data-idx="${idx}" type="number" step="0.01" min="0" value="${escapeHtml(item.cost_price || 0)}" ${item.catalog_id ? "readonly" : ""}></td><td>${money(item.total_price || 0)}</td><td class="${marginCls}">${money(marginItem)}</td><td><div class="budget-row-actions">${item.catalog_id ? `<button class="btn btn-secondary js-item-refresh" data-idx="${idx}">Recarregar</button>` : ""}<button class="btn btn-ghost js-item-del" data-idx="${idx}">Remover</button></div></td></tr>`;
      }).join("")}</tbody></table>`;

      $all(".js-item-type", itemsWrap).forEach(el => el.addEventListener("change", e => { const idx = Number(e.target.getAttribute("data-idx")); state.items[idx].item_type = e.target.value; }));
      $all(".js-item-desc", itemsWrap).forEach(el => el.addEventListener("input", e => { const idx = Number(e.target.getAttribute("data-idx")); state.items[idx].description = e.target.value; }));
      $all(".js-item-qty", itemsWrap).forEach(el => el.addEventListener("input", e => { const idx = Number(e.target.getAttribute("data-idx")); state.items[idx].quantity = parseNumber(e.target.value); renderItems(); }));
      $all(".js-item-unit", itemsWrap).forEach(el => el.addEventListener("input", e => { const idx = Number(e.target.getAttribute("data-idx")); state.items[idx].unit_price = parseNumber(e.target.value); renderItems(); }));
      $all(".js-item-cost", itemsWrap).forEach(el => el.addEventListener("input", e => { const idx = Number(e.target.getAttribute("data-idx")); state.items[idx].cost_price = parseNumber(e.target.value); renderItems(); }));
      $all(".js-item-del", itemsWrap).forEach(el => el.addEventListener("click", e => { const idx = Number(e.target.getAttribute("data-idx")); state.items.splice(idx, 1); renderItems(); }));
      $all(".js-item-refresh", itemsWrap).forEach(el => el.addEventListener("click", async e => {
        const idx = Number(e.target.getAttribute("data-idx"));
        const current = state.items[idx];
        try {
          const catalog = await loadCatalog(ctx);
          const item = catalog.find(x => x.id === current.catalog_id);
          if (!item) throw new Error("Item do catálogo não encontrado ou inativo.");
          state.items[idx] = { ...state.items[idx], item_type: item.item_type || "produto", description: item.name, quantity: state.items[idx].quantity || 1, unit_price: Number(item.sale_price || 0), cost_price: Number(item.cost_price || 0), total_price: Number((Number(state.items[idx].quantity || 1) * Number(item.sale_price || 0)).toFixed(2)), total_cost: Number((Number(state.items[idx].quantity || 1) * Number(item.cost_price || 0)).toFixed(2)), catalog_id: item.id, catalog_label: `${item.category || "Sem categoria"} • ${item.unit || "un"}` };
          renderItems();
        } catch (err) { setError(err.message || String(err)); }
      }));

      recalc();
    }

    function loadBudgetIntoForm(budget, items) {
      state.currentBudgetId = budget ? budget.id : null;
      clientName.value = budget?.client_name || ticket.client_name || "";
      clientPhone.value = budget?.client_phone || ticket.client_phone || "";
      description.value = budget?.description || ticket.description || "";
      discount.value = String(budget?.discount_value || 0);
      state.items = (items || []).map(item => ({ item_type: item.item_type || "servico", description: item.description || "", quantity: Number(item.quantity || 1), unit_price: Number(item.unit_price || 0), cost_price: Number(item.cost_price || 0), total_price: Number(item.total_price || 0), total_cost: Number((Number(item.quantity || 1) * Number(item.cost_price || 0)).toFixed(2)), catalog_id: null, catalog_label: null }));
      renderItems();
    }

    function renderHistory() {
      if (!state.budgets.length) { historyWrap.innerHTML = '<div class="empty">Nenhum orçamento salvo ainda.</div>'; return; }
      historyWrap.innerHTML = state.budgets.map(b => `<div class="budget-mini-card"><div class="budget-mini-top"><div><strong>Versão ${escapeHtml(b.version || 1)}</strong><div class="budget-small">${escapeHtml(fmtDateTime(b.created_at))}</div></div><div>${badge(budgetStatusLabel(b.status))}</div></div><div class="budget-small">Descrição: ${escapeHtml((b.description || "").slice(0, 100) || "—")}</div><div class="budget-small">Venda: ${money(b.total || 0)}</div><div class="budget-small">Custo: ${money(b.total_cost || 0)}</div><div class="budget-small">Margem: ${money(b.margin_value || 0)} • ${percent(b.margin_percent || 0)}</div><div class="budget-small">Etapa: ${badge(stageLabel(b.pipeline_stage || "orcamento"))}</div><div class="modal-actions" style="margin-top:10px;"><button class="btn btn-secondary js-load-budget" data-id="${b.id}">Carregar</button></div></div>`).join("");
      $all(".js-load-budget", historyWrap).forEach(btn => btn.addEventListener("click", async () => {
        const budgetId = btn.getAttribute("data-id");
        const budget = state.budgets.find(x => x.id === budgetId);
        if (!budget) return;
        const items = await loadBudgetItems(ctx, budget.id);
        loadBudgetIntoForm(budget, items);
      }));
    }

    async function refreshData() {
      try {
        setError("");
        state.pipeline = await ensurePipeline(ctx, ticket);
        state.budgets = await loadBudgets(ctx, ticket.id);
        if (state.budgets.length) {
          const first = state.budgets[0];
          const items = await loadBudgetItems(ctx, first.id);
          loadBudgetIntoForm(first, items);
        } else {
          loadBudgetIntoForm(null, []);
        }
        state.budgets = state.budgets.map(b => ({ ...b, pipeline_stage: state.pipeline?.stage || "orcamento" }));
        renderHistory();
      } catch (e) { setError(e.message || String(e)); }
    }

    async function saveWithStatus(status) {
      try {
        setError("");
        if (!state.pipeline) state.pipeline = await ensurePipeline(ctx, ticket);
        const calc = recalc();
        if (!state.items.length) throw new Error("Adicione pelo menos um item no orçamento.");
        if (state.items.some(item => !String(item.description || "").trim())) throw new Error("Todos os itens precisam ter descrição.");
        const existingVersions = state.budgets.length ? Math.max(...state.budgets.map(b => Number(b.version || 1))) : 0;
        const current = state.budgets.find(b => b.id === state.currentBudgetId) || null;
        const budgetId = await upsertBudget(ctx, { id: state.currentBudgetId, ticket_id: ticket.id, pipeline_id: state.pipeline.id, customer_id: ticket.customer_id || null, client_name: clientName.value.trim(), client_phone: clientPhone.value.trim(), description: description.value.trim(), subtotal: calc.subtotal, discount_value: calc.discount_value, total: calc.total, total_cost: calc.total_cost, margin_value: calc.margin_value, margin_percent: calc.margin_percent, status, version: current ? current.version : existingVersions + 1 }, state.items);
        state.currentBudgetId = budgetId;
        let osIdGerada = null;

        if (status === "approved") {
          await ctx.sb.db
            .from("budgets")
            .update({ approved_at: new Date().toISOString() })
            .eq("id", budgetId)
            .eq("company_id", ctx.companyId);

          osIdGerada = await convertBudgetToServiceOrder(
            ctx,
            {
              ...(current || {}),
              ...calc,
              id: budgetId,
              ticket_id: ticket.id,
              pipeline_id: state.pipeline.id,
              customer_id: ticket.customer_id || null,
              client_name: clientName.value.trim(),
              client_phone: clientPhone.value.trim(),
              description: description.value.trim(),
              status: "approved"
            },
            ticket
          );
        }

        await refreshData();
        if (typeof refreshAfter === "function") await refreshAfter();

        if (status === "approved" && osIdGerada) {
          alert("Orçamento aprovado e OS criada com sucesso. ID: " + osIdGerada);
        } else {
          alert(
            status === "draft" ? "Rascunho salvo." :
            status === "sent" ? "Orçamento marcado como enviado." :
            status === "approved" ? "Orçamento aprovado." :
            status === "rejected" ? "Orçamento rejeitado." :
            "Orçamento salvo."
          );
        }
      } catch (e) { setError(e.message || String(e)); }
    }

    $("#btnAddServico", backdrop).addEventListener("click", () => { state.items.push({ item_type: "servico", description: "", quantity: 1, unit_price: 0, cost_price: 0, total_price: 0, total_cost: 0, catalog_id: null, catalog_label: null }); renderItems(); });
    $("#btnAddProduto", backdrop).addEventListener("click", () => { state.items.push({ item_type: "produto", description: "", quantity: 1, unit_price: 0, cost_price: 0, total_price: 0, total_cost: 0, catalog_id: null, catalog_label: null }); renderItems(); });
    $("#btnAddCatalogo", backdrop).addEventListener("click", () => {
      abrirModalCatalogoOrcamento(ctx, (item) => {
        state.items.push({ item_type: item.item_type || "produto", description: item.name, quantity: 1, unit_price: Number(item.sale_price || 0), cost_price: Number(item.cost_price || 0), total_price: Number(item.sale_price || 0), total_cost: Number(item.cost_price || 0), catalog_id: item.id, catalog_label: `${item.category || "Sem categoria"} • ${item.unit || "un"}` });
        renderItems();
      });
    });
    $("#btnNovoRascunho", backdrop).addEventListener("click", () => { state.currentBudgetId = null; description.value = ticket.description || ""; discount.value = "0"; state.items = []; renderItems(); });
    discount.addEventListener("input", recalc);
    $("#btnSalvarRascunho", backdrop).addEventListener("click", () => saveWithStatus("draft"));
    $("#btnEnviarOrcamento", backdrop).addEventListener("click", () => saveWithStatus("sent"));
    $("#btnAprovarOrcamento", backdrop).addEventListener("click", () => saveWithStatus("approved"));
    $("#btnRejeitarOrcamento", backdrop).addEventListener("click", () => saveWithStatus("rejected"));
    $("#btnConverterOs", backdrop).addEventListener("click", async () => {
      try {
        setError("");
        const current = state.budgets.find(b => b.id === state.currentBudgetId);
        if (!current) throw new Error("Salve o orçamento antes de converter em OS.");
        if (!["approved", "converted"].includes(String(current.status || "").toLowerCase())) throw new Error("A OS só pode ser criada a partir de orçamento aprovado.");
        const osId = await convertBudgetToServiceOrder(ctx, current, ticket);
        await refreshData();
        if (typeof refreshAfter === "function") await refreshAfter();
        alert("OS criada com sucesso. ID: " + osId);
      } catch (e) { setError(e.message || String(e)); }
    });

    refreshData();
  }

  async function listarTelaOrcamentos(ctx) {
    injectCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) return;
    alvo.innerHTML = '<div class="panel"><h2>Orçamentos</h2><div class="panel-sub">Use o Pipeline Comercial ou gere um orçamento a partir de Chamados.</div><div id="orcamentosListaWrap" class="budget-mini-list"></div></div>';
    const budgets = await ctx.sb.db.from("budgets").select("id, company_id, ticket_id, pipeline_id, client_name, client_phone, description, subtotal, discount_value, total, total_cost, margin_value, margin_percent, status, version, created_at, updated_at, approved_at").eq("company_id", ctx.companyId).order("created_at", { ascending: false });
    const wrap = document.getElementById("orcamentosListaWrap");
    if (budgets.error) { wrap.innerHTML = '<div class="empty">Falha ao carregar orçamentos.</div>'; return; }
    wrap.innerHTML = budgets.data && budgets.data.length ? renderBudgetsResumoHtml(budgets.data) : '<div class="empty">Nenhum orçamento cadastrado ainda.</div>';
  }

  window.ModuloBudgets = { abrirModalOrcamento, renderBudgetsResumoHtml, ensurePipeline, listarTelaOrcamentos };
})();