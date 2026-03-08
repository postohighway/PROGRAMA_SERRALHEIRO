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

  function hojeISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function inicioMesISO() {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }

  function badgeSituacaoReceber(item) {
    if (item.paid) return `<span class="status-pill status-approved">Pago</span>`;
    const hoje = hojeISO();
    if (item.due_date && item.due_date < hoje) return `<span class="status-pill status-rejected">Vencido</span>`;
    return `<span class="status-pill status-draft">Em aberto</span>`;
  }

  function injetarCss() {
    if (document.getElementById("css-financeiro-pro")) return;
    const st = document.createElement("style");
    st.id = "css-financeiro-pro";
    st.textContent = `
      .fin-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .fin-tab{border:none;background:#1b3560;color:#fff;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}
      .fin-tab.active{background:#4b87f5}
      .fin-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}
      .fin-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .fin-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .fin-kpi-value{font-size:20px;font-weight:800;color:#eff6ff}
      .fin-grid{display:grid;grid-template-columns:1.1fr 1.1fr;gap:18px}
      .fin-subgrid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
      .fin-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .fin-title{font-weight:800;color:#eff6ff;margin-bottom:6px}
      .fin-meta{font-size:12px;color:#9db3d6}
      .fin-list-line{border-bottom:1px solid rgba(108,152,232,.10);padding:10px 0}
      .fin-list-line:last-child{border-bottom:none}
      .fin-obra-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px}
      .fin-obra-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .fin-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      @media (max-width: 1200px){
        .fin-kpis{grid-template-columns:repeat(3,1fr)}
        .fin-grid,.fin-subgrid{grid-template-columns:1fr}
      }
      @media (max-width: 700px){
        .fin-kpis{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(st);
  }

  async function listarFinanceiro(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de financeiro não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = { aba: "executivo" };

    alvo.innerHTML = `
      <div class="fin-tabs">
        <button class="fin-tab active" data-tab="executivo">Executivo</button>
        <button class="fin-tab" data-tab="obras">Por Obra</button>
        <button class="fin-tab" data-tab="receber">Contas a Receber</button>
        <button class="fin-tab" data-tab="caixa">Fluxo de Caixa</button>
      </div>
      <div id="financeiroConteudo"></div>
    `;

    $$(".fin-tab", alvo).forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.aba = btn.getAttribute("data-tab");
        $$(".fin-tab", alvo).forEach((x) => x.classList.toggle("active", x === btn));
        await render();
      });
    });

    await render();

    async function render() {
      const box = $("#financeiroConteudo", alvo);
      box.innerHTML = `<div class="empty">Carregando financeiro...</div>`;

      if (state.aba === "executivo") return renderExecutivo(box);
      if (state.aba === "obras") return renderObras(box);
      if (state.aba === "receber") return renderReceber(box);
      if (state.aba === "caixa") return renderCaixa(box);
    }

    async function carregarBaseFinanceira() {
      const inicioMes = `${inicioMesISO()}T00:00:00`;
      const hoje = hojeISO();

      const [
        receivablesResp,
        paymentsResp,
        purchasesResp,
        quotesResp,
        workordersResp,
        txsResp,
        customersResp
      ] = await Promise.all([
        ctx.sb.db.from("receivables").select("id, due_date, amount, paid, paid_at, company_id, customer_id, quote_id, workorder_id, contract_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("payments").select("id, amount, paid_at, created_at, note, quote_id, ticket_id, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("purchases").select("id, workorder_id, description, total, status, created_at, paid_at, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("quotes").select("id, ticket_id, status, total, customer_id, created_at, approved_at, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("workorders").select("id, quote_id, ticket_id, desc, status, due_date, created_at, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("txs").select("id, type, desc, amount, due_date, status, category, created_at, receivable_id, workorder_id, quote_id, purchase_id, company_id").eq("company_id", ctx.companyId),
        ctx.sb.db.from("customers").select("id, name, phone, email").eq("company_id", ctx.companyId)
      ]);

      for (const r of [receivablesResp, paymentsResp, purchasesResp, quotesResp, workordersResp, txsResp, customersResp]) {
        if (r.error) throw r.error;
      }

      const customers = customersResp.data || [];
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      return {
        hoje,
        inicioMes,
        receivables: receivablesResp.data || [],
        payments: paymentsResp.data || [],
        purchases: purchasesResp.data || [],
        quotes: quotesResp.data || [],
        workorders: workordersResp.data || [],
        txs: txsResp.data || [],
        customers,
        customerMap
      };
    }

    async function renderExecutivo(box) {
      const base = await carregarBaseFinanceira();

      const receberAberto = base.receivables.filter((r) => !r.paid).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const receberVencido = base.receivables.filter((r) => !r.paid && r.due_date && r.due_date < base.hoje).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const recebidoMes = base.payments.filter((p) => (p.paid_at || p.created_at || "") >= base.inicioMes).reduce((acc, p) => acc + Number(p.amount || 0), 0);
      const comprasMes = base.purchases.filter((p) => (p.created_at || "") >= base.inicioMes).reduce((acc, p) => acc + Number(p.total || 0), 0);
      const faturamentoPrevisto = base.quotes.filter((q) => q.status === "approved").reduce((acc, q) => acc + Number(q.total || 0), 0);
      const lucroBrutoEstimado = faturamentoPrevisto - base.purchases.reduce((acc, p) => acc + Number(p.total || 0), 0);
      const margemMedia = faturamentoPrevisto > 0 ? (lucroBrutoEstimado / faturamentoPrevisto) * 100 : 0;

      const topReceber = [...base.receivables]
        .filter((r) => !r.paid)
        .sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")))
        .slice(0, 8);

      const topCompras = [...base.purchases]
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .slice(0, 8);

      box.innerHTML = `
        <div class="fin-kpis">
          <div class="fin-kpi"><div class="fin-kpi-label">A Receber</div><div class="fin-kpi-value">${formatarMoeda(receberAberto)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Recebido no Mês</div><div class="fin-kpi-value">${formatarMoeda(recebidoMes)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Compras no Mês</div><div class="fin-kpi-value">${formatarMoeda(comprasMes)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Faturamento Previsto</div><div class="fin-kpi-value">${formatarMoeda(faturamentoPrevisto)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Vencido</div><div class="fin-kpi-value">${formatarMoeda(receberVencido)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Margem Média</div><div class="fin-kpi-value">${margemMedia.toFixed(2)}%</div></div>
        </div>

        <div class="fin-grid">
          <div class="fin-card">
            <div class="fin-title">Próximos recebimentos</div>
            ${topReceber.length ? topReceber.map((r) => {
              const cliente = base.customerMap.get(r.customer_id);
              return `
                <div class="fin-list-line">
                  <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                    <div>
                      <div>${escapeHtml(cliente?.name || "Cliente")}</div>
                      <div class="fin-meta">Vencimento: ${escapeHtml(formatarData(r.due_date))}</div>
                    </div>
                    <div style="text-align:right">
                      <div>${formatarMoeda(r.amount || 0)}</div>
                      <div>${badgeSituacaoReceber(r)}</div>
                    </div>
                  </div>
                </div>`;
            }).join("") : `<div class="fin-meta">Nenhum recebível em aberto.</div>`}
          </div>

          <div class="fin-card">
            <div class="fin-title">Últimas compras</div>
            ${topCompras.length ? topCompras.map((c) => `
              <div class="fin-list-line">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
                  <div>
                    <div>${escapeHtml(c.description || "Compra")}</div>
                    <div class="fin-meta">${escapeHtml(formatarDataHora(c.created_at))}</div>
                  </div>
                  <div style="text-align:right">
                    <div>${formatarMoeda(c.total || 0)}</div>
                    <div class="fin-meta">${escapeHtml(c.status || "draft")}</div>
                  </div>
                </div>
              </div>
            `).join("") : `<div class="fin-meta">Nenhuma compra lançada.</div>`}
          </div>
        </div>
      `;
    }

    async function renderObras(box) {
      const base = await carregarBaseFinanceira();

      const obras = base.workorders.map((os) => {
        const quote = base.quotes.find((q) => q.id === os.quote_id) || null;
        const compras = base.purchases.filter((p) => p.workorder_id === os.id);
        const receber = base.receivables.filter((r) => r.workorder_id === os.id || r.quote_id === os.quote_id);
        const pagos = base.payments.filter((p) => p.quote_id === os.quote_id);
        const custo = compras.reduce((acc, c) => acc + Number(c.total || 0), 0);
        const orcado = Number(quote?.total || 0);
        const recebido = pagos.reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const aReceber = receber.filter((r) => !r.paid).reduce((acc, r) => acc + Number(r.amount || 0), 0);
        const lucro = orcado - custo;
        const margem = orcado > 0 ? (lucro / orcado) * 100 : 0;
        return { os, quote, custo, orcado, recebido, aReceber, lucro, margem };
      }).sort((a, b) => b.orcado - a.orcado);

      box.innerHTML = `
        <div class="fin-toolbar">
          <div class="fin-meta">Resultado financeiro por obra / OS</div>
        </div>
        <div>
          ${obras.length ? obras.map((o) => `
            <div class="fin-obra-card">
              <div class="fin-obra-top">
                <div>
                  <div class="fin-title">OS ${escapeHtml(o.os.id)}</div>
                  <div class="fin-meta">Orçamento: ${escapeHtml(o.os.quote_id || "—")} • Status: ${escapeHtml(o.os.status || "aberta")}</div>
                  <div class="fin-meta">${escapeHtml(o.os.desc || "Sem descrição")}</div>
                </div>
                <div>${o.margem >= 0 ? `<span class="status-pill status-approved">${o.margem.toFixed(2)}%</span>` : `<span class="status-pill status-rejected">${o.margem.toFixed(2)}%</span>`}</div>
              </div>
              <div class="fin-subgrid" style="margin-top:12px">
                <div class="fin-card"><div class="fin-meta">Orçado</div><div class="fin-title">${formatarMoeda(o.orcado)}</div></div>
                <div class="fin-card"><div class="fin-meta">Compras</div><div class="fin-title">${formatarMoeda(o.custo)}</div></div>
                <div class="fin-card"><div class="fin-meta">Recebido</div><div class="fin-title">${formatarMoeda(o.recebido)}</div></div>
                <div class="fin-card"><div class="fin-meta">A Receber</div><div class="fin-title">${formatarMoeda(o.aReceber)}</div></div>
                <div class="fin-card"><div class="fin-meta">Lucro Bruto</div><div class="fin-title">${formatarMoeda(o.lucro)}</div></div>
                <div class="fin-card"><div class="fin-meta">Margem</div><div class="fin-title">${o.margem.toFixed(2)}%</div></div>
              </div>
            </div>
          `).join("") : `<div class="fin-card"><div class="fin-meta">Nenhuma obra encontrada.</div></div>`}
        </div>
      `;
    }

    async function renderReceber(box) {
      const base = await carregarBaseFinanceira();
      const itens = [...base.receivables].sort((a, b) => String(a.due_date || "").localeCompare(String(b.due_date || "")));

      box.innerHTML = `
        <div class="fin-card">
          <div class="fin-title">Contas a Receber</div>
          <div class="table-wrap" style="margin-top:12px">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pago em</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                ${itens.length ? itens.map((r) => {
                  const cliente = base.customerMap.get(r.customer_id);
                  return `
                    <tr>
                      <td>${escapeHtml(cliente?.name || "Cliente")}</td>
                      <td>${escapeHtml(formatarData(r.due_date))}</td>
                      <td>${formatarMoeda(r.amount || 0)}</td>
                      <td>${badgeSituacaoReceber(r)}</td>
                      <td>${escapeHtml(formatarDataHora(r.paid_at))}</td>
                      <td>${escapeHtml(r.workorder_id || r.quote_id || r.contract_id || "—")}</td>
                    </tr>
                  `;
                }).join("") : `<tr><td colspan="6">Nenhuma conta a receber encontrada.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    async function renderCaixa(box) {
      const base = await carregarBaseFinanceira();

      const entradas = base.txs.filter((t) => String(t.type || "").toLowerCase() === "entrada");
      const saidas = base.txs.filter((t) => String(t.type || "").toLowerCase() === "saida");
      const entradasTotal = entradas.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const saidasTotal = saidas.reduce((acc, t) => acc + Number(t.amount || 0), 0);
      const saldo = entradasTotal - saidasTotal;

      const ultimos = [...base.txs].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 20);

      box.innerHTML = `
        <div class="fin-kpis">
          <div class="fin-kpi"><div class="fin-kpi-label">Entradas</div><div class="fin-kpi-value">${formatarMoeda(entradasTotal)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Saídas</div><div class="fin-kpi-value">${formatarMoeda(saidasTotal)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Saldo</div><div class="fin-kpi-value">${formatarMoeda(saldo)}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Lançamentos</div><div class="fin-kpi-value">${base.txs.length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Entradas em aberto</div><div class="fin-kpi-value">${entradas.filter((t) => String(t.status || "").toLowerCase() !== "pago").length}</div></div>
          <div class="fin-kpi"><div class="fin-kpi-label">Saídas em aberto</div><div class="fin-kpi-value">${saidas.filter((t) => String(t.status || "").toLowerCase() !== "pago").length}</div></div>
        </div>

        <div class="fin-card">
          <div class="fin-title">Fluxo de Caixa</div>
          <div class="table-wrap" style="margin-top:12px">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                ${ultimos.length ? ultimos.map((t) => `
                  <tr>
                    <td>${escapeHtml(t.type || "—")}</td>
                    <td>${escapeHtml(t.desc || "—")}</td>
                    <td>${escapeHtml(t.category || "—")}</td>
                    <td>${formatarMoeda(t.amount || 0)}</td>
                    <td>${escapeHtml(formatarData(t.due_date))}</td>
                    <td>${escapeHtml(t.status || "—")}</td>
                    <td>${escapeHtml(t.workorder_id || t.quote_id || t.purchase_id || t.receivable_id || "—")}</td>
                  </tr>
                `).join("") : `<tr><td colspan="7">Nenhum lançamento encontrado.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }
  }

  window.ModuloFinanceiro = { listarFinanceiro };
})();