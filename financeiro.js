
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

  function hojeISO() { return new Date().toISOString().slice(0, 10); }

  function inicioMesISO(refDate) {
    const d = refDate ? new Date(refDate + "T12:00:00") : new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }

  function fimMesISO(refDate) {
    const d = refDate ? new Date(refDate + "T12:00:00") : new Date();
    d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  }

  function addDias(dataISO, dias) {
    const d = new Date(`${dataISO}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function periodoPreset(tipo) {
    const hoje = hojeISO();
    if (tipo === "hoje") return { inicio: hoje, fim: hoje };
    if (tipo === "7dias") return { inicio: hoje, fim: addDias(hoje, 7) };
    if (tipo === "15dias") return { inicio: hoje, fim: addDias(hoje, 15) };
    if (tipo === "30dias") return { inicio: hoje, fim: addDias(hoje, 30) };
    if (tipo === "mes_atual") return { inicio: inicioMesISO(hoje), fim: fimMesISO(hoje) };
    if (tipo === "mes_anterior") {
      const d = new Date(hoje + "T12:00:00");
      d.setMonth(d.getMonth() - 1);
      const ref = d.toISOString().slice(0, 10);
      return { inicio: inicioMesISO(ref), fim: fimMesISO(ref) };
    }
    return { inicio: hoje, fim: hoje };
  }

  function entreDatas(dataValor, inicio, fim) {
    if (!dataValor) return false;
    const d = String(dataValor).slice(0, 10);
    return d >= inicio && d <= fim;
  }

  function badgeSituacaoReceber(item) {
    if (item.paid) return `<span class="status-pill status-approved">Pago</span>`;
    const hoje = hojeISO();
    if (item.due_date && item.due_date < hoje) return `<span class="status-pill status-rejected">Vencido</span>`;
    return `<span class="status-pill status-draft">Em aberto</span>`;
  }

  function badgeTipoFluxo(tipo) {
    const t = String(tipo || "").toLowerCase();
    if (t === "entrada") return `<span class="status-pill status-approved">Entrada</span>`;
    if (t === "saida") return `<span class="status-pill status-rejected">Saída</span>`;
    return `<span class="status-pill status-draft">${escapeHtml(tipo || "—")}</span>`;
  }

  function injetarCss() {
    if (document.getElementById("css-financeiro-periodo-v1")) return;
    const st = document.createElement("style");
    st.id = "css-financeiro-periodo-v1";
    st.textContent = `
      .fin-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .fin-tab{border:none;background:#1b3560;color:#fff;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
      .fin-tab.active{background:#4b87f5}
      .fin-periodo{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:14px}
      .fin-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
      .fin-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .fin-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .fin-kpi-value{font-size:20px;font-weight:800;color:#eff6ff}
      .fin-grid{display:grid;grid-template-columns:1.1fr 1.1fr;gap:18px}
      .fin-subgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
      .fin-card,.fin-rec-card,.fin-obra-card,.fin-dre-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .fin-title{font-weight:800;color:#eff6ff;margin-bottom:6px}
      .fin-meta{font-size:12px;color:#9db3d6}
      .fin-list-line{border-bottom:1px solid rgba(108,152,232,.10);padding:10px 0}
      .fin-list-line:last-child{border-bottom:none}
      .fin-toolbar,.fin-actions{display:flex;gap:8px;flex-wrap:wrap}
      .fin-rec-card,.fin-obra-card{margin-bottom:10px}
      .fin-rec-top,.fin-obra-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .fin-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(108,152,232,.10)}
      .fin-row:last-child{border-bottom:none}
      .dre-pos{color:#8ef0a2}
      .dre-neg{color:#ff9090}
      @media (max-width: 1200px){.fin-kpis{grid-template-columns:repeat(3,1fr)} .fin-grid,.fin-subgrid{grid-template-columns:1fr}}
      @media (max-width: 700px){.fin-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function listarFinanceiro(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de financeiro não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const padrao = periodoPreset("mes_atual");
    const state = { aba: "executivo", preset: "mes_atual", inicio: padrao.inicio, fim: padrao.fim };

    alvo.innerHTML = `
      <div class="fin-tabs">
        <button class="fin-tab active" data-tab="executivo">Executivo</button>
        <button class="fin-tab" data-tab="obras">Por Obra</button>
        <button class="fin-tab" data-tab="receber">Contas a Receber</button>
        <button class="fin-tab" data-tab="caixa">Fluxo de Caixa</button>
        <button class="fin-tab" data-tab="dre">DRE</button>
        <button class="fin-tab" data-tab="previsao">Previsão</button>
      </div>

      <div class="fin-periodo">
        <div>
          <label class="label">Período</label>
          <select id="finPresetPeriodo" class="select">
            <option value="hoje">Hoje</option>
            <option value="7dias">7 dias</option>
            <option value="15dias">15 dias</option>
            <option value="30dias">30 dias</option>
            <option value="mes_atual" selected>Mês atual</option>
            <option value="mes_anterior">Mês anterior</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        <div>
          <label class="label">Data inicial</label>
          <input id="finDataInicio" class="field" type="date" value="${state.inicio}">
        </div>
        <div>
          <label class="label">Data final</label>
          <input id="finDataFim" class="field" type="date" value="${state.fim}">
        </div>
        <div>
          <button id="finAplicarPeriodo" class="btn btn-primary">Aplicar</button>
        </div>
      </div>

      <div id="financeiroConteudo"></div>
    `;

    $("#finPresetPeriodo", alvo).addEventListener("change", (e) => {
      state.preset = e.target.value;
      if (state.preset !== "personalizado") {
        const p = periodoPreset(state.preset);
        state.inicio = p.inicio;
        state.fim = p.fim;
        $("#finDataInicio", alvo).value = state.inicio;
        $("#finDataFim", alvo).value = state.fim;
      }
    });

    $("#finAplicarPeriodo", alvo).addEventListener("click", async () => {
      state.inicio = $("#finDataInicio", alvo).value;
      state.fim = $("#finDataFim", alvo).value;
      if (!state.inicio || !state.fim) return alert("Informe data inicial e final.");
      if (state.inicio > state.fim) return alert("Data inicial não pode ser maior que a final.");
      await render();
    });

    $$(".fin-tab", alvo).forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.aba = btn.getAttribute("data-tab");
        $$(".fin-tab", alvo).forEach((x) => x.classList.toggle("active", x === btn));
        await render();
      });
    });

    await render();

    async function carregarBaseFinanceira() {
      const [
        receivablesResp,
        paymentsResp,
        purchasesResp,
        quotesResp,
        workordersResp,
        txsResp,
        customersResp,
        contractsResp
      ] = await Promise.all([
        ctx.sb.db.from("receivables").select("id, due_date, amount, paid, paid_at, company_id, customer_id, quote_id, workorder_id, contract_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("payments").select("id, amount, paid_at, created_at, note, quote_id, ticket_id, company_id, receivable_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("purchases").select("id, workorder_id, description, total, status, created_at, paid_at, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("quotes").select("id, ticket_id, status, total, customer_id, created_at, approved_at, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("workorders").select("id, quote_id, ticket_id, desc, status, due_date, created_at, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("txs").select("id, type, desc, amount, due_date, status, category, created_at, receivable_id, workorder_id, quote_id, purchase_id, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("customers").select("id, name, phone, email").eq("company_id", ctx.companyId),
        ctx.sb.db.from("contracts").select("id, customer_id, name, amount, status, company_id").eq("company_id", ctx.companyId)
      ]);

      for (const r of [receivablesResp, paymentsResp, purchasesResp, quotesResp, workordersResp, txsResp, customersResp, contractsResp]) {
        if (r.error) throw r.error;
      }

      const customers = customersResp.data || [];
      const customerMap = new Map(customers.map((c) => [c.id, c]));
      const contracts = contractsResp.data || [];

      return {
        receivables: receivablesResp.data || [],
        payments: paymentsResp.data || [],
        purchases: purchasesResp.data || [],
        quotes: quotesResp.data || [],
        workorders: workordersResp.data || [],
        txs: txsResp.data || [],
        customers,
        customerMap,
        contracts
      };
    }

    function pagamentosNoPeriodo(base) { return base.payments.filter((p) => entreDatas(p.paid_at || p.created_at, state.inicio, state.fim)); }
    function comprasNoPeriodo(base) { return base.purchases.filter((p) => entreDatas(p.created_at || p.paid_at, state.inicio, state.fim)); }
    function quotesNoPeriodo(base) { return base.quotes.filter((q) => entreDatas(q.approved_at || q.created_at, state.inicio, state.fim)); }
    function txsNoPeriodo(base) { return base.txs.filter((t) => entreDatas(t.created_at || t.due_date, state.inicio, state.fim)); }
    function receivablesNoPeriodo(base) { return base.receivables.filter((r) => entreDatas(r.due_date, state.inicio, state.fim)); }

    async function render() {
      const box = $("#financeiroConteudo", alvo);
      box.innerHTML = `<div class="empty">Carregando financeiro...</div>`;

      if (state.aba === "executivo") return renderExecutivo(box);
      if (state.aba === "obras") return renderObras(box);
      if (state.aba === "receber") return renderReceber(box);
      if (state.aba === "caixa") return renderCaixa(box);
      if (state.aba === "dre") return renderDRE(box);
      if (state.aba === "previsao") return renderPrevisao(box);
    }

    async function renderExecutivo(box) {
      const base = await carregarBaseFinanceira();
      const receberAberto = base.receivables.filter((r) => !r.paid).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const receberVencido = base.receivables.filter((r) => !r.paid && r.due_date && r.due_date < hojeISO()).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const recebidoPeriodo = pagamentosNoPeriodo(base).reduce((acc, p) => acc + Number(p.amount || 0), 0);
      const comprasPeriodo = comprasNoPeriodo(base).reduce((acc, p) => acc + Number(p.total || 0), 0);
      const faturamentoPeriodo = quotesNoPeriodo(base).filter((q) => q.status === "approved").reduce((acc, q) => acc + Number(q.total || 0), 0);
      const lucroBrutoPeriodo = faturamentoPeriodo - comprasPeriodo;
      const margemPeriodo = faturamentoPeriodo > 0 ? (lucroBrutoPeriodo / faturamentoPeriodo) * 100 : 0;
      const topReceber = [...base.receivables].filter((r) => !r.paid).sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || ""))).slice(0, 8);
      const topCompras = [...comprasNoPeriodo(base)].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 8);

      box.innerHTML = `
        <div class="fin-meta" style="margin-bottom:10px">Resultado do período: ${escapeHtml(formatarData(state.inicio))} até ${escapeHtml(formatarData(state.fim))}</div>
        <div class="fin-kpis">
          <div class="fin-kpi"><div class="fin-kpi-label">A Receber Geral</div><div class="fin-kpi-value">${formatarMoeda(receberAberto)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Recebido no Período</div><div class="fin-kpi-value">${formatarMoeda(recebidoPeriodo)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Compras no Período</div><div class="fin-kpi-value">${formatarMoeda(comprasPeriodo)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Faturamento no Período</div><div class="fin-kpi-value">${formatarMoeda(faturamentoPeriodo)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Vencido Geral</div><div class="fin-kpi-value">${formatarMoeda(receberVencido)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Margem do Período</div><div class="fin-kpi-value">${margemPeriodo.toFixed(2)}%</div></div>
        </div>
        <div class="fin-grid">
          <div class="fin-card">
            <div class="fin-title">Próximos recebimentos</div>
            ${topReceber.length ? topReceber.map((r) => {
              const cliente = base.customerMap.get(r.customer_id);
              return `<div class="fin-list-line"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div>${escapeHtml(cliente?.name || "Cliente")}</div><div class="fin-meta">Vencimento: ${escapeHtml(formatarData(r.due_date))}</div></div><div style="text-align:right"><div>${formatarMoeda(r.amount || 0)}</div><div>${badgeSituacaoReceber(r)}</div></div></div></div>`;
            }).join("") : `<div class="fin-meta">Nenhum recebível em aberto.</div>`}
          </div>
          <div class="fin-card">
            <div class="fin-title">Compras do período</div>
            ${topCompras.length ? topCompras.map((c) => `<div class="fin-list-line"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><div>${escapeHtml(c.description || "Compra")}</div><div class="fin-meta">${escapeHtml(formatarDataHora(c.created_at))}</div></div><div style="text-align:right"><div>${formatarMoeda(c.total || 0)}</div><div class="fin-meta">${escapeHtml(c.status || "draft")}</div></div></div></div>`).join("") : `<div class="fin-meta">Nenhuma compra no período.</div>`}
          </div>
        </div>
      `;
    }

    async function renderObras(box) {
      const base = await carregarBaseFinanceira();
      const obras = base.workorders.map((os) => {
        const quote = base.quotes.find((q) => q.id === os.quote_id) || null;
        const compras = base.purchases.filter((p) => p.workorder_id === os.id && entreDatas(p.created_at || p.paid_at, state.inicio, state.fim));
        const receber = base.receivables.filter((r) => (r.workorder_id === os.id || r.quote_id === os.quote_id) && entreDatas(r.due_date, state.inicio, state.fim));
        const pagos = base.payments.filter((p) => p.quote_id === os.quote_id && entreDatas(p.paid_at || p.created_at, state.inicio, state.fim));
        const custo = compras.reduce((acc, c) => acc + Number(c.total || 0), 0);
        const orcado = Number(quote?.total || 0);
        const recebido = pagos.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const aReceber = receber.filter((r) => !r.paid).reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const lucroPeriodo = recebido - custo;
        const margemPeriodo = recebido > 0 ? (lucroPeriodo / recebido) * 100 : 0;
        return { os, custo, orcado, recebido, aReceber, lucroPeriodo, margemPeriodo };
      }).sort((a, b) => b.recebido - a.recebido);

      box.innerHTML = `
        <div class="fin-toolbar"><div class="fin-meta">Resultado por obra no período: ${escapeHtml(formatarData(state.inicio))} até ${escapeHtml(formatarData(state.fim))}</div></div>
        <div>
          ${obras.length ? obras.map((o) => `
            <div class="fin-obra-card">
              <div class="fin-obra-top">
                <div>
                  <div class="fin-title">OS ${escapeHtml(o.os.id)}</div>
                  <div class="fin-meta">Status: ${escapeHtml(o.os.status || "aberta")}</div>
                  <div class="fin-meta">${escapeHtml(o.os.desc || "Sem descrição")}</div>
                </div>
                <div>${o.margemPeriodo >= 0 ? `<span class="status-pill status-approved">${o.margemPeriodo.toFixed(2)}%</span>` : `<span class="status-pill status-rejected">${o.margemPeriodo.toFixed(2)}%</span>`}</div>
              </div>
              <div class="fin-subgrid" style="margin-top:12px">
                <div class="fin-card"><div class="fin-meta">Orçado Total</div><div class="fin-title">${formatarMoeda(o.orcado)}</div></div>
                <div class="fin-card"><div class="fin-meta">Compras no Período</div><div class="fin-title">${formatarMoeda(o.custo)}</div></div>
                <div class="fin-card"><div class="fin-meta">Recebido no Período</div><div class="fin-title">${formatarMoeda(o.recebido)}</div></div>
                <div class="fin-card"><div class="fin-meta">A Receber no Período</div><div class="fin-title">${formatarMoeda(o.aReceber)}</div></div>
                <div class="fin-card"><div class="fin-meta">Resultado do Período</div><div class="fin-title">${formatarMoeda(o.lucroPeriodo)}</div></div>
                <div class="fin-card"><div class="fin-meta">Margem do Período</div><div class="fin-title">${o.margemPeriodo.toFixed(2)}%</div></div>
              </div>
            </div>
          `).join("") : `<div class="fin-card"><div class="fin-meta">Nenhuma obra encontrada.</div></div>`}
        </div>
      `;
    }

    async function renderReceber(box) {
      const base = await carregarBaseFinanceira();
      const itens = [...receivablesNoPeriodo(base)].sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));
      box.innerHTML = `
        <div class="fin-card">
          <div class="fin-title">Contas a Receber do Período</div>
          <div class="fin-meta">${escapeHtml(formatarData(state.inicio))} até ${escapeHtml(formatarData(state.fim))}</div>
          <div style="margin-top:12px">
            ${itens.length ? itens.map((r) => {
              const cliente = base.customerMap.get(r.customer_id);
              return `<div class="fin-rec-card"><div class="fin-rec-top"><div><div class="fin-title">${escapeHtml(cliente?.name || "Cliente")}</div><div class="fin-meta">Vencimento: ${escapeHtml(formatarData(r.due_date))}</div><div class="fin-meta">Origem: ${escapeHtml(r.workorder_id || r.quote_id || r.contract_id || "—")}</div></div><div style="text-align:right"><div class="fin-title">${formatarMoeda(r.amount || 0)}</div><div>${badgeSituacaoReceber(r)}</div></div></div></div>`;
            }).join("") : `<div class="fin-meta">Nenhuma conta a receber no período.</div>`}
          </div>
        </div>
      `;
    }

    async function renderCaixa(box) {
      const base = await carregarBaseFinanceira();
      const periodoTxs = txsNoPeriodo(base);
      const entradas = periodoTxs.filter((t) => String(t.type || "").toLowerCase() === "entrada");
      const saidas = periodoTxs.filter((t) => String(t.type || "").toLowerCase() === "saida");
      const entradasTotal = entradas.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const saidasTotal = saidas.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const saldo = entradasTotal - saidasTotal;
      const ultimos = [...periodoTxs].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 50);

      box.innerHTML = `
        <div class="fin-meta" style="margin-bottom:10px">Fluxo do período: ${escapeHtml(formatarData(state.inicio))} até ${escapeHtml(formatarData(state.fim))}</div>
        <div class="fin-kpis">
          <div class="fin-kpi"><div class="fin-kpi-label">Entradas do Período</div><div class="fin-kpi-value">${formatarMoeda(entradasTotal)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Saídas do Período</div><div class="fin-kpi-value">${formatarMoeda(saidasTotal)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Saldo do Período</div><div class="fin-kpi-value">${formatarMoeda(saldo)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Lançamentos</div><div class="fin-kpi-value">${periodoTxs.length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Entradas em Aberto</div><div class="fin-kpi-value">${entradas.filter((t) => String(t.status || "").toLowerCase() !== "pago").length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Saídas em Aberto</div><div class="fin-kpi-value">${saidas.filter((t) => String(t.status || "").toLowerCase() !== "pago").length}</div></div>
        </div>
        <div class="fin-card">
          <div class="fin-title">Fluxo de Caixa</div>
          <div class="table-wrap" style="margin-top:12px">
            <table>
              <thead><tr><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Vencimento</th><th>Status</th><th>Origem</th></tr></thead>
              <tbody>
                ${ultimos.length ? ultimos.map((t) => `<tr><td>${badgeTipoFluxo(t.type)}</td><td>${escapeHtml(t.desc || "—")}</td><td>${escapeHtml(t.category || "—")}</td><td>${formatarMoeda(t.amount || 0)}</td><td>${escapeHtml(formatarData(t.due_date))}</td><td>${escapeHtml(t.status || "—")}</td><td>${escapeHtml(t.workorder_id || t.quote_id || t.purchase_id || t.receivable_id || "—")}</td></tr>`).join("") : `<tr><td colspan="7">Nenhum lançamento no período.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    async function renderDRE(box) {
      const base = await carregarBaseFinanceira();
      const receitaBruta = quotesNoPeriodo(base).filter((q) => q.status === "approved").reduce((acc, q) => acc + Number(q.total || 0), 0);
      const deducoes = 0;
      const receitaLiquida = receitaBruta - deducoes;
      const custosDiretos = comprasNoPeriodo(base).reduce((acc, p) => acc + Number(p.total || 0), 0);
      const lucroBruto = receitaLiquida - custosDiretos;
      const despesasOperacionais = txsNoPeriodo(base).filter((t) => String(t.type || "").toLowerCase() === "saida").filter((t) => !String(t.category || "").toLowerCase().includes("compra")).reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const lucroOperacional = lucroBruto - despesasOperacionais;

      box.innerHTML = `
        <div class="fin-dre-card">
          <div class="fin-title">DRE Gerencial do Período</div>
          <div class="fin-meta">${escapeHtml(formatarData(state.inicio))} até ${escapeHtml(formatarData(state.fim))}. Movimentação em dinheiro não compõe base fiscal.</div>
          <div style="margin-top:14px">
            <div class="fin-row"><div>Receita Bruta do Período</div><div class="dre-pos">${formatarMoeda(receitaBruta)}</div></div>
            <div class="fin-row"><div>(-) Deduções</div><div>${formatarMoeda(deducoes)}</div></div>
            <div class="fin-row"><div><strong>Receita Líquida</strong></div><div><strong>${formatarMoeda(receitaLiquida)}</strong></div></div>
            <div class="fin-row"><div>(-) Custos Diretos / Compras</div><div>${formatarMoeda(custosDiretos)}</div></div>
            <div class="fin-row"><div><strong>Lucro Bruto</strong></div><div class="${lucroBruto >= 0 ? 'dre-pos' : 'dre-neg'}"><strong>${formatarMoeda(lucroBruto)}</strong></div></div>
            <div class="fin-row"><div>(-) Despesas Operacionais</div><div>${formatarMoeda(despesasOperacionais)}</div></div>
            <div class="fin-row"><div><strong>Lucro Operacional</strong></div><div class="${lucroOperacional >= 0 ? 'dre-pos' : 'dre-neg'}"><strong>${formatarMoeda(lucroOperacional)}</strong></div></div>
          </div>
        </div>
      `;
    }

    async function renderPrevisao(box) {
      const base = await carregarBaseFinanceira();
      const janelas = [
        { titulo: "Hoje", ate: hojeISO() },
        { titulo: "7 dias", ate: addDias(hojeISO(), 7) },
        { titulo: "15 dias", ate: addDias(hojeISO(), 15) },
        { titulo: "30 dias", ate: addDias(hojeISO(), 30) }
      ];

      const cards = janelas.map((j) => {
        const entradasPrevistas = base.receivables.filter((r) => !r.paid && r.due_date && r.due_date >= state.inicio && r.due_date <= j.ate).reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const saidasPrevistas = base.txs.filter((t) => String(t.type || "").toLowerCase() === "saida").filter((t) => String(t.status || "").toLowerCase() !== "pago").filter((t) => t.due_date && t.due_date >= state.inicio && t.due_date <= j.ate).reduce((acc, t) => acc + Number(t.amount || 0), 0);
        const saldoPrevisto = entradasPrevistas - saidasPrevistas;
        return `<div class="fin-card"><div class="fin-title">${j.titulo}</div><div class="fin-row"><div>Entradas previstas</div><div>${formatarMoeda(entradasPrevistas)}</div></div><div class="fin-row"><div>Saídas previstas</div><div>${formatarMoeda(saidasPrevistas)}</div></div><div class="fin-row"><div><strong>Saldo previsto</strong></div><div><strong>${formatarMoeda(saldoPrevisto)}</strong></div></div></div>`;
      }).join("");

      const contratosAtivos = base.contracts.filter((c) => String(c.status || "").toLowerCase() !== "cancelado");
      const mrr = contratosAtivos.reduce((acc, c) => acc + Number(c.amount || 0), 0);

      box.innerHTML = `
        <div class="fin-kpis">
          <div class="fin-kpi"><div class="fin-kpi-label">Contratos Ativos</div><div class="fin-kpi-value">${contratosAtivos.length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">MRR Contratual</div><div class="fin-kpi-value">${formatarMoeda(mrr)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Recebíveis em Aberto</div><div class="fin-kpi-value">${base.receivables.filter((r) => !r.paid).length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Obras Ativas</div><div class="fin-kpi-value">${base.workorders.filter((w) => !["concluida", "cancelada"].includes(String(w.status || "").toLowerCase())).length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Compras em Aberto</div><div class="fin-kpi-value">${base.purchases.filter((p) => String(p.status || "").toLowerCase() !== "paid").length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Período Base</div><div class="fin-kpi-value">${formatarData(state.inicio)}</div></div>
        </div>
        <div class="fin-grid">${cards}</div>
      `;
    }
  }

  window.ModuloFinanceiro = { listarFinanceiro };
})();
