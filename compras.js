(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatarDataHora(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }

  function formatarMoeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }

  function addDiasVencimento(dataISO, dias) {
    const d = new Date(dataISO + "T12:00:00");
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function badgeStatus(status) {
    const s = String(status || "").toLowerCase();
    const mapa = { draft: "Rascunho", open: "Aberta", paid: "Paga", cancelada: "Cancelada" };
    return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(mapa[s] || status || "—")}</span>`;
  }

  async function syncPurchaseToExpense(ctx, purchase) {
    if (!purchase || !purchase.id) return;
    const status = String(purchase.status || "").toLowerCase();
    const total = Number(purchase.total || purchase.value || 0);
    const dueDate = purchase.due_date || addDiasVencimento(purchase.date || new Date().toISOString().slice(0, 10), 30);
    const desc = (purchase.description || "Compra").trim();

    const existing = await ctx.sb.db.from("expenses").select("id, amount, paid").eq("company_id", ctx.companyId).eq("purchase_id", purchase.id).maybeSingle();
    if (existing.error) return;

    if (status === "paid") {
      if (existing.data) {
        await ctx.sb.db.from("expenses").update({
          paid: true,
          paid_at: purchase.paid_at || new Date().toISOString(),
          amount: total,
          due_date: dueDate,
          description: desc
        }).eq("id", existing.data.id);
      }
      return;
    }

    if (status === "open") {
      const payload = {
        company_id: ctx.companyId,
        description: desc,
        category: "Compra",
        amount: total,
        due_date: dueDate,
        paid: false,
        purchase_id: purchase.id
      };
      if (existing.data) {
        await ctx.sb.db.from("expenses").update({
          amount: payload.amount,
          due_date: payload.due_date,
          description: payload.description
        }).eq("id", existing.data.id);
      } else {
        await ctx.sb.db.from("expenses").insert(payload);
      }
    }
  }

  function injetarCss() {
    if (document.getElementById("css-compras-pro")) return;
    const st = document.createElement("style");
    st.id = "css-compras-pro";
    st.textContent = `
      .compras-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:18px}
      .compra-list-item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer}
      .compra-list-item.active{border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.12)}
      .compra-top{display:flex;justify-content:space-between;gap:10px}
      .compra-title{font-weight:800;color:#eff6ff}
      .compra-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .compra-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .compra-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .compra-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .compra-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .compra-kpi-value{font-size:18px;font-weight:800;color:#eff6ff}
      .compra-info-box{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-top:12px}
      .btn.btn-success{background:#14845f;color:#fff}
      .btn.btn-warning{background:#8a6612;color:#fff}
      .btn.btn-danger{background:#8c3240;color:#fff}
      @media (max-width:1100px){.compras-grid,.compra-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function listarCompras(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de compras não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = {
      busca: "",
      status: "",
      workorderId: ctx.workorderId || null,
      compras: [],
      selecionada: null,
      itens: []
    };

    alvo.innerHTML = `
      <div class="compra-kpis">
        <div class="compra-kpi"><div class="compra-kpi-label">Compras</div><div class="compra-kpi-value" id="kpiComprasTotal">0</div></div>
        <div class="compra-kpi"><div class="compra-kpi-label">Valor Comprado</div><div class="compra-kpi-value" id="kpiComprado">R$ 0,00</div></div>
        <div class="compra-kpi"><div class="compra-kpi-label">Orçamento da OS</div><div class="compra-kpi-value" id="kpiOrcamento">R$ 0,00</div></div>
        <div class="compra-kpi"><div class="compra-kpi-label">Margem Estimada</div><div class="compra-kpi-value" id="kpiMargem">0%</div></div>
      </div>

      <div class="toolbar">
        <input id="filtroBuscaCompra" class="field" placeholder="Buscar por descrição, nota ou compra">
        <select id="filtroStatusCompra" class="select">
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="open">Aberta</option>
          <option value="paid">Paga</option>
        </select>
        <button id="btnNovaCompra" class="btn btn-primary">Nova Compra</button>
      </div>

      <div class="compras-grid">
        <div class="panel">
          <h2>Lista de Compras</h2>
          <div class="panel-sub">Compras vinculadas à Ordem de Serviço</div>
          <div id="listaComprasWrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe da Compra</h2>
          <div class="panel-sub">Itens, total e impacto na margem</div>
          <div id="detalheCompraWrap" class="empty">Selecione uma compra.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaCompra", alvo).addEventListener("input", async (e) => { state.busca = e.target.value || ""; await carregarLista(); });
    $("#filtroStatusCompra", alvo).addEventListener("change", async (e) => { state.status = e.target.value || ""; await carregarLista(); });
    $("#btnNovaCompra", alvo).addEventListener("click", () => abrirModalCompra(ctx, state.workorderId, null, carregarLista));

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaComprasWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando compras...</div>`;

      let query = ctx.sb.db
        .from("purchases")
        .select("id, description, value, invoice_number, date, due_date, status, subtotal, total, created_at, updated_at, paid_at, workorder_id")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false });

      if (state.workorderId) query = query.eq("workorder_id", state.workorderId);
      if (state.status) query = query.eq("status", state.status);

      const { data, error } = await query;
      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar compras.</div>`;
        throw error;
      }

      const busca = state.busca.trim().toLowerCase();
      state.compras = (data || []).filter((c) => !busca || [c.id, c.description, c.invoice_number, c.status].join(" ").toLowerCase().includes(busca));

      let totalComprado = state.compras.reduce((acc, c) => acc + Number(c.total || c.value || 0), 0);
      let orcamentoTotal = 0;

      if (state.workorderId) {
        const os = await ctx.sb.db.from("workorders").select("quote_id, budget_id").eq("id", state.workorderId).maybeSingle();
        const quoteId = os.data?.quote_id || null;
        const budgetId = os.data?.budget_id || null;
        if (quoteId) {
          const q = await ctx.sb.db.from("quotes").select("total").eq("id", quoteId).maybeSingle();
          orcamentoTotal = Number(q.data?.total || 0);
        } else if (budgetId) {
          const b = await ctx.sb.db.from("budgets").select("total").eq("id", budgetId).maybeSingle();
          orcamentoTotal = Number(b.data?.total || 0);
        }
      }

      const margem = orcamentoTotal > 0 ? ((orcamentoTotal - totalComprado) / orcamentoTotal) * 100 : 0;
      $("#kpiComprasTotal").textContent = String(state.compras.length);
      $("#kpiComprado").textContent = formatarMoeda(totalComprado);
      $("#kpiOrcamento").textContent = formatarMoeda(orcamentoTotal);
      $("#kpiMargem").textContent = `${margem.toFixed(2)}%`;

      if (!state.compras.length) {
        wrap.innerHTML = `<div class="empty">Nenhuma compra encontrada.</div>`;
        $("#detalheCompraWrap", alvo).innerHTML = `<div class="empty">Selecione uma compra.</div>`;
        return;
      }

      wrap.innerHTML = state.compras.map((c) => `
        <div class="compra-list-item ${state.selecionada && state.selecionada.id === c.id ? "active" : ""}" data-id="${c.id}">
          <div class="compra-top">
            <div>
              <div class="compra-title">${escapeHtml(c.description || "Compra")}</div>
              <div class="compra-meta">NF: ${escapeHtml(c.invoice_number || "—")}</div>
            </div>
            <div>${badgeStatus(c.status)}</div>
          </div>
          <div class="compra-meta">Data: ${escapeHtml(formatarDataHora(c.created_at))}</div>
          <div class="compra-meta">OS: ${escapeHtml(c.workorder_id || "—")}</div>
          <div style="margin-top:8px"><strong>Total:</strong> ${formatarMoeda(c.total || c.value || 0)}</div>
        </div>
      `).join("");

      $$(".compra-list-item", wrap).forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          state.selecionada = state.compras.find((x) => x.id === id) || null;
          await carregarDetalhe();
          await carregarLista();
        });
      });

      if (!state.selecionada) state.selecionada = state.compras[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheCompraWrap", alvo);
      if (!state.selecionada) {
        wrap.innerHTML = `<div class="empty">Selecione uma compra.</div>`;
        return;
      }

      wrap.innerHTML = `<div class="empty">Carregando detalhe...</div>`;

      const [itensResp, osResp] = await Promise.all([
        ctx.sb.db.from("purchase_items").select("id, item_type, description, unit, qty, unit_cost, line_total, created_at").eq("purchase_id", state.selecionada.id).order("created_at", { ascending: true }),
        state.selecionada.workorder_id ? ctx.sb.db.from("workorders").select("quote_id, desc").eq("id", state.selecionada.workorder_id).maybeSingle() : Promise.resolve({ data: null })
      ]);

      state.itens = itensResp.data || [];
      const ordem = osResp.data || null;
      let quoteTotal = 0;
      if (ordem?.quote_id) {
        const q = await ctx.sb.db.from("quotes").select("total").eq("id", ordem.quote_id).maybeSingle();
        quoteTotal = Number(q.data?.total || 0);
      }

      const compraTotal = Number(state.selecionada.total || state.selecionada.value || 0);
      const margemRestante = quoteTotal > 0 ? ((quoteTotal - compraTotal) / quoteTotal) * 100 : 0;

      wrap.innerHTML = `
        <div class="compra-actions">
          <button id="btnEditarCompra" class="btn btn-secondary">Editar Compra</button>
          <button id="btnNovoItemCompra" class="btn btn-primary">Adicionar Item</button>
          <button id="btnSalvarCompraItens" class="btn btn-secondary">Recalcular Total</button>
          <button id="btnMarcarPaga" class="btn btn-success">Marcar como Paga</button>
        </div>

        <div class="compra-kpis">
          <div class="compra-kpi"><div class="compra-kpi-label">Total da Compra</div><div class="compra-kpi-value">${formatarMoeda(compraTotal)}</div></div>
          <div class="compra-kpi"><div class="compra-kpi-label">Orçamento da OS</div><div class="compra-kpi-value">${formatarMoeda(quoteTotal)}</div></div>
          <div class="compra-kpi"><div class="compra-kpi-label">Margem remanescente</div><div class="compra-kpi-value">${margemRestante.toFixed(2)}%</div></div>
          <div class="compra-kpi"><div class="compra-kpi-label">Status</div><div class="compra-kpi-value">${escapeHtml(state.selecionada.status || "draft")}</div></div>
        </div>

        <div class="compra-info-box">
          <div class="compra-title">${escapeHtml(state.selecionada.description || "Compra")}</div>
          <div class="compra-meta">NF: ${escapeHtml(state.selecionada.invoice_number || "—")}</div>
          <div class="compra-meta">Data: ${escapeHtml(state.selecionada.date || "—")}</div>
          <div class="compra-meta">OS: ${escapeHtml(state.selecionada.workorder_id || "—")}</div>
          <div class="compra-meta">Criada em: ${escapeHtml(formatarDataHora(state.selecionada.created_at))}</div>
          ${ordem ? `<div class="compra-meta">Descrição da OS: ${escapeHtml(ordem.desc || "—")}</div>` : ""}
        </div>

        <div class="table-wrap" style="margin-top:14px">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Unidade</th>
                <th>Qtd</th>
                <th>Custo Unit.</th>
                <th>Total Linha</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${state.itens.length ? state.itens.map((item) => `
                <tr>
                  <td>${escapeHtml(item.item_type || "material")}</td>
                  <td>${escapeHtml(item.description || "—")}</td>
                  <td>${escapeHtml(item.unit || "—")}</td>
                  <td>${escapeHtml(item.qty || 0)}</td>
                  <td>${formatarMoeda(item.unit_cost || 0)}</td>
                  <td>${formatarMoeda(item.line_total || 0)}</td>
                  <td>
                    <button class="btn btn-secondary btnEditarItemCompra" data-id="${item.id}">Editar</button>
                    <button class="btn btn-danger btnExcluirItemCompra" data-id="${item.id}">Excluir</button>
                  </td>
                </tr>
              `).join("") : `<tr><td colspan="7">Nenhum item nesta compra.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;

      $("#btnEditarCompra", wrap).addEventListener("click", () => abrirModalCompra(ctx, state.selecionada.workorder_id, state.selecionada, carregarLista));
      $("#btnNovoItemCompra", wrap).addEventListener("click", () => abrirModalItemCompra(ctx, state.selecionada.id, null, carregarDetalhe));
      $("#btnSalvarCompraItens", wrap).addEventListener("click", recalcularCompra);
      $("#btnMarcarPaga", wrap).addEventListener("click", marcarPaga);

      $$(".btnEditarItemCompra", wrap).forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const item = state.itens.find((x) => x.id === id);
          abrirModalItemCompra(ctx, state.selecionada.id, item, carregarDetalhe);
        });
      });

      $$(".btnExcluirItemCompra", wrap).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          if (!window.confirm("Excluir item da compra?")) return;
          const r = await ctx.sb.db.from("purchase_items").delete().eq("id", id);
          if (r.error) return alert("Falha ao excluir item: " + (r.error.message || r.error));
          await recalcularCompra();
        });
      });

      async function recalcularCompra() {
        const itens = await ctx.sb.db.from("purchase_items").select("line_total").eq("purchase_id", state.selecionada.id);
        if (itens.error) return alert("Falha ao recalcular compra.");
        const total = (itens.data || []).reduce((acc, row) => acc + Number(row.line_total || 0), 0);
        const r = await ctx.sb.db.from("purchases").update({
          subtotal: total,
          total: total,
          value: total,
          updated_at: new Date().toISOString()
        }).eq("id", state.selecionada.id);
        if (r.error) return alert("Falha ao salvar total da compra: " + (r.error.message || r.error));
        const updated = { ...state.selecionada, total, value: total };
        if (String(updated.status || "").toLowerCase() === "open") await syncPurchaseToExpense(ctx, updated);
        alert("Compra recalculada.");
        await carregarLista();
      }

      async function marcarPaga() {
        const agora = new Date().toISOString();
        const r = await ctx.sb.db.from("purchases").update({
          status: "paid",
          paid_at: agora,
          updated_at: agora
        }).eq("id", state.selecionada.id);
        if (r.error) return alert("Falha ao marcar compra como paga: " + (r.error.message || r.error));
        const updated = { ...state.selecionada, status: "paid", paid_at: agora };
        await syncPurchaseToExpense(ctx, updated);
        const valor = Number(state.selecionada.total || state.selecionada.value || 0);
        if (valor > 0) {
          await ctx.sb.db.from("txs").insert({
            company_id: ctx.companyId,
            type: "pagar",
            desc: state.selecionada.description || "Compra",
            amount: valor,
            due_date: agora.slice(0, 10),
            status: "quitado",
            category: "Compra",
            purchase_id: state.selecionada.id
          });
        }
        alert("Compra marcada como paga, conta a pagar baixada e lançamento no fluxo de caixa.");
        await carregarLista();
      }
    }

    function abrirModalCompra(ctx, workorderId, compra, onSaved) {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal">
          <div class="modal-head">
            <div>
              <div class="modal-title">${compra ? "Editar Compra" : "Nova Compra"}</div>
              <div class="panel-sub">Cadastro de compra vinculada à Ordem de Serviço</div>
            </div>
            <button class="btn btn-ghost" id="fecharModalCompra">Fechar</button>
          </div>

          <div class="alert error" id="erroModalCompra"></div>

          <div class="grid-form">
            <div><label class="label">Descrição</label><input id="compraDescricao" class="field" value="${escapeHtml(compra?.description || "")}"></div>
            <div><label class="label">Nota fiscal</label><input id="compraNF" class="field" value="${escapeHtml(compra?.invoice_number || "")}"></div>
            <div><label class="label">Data da compra</label><input id="compraData" class="field" type="date" value="${escapeHtml(compra?.date || new Date().toISOString().slice(0,10))}"></div>
            <div><label class="label">Vencimento (pagamento)</label><input id="compraVencimento" class="field" type="date" value="${escapeHtml(compra?.due_date || addDiasVencimento(new Date().toISOString().slice(0,10), 30))}"></div>
            <div><label class="label">Status</label><select id="compraStatus" class="select">
              <option value="draft" ${String(compra?.status || "draft") === "draft" ? "selected" : ""}>Rascunho</option>
              <option value="open" ${String(compra?.status || "") === "open" ? "selected" : ""}>Aberta</option>
              <option value="paid" ${String(compra?.status || "") === "paid" ? "selected" : ""}>Paga</option>
            </select></div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" id="cancelarModalCompra">Cancelar</button>
            <button class="btn btn-primary" id="salvarModalCompra">Salvar Compra</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const fechar = () => document.body.removeChild(backdrop);
      $("#fecharModalCompra", backdrop).addEventListener("click", fechar);
      $("#cancelarModalCompra", backdrop).addEventListener("click", fechar);
      const erroBox = $("#erroModalCompra", backdrop);

      $("#salvarModalCompra", backdrop).addEventListener("click", async () => {
        erroBox.textContent = "";
        erroBox.classList.remove("show");

        const payload = {
          company_id: ctx.companyId,
          workorder_id: workorderId || compra?.workorder_id || null,
          description: $("#compraDescricao", backdrop).value.trim(),
          invoice_number: $("#compraNF", backdrop).value.trim() || null,
          date: $("#compraData", backdrop).value || new Date().toISOString().slice(0,10),
          due_date: $("#compraVencimento", backdrop).value || addDiasVencimento(new Date().toISOString().slice(0,10), 30),
          status: $("#compraStatus", backdrop).value,
          updated_at: new Date().toISOString()
        };

        if (!payload.description) {
          erroBox.textContent = "Descrição é obrigatória.";
          erroBox.classList.add("show");
          return;
        }

        let r;
        if (compra?.id) {
          r = await ctx.sb.db.from("purchases").update(payload).eq("id", compra.id);
        } else {
          payload.value = 0;
          payload.subtotal = 0;
          payload.total = 0;
          r = await ctx.sb.db.from("purchases").insert(payload);
        }

        if (r.error) {
          erroBox.textContent = r.error.message || "Falha ao salvar compra.";
          erroBox.classList.add("show");
          return;
        }

        const savedId = compra?.id || (Array.isArray(r.data) ? r.data[0]?.id : r.data?.id);
        if (savedId && (payload.status === "open" || payload.status === "paid")) {
          const full = await ctx.sb.db.from("purchases").select("id, description, date, due_date, status, total, value, paid_at").eq("id", savedId).single();
          if (full.data) await syncPurchaseToExpense(ctx, full.data);
        }

        fechar();
        await onSaved();
      });
    }

    function abrirModalItemCompra(ctx, purchaseId, item, onSaved) {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal">
          <div class="modal-head">
            <div>
              <div class="modal-title">${item ? "Editar Item da Compra" : "Adicionar Item à Compra"}</div>
              <div class="panel-sub">Itens de custo real da obra</div>
            </div>
            <button class="btn btn-ghost" id="fecharModalItemCompra">Fechar</button>
          </div>

          <div class="alert error" id="erroModalItemCompra"></div>

          <div class="grid-form">
            <div><label class="label">Tipo</label><select id="itemCompraTipo" class="select">
              <option value="material" ${item?.item_type === "material" ? "selected" : ""}>Material</option>
              <option value="servico" ${item?.item_type === "servico" ? "selected" : ""}>Serviço</option>
              <option value="frete" ${item?.item_type === "frete" ? "selected" : ""}>Frete</option>
            </select></div>
            <div><label class="label">Unidade</label><input id="itemCompraUnidade" class="field" value="${escapeHtml(item?.unit || "")}"></div>
            <div><label class="label">Quantidade</label><input id="itemCompraQtd" class="field" type="number" step="0.01" value="${Number(item?.qty || 1)}"></div>
            <div><label class="label">Custo unitário</label><input id="itemCompraCusto" class="field" type="number" step="0.01" value="${Number(item?.unit_cost || 0)}"></div>
            <div class="full"><label class="label">Descrição</label><textarea id="itemCompraDescricao" class="textarea">${escapeHtml(item?.description || "")}</textarea></div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" id="cancelarModalItemCompra">Cancelar</button>
            <button class="btn btn-primary" id="salvarModalItemCompra">Salvar Item</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const fechar = () => document.body.removeChild(backdrop);
      $("#fecharModalItemCompra", backdrop).addEventListener("click", fechar);
      $("#cancelarModalItemCompra", backdrop).addEventListener("click", fechar);
      const erroBox = $("#erroModalItemCompra", backdrop);

      $("#salvarModalItemCompra", backdrop).addEventListener("click", async () => {
        erroBox.textContent = "";
        erroBox.classList.remove("show");

        const qty = Number($("#itemCompraQtd", backdrop).value || 0);
        const unitCost = Number($("#itemCompraCusto", backdrop).value || 0);
        const lineTotal = qty * unitCost;

        const payload = {
          company_id: ctx.companyId,
          purchase_id: purchaseId,
          item_type: $("#itemCompraTipo", backdrop).value,
          description: $("#itemCompraDescricao", backdrop).value.trim(),
          unit: $("#itemCompraUnidade", backdrop).value.trim() || null,
          qty,
          unit_cost: unitCost,
          line_total: lineTotal
        };

        if (!payload.description) {
          erroBox.textContent = "Descrição é obrigatória.";
          erroBox.classList.add("show");
          return;
        }

        let r;
        if (item?.id) {
          r = await ctx.sb.db.from("purchase_items").update(payload).eq("id", item.id);
        } else {
          r = await ctx.sb.db.from("purchase_items").insert(payload);
        }

        if (r.error) {
          erroBox.textContent = r.error.message || "Falha ao salvar item.";
          erroBox.classList.add("show");
          return;
        }

        const itens = await ctx.sb.db.from("purchase_items").select("line_total").eq("purchase_id", purchaseId);
        if (!itens.error) {
          const total = (itens.data || []).reduce((acc, row) => acc + Number(row.line_total || 0), 0);
          await ctx.sb.db.from("purchases").update({
            subtotal: total,
            total: total,
            value: total,
            updated_at: new Date().toISOString()
          }).eq("id", purchaseId);
          const purch = await ctx.sb.db.from("purchases").select("id, description, date, due_date, status, total, value, paid_at").eq("id", purchaseId).single();
          if (purch.data && String(purch.data.status || "").toLowerCase() === "open") await syncPurchaseToExpense(ctx, { ...purch.data, total });
        }

        fechar();
        await onSaved();
      });
    }
  }

  window.ModuloCompras = { listarCompras };
})();