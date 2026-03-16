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

  function formatarMoeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }

  function badgePago(paid) {
    return paid
      ? '<span class="status-pill status-approved">Paga</span>'
      : '<span class="status-pill status-draft">Em aberto</span>';
  }

  function injetarCss() {
    if (document.getElementById("css-despesas-modulo")) return;
    const st = document.createElement("style");
    st.id = "css-despesas-modulo";
    st.textContent = `
      .desp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .desp-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .desp-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .desp-kpi-value{font-size:20px;font-weight:800;color:#eff6ff}
      .desp-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:18px}
      .desp-list-item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer}
      .desp-list-item.active{border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.12)}
      .desp-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .desp-title{font-weight:800;color:#eff6ff}
      .desp-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .desp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      @media (max-width: 1100px){.desp-grid,.desp-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function listarDespesas(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de despesas não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = { busca: "", status: "", despesas: [], selecionada: null };

    alvo.innerHTML = `
      <div class="desp-kpis">
        <div class="desp-kpi"><div class="desp-kpi-label">Despesas</div><div class="desp-kpi-value" id="kpiDespesasQtd">0</div></div>
        <div class="desp-kpi"><div class="desp-kpi-label">Em Aberto</div><div class="desp-kpi-value" id="kpiDespesasAberto">R$ 0,00</div></div>
        <div class="desp-kpi"><div class="desp-kpi-label">Pagas</div><div class="desp-kpi-value" id="kpiDespesasPagas">R$ 0,00</div></div>
        <div class="desp-kpi"><div class="desp-kpi-label">Vencidas</div><div class="desp-kpi-value" id="kpiDespesasVencidas">R$ 0,00</div></div>
      </div>

      <div class="toolbar">
        <input id="filtroBuscaDespesa" class="field" placeholder="Buscar por descrição ou categoria">
        <select id="filtroStatusDespesa" class="select">
          <option value="">Todos os status</option>
          <option value="abertas">Em aberto</option>
          <option value="pagas">Pagas</option>
        </select>
        <button id="btnNovaDespesa" class="btn btn-primary">Nova Despesa</button>
      </div>

      <div class="desp-grid">
        <div class="panel">
          <h2>Lista de Despesas</h2>
          <div class="panel-sub">Contas a pagar e despesas administrativas</div>
          <div id="listaDespesasWrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe da Despesa</h2>
          <div class="panel-sub">Baixa financeira integrada ao caixa</div>
          <div id="detalheDespesaWrap" class="empty">Selecione uma despesa.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaDespesa", alvo).addEventListener("input", async (e) => {
      state.busca = e.target.value || "";
      await carregarLista();
    });

    $("#filtroStatusDespesa", alvo).addEventListener("change", async (e) => {
      state.status = e.target.value || "";
      await carregarLista();
    });

    $("#btnNovaDespesa", alvo).addEventListener("click", () => abrirModalDespesa(ctx, null, carregarLista));

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaDespesasWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando despesas...</div>`;

      const { data, error } = await ctx.sb.db
        .from("expenses")
        .select("id, company_id, description, category, amount, due_date, paid, paid_at, created_at, purchase_id")
        .eq("company_id", ctx.companyId)
        .order("due_date", { ascending: true });

      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar despesas.</div>`;
        throw error;
      }

      const hoje = new Date().toISOString().slice(0, 10);
      let lista = data || [];

      if (state.status === "abertas") lista = lista.filter((x) => !x.paid);
      if (state.status === "pagas") lista = lista.filter((x) => x.paid);

      const busca = state.busca.trim().toLowerCase();
      if (busca) lista = lista.filter((x) => [x.description, x.category].join(" ").toLowerCase().includes(busca));

      state.despesas = lista;

      const totalAberto = lista.filter((x) => !x.paid).reduce((a, x) => a + Number(x.amount || 0), 0);
      const totalPago = lista.filter((x) => x.paid).reduce((a, x) => a + Number(x.amount || 0), 0);
      const totalVencido = lista.filter((x) => !x.paid && x.due_date && x.due_date < hoje).reduce((a, x) => a + Number(x.amount || 0), 0);

      $("#kpiDespesasQtd").textContent = String(lista.length);
      $("#kpiDespesasAberto").textContent = formatarMoeda(totalAberto);
      $("#kpiDespesasPagas").textContent = formatarMoeda(totalPago);
      $("#kpiDespesasVencidas").textContent = formatarMoeda(totalVencido);

      if (!lista.length) {
        wrap.innerHTML = `<div class="empty">Nenhuma despesa encontrada.</div>`;
        $("#detalheDespesaWrap", alvo).innerHTML = `<div class="empty">Selecione uma despesa.</div>`;
        return;
      }

      wrap.innerHTML = lista.map((d) => `
        <div class="desp-list-item ${state.selecionada && state.selecionada.id === d.id ? "active" : ""}" data-id="${d.id}">
          <div class="desp-top">
            <div>
              <div class="desp-title">${escapeHtml(d.description || "Despesa")}</div>
              <div class="desp-meta">Categoria: ${escapeHtml(d.purchase_id ? "Compra (OS)" : (d.category || "—"))}</div>
            </div>
            <div>${badgePago(d.paid)}</div>
          </div>
          <div class="desp-meta">Vencimento: ${escapeHtml(formatarData(d.due_date))}</div>
          <div class="desp-meta">Criada em: ${escapeHtml(formatarDataHora(d.created_at))}</div>
          <div style="margin-top:8px"><strong>Valor:</strong> ${formatarMoeda(d.amount || 0)}</div>
        </div>
      `).join("");

      $$(".desp-list-item", wrap).forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          state.selecionada = state.despesas.find((x) => x.id === id) || null;
          await carregarDetalhe();
          await carregarLista();
        });
      });

      if (!state.selecionada) state.selecionada = state.despesas[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheDespesaWrap", alvo);
      if (!state.selecionada) {
        wrap.innerHTML = `<div class="empty">Selecione uma despesa.</div>`;
        return;
      }

      wrap.innerHTML = `
        <div class="desp-actions">
          ${state.selecionada.purchase_id ? `<span class="desp-meta">Compra vinculada à OS — edite pela tela Compras</span>` : `<button id="btnEditarDespesa" class="btn btn-secondary">Editar</button>`}
          ${state.selecionada.paid ? `<button class="btn btn-secondary" disabled>Já paga</button>` : `<button id="btnPagarDespesa" class="btn btn-success">Baixar / Marcar como Paga</button>`}
        </div>

        <div class="quote-info-box">
          <div><strong>Descrição:</strong> ${escapeHtml(state.selecionada.description || "—")}</div>
          <div><strong>Categoria:</strong> ${escapeHtml(state.selecionada.category || "—")}</div>
          <div><strong>Valor:</strong> ${formatarMoeda(state.selecionada.amount || 0)}</div>
          <div><strong>Vencimento:</strong> ${escapeHtml(formatarData(state.selecionada.due_date))}</div>
          <div><strong>Status:</strong> ${state.selecionada.paid ? "Paga" : "Em aberto"}</div>
          <div><strong>Pago em:</strong> ${escapeHtml(formatarDataHora(state.selecionada.paid_at))}</div>
        </div>
      `;

      const btnEditar = $("#btnEditarDespesa", wrap);
      if (btnEditar) btnEditar.addEventListener("click", () => abrirModalDespesa(ctx, state.selecionada, carregarLista));

      const btnPagar = $("#btnPagarDespesa", wrap);
      if (btnPagar) {
        btnPagar.addEventListener("click", async () => {
          if (!window.confirm("Deseja baixar esta despesa e lançar no caixa como saída?")) return;

          const agora = new Date().toISOString();

          const upd = await ctx.sb.db
            .from("expenses")
            .update({ paid: true, paid_at: agora })
            .eq("id", state.selecionada.id);

          if (upd.error) return alert("Falha ao baixar despesa: " + (upd.error.message || upd.error));

          if (state.selecionada.purchase_id) {
            await ctx.sb.db.from("purchases").update({
              status: "paid",
              paid_at: agora,
              updated_at: agora
            }).eq("id", state.selecionada.purchase_id);
          }

          const txPayload = {
            company_id: ctx.companyId,
            type: "pagar",
            desc: state.selecionada.description || "Despesa",
            amount: Number(state.selecionada.amount || 0),
            due_date: String(agora).slice(0, 10),
            status: "quitado",
            category: state.selecionada.purchase_id ? "Compra" : (state.selecionada.category || "despesa")
          };
          if (state.selecionada.purchase_id) txPayload.purchase_id = state.selecionada.purchase_id;
          const tx = await ctx.sb.db.from("txs").insert(txPayload);

          if (tx.error) return alert("Despesa baixada, mas houve falha ao lançar no caixa: " + (tx.error.message || tx.error));

          alert("Despesa baixada com sucesso.");
          state.selecionada = null;
          await carregarLista();
        });
      }
    }
  }

  function abrirModalDespesa(ctx, despesa, onSaved) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${despesa ? "Editar Despesa" : "Nova Despesa"}</div>
            <div class="panel-sub">Cadastro de conta a pagar / despesa administrativa</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalDespesa">Fechar</button>
        </div>

        <div class="alert error" id="erroModalDespesa"></div>

        <div class="grid-form">
          <div>
            <label class="label">Descrição</label>
            <input id="despesaDescricao" class="field" value="${escapeHtml(despesa?.description || "")}">
          </div>
          <div>
            <label class="label">Categoria</label>
            <input id="despesaCategoria" class="field" value="${escapeHtml(despesa?.category || "")}">
          </div>
          <div>
            <label class="label">Valor</label>
            <input id="despesaValor" class="field" type="number" step="0.01" value="${Number(despesa?.amount || 0)}">
          </div>
          <div>
            <label class="label">Vencimento</label>
            <input id="despesaVencimento" class="field" type="date" value="${escapeHtml(despesa?.due_date || "")}">
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelarModalDespesa">Cancelar</button>
          <button class="btn btn-primary" id="salvarModalDespesa">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalDespesa", backdrop).addEventListener("click", fechar);
    $("#cancelarModalDespesa", backdrop).addEventListener("click", fechar);
    const erro = $("#erroModalDespesa", backdrop);

    $("#salvarModalDespesa", backdrop).addEventListener("click", async () => {
      erro.textContent = "";
      erro.classList.remove("show");

      const payload = {
        company_id: ctx.companyId,
        description: $("#despesaDescricao", backdrop).value.trim(),
        category: $("#despesaCategoria", backdrop).value.trim() || null,
        amount: Number($("#despesaValor", backdrop).value || 0),
        due_date: $("#despesaVencimento", backdrop).value || null
      };

      if (!payload.description) {
        erro.textContent = "Descrição é obrigatória.";
        erro.classList.add("show");
        return;
      }

      if (payload.amount <= 0) {
        erro.textContent = "Valor deve ser maior que zero.";
        erro.classList.add("show");
        return;
      }

      let resp;
      if (despesa?.id) {
        resp = await ctx.sb.db.from("expenses").update(payload).eq("id", despesa.id);
      } else {
        resp = await ctx.sb.db.from("expenses").insert({ ...payload, paid: false });
      }

      if (resp.error) {
        erro.textContent = resp.error.message || "Falha ao salvar despesa.";
        erro.classList.add("show");
        return;
      }

      fechar();
      await onSaved();
    });
  }

  window.ModuloDespesas = { listarDespesas };
})();