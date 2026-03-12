
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
  function num(v) {
    const n = Number(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  function ensureCss() {
    if (document.getElementById("css-budget-modal-v1")) return;
    const st = document.createElement("style");
    st.id = "css-budget-modal-v1";
    st.textContent = `
      .budget-items{display:flex;flex-direction:column;gap:10px;margin-top:14px}
      .budget-item{border:1px solid rgba(108,152,232,.16);border-radius:12px;padding:12px;background:rgba(255,255,255,.03)}
      .budget-item-grid{display:grid;grid-template-columns:120px 1fr 110px 130px 130px 44px;gap:10px;align-items:end}
      .budget-total-box{display:grid;grid-template-columns:1fr 220px;gap:10px;margin-top:14px}
      .budget-total-card{border:1px solid rgba(108,152,232,.16);border-radius:12px;padding:12px;background:rgba(255,255,255,.03)}
      .budget-mini{font-size:12px;color:#9db3d6}
      .btn-danger{background:#8f3442;color:#fff}
      @media (max-width:1200px){.budget-item-grid{grid-template-columns:1fr 1fr}.budget-total-box{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }
  async function ensurePipeline(ctx, ticket) {
    const existing = await ctx.sb.db.from("commercial_pipeline").select("id").eq("company_id", ctx.companyId).eq("ticket_id", ticket.id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
    const ins = await ctx.sb.db.from("commercial_pipeline").insert({
      company_id: ctx.companyId,
      ticket_id: ticket.id,
      stage: "diagnostico",
      estimated_value: 0,
      status: "ativo"
    }).select("id").single();
    if (ins.error) throw ins.error;
    return ins.data;
  }
  function itemTemplate(item, idx) {
    return `
      <div class="budget-item" data-idx="${idx}">
        <div class="budget-item-grid">
          <div><label class="label">Tipo</label><select class="select bi-type"><option value="servico" ${item.item_type === "servico" ? "selected" : ""}>Serviço</option><option value="produto" ${item.item_type === "produto" ? "selected" : ""}>Produto</option></select></div>
          <div><label class="label">Descrição</label><input class="field bi-desc" value="${escapeHtml(item.description || "")}" placeholder="Descrição do item" /></div>
          <div><label class="label">Qtd.</label><input class="field bi-qty" type="number" step="0.001" min="0" value="${item.quantity ?? 1}" /></div>
          <div><label class="label">Valor unitário</label><input class="field bi-unit" type="number" step="0.01" min="0" value="${item.unit_price ?? 0}" /></div>
          <div><label class="label">Subtotal</label><div class="field bi-total" style="display:flex;align-items:center">${moeda(item.total_price || 0)}</div></div>
          <div><button class="btn btn-danger bi-remove" title="Remover item">X</button></div>
        </div>
      </div>`;
  }
  function readItems(container) {
    return $all(".budget-item", container).map((el, i) => {
      const quantity = num($(".bi-qty", el).value || 0);
      const unit_price = num($(".bi-unit", el).value || 0);
      return {
        item_type: $(".bi-type", el).value || "servico",
        description: $(".bi-desc", el).value.trim(),
        quantity,
        unit_price,
        total_price: Number((quantity * unit_price).toFixed(2)),
        sort_order: i + 1
      };
    }).filter(x => x.description);
  }
  function refreshTotals(backdrop) {
    const itemsWrap = $("#budgetItemsWrap", backdrop);
    const items = readItems(itemsWrap);
    $all(".budget-item", itemsWrap).forEach(el => {
      const qty = num($(".bi-qty", el).value || 0);
      const unit = num($(".bi-unit", el).value || 0);
      $(".bi-total", el).textContent = moeda(qty * unit);
    });
    const subtotal = items.reduce((a, b) => a + Number(b.total_price || 0), 0);
    const desconto = num($("#budgetDiscount", backdrop).value || 0);
    const total = Math.max(0, subtotal - desconto);
    $("#budgetSubtotal", backdrop).textContent = moeda(subtotal);
    $("#budgetTotal", backdrop).textContent = moeda(total);
    return { items, subtotal, desconto, total };
  }
  function attachEvents(backdrop) {
    const itemsWrap = $("#budgetItemsWrap", backdrop);
    function bindItem(el) {
      ["input","change"].forEach(evt => {
        $all(".bi-qty, .bi-unit, .bi-desc, .bi-type", el).forEach(inp => inp.addEventListener(evt, () => refreshTotals(backdrop)));
      });
      $(".bi-remove", el).addEventListener("click", () => { el.remove(); refreshTotals(backdrop); });
    }
    $all(".budget-item", itemsWrap).forEach(bindItem);
    $("#btnAddItemBudget", backdrop).addEventListener("click", () => {
      itemsWrap.insertAdjacentHTML("beforeend", itemTemplate({ item_type:"servico", description:"", quantity:1, unit_price:0, total_price:0 }, Date.now()));
      bindItem(itemsWrap.lastElementChild);
      refreshTotals(backdrop);
    });
    $("#budgetDiscount", backdrop).addEventListener("input", () => refreshTotals(backdrop));
    refreshTotals(backdrop);
  }
  async function abrirModalOrcamento(ctx, ticket, onSaved) {
    ensureCss();
    const pipeline = await ensurePipeline(ctx, ticket);
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" style="width:min(1200px,calc(100vw - 32px));max-height:92vh;overflow:auto">
        <div class="modal-head">
          <div><div class="modal-title">Orçamento do Chamado</div><div class="panel-sub">${escapeHtml(ticket.client_name || "Cliente")} • ${escapeHtml(ticket.client_phone || "—")}</div></div>
          <button class="btn btn-ghost" id="fecharModalBudget">Fechar</button>
        </div>
        <div class="alert error" id="erroBudgetModal"></div>
        <div class="grid-form">
          <div><label class="label">Descrição geral</label><textarea id="budgetDescription" class="textarea" placeholder="Resumo técnico/comercial do orçamento">${escapeHtml(ticket.description || "")}</textarea></div>
          <div><label class="label">Desconto</label><input id="budgetDiscount" class="field" type="number" step="0.01" min="0" value="0" /></div>
        </div>
        <div class="detail-actions" style="margin-top:14px"><button id="btnAddItemBudget" class="btn btn-secondary">Adicionar Item</button></div>
        <div id="budgetItemsWrap" class="budget-items">${itemTemplate({ item_type:"servico", description:ticket.description || "", quantity:1, unit_price:0, total_price:0 }, 1)}</div>
        <div class="budget-total-box">
          <div class="budget-total-card"><div class="budget-mini">Subtotal</div><div id="budgetSubtotal" style="font-size:22px;font-weight:800">${moeda(0)}</div></div>
          <div class="budget-total-card"><div class="budget-mini">Total do orçamento</div><div id="budgetTotal" style="font-size:22px;font-weight:800">${moeda(0)}</div></div>
        </div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn btn-secondary" id="cancelarModalBudget">Cancelar</button>
          <button class="btn btn-primary" id="salvarRascunhoBudget">Salvar Rascunho</button>
          <button class="btn btn-success" id="enviarBudget">Salvar e Enviar</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    attachEvents(backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalBudget", backdrop).addEventListener("click", fechar);
    $("#cancelarModalBudget", backdrop).addEventListener("click", fechar);

    async function salvar(statusFinal) {
      const erroBox = $("#erroBudgetModal", backdrop);
      erroBox.textContent = ""; erroBox.classList.remove("show");
      const { items, subtotal, desconto, total } = refreshTotals(backdrop);
      const description = $("#budgetDescription", backdrop).value.trim();
      if (!items.length) {
        erroBox.textContent = "Adicione pelo menos um item ao orçamento.";
        erroBox.classList.add("show");
        return;
      }
      const head = await ctx.sb.db.from("budgets").insert({
        company_id: ctx.companyId,
        ticket_id: ticket.id,
        pipeline_id: pipeline.id,
        customer_id: ticket.customer_id || null,
        client_name: ticket.client_name || null,
        client_phone: ticket.client_phone || null,
        description,
        subtotal,
        discount_value: desconto,
        total,
        status: statusFinal
      }).select("id, total").single();
      if (head.error) {
        erroBox.textContent = head.error.message || "Falha ao salvar orçamento.";
        erroBox.classList.add("show");
        return;
      }
      const itemsPayload = items.map((item, i) => ({
        company_id: ctx.companyId,
        budget_id: head.data.id,
        item_type: item.item_type,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        sort_order: i + 1
      }));
      const insItems = await ctx.sb.db.from("budget_items").insert(itemsPayload);
      if (insItems.error) {
        erroBox.textContent = insItems.error.message || "Falha ao salvar itens.";
        erroBox.classList.add("show");
        return;
      }
      await ctx.sb.db.from("commercial_pipeline").update({
        stage: statusFinal === "sent" ? "aprovacao" : "orcamento",
        estimated_value: total
      }).eq("id", pipeline.id).eq("company_id", ctx.companyId);
      try {
        await ctx.sb.db.from("ticket_messages").insert({
          company_id: ctx.companyId,
          ticket_id: ticket.id,
          author_type: "system",
          author_name: "Sistema",
          message: statusFinal === "sent" ? "Orçamento criado e enviado." : "Orçamento salvo em rascunho.",
          event_type: "quote_created"
        });
      } catch {}
      fechar();
      if (typeof onSaved === "function") await onSaved();
      alert(statusFinal === "sent" ? "Orçamento salvo e enviado." : "Orçamento salvo em rascunho.");
    }

    $("#salvarRascunhoBudget", backdrop).addEventListener("click", () => salvar("draft"));
    $("#enviarBudget", backdrop).addEventListener("click", () => salvar("sent"));
  }
  window.ModuloBudgets = { abrirModalOrcamento };
})();
