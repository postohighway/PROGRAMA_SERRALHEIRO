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
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(Number(v || 0));
  }

  function badgeStatus(status) {
    const s = String(status || "").toLowerCase();
    const mapa = {
      draft: "Rascunho",
      sent: "Enviado",
      approved: "Aprovado",
      rejected: "Recusado",
      partially_approved: "Parcialmente aprovado"
    };
    return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(mapa[s] || status || "—")}</span>`;
  }

  function injetarCss() {
    if (document.getElementById("css-orcamentos-pro-v3")) return;
    const st = document.createElement("style");
    st.id = "css-orcamentos-pro-v3";
    st.textContent = `
      .orc-grid{display:grid;grid-template-columns:1.05fr 1.3fr;gap:18px}
      .orc-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .orc-resumo{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .orc-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .orc-card-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .orc-card-value{font-size:22px;font-weight:800;color:#eff6ff}
      .orc-list-item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer}
      .orc-list-item.active{border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.12)}
      .orc-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .orc-id{font-size:12px;color:#9db3d6}
      .orc-title{font-weight:800;color:#eff6ff}
      .orc-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .orc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .quote-items-table input,.quote-items-table select,.quote-items-table textarea{width:100%}
      .quote-items-table td,.quote-items-table th{vertical-align:middle}
      .quote-totais{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}
      .quote-total-box{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .quote-total-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .quote-total-value{font-size:18px;font-weight:800;color:#eff6ff}
      .mini-muted{font-size:12px;color:#9db3d6}
      .quote-edit-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
      .quote-edit-full{grid-column:1/-1}
      .quote-info-box{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-top:12px}
      .quote-header-actions{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
      .quote-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
      .quote-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .quote-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .quote-kpi-value{font-size:18px;font-weight:800;color:#eff6ff}
      .btn.btn-success{background:#14845f;color:#fff}
      .btn.btn-warning{background:#8a6612;color:#fff}
      .btn.btn-danger{background:#8c3240;color:#fff}
      @media (max-width: 1100px){
        .orc-grid{grid-template-columns:1fr}
        .orc-resumo,.quote-totais,.quote-kpis,.quote-edit-grid{grid-template-columns:repeat(2,1fr)}
      }
      @media (max-width: 700px){
        .orc-resumo,.quote-totais,.quote-kpis,.quote-edit-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(st);
  }

  async function listarOrcamentos(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de orçamentos não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = {
      busca: "",
      status: "",
      selecionado: null,
      orcamentos: [],
      itens: []
    };

    alvo.innerHTML = `
      <div class="orc-resumo">
        <div class="orc-card"><div class="orc-card-label">Total de Orçamentos</div><div class="orc-card-value" id="resumoTotalOrc">0</div></div>
        <div class="orc-card"><div class="orc-card-label">Rascunhos</div><div class="orc-card-value" id="resumoDraft">0</div></div>
        <div class="orc-card"><div class="orc-card-label">Enviados</div><div class="orc-card-value" id="resumoSent">0</div></div>
        <div class="orc-card"><div class="orc-card-label">Aprovados</div><div class="orc-card-value" id="resumoApproved">0</div></div>
      </div>

      <div class="orc-toolbar">
        <input id="filtroBuscaOrc" class="field" placeholder="Buscar por cliente, ticket ou ID do orçamento">
        <select id="filtroStatusOrc" class="select">
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="sent">Enviado</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Recusado</option>
          <option value="partially_approved">Parcialmente aprovado</option>
        </select>
      </div>

      <div class="orc-grid">
        <div class="panel">
          <h2>Lista de orçamentos</h2>
          <div class="panel-sub">Orçamentos gerados a partir dos chamados</div>
          <div id="listaOrcamentosWrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe do orçamento</h2>
          <div class="panel-sub">Itens, totais, aprovação e geração de OS</div>
          <div id="detalheOrcamentoWrap" class="empty">Selecione um orçamento.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaOrc", alvo).addEventListener("input", async (e) => {
      state.busca = e.target.value || "";
      await carregarLista();
    });

    $("#filtroStatusOrc", alvo).addEventListener("change", async (e) => {
      state.status = e.target.value || "";
      await carregarLista();
    });

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaOrcamentosWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando orçamentos...</div>`;

      let query = ctx.sb.db
        .from("quotes")
        .select("id, ticket_id, customer_id, status, subtotal, discount, surcharge, total, created_at, updated_at, version")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false });

      if (state.status) query = query.eq("status", state.status);

      const { data, error } = await query;
      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar orçamentos.</div>`;
        throw error;
      }

      const busca = state.busca.trim().toLowerCase();
      state.orcamentos = (data || []).filter((q) => {
        if (!busca) return true;
        const texto = [q.id, q.ticket_id, q.customer_id, q.status].join(" ").toLowerCase();
        return texto.includes(busca);
      });

      $("#resumoTotalOrc").textContent = String(state.orcamentos.length);
      $("#resumoDraft").textContent = String(state.orcamentos.filter((q) => q.status === "draft").length);
      $("#resumoSent").textContent = String(state.orcamentos.filter((q) => q.status === "sent").length);
      $("#resumoApproved").textContent = String(state.orcamentos.filter((q) => q.status === "approved").length);

      if (!state.orcamentos.length) {
        wrap.innerHTML = `<div class="empty">Nenhum orçamento encontrado.</div>`;
        $("#detalheOrcamentoWrap", alvo).innerHTML = `<div class="empty">Selecione um orçamento.</div>`;
        return;
      }

      wrap.innerHTML = state.orcamentos.map((q) => `
        <div class="orc-list-item ${state.selecionado && state.selecionado.id === q.id ? "active" : ""}" data-id="${q.id}">
          <div class="orc-top">
            <div>
              <div class="orc-title">Orçamento v${escapeHtml(q.version || 1)}</div>
              <div class="orc-id">ID: ${escapeHtml(q.id)}</div>
            </div>
            <div>${badgeStatus(q.status)}</div>
          </div>
          <div class="orc-meta">Ticket: ${escapeHtml(q.ticket_id || "—")}</div>
          <div class="orc-meta">Criado em: ${escapeHtml(formatarDataHora(q.created_at))}</div>
          <div class="orc-meta">Atualizado em: ${escapeHtml(formatarDataHora(q.updated_at))}</div>
          <div style="margin-top:8px"><strong>Total:</strong> ${formatarMoeda(q.total || 0)}</div>
        </div>
      `).join("");

      $$(".orc-list-item", wrap).forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          state.selecionado = state.orcamentos.find((x) => x.id === id) || null;
          await carregarDetalhe();
          await carregarLista();
        });
      });

      if (!state.selecionado) state.selecionado = state.orcamentos[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheOrcamentoWrap", alvo);
      if (!state.selecionado) {
        wrap.innerHTML = `<div class="empty">Selecione um orçamento.</div>`;
        return;
      }

      wrap.innerHTML = `<div class="empty">Carregando detalhe...</div>`;

      const [itensResp, ticketResp, workorderResp] = await Promise.all([
        ctx.sb.db
          .from("quote_items")
          .select("id, item_type, description, unit, qty, unit_cost, unit_price, total_cost, total_price, sort_order, status")
          .eq("quote_id", state.selecionado.id)
          .order("sort_order", { ascending: true }),
        state.selecionado.ticket_id
          ? ctx.sb.db.from("tickets").select("id, client_name, client_phone, description, due_date, customer_id").eq("id", state.selecionado.ticket_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        ctx.sb.db.from("workorders").select("id, status, created_at, due_date").eq("quote_id", state.selecionado.id).maybeSingle()
      ]);

      if (itensResp.error) throw itensResp.error;

      state.itens = itensResp.data || [];
      const ticket = ticketResp.data || null;
      const workorder = workorderResp.data || null;
      const totalCustos = state.itens.reduce((acc, item) => acc + Number(item.total_cost || 0), 0);
      const totalVendas = state.itens.reduce((acc, item) => acc + Number(item.total_price || 0), 0);
      const margem = totalVendas > 0 ? ((totalVendas - totalCustos) / totalVendas) * 100 : 0;

      wrap.innerHTML = `
        <div class="quote-header-actions">
          <div>
            <div class="orc-title">Orçamento v${escapeHtml(state.selecionado.version || 1)}</div>
            <div class="orc-id">ID: ${escapeHtml(state.selecionado.id)}</div>
          </div>
          <div>${badgeStatus(state.selecionado.status)}</div>
        </div>

        <div class="orc-actions" style="margin-top:12px">
          <button id="btnAdicionarItem" class="btn btn-primary">Adicionar Item</button>
          <button id="btnSalvarTotais" class="btn btn-secondary">Salvar Totais</button>
          <button id="btnEnviarOrc" class="btn btn-warning">Marcar como Enviado</button>
          <button id="btnAprovarOrc" class="btn btn-success">Aprovar</button>
          <button id="btnRecusarOrc" class="btn btn-danger">Recusar</button>
          <button id="btnGerarOS" class="btn btn-success" ${workorder ? "disabled" : ""}>${workorder ? "OS já gerada" : "Gerar Ordem de Serviço"}</button>
        </div>

        <div class="quote-kpis">
          <div class="quote-kpi"><div class="quote-kpi-label">Total de Custos</div><div class="quote-kpi-value">${formatarMoeda(totalCustos)}</div></div>
          <div class="quote-kpi"><div class="quote-kpi-label">Total de Venda</div><div class="quote-kpi-value">${formatarMoeda(totalVendas)}</div></div>
          <div class="quote-kpi"><div class="quote-kpi-label">Margem Bruta</div><div class="quote-kpi-value">${margem.toFixed(2)}%</div></div>
          <div class="quote-kpi"><div class="quote-kpi-label">Ordem de Serviço</div><div class="quote-kpi-value">${workorder ? "Criada" : "Pendente"}</div></div>
        </div>

        <div class="quote-info-box">
          <div class="mini-card-title">Dados do chamado</div>
          <div class="mini-muted">Ticket: ${escapeHtml(state.selecionado.ticket_id || "—")}</div>
          <div class="mini-muted">Cliente: ${escapeHtml(ticket?.client_name || "—")}</div>
          <div class="mini-muted">Telefone: ${escapeHtml(ticket?.client_phone || "—")}</div>
          <div style="margin-top:8px">${escapeHtml(ticket?.description || "Sem descrição do chamado.")}</div>
        </div>

        ${workorder ? `
          <div class="quote-info-box">
            <div class="mini-card-title">Ordem de Serviço vinculada</div>
            <div class="mini-muted">OS: ${escapeHtml(workorder.id)}</div>
            <div class="mini-muted">Status: ${escapeHtml(workorder.status || "aberta")}</div>
            <div class="mini-muted">Criada em: ${escapeHtml(formatarDataHora(workorder.created_at))}</div>
            <div class="mini-muted">Prazo: ${escapeHtml(workorder.due_date || "—")}</div>
          </div>
        ` : ""}

        <div class="table-wrap" style="margin-top:14px">
          <table class="quote-items-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Unidade</th>
                <th>Qtd</th>
                <th>Custo Unit.</th>
                <th>Venda Unit.</th>
                <th>Custo Total</th>
                <th>Venda Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="quoteItemsBody">
              ${state.itens.length ? state.itens.map((item, index) => renderLinhaItem(item, index)).join("") : `<tr><td colspan="9" class="mini-muted">Nenhum item cadastrado.</td></tr>`}
            </tbody>
          </table>
        </div>

        <div class="quote-totais">
          <div class="quote-total-box">
            <div class="quote-total-label">Subtotal</div>
            <input id="campoSubtotal" class="field" type="number" step="0.01" value="${Number(state.selecionado.subtotal || 0)}">
          </div>
          <div class="quote-total-box">
            <div class="quote-total-label">Desconto</div>
            <input id="campoDesconto" class="field" type="number" step="0.01" value="${Number(state.selecionado.discount || 0)}">
          </div>
          <div class="quote-total-box">
            <div class="quote-total-label">Acréscimo</div>
            <input id="campoAcrescimo" class="field" type="number" step="0.01" value="${Number(state.selecionado.surcharge || 0)}">
          </div>
          <div class="quote-total-box">
            <div class="quote-total-label">Total Final</div>
            <div class="quote-total-value" id="campoTotalFinal">${formatarMoeda(state.selecionado.total || 0)}</div>
          </div>
        </div>
      `;

      $("#btnAdicionarItem", wrap).addEventListener("click", () => abrirModalItem(ctx, null, state.selecionado.id, carregarDetalhe));
      $("#btnSalvarTotais", wrap).addEventListener("click", salvarTotais);
      $("#btnEnviarOrc", wrap).addEventListener("click", () => alterarStatus("sent"));
      $("#btnAprovarOrc", wrap).addEventListener("click", () => alterarStatus("approved"));
      $("#btnRecusarOrc", wrap).addEventListener("click", () => alterarStatus("rejected"));

      const btnGerarOS = $("#btnGerarOS", wrap);
      if (btnGerarOS && !workorder) {
        btnGerarOS.addEventListener("click", async () => {
          if (!window.confirm("Deseja gerar a Ordem de Serviço deste orçamento?")) return;
          const result = await gerarOrdemServico(ctx, state.selecionado, ticket);
          if (!result.ok) return alert(result.error || "Falha ao gerar Ordem de Serviço.");
          alert("Ordem de Serviço gerada com sucesso.");
          await carregarDetalhe();
        });
      }

      $$(".btnEditarItem", wrap).forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          const item = state.itens.find((x) => x.id === id);
          abrirModalItem(ctx, item, state.selecionado.id, carregarDetalhe);
        });
      });

      $$(".btnExcluirItem", wrap).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.getAttribute("data-id");
          if (!window.confirm("Deseja excluir este item?")) return;
          const r = await ctx.sb.db.from("quote_items").delete().eq("id", id);
          if (r.error) return alert("Falha ao excluir item: " + (r.error.message || r.error));
          await recalcularTotais();
          await carregarDetalhe();
        });
      });

      ["campoSubtotal", "campoDesconto", "campoAcrescimo"].forEach((id) => {
        $("#" + id, wrap).addEventListener("input", atualizarPreviewTotal);
      });

      atualizarPreviewTotal();

      async function salvarTotais() {
        const subtotal = Number($("#campoSubtotal", wrap).value || 0);
        const discount = Number($("#campoDesconto", wrap).value || 0);
        const surcharge = Number($("#campoAcrescimo", wrap).value || 0);
        const total = subtotal - discount + surcharge;

        const r = await ctx.sb.db
          .from("quotes")
          .update({
            subtotal,
            discount,
            surcharge,
            total,
            updated_at: new Date().toISOString()
          })
          .eq("id", state.selecionado.id);

        if (r.error) return alert("Falha ao salvar totais: " + (r.error.message || r.error));

        state.selecionado.subtotal = subtotal;
        state.selecionado.discount = discount;
        state.selecionado.surcharge = surcharge;
        state.selecionado.total = total;
        alert("Totais salvos com sucesso.");
        await carregarLista();
      }

      async function alterarStatus(novoStatus) {
        const payload = { status: novoStatus, updated_at: new Date().toISOString() };
        if (novoStatus === "sent") payload.sent_at = new Date().toISOString();
        if (novoStatus === "approved") payload.approved_at = new Date().toISOString();
        if (novoStatus === "rejected") payload.rejected_at = new Date().toISOString();

        const r = await ctx.sb.db.from("quotes").update(payload).eq("id", state.selecionado.id);
        if (r.error) return alert("Falha ao alterar status: " + (r.error.message || r.error));

        state.selecionado.status = novoStatus;
        alert(novoStatus === "approved" ? "Orçamento aprovado com sucesso." : novoStatus === "rejected" ? "Orçamento marcado como recusado." : "Orçamento marcado como enviado.");
        await carregarLista();
      }

      function atualizarPreviewTotal() {
        const subtotal = Number($("#campoSubtotal", wrap).value || 0);
        const discount = Number($("#campoDesconto", wrap).value || 0);
        const surcharge = Number($("#campoAcrescimo", wrap).value || 0);
        const total = subtotal - discount + surcharge;
        $("#campoTotalFinal", wrap).textContent = formatarMoeda(total);
      }

      async function recalcularTotais() {
        const itens = await ctx.sb.db.from("quote_items").select("total_price").eq("quote_id", state.selecionado.id);
        if (itens.error) return;
        const subtotal = (itens.data || []).reduce((acc, item) => acc + Number(item.total_price || 0), 0);
        const discount = Number(state.selecionado.discount || 0);
        const surcharge = Number(state.selecionado.surcharge || 0);
        const total = subtotal - discount + surcharge;

        await ctx.sb.db
          .from("quotes")
          .update({ subtotal, total, updated_at: new Date().toISOString() })
          .eq("id", state.selecionado.id);

        state.selecionado.subtotal = subtotal;
        state.selecionado.total = total;
      }
    }

    function renderLinhaItem(item, index) {
      return `
        <tr>
          <td>${escapeHtml(item.item_type || "other")}</td>
          <td>${escapeHtml(item.description || "—")}</td>
          <td>${escapeHtml(item.unit || "—")}</td>
          <td>${escapeHtml(item.qty || 0)}</td>
          <td>${formatarMoeda(item.unit_cost || 0)}</td>
          <td>${formatarMoeda(item.unit_price || 0)}</td>
          <td>${formatarMoeda(item.total_cost || 0)}</td>
          <td>${formatarMoeda(item.total_price || 0)}</td>
          <td>
            <button class="btn btn-secondary btnEditarItem" data-id="${item.id}">Editar</button>
            <button class="btn btn-danger btnExcluirItem" data-id="${item.id}">Excluir</button>
          </td>
        </tr>
      `;
    }

    async function gerarOrdemServico(ctx, quote, ticket) {
      if (!quote || !quote.id) return { ok: false, error: "Orçamento inválido." };
      const existente = await ctx.sb.db.from("workorders").select("id").eq("quote_id", quote.id).maybeSingle();
      if (!existente.error && existente.data) return { ok: true, id: existente.data.id };

      const payload = {
        company_id: ctx.companyId,
        quote_id: quote.id,
        ticket_id: quote.ticket_id || null,
        client_id: ticket?.customer_id || quote.customer_id || null,
        desc: ticket?.description || "Ordem gerada a partir do orçamento.",
        status: "aberta",
        due_date: ticket?.due_date || null,
        priority: "normal",
        notes: "Gerada automaticamente a partir do orçamento aprovado."
      };

      const ins = await ctx.sb.db.from("workorders").insert(payload).select("id").maybeSingle();
      if (ins.error) return { ok: false, error: ins.error.message || ins.error };

      try {
        await ctx.sb.db.from("ticket_messages").insert({
          company_id: ctx.companyId,
          ticket_id: quote.ticket_id,
          author_type: "system",
          author_name: "Sistema",
          message: "Ordem de Serviço gerada a partir do orçamento.",
          event_type: "workorder_created"
        });
      } catch {}

      return { ok: true, id: ins.data?.id || null };
    }

    function abrirModalItem(ctx, item, quoteId, onSaved) {
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `
        <div class="modal">
          <div class="modal-head">
            <div>
              <div class="modal-title">${item ? "Editar Item" : "Adicionar Item"}</div>
              <div class="panel-sub">Preencha custo, venda e quantidade</div>
            </div>
            <button class="btn btn-ghost" id="fecharModalItem">Fechar</button>
          </div>

          <div class="alert error" id="erroModalItem"></div>

          <div class="quote-edit-grid">
            <div>
              <label class="label">Tipo</label>
              <select id="itemTipo" class="select">
                <option value="material" ${item?.item_type === "material" ? "selected" : ""}>Material</option>
                <option value="mao_de_obra" ${item?.item_type === "mao_de_obra" ? "selected" : ""}>Mão de obra</option>
                <option value="other" ${!item || item?.item_type === "other" ? "selected" : ""}>Outro</option>
              </select>
            </div>
            <div>
              <label class="label">Unidade</label>
              <input id="itemUnidade" class="field" value="${escapeHtml(item?.unit || "")}">
            </div>
            <div>
              <label class="label">Quantidade</label>
              <input id="itemQtd" class="field" type="number" step="0.01" value="${Number(item?.qty || 1)}">
            </div>
            <div>
              <label class="label">Custo unitário</label>
              <input id="itemCusto" class="field" type="number" step="0.01" value="${Number(item?.unit_cost || 0)}">
            </div>
            <div>
              <label class="label">Venda unitária</label>
              <input id="itemVenda" class="field" type="number" step="0.01" value="${Number(item?.unit_price || 0)}">
            </div>
            <div>
              <label class="label">Ordem</label>
              <input id="itemSortOrder" class="field" type="number" step="1" value="${Number(item?.sort_order || 0)}">
            </div>
            <div class="quote-edit-full">
              <label class="label">Descrição</label>
              <textarea id="itemDescricao" class="textarea">${escapeHtml(item?.description || "")}</textarea>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" id="cancelarModalItem">Cancelar</button>
            <button class="btn btn-primary" id="salvarModalItem">Salvar Item</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);

      const fechar = () => document.body.removeChild(backdrop);
      $("#fecharModalItem", backdrop).addEventListener("click", fechar);
      $("#cancelarModalItem", backdrop).addEventListener("click", fechar);

      const erroBox = $("#erroModalItem", backdrop);

      $("#salvarModalItem", backdrop).addEventListener("click", async () => {
        erroBox.textContent = "";
        erroBox.classList.remove("show");

        const qty = Number($("#itemQtd", backdrop).value || 0);
        const unitCost = Number($("#itemCusto", backdrop).value || 0);
        const unitPrice = Number($("#itemVenda", backdrop).value || 0);
        const totalCost = qty * unitCost;
        const totalPrice = qty * unitPrice;

        const payload = {
          quote_id: quoteId,
          item_type: $("#itemTipo", backdrop).value,
          description: $("#itemDescricao", backdrop).value.trim(),
          unit: $("#itemUnidade", backdrop).value.trim() || null,
          qty,
          unit_cost: unitCost,
          unit_price: unitPrice,
          total_cost: totalCost,
          total_price: totalPrice,
          sort_order: Number($("#itemSortOrder", backdrop).value || 0),
          status: item?.status || "pending"
        };

        if (!payload.description) {
          erroBox.textContent = "Descrição é obrigatória.";
          erroBox.classList.add("show");
          return;
        }

        let r;
        if (item?.id) {
          r = await ctx.sb.db.from("quote_items").update(payload).eq("id", item.id);
        } else {
          r = await ctx.sb.db.from("quote_items").insert(payload);
        }

        if (r.error) {
          erroBox.textContent = r.error.message || "Falha ao salvar item.";
          erroBox.classList.add("show");
          return;
        }

        const itens = await ctx.sb.db.from("quote_items").select("total_price").eq("quote_id", quoteId);
        if (!itens.error) {
          const subtotal = (itens.data || []).reduce((acc, row) => acc + Number(row.total_price || 0), 0);
          const quoteAtual = await ctx.sb.db.from("quotes").select("discount, surcharge").eq("id", quoteId).maybeSingle();
          const discount = Number(quoteAtual.data?.discount || 0);
          const surcharge = Number(quoteAtual.data?.surcharge || 0);
          const total = subtotal - discount + surcharge;

          await ctx.sb.db.from("quotes").update({
            subtotal,
            total,
            updated_at: new Date().toISOString()
          }).eq("id", quoteId);
        }

        fechar();
        await onSaved();
      });
    }
  }

  window.ModuloOrcamentos = {
    listarOrcamentos
  };
})();