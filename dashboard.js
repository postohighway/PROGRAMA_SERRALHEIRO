(function () {
  "use strict";

  function fmtInt(v) {
    return new Intl.NumberFormat("pt-BR").format(Number(v || 0));
  }

  function fmtMoney(v) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(Number(v || 0));
  }

  function norm(v) {
    return String(v || "").trim().toLowerCase();
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function plusDays(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function panel(title, subtitle, body) {
    return `<div class="panel"><h2>${title}</h2>${subtitle ? `<div class="panel-sub">${subtitle}</div>` : ""}${body}</div>`;
  }

  function row(a, b, c, d) {
    return `<div class="line-item"><div class="line-top"><div>${a || "—"}</div><div>${b || ""}</div></div><div>${c || "—"}</div>${d ? `<div class="muted" style="margin-top:6px;">${d}</div>` : ""}</div>`;
  }

  function badge(status) {
    const s = norm(status);
    let cls = "status-pill";
    if (["ativo", "finalizado", "quitado", "pago"].includes(s)) cls += " status-finalizado";
    else if (["suspenso", "em_analise", "aguardando_analise"].includes(s)) cls += " status-aguardando_analise";
    else if (["cancelado"].includes(s)) cls += " status-cancelado";
    else cls += " status-aberto";
    return `<span class="${cls}">${status || "—"}</span>`;
  }

  async function safeSelect(db, table, columns, companyId, extraBuilder) {
    try {
      let q = db.from(table).select(columns).eq("company_id", companyId);
      if (typeof extraBuilder === "function") q = extraBuilder(q);
      const r = await q;
      if (r.error) throw r.error;
      return { ok: true, data: r.data || [] };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  function monthsBack(count) {
    const out = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      out.push({ key, label });
    }
    return out;
  }

  function aggregateCountByMonth(items, field, months) {
    const map = {};
    months.forEach(m => map[m.key] = 0);
    (items || []).forEach(item => {
      const raw = item[field];
      if (!raw) return;
      const d = new Date(String(raw).length <= 10 ? raw + "T00:00:00" : raw);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (key in map) map[key] += 1;
    });
    return months.map(m => map[m.key] || 0);
  }

  function aggregateMoneyByMonth(items, fieldDate, fieldAmount, months) {
    const map = {};
    months.forEach(m => map[m.key] = 0);
    (items || []).forEach(item => {
      const raw = item[fieldDate];
      if (!raw) return;
      const d = new Date(String(raw).length <= 10 ? raw + "T00:00:00" : raw);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (key in map) map[key] += Number(item[fieldAmount] || 0);
    });
    return months.map(m => map[m.key] || 0);
  }

  function renderContracts(contracts) {
    if (!contracts.length) return `<div class="empty">Nenhum contrato ativo encontrado.</div>`;
    return `<div class="list-lines">${contracts.slice(0, 8).map(c => row(
      c.name || "Contrato",
      badge(c.status),
      `${c.customer_name || "Cliente"} • ${fmtMoney(c.amount || 0)}`,
      [
        c.next_billing_date ? `Próxima cobrança: ${new Date(c.next_billing_date + "T00:00:00").toLocaleDateString("pt-BR")}` : "",
        c.sla_name || ""
      ].filter(Boolean).join(" • ")
    )).join("")}</div>`;
  }

  function renderReceivables(items) {
    if (!items.length) return `<div class="empty">Nenhuma cobrança encontrada.</div>`;
    return `<div class="list-lines">${items.slice(0, 8).map(r => row(
      r.due_date ? new Date(r.due_date + "T00:00:00").toLocaleDateString("pt-BR") : "—",
      badge(r.paid ? "pago" : "aberto"),
      `${r.customer_name || "Cliente"} • ${fmtMoney(r.amount || 0)}`,
      r.contract_name ? `Contrato: ${r.contract_name}` : ""
    )).join("")}</div>`;
  }

  function renderTickets(items) {
    if (!items.length) return `<div class="empty">Nenhum chamado recente.</div>`;
    return `<div class="list-lines">${items.slice(0, 8).map(t => row(
      t.created_at ? new Date(t.created_at).toLocaleDateString("pt-BR") : "—",
      badge(t.status),
      `${t.client_name || "Sem nome"}${t.client_phone ? " — " + t.client_phone : ""}`,
      t.description || ""
    )).join("")}</div>`;
  }

  function drawCharts(months, metrics) {
    if (typeof window.Chart === "undefined") return;

    const common = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#edf4ff" } } },
      scales: {
        x: { ticks: { color: "#c8d8f4" }, grid: { color: "rgba(36,59,97,.35)" } },
        y: { ticks: { color: "#c8d8f4" }, grid: { color: "rgba(36,59,97,.35)" } }
      }
    };

    const a = document.getElementById("grafTicketsMes");
    if (a) {
      new window.Chart(a, {
        type: "line",
        data: {
          labels: months.map(m => m.label),
          datasets: [{
            label: "Chamados",
            data: metrics.ticketsByMonth,
            borderColor: "#3d86ff",
            backgroundColor: "rgba(61,134,255,.18)",
            fill: true,
            tension: 0.3
          }]
        },
        options: common
      });
    }

    const b = document.getElementById("grafMRRMes");
    if (b) {
      new window.Chart(b, {
        type: "bar",
        data: {
          labels: months.map(m => m.label),
          datasets: [{
            label: "Receita recorrente",
            data: metrics.contractRevenueByMonth,
            backgroundColor: "rgba(20,195,142,.78)",
            borderColor: "#14c38e",
            borderWidth: 1
          }]
        },
        options: common
      });
    }

    const c = document.getElementById("grafRecebiveis");
    if (c) {
      new window.Chart(c, {
        type: "doughnut",
        data: {
          labels: ["Em aberto", "Pagos"],
          datasets: [{
            data: [metrics.openReceivables, metrics.paidReceivables],
            backgroundColor: ["#f6b73c", "#14c38e"],
            borderColor: "#07111f",
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { color: "#edf4ff" } } }
        }
      });
    }
  }

  async function renderizarDashboard(opts) {
    const areaId = opts && opts.areaId ? opts.areaId : "conteudoTela";
    const sb = opts && opts.sb ? opts.sb : window.sb;
    const setErro = opts && opts.setErro ? opts.setErro : function(){};
    const setInfo = opts && opts.setInfo ? opts.setInfo : function(){};
    const setTitulo = opts && opts.setTitulo ? opts.setTitulo : function(){};

    setTitulo("Dashboard", "Painel executivo SaaS do sistema");
    setErro("");
    setInfo("");

    const alvo = document.getElementById(areaId);
    if (!alvo) return;

    alvo.innerHTML = panel("Dashboard", "Carregando indicadores executivos...", `<div class="placeholder-big">Aguarde, consolidando operação, contratos e financeiro.</div>`);

    if (!(sb && sb.db && sb.companyId)) {
      setInfo("Conexão carregada, mas companyId ainda não está disponível.");
      return;
    }

    try {
      const hoje = todayISO();
      const limite7 = plusDays(hoje, 7);

      const [ticketsResp, customersResp, contractsResp, slaResp, receivablesResp] = await Promise.all([
        safeSelect(sb.db, "tickets", "id, created_at, client_name, client_phone, description, status, customer_id", sb.companyId),
        safeSelect(sb.db, "customers", "id, name, phone, created_at", sb.companyId),
        safeSelect(sb.db, "contracts", "id, customer_id, sla_plan_id, start_date, next_billing_date, status, name, amount, created_at", sb.companyId),
        safeSelect(sb.db, "sla_plans", "id, name, hours_to_expire, created_at", sb.companyId),
        safeSelect(sb.db, "receivables", "id, contract_id, due_date, amount, paid, paid_at, customer_id, created_at", sb.companyId)
      ]);

      const tickets = ticketsResp.ok ? ticketsResp.data : [];
      const customers = customersResp.ok ? customersResp.data : [];
      const contracts = contractsResp.ok ? contractsResp.data : [];
      const slaPlans = slaResp.ok ? slaResp.data : [];
      const receivables = receivablesResp.ok ? receivablesResp.data : [];

      const customerMap = {};
      customers.forEach(c => { customerMap[c.id] = c; });
      const slaMap = {};
      slaPlans.forEach(s => { slaMap[s.id] = s; });
      const contractMap = {};
      contracts.forEach(c => { contractMap[c.id] = c; });

      const activeContracts = contracts.filter(c => norm(c.status) === "ativo");
      const suspendedContracts = contracts.filter(c => norm(c.status) === "suspenso");
      const canceledContracts = contracts.filter(c => norm(c.status) === "cancelado");

      const mrr = activeContracts.reduce((acc, c) => acc + Number(c.amount || 0), 0);
      const paidReceivables = receivables.filter(r => !!r.paid).length;
      const openReceivables = receivables.filter(r => !r.paid).length;
      const overdueReceivables = receivables.filter(r => !r.paid && r.due_date && String(r.due_date) < hoje).length;
      const dueSoonReceivables = receivables.filter(r => !r.paid && r.due_date && String(r.due_date) >= hoje && String(r.due_date) <= limite7).length;

      const openTickets = tickets.filter(t => ["aberto", "open"].includes(norm(t.status))).length;
      const analysisTickets = tickets.filter(t => ["em_analise", "aguardando_analise"].includes(norm(t.status))).length;
      const progressTickets = tickets.filter(t => norm(t.status) === "em_andamento").length;

      const recurringCustomers = new Set(activeContracts.map(c => c.customer_id).filter(Boolean)).size;
      const avulsoKeys = new Set();
      tickets.forEach(t => {
        if (t.customer_id && activeContracts.some(c => c.customer_id === t.customer_id)) return;
        const key = `${String(t.client_name || "").trim().toLowerCase()}||${String(t.client_phone || "").trim()}`;
        if (key !== "||") avulsoKeys.add(key);
      });
      const avulsoClients = avulsoKeys.size;

      const months = monthsBack(6);
      const ticketsByMonth = aggregateCountByMonth(tickets, "created_at", months);
      const contractRevenueByMonth = aggregateMoneyByMonth(activeContracts, "start_date", "amount", months);

      const contractsView = activeContracts.map(c => ({
        ...c,
        customer_name: customerMap[c.customer_id] ? customerMap[c.customer_id].name : "",
        sla_name: slaMap[c.sla_plan_id] ? `${slaMap[c.sla_plan_id].name} • ${slaMap[c.sla_plan_id].hours_to_expire || 0}h` : ""
      })).sort((a, b) => String(a.next_billing_date || "").localeCompare(String(b.next_billing_date || "")));

      const receivablesView = receivables.map(r => ({
        ...r,
        contract_name: contractMap[r.contract_id] ? contractMap[r.contract_id].name : "",
        customer_name: customerMap[r.customer_id] ? customerMap[r.customer_id].name : ""
      })).sort((a, b) => String(b.due_date || "").localeCompare(String(a.due_date || "")));

      const latestTickets = [...tickets].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));

      alvo.innerHTML = `
        <div class="cards" style="grid-template-columns:repeat(6,minmax(0,1fr));">
          <div class="card"><div class="card-label">MRR</div><div class="card-value">${fmtMoney(mrr)}</div></div>
          <div class="card"><div class="card-label">Contratos Ativos</div><div class="card-value">${fmtInt(activeContracts.length)}</div></div>
          <div class="card"><div class="card-label">Cobranças em Aberto</div><div class="card-value">${fmtInt(openReceivables)}</div></div>
          <div class="card"><div class="card-label">Chamados Abertos</div><div class="card-value">${fmtInt(openTickets)}</div></div>
          <div class="card"><div class="card-label">Clientes Recorrentes</div><div class="card-value">${fmtInt(recurringCustomers)}</div></div>
          <div class="card"><div class="card-label">Clientes Avulsos</div><div class="card-value">${fmtInt(avulsoClients)}</div></div>
        </div>

        <div class="grid-2" style="margin-top:16px;">
          ${panel("Chamados por Mês", "Evolução da operação", `<div style="height:320px;"><canvas id="grafTicketsMes"></canvas></div>`)}
          ${panel("Receita Recorrente", "Base mensal de contratos ativos", `<div style="height:320px;"><canvas id="grafMRRMes"></canvas></div>`)}
        </div>

        <div class="grid-2" style="margin-top:16px;">
          ${panel("Cobranças", "Situação aberta x paga", `<div style="height:320px;"><canvas id="grafRecebiveis"></canvas></div>`)}
          ${panel("Resumo Executivo", "Indicadores principais do negócio", `<div class="list-lines">
            ${row("MRR", fmtMoney(mrr), "Receita mensal recorrente", `Contratos ativos: ${fmtInt(activeContracts.length)}`)}
            ${row("Cobranças", fmtInt(openReceivables), "Cobranças em aberto", `Vencidas: ${fmtInt(overdueReceivables)} • 7 dias: ${fmtInt(dueSoonReceivables)}`)}
            ${row("SLA", fmtInt(openTickets), "Chamados abertos", `Em análise: ${fmtInt(analysisTickets)} • Em andamento: ${fmtInt(progressTickets)}`)}
            ${row("Base", fmtInt(recurringCustomers), "Clientes recorrentes", `Avulsos: ${fmtInt(avulsoClients)}`)}
          </div>`)}
        </div>

        <div class="grid-2" style="margin-top:16px;">
          ${panel("Contratos Ativos", "Clientes recorrentes e próxima cobrança", renderContracts(contractsView))}
          ${panel("Cobranças Recentes", "Recebíveis vinculados a contratos", renderReceivables(receivablesView))}
        </div>

        <div class="grid-2" style="margin-top:16px;">
          ${panel("Últimos Chamados", "Fila operacional recente", renderTickets(latestTickets))}
          ${panel("Alertas", "Pontos de atenção do sistema", `<div class="list-lines">
            ${row("Contratos", badge("ativo"), "Ativos / Suspensos / Cancelados", `${fmtInt(activeContracts.length)} / ${fmtInt(suspendedContracts.length)} / ${fmtInt(canceledContracts.length)}`)}
            ${row("Recebíveis", badge("aberto"), "Cobranças vencidas", `${fmtInt(overdueReceivables)} vencida(s) • ${fmtInt(dueSoonReceivables)} vence(m) em 7 dias`)}
            ${row("Tickets", badge("aberto"), "Abertos / Em análise / Em andamento", `${fmtInt(openTickets)} / ${fmtInt(analysisTickets)} / ${fmtInt(progressTickets)}`)}
            ${row("Base comercial", badge("ativo"), "Recorrentes / Avulsos", `${fmtInt(recurringCustomers)} / ${fmtInt(avulsoClients)}`)}
          </div>`)}
        </div>
      `;

      drawCharts(months, {
        ticketsByMonth,
        contractRevenueByMonth,
        openReceivables,
        paidReceivables
      });
    } catch (erro) {
      setErro("Falha ao carregar dashboard: " + (erro.message || erro));
      alvo.innerHTML = panel("Dashboard", "Não foi possível montar o painel executivo.", `<div class="placeholder-big">Verifique acesso às tabelas tickets, customers, contracts, sla_plans e receivables.</div>`);
    }
  }

  window.ModuloDashboard = {
    renderizarDashboard: renderizarDashboard
  };
})();