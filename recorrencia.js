(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }

  function inteiro(v) {
    return new Intl.NumberFormat("pt-BR").format(Number(v || 0));
  }

  function moeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }

  function fmtData(data) {
    if (!data) return "—";
    const d = new Date(String(data).length <= 10 ? data + "T00:00:00" : data);
    return d.toLocaleDateString("pt-BR");
  }

  function hojeISO() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }

  function normalizar(s) {
    return String(s || "").trim().toLowerCase();
  }

  function linkAssinaturaUrl(token) {
    if (!token) return "";
    const base = (window.location.origin || "") + (window.location.pathname || "").replace(/\/[^/]*$/, "") + "/assinatura-contrato.html";
    return base + "?t=" + encodeURIComponent(token);
  }

  function panel(title, subtitle, body) {
    return `<div class="panel"><h2>${title}</h2>${subtitle ? `<div class="panel-sub">${subtitle}</div>` : ""}${body}</div>`;
  }

  function linha(topLeft, topRight, main, sub, actions) {
    return `<div class="line-item"><div class="line-top"><div>${topLeft || "—"}</div><div>${topRight || ""}</div></div><div>${main || "—"}</div>${sub ? `<div class="muted" style="margin-top:6px;">${sub}</div>` : ""}${actions ? `<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>` : ""}</div>`;
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

  async function safeInsert(db, table, payload) {
    const r = await db.from(table).insert(payload).select().limit(1);
    if (r.error) throw r.error;
    return (r.data || [])[0] || null;
  }

  async function safeUpdate(db, table, payload, filters) {
    let q = db.from(table).update(payload);
    (filters || []).forEach(([field, value]) => { q = q.eq(field, value); });
    const r = await q.select().limit(1);
    if (r.error) throw r.error;
    return (r.data || [])[0] || null;
  }

  function statusContratoPill(status) {
    const s = normalizar(status);
    let cls = "status-pill";
    if (s === "ativo" || s === "renovado") cls += " status-finalizado";
    else if (s === "suspenso") cls += " status-aguardando_analise";
    else if (s === "cancelado" || s === "encerrado") cls += " status-cancelado";
    else cls += " status-aberto";
    return `<span class="${cls}">${status || "—"}</span>`;
  }

  function statusRecebivelPill(paid) {
    return paid
      ? `<span class="status-pill status-finalizado">Pago</span>`
      : `<span class="status-pill status-aberto">Em aberto</span>`;
  }

  function slaDescricao(plan) {
    if (!plan) return "—";
    return `${plan.name || "Plano"} • ${plan.hours_to_expire || 0}h`;
  }

  function mergeContratos(contratos, customers, slaPlans) {
    const mapaCustomer = {};
    const mapaSla = {};
    (customers || []).forEach((c) => { mapaCustomer[c.id] = c; });
    (slaPlans || []).forEach((p) => { mapaSla[p.id] = p; });

    return (contratos || []).map((c) => ({
      ...c,
      customer_name: mapaCustomer[c.customer_id] ? mapaCustomer[c.customer_id].name : "",
      customer_phone: mapaCustomer[c.customer_id] ? mapaCustomer[c.customer_id].phone : "",
      sla_name: mapaSla[c.sla_plan_id] ? slaDescricao(mapaSla[c.sla_plan_id]) : ""
    }));
  }

  function avulsosFromTickets(tickets, customers) {
    const mapaCustomer = {};
    (customers || []).forEach((c) => {
      mapaCustomer[`${String(c.name || "").trim().toLowerCase()}||${String(c.phone || "").trim()}`] = c;
    });

    const mapa = {};
    (tickets || []).forEach((t) => {
      const nome = String(t.client_name || "").trim();
      const fone = String(t.client_phone || "").trim();
      if (!nome && !fone) return;
      const key = `${nome.toLowerCase()}||${fone}`;
      const customer = mapaCustomer[key] || null;
      if (!mapa[key]) {
        mapa[key] = {
          client_name: nome || "Sem nome",
          client_phone: fone || "",
          total_chamados: 0,
          ultimo_status: t.status || "",
          ultima_data: t.created_at || null,
          customer_id: customer ? customer.id : null
        };
      }
      mapa[key].total_chamados += 1;
      if (t.created_at && (!mapa[key].ultima_data || String(t.created_at) > String(mapa[key].ultima_data))) {
        mapa[key].ultima_data = t.created_at;
        mapa[key].ultimo_status = t.status || "";
      }
    });

    return Object.values(mapa).sort((a, b) => String(b.ultima_data || "").localeCompare(String(a.ultima_data || "")));
  }

  function renderContratos(contratos) {
    if (!contratos.length) return `<div class="empty">Nenhum contrato cadastrado ainda.</div>`;
    return `<div class="list-lines">${contratos.map((c) => {
      const subParts = [
        c.sla_name ? `SLA: ${c.sla_name}` : "",
        `Valor: ${moeda(c.amount || 0)}`,
        c.start_date ? `Início: ${fmtData(c.start_date)}` : "",
        c.next_billing_date ? `Próxima cobrança: ${fmtData(c.next_billing_date)}` : "",
        c.signed_at ? `Assinado em ${fmtData(c.signed_at)}` : ""
      ].filter(Boolean);
      const linkChamado = c.ticket_id ? `<a href="#chamados" class="link-inline" data-action="ir-chamado" data-ticket-id="${c.ticket_id}" style="margin-left:6px;">Ver chamado</a>` : "";
      const btnAssinatura = !c.signed_at && c.signature_token
        ? `<button class="btn-secondary" data-action="link-assinatura" data-token="${(c.signature_token || "").replace(/"/g, "&quot;")}">Enviar para assinatura</button>`
        : !c.signed_at
        ? `<button class="btn-secondary" data-action="gerar-link-assinatura" data-id="${c.id}">Gerar link assinatura</button>`
        : "";
      return linha(
        c.name || "Contrato",
        statusContratoPill(c.status),
        `${c.customer_name || "Cliente"}${c.customer_phone ? " — " + c.customer_phone : ""}${linkChamado}`,
        subParts.join(" • "),
        `${btnAssinatura}<button class="btn-secondary" data-action="editar-contrato" data-id="${c.id}">Editar</button><button class="btn-secondary" data-action="cancelar-contrato" data-id="${c.id}">Cancelar</button><button class="btn-secondary" data-action="reativar-contrato" data-id="${c.id}">Reativar</button>`
      );
    }).join("")}</div>`;
  }

  function renderRecebiveis(receivables, contratosMap, customersMap) {
    if (!receivables.length) return `<div class="empty">Nenhuma cobrança recorrente encontrada.</div>`;
    return `<div class="list-lines">${receivables.slice(0, 12).map((r) => {
      const contrato = contratosMap[r.contract_id] || null;
      const customer = customersMap[r.customer_id] || null;
      const actions = !r.paid ? `<button class="btn-secondary" data-action="marcar-pago" data-id="${r.id}">Marcar como pago</button>` : "";
      return linha(
        fmtData(r.due_date),
        statusRecebivelPill(r.paid),
        `${customer ? customer.name : "Cliente"} • ${moeda(r.amount || 0)}`,
        [contrato ? `Contrato: ${contrato.name || "Sem nome"}` : "", r.paid_at ? `Pago em: ${fmtData(r.paid_at)}` : "Aguardando pagamento"].filter(Boolean).join(" • "),
        actions
      );
    }).join("")}</div>`;
  }

  function renderAvulsos(avulsos) {
    if (!avulsos.length) return `<div class="empty">Nenhum cliente avulso encontrado a partir dos chamados.</div>`;
    return `<div class="list-lines">${avulsos.slice(0, 12).map((c, idx) => linha(
      c.ultima_data ? fmtData(c.ultima_data) : "—",
      `<span class="status-pill status-aberto">Avulso</span>`,
      `${c.client_name}${c.client_phone ? " — " + c.client_phone : ""}`,
      `${inteiro(c.total_chamados)} chamado(s) • último status: ${c.ultimo_status || "—"}`,
      `<button class="btn-secondary" data-action="converter-avulso" data-idx="${idx}">Converter em recorrente</button>${c.customer_id ? `<button class="btn-secondary" data-action="usar-cadastro" data-customer-id="${c.customer_id}">Usar cadastro existente</button>` : ""}`
    )).join("")}</div>`;
  }

  function formHtml(customers, slaPlans) {
    const customerOptions = (customers || []).map((c) => `<option value="${c.id}">${c.name}${c.phone ? " — " + c.phone : ""}</option>`).join("");
    const slaOptions = (slaPlans || []).map((p) => `<option value="${p.id}">${slaDescricao(p)}</option>`).join("");
    return `<form id="formRecorrencia" class="form-grid-2"><input type="hidden" id="rcContratoId" value="" /><div class="field"><label>Cliente</label><select id="rcCustomerId" required><option value="">Selecione</option>${customerOptions}</select></div><div class="field"><label>Nome do Contrato</label><input id="rcName" type="text" placeholder="Ex.: Plano mensal manutenção" /></div><div class="field"><label>Plano SLA</label><select id="rcSlaPlanId" required><option value="">Selecione</option>${slaOptions}</select></div><div class="field"><label>Valor Mensal</label><input id="rcAmount" type="number" min="0" step="0.01" placeholder="0,00" /></div><div class="field"><label>Início do Contrato</label><input id="rcStartDate" type="date" /></div><div class="field"><label>Próxima Cobrança</label><input id="rcNextBillingDate" type="date" /></div><div class="field"><label>Status</label><select id="rcStatus"><option value="ativo">ativo</option><option value="suspenso">suspenso</option><option value="cancelado">cancelado</option></select></div><div class="field" style="grid-column:1/-1"><label>Conteúdo do contrato</label><textarea id="rcContractContent" class="textarea" rows="12" placeholder="Preenchido automaticamente ao criar a partir do chamado. Edite conforme necessário." style="font-family:monospace;font-size:13px"></textarea><div class="muted" style="margin-top:6px">Placeholders: {{NOME_CLIENTE}}, {{TELEFONE}}, {{ENDERECO}}, {{EMAIL}}, {{PLANO_SLA}}, {{VALOR_MENSAL}}, {{DATA_INICIO}}, {{DATA_HOJE}}, {{DESCRICAO_ATENDIMENTO}}</div></div><div class="field"><label>Assinatura digital</label><input id="rcSignedBy" type="text" placeholder="Nome de quem assinou (cliente)" /></div><div class="field"><label>Data da assinatura</label><input id="rcSignedAt" type="datetime-local" placeholder="Quando o cliente assinou" /></div><div class="field"><label>Resumo</label><div class="muted">Marque a assinatura quando o cliente assinar digitalmente.</div></div><div style="grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;"><button type="submit" class="btn-primary">Salvar contrato</button><button type="button" id="btnNovoContrato" class="btn-secondary">Novo contrato</button><button type="button" id="btnProcessarRecorrencia" class="btn-secondary">Processar recorrências agora</button><button type="button" id="btnExportarBanco" class="btn-secondary">Exportar para banco</button></div></form>`;
  }

  async function renderizarRecorrencia(opts) {
    const areaId = opts && opts.areaId ? opts.areaId : "conteudoTela";
    const sb = opts && opts.sb ? opts.sb : window.sb;
    const setErro = opts && opts.setErro ? opts.setErro : function(){};
    const setInfo = opts && opts.setInfo ? opts.setInfo : function(){};
    const setTitulo = opts && opts.setTitulo ? opts.setTitulo : function(){};

    setTitulo("Recorrência", "Clientes avulsos, contratos e SLA");
    setErro("");
    setInfo("");

    const alvo = document.getElementById(areaId);
    if (!alvo) return;

    alvo.innerHTML = panel("Recorrência", "Carregando contratos, clientes avulsos e recorrência financeira...", `<div class="placeholder-big">Aguarde, montando o módulo de recorrência.</div>`);

    if (!(sb && sb.db && sb.companyId)) {
      setInfo("Conexão carregada, mas companyId ainda não está disponível.");
      return;
    }

    try {
      const [ticketsResp, customersResp, contractsResp, slaResp, receivablesResp] = await Promise.all([
        safeSelect(sb.db, "tickets", "id, client_name, client_phone, status, created_at", sb.companyId),
        safeSelect(sb.db, "customers", "id, name, phone, email, address, notes, created_at", sb.companyId),
        safeSelect(sb.db, "contracts", "id, company_id, customer_id, sla_plan_id, ticket_id, start_date, next_billing_date, status, created_at, name, amount, contract_content, signed_at, signed_by, signature_token", sb.companyId),
        safeSelect(sb.db, "sla_plans", "id, company_id, name, hours_to_expire, created_at", sb.companyId),
        safeSelect(sb.db, "receivables", "id, contract_id, due_date, amount, paid, paid_at, created_at, company_id, customer_id, nosso_numero, documento_ref", sb.companyId, (q) => q.order("due_date", { ascending: false }))
      ]);

      const tickets = ticketsResp.ok ? ticketsResp.data : [];
      const customers = customersResp.ok ? customersResp.data : [];
      const contractsRaw = contractsResp.ok ? contractsResp.data : [];
      const slaPlans = slaResp.ok ? slaResp.data : [];
      const receivables = receivablesResp.ok ? receivablesResp.data : [];

      const contratos = mergeContratos(contractsRaw, customers, slaPlans);
      const avulsos = avulsosFromTickets(tickets, customers);
      const contratosAtivos = contratos.filter((c) => normalizar(c.status) === "ativo");
      const contratosSuspensos = contratos.filter((c) => normalizar(c.status) === "suspenso");
      const receitaMensal = contratosAtivos.reduce((acc, item) => acc + Number(item.amount || 0), 0);
      const cobrancasAbertas = receivables.filter((r) => !r.paid && !!r.contract_id).length;

      const contratosMap = {};
      const customersMap = {};
      contratos.forEach((c) => { contratosMap[c.id] = c; });
      customers.forEach((c) => { customersMap[c.id] = c; });

      alvo.innerHTML = `<div class="cards" style="grid-template-columns:repeat(5,minmax(0,1fr));"><div class="card"><div class="card-label">Clientes Avulsos</div><div class="card-value">${inteiro(avulsos.length)}</div></div><div class="card"><div class="card-label">Contratos Ativos</div><div class="card-value">${inteiro(contratosAtivos.length)}</div></div><div class="card"><div class="card-label">Contratos Suspensos</div><div class="card-value">${inteiro(contratosSuspensos.length)}</div></div><div class="card"><div class="card-label">Receita Mensal Contratada</div><div class="card-value">${moeda(receitaMensal)}</div></div><div class="card"><div class="card-label">Cobranças em Aberto</div><div class="card-value">${inteiro(cobrancasAbertas)}</div></div></div><div class="grid-2" style="margin-top:16px;">${panel("Criar / Editar Contrato", "O operador define cliente, SLA, valor e data da recorrência", formHtml(customers, slaPlans))}${panel("Clientes Avulsos", "Clientes que entram direto via chamados e podem virar recorrentes", renderAvulsos(avulsos))}</div><div class="grid-2" style="margin-top:16px;">${panel("Contratos Cadastrados", "Situação atual dos vínculos recorrentes", renderContratos(contratos))}${panel("Cobranças Recorrentes", "Últimos recebíveis vinculados a contratos", renderRecebiveis(receivables, contratosMap, customersMap))}</div>`;

      const state = { sb, customers, slaPlans, contratos, avulsos };
      const form = $("#formRecorrencia", alvo);
      const rcContratoId = $("#rcContratoId", alvo);
      const rcCustomerId = $("#rcCustomerId", alvo);
      const rcName = $("#rcName", alvo);
      const rcSlaPlanId = $("#rcSlaPlanId", alvo);
      const rcAmount = $("#rcAmount", alvo);
      const rcStartDate = $("#rcStartDate", alvo);
      const rcNextBillingDate = $("#rcNextBillingDate", alvo);
      const rcStatus = $("#rcStatus", alvo);
      const rcContractContent = $("#rcContractContent", alvo);
      const rcSignedBy = $("#rcSignedBy", alvo);
      const rcSignedAt = $("#rcSignedAt", alvo);
      const btnNovoContrato = $("#btnNovoContrato", alvo);
      const btnProcessarRecorrencia = $("#btnProcessarRecorrencia", alvo);
      const btnExportarBanco = $("#btnExportarBanco", alvo);

      rcStartDate.value = hojeISO();
      rcNextBillingDate.value = hojeISO();

      function resetForm() {
        rcContratoId.value = "";
        rcCustomerId.value = "";
        rcName.value = "";
        rcSlaPlanId.value = "";
        rcAmount.value = "";
        rcStartDate.value = hojeISO();
        rcNextBillingDate.value = hojeISO();
        rcStatus.value = "ativo";
        if (rcContractContent) rcContractContent.value = "";
        if (rcSignedBy) rcSignedBy.value = "";
        if (rcSignedAt) rcSignedAt.value = "";
      }

      function preencherForm(c) {
        rcContratoId.value = c.id || "";
        rcCustomerId.value = c.customer_id || "";
        rcName.value = c.name || "";
        rcSlaPlanId.value = c.sla_plan_id || "";
        rcAmount.value = Number(c.amount || 0);
        rcStartDate.value = c.start_date ? String(c.start_date).slice(0, 10) : hojeISO();
        rcNextBillingDate.value = c.next_billing_date ? String(c.next_billing_date).slice(0, 10) : hojeISO();
        rcStatus.value = c.status || "ativo";
        if (rcContractContent) rcContractContent.value = c.contract_content || "";
        if (rcSignedBy) rcSignedBy.value = c.signed_by || "";
        if (rcSignedAt && c.signed_at) {
          const d = new Date(c.signed_at);
          rcSignedAt.value = d.toISOString().slice(0, 16);
        } else if (rcSignedAt) rcSignedAt.value = "";
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      async function ensureCustomer(av) {
        if (av.customer_id) return av.customer_id;
        const existente = state.customers.find((c) => normalizar(c.name) === normalizar(av.client_name) && String(c.phone || "").trim() === String(av.client_phone || "").trim());
        if (existente) return existente.id;
        const novo = await safeInsert(sb.db, "customers", { company_id: sb.companyId, name: av.client_name || "Sem nome", phone: av.client_phone || null });
        return novo ? novo.id : null;
      }

      async function garantirPrimeiroRecebivel(contractRow) {
        const dueDate = String(contractRow.next_billing_date || "").slice(0, 10);
        if (!dueDate) return;
        const existente = await sb.db.from("receivables").select("id").eq("company_id", sb.companyId).eq("contract_id", contractRow.id).eq("due_date", dueDate).limit(1);
        if (existente.error) throw existente.error;
        if ((existente.data || []).length) return;
        await safeInsert(sb.db, "receivables", { company_id: sb.companyId, contract_id: contractRow.id, customer_id: contractRow.customer_id, due_date: dueDate, amount: Number(contractRow.amount || 0), paid: false });
      }

      async function salvarContrato(ev) {
        ev.preventDefault();
        setErro("");
        setInfo("");
        if (!rcCustomerId.value) return setErro("Selecione o cliente.");
        if (!rcSlaPlanId.value) return setErro("Selecione o plano SLA.");
        if (!rcStartDate.value) return setErro("Informe a data de início do contrato.");
        if (!rcNextBillingDate.value) return setErro("Informe a próxima cobrança.");

        const payload = {
          company_id: sb.companyId,
          customer_id: rcCustomerId.value,
          sla_plan_id: rcSlaPlanId.value,
          start_date: rcStartDate.value,
          next_billing_date: rcNextBillingDate.value,
          status: rcStatus.value || "ativo",
          name: rcName.value || null,
          amount: Number(rcAmount.value || 0),
          contract_content: rcContractContent ? rcContractContent.value.trim() || null : null,
          signed_by: rcSignedBy ? rcSignedBy.value.trim() || null : null,
          signed_at: rcSignedAt && rcSignedAt.value ? new Date(rcSignedAt.value).toISOString() : null
        };

        try {
          let contrato;
          if (rcContratoId.value) {
            const existente = state.contratos.find((c) => String(c.id) === String(rcContratoId.value));
            if (existente && !existente.signature_token && !existente.signed_at) {
              payload.signature_token = "sig_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
            }
            contrato = await safeUpdate(sb.db, "contracts", payload, [["id", rcContratoId.value], ["company_id", sb.companyId]]);
            setInfo("Contrato atualizado com sucesso.");
          } else {
            payload.signature_token = "sig_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
            contrato = await safeInsert(sb.db, "contracts", payload);
            setInfo("Contrato criado com sucesso. Use 'Enviar para assinatura' para enviar o link ao cliente.");
          }
          if (contrato && normalizar(contrato.status) === "ativo") {
            await garantirPrimeiroRecebivel(contrato);
          }
          await renderizarRecorrencia(opts);
        } catch (erro) {
          setErro("Falha ao salvar contrato: " + (erro.message || erro));
        }
      }

      async function processarRecorrencia() {
        setErro("");
        setInfo("");
        try {
          const r = await sb.db.rpc("fn_generate_contract_receivables", { p_company_id: sb.companyId });
          if (r.error) throw r.error;
          const data = r.data || {};
          const qtd = typeof data === "object" && data !== null ? (data.created || data.count || data.qtd || 0) : 0;
          setInfo(`Recorrências processadas com sucesso. Cobranças geradas: ${qtd}.`);
          await renderizarRecorrencia(opts);
        } catch (erro) {
          setErro("Falha ao processar recorrências. Rode a SQL deste pacote antes de usar esse botão. Detalhe: " + (erro.message || erro));
        }
      }

      async function cancelarContrato(id) {
        try {
          await safeUpdate(sb.db, "contracts", { status: "cancelado" }, [["id", id], ["company_id", sb.companyId]]);
          setInfo("Contrato cancelado.");
          await renderizarRecorrencia(opts);
        } catch (erro) {
          setErro("Falha ao cancelar contrato: " + (erro.message || erro));
        }
      }

      async function reativarContrato(id) {
        try {
          await safeUpdate(sb.db, "contracts", { status: "ativo" }, [["id", id], ["company_id", sb.companyId]]);
          setInfo("Contrato reativado.");
          await renderizarRecorrencia(opts);
        } catch (erro) {
          setErro("Falha ao reativar contrato: " + (erro.message || erro));
        }
      }

      form.addEventListener("submit", salvarContrato);
      btnNovoContrato.addEventListener("click", resetForm);
      btnProcessarRecorrencia.addEventListener("click", processarRecorrencia);
      if (btnExportarBanco) btnExportarBanco.addEventListener("click", exportarParaBanco);

      function exportarParaBanco() {
        const cobrancasAbertas = receivables.filter((r) => !r.paid && !!r.contract_id);
        if (!cobrancasAbertas.length) {
          setInfo("Nenhuma cobrança em aberto para exportar.");
          return;
        }
        const sep = ";";
        const enc = "utf-8";
        const cabecalho = ["cliente", "cpf_cnpj", "telefone", "valor", "vencimento", "nosso_numero", "descricao"];
        const linhas = cobrancasAbertas.map((r) => {
          const c = customersMap[r.customer_id] || {};
          const contrato = contratosMap[r.contract_id] || {};
          const doc = (c.document || "").replace(/\D/g, "") || "";
          const valor = String(Number(r.amount || 0).toFixed(2)).replace(".", ",");
          const venc = r.due_date ? String(r.due_date).slice(0, 10) : "";
          const nossoNum = r.nosso_numero || r.documento_ref || r.id || "";
          const desc = `Recorrência ${contrato.name || "Contrato"} - ${venc}`;
          return [c.name || "Cliente", doc, c.phone || "", valor, venc, nossoNum, desc].map((v) => `"${String(v || "").replace(/"/g, '""')}"`).join(sep);
        });
        const csv = "\uFEFF" + cabecalho.join(sep) + "\r\n" + linhas.join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=" + enc });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "cobrancas_recorrentes_" + hojeISO().replace(/-/g, "") + ".csv";
        a.click();
        URL.revokeObjectURL(url);
        setInfo("Arquivo exportado. Envie ao banco para gerar boletos.");
      }

      async function marcarRecebivelPago(receivableId) {
        const hoje = hojeISO();
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop";
        backdrop.innerHTML = `
          <div class="modal" style="max-width:360px;">
            <div class="modal-head"><div class="modal-title">Marcar cobrança como paga</div><button class="btn btn-ghost" id="fecharMarcarPago">Fechar</button></div>
            <div class="grid-form" style="padding:16px;">
              <div><label class="label">Data do pagamento</label><input id="dataPagamentoRecebivel" class="field" type="date" value="${hoje}"></div>
            </div>
            <div class="modal-actions"><button class="btn btn-secondary" id="cancelarMarcarPago">Cancelar</button><button class="btn btn-primary" id="confirmarMarcarPago">Confirmar</button></div>
          </div>`;
        document.body.appendChild(backdrop);
        const fechar = () => document.body.removeChild(backdrop);
        $("#fecharMarcarPago", backdrop).addEventListener("click", fechar);
        $("#cancelarMarcarPago", backdrop).addEventListener("click", fechar);
        $("#confirmarMarcarPago", backdrop).addEventListener("click", async () => {
          const dataPag = $("#dataPagamentoRecebivel", backdrop).value || hoje;
          fechar();
          try {
            await safeUpdate(sb.db, "receivables", { paid: true, paid_at: dataPag }, [["id", receivableId], ["company_id", sb.companyId]]);
            setInfo("Cobrança marcada como paga.");
            await renderizarRecorrencia(opts);
          } catch (erro) {
            setErro("Falha ao marcar cobrança: " + (erro.message || erro));
          }
        });
      }

      alvo.addEventListener("click", async function (ev) {
        const btn = ev.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const idx = btn.getAttribute("data-idx");
        const customerIdExisting = btn.getAttribute("data-customer-id");
        const ticketId = btn.getAttribute("data-ticket-id");

        if (action === "ir-chamado" && ticketId) {
          ev.preventDefault();
          try { sessionStorage.setItem("sgb_chamados_focus_ticket_id", String(ticketId)); } catch (_) {}
          window.location.hash = "chamados";
          return;
        }
        if (action === "marcar-pago" && id) return marcarRecebivelPago(id);
        if (action === "link-assinatura") {
          const tok = btn.getAttribute("data-token");
          if (tok) {
            const url = linkAssinaturaUrl(tok);
            const backdrop = document.createElement("div");
            backdrop.className = "modal-backdrop";
            backdrop.innerHTML = `<div class="modal" style="max-width:480px;"><div class="modal-head"><div class="modal-title">Link para assinatura digital</div><button class="btn btn-ghost" id="fecharLinkAssinatura">Fechar</button></div><div class="panel" style="margin:16px 0;"><p class="muted" style="margin-bottom:10px;">Envie este link ao cliente por WhatsApp ou e-mail. O cliente abrirá, lerá o contrato e assinará digitalmente.</p><div class="link-box" style="word-break:break-all;padding:10px;background:rgba(0,0,0,.2);border-radius:8px;">${url}</div></div><div class="modal-actions"><button class="btn btn-secondary" id="copiarLinkAssinatura">Copiar link</button><a class="btn btn-primary" href="${url}" target="_blank" rel="noopener">Abrir</a></div></div>`;
            document.body.appendChild(backdrop);
            const fechar = () => document.body.removeChild(backdrop);
            $("#fecharLinkAssinatura", backdrop).addEventListener("click", fechar);
            $("#copiarLinkAssinatura", backdrop).addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); alert("Link copiado."); } catch (_) { alert("Copie manualmente: " + url); } });
          }
          return;
        }
        if (action === "gerar-link-assinatura" && id) {
          try {
            const sigToken = "sig_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
            await sb.db.from("contracts").update({ signature_token: sigToken }).eq("id", id).eq("company_id", sb.companyId);
            setInfo("Link de assinatura gerado. Clique em 'Enviar para assinatura' para copiar.");
            await renderizarRecorrencia(opts);
          } catch (erro) {
            setErro("Falha ao gerar link: " + (erro.message || erro));
          }
          return;
        }
        if (action === "editar-contrato") {
          const contrato = state.contratos.find((c) => String(c.id) === String(id));
          if (contrato) preencherForm(contrato);
          return;
        }
        if (action === "cancelar-contrato") return cancelarContrato(id);
        if (action === "reativar-contrato") return reativarContrato(id);
        if (action === "usar-cadastro") {
          rcCustomerId.value = customerIdExisting || "";
          window.scrollTo({ top: 0, behavior: "smooth" });
          return;
        }
        if (action === "converter-avulso") {
          const av = state.avulsos[Number(idx)];
          if (!av) return;
          try {
            const customerRealId = await ensureCustomer(av);
            rcCustomerId.value = customerRealId || "";
            rcName.value = `Contrato recorrente - ${av.client_name || "Cliente"}`;
            window.scrollTo({ top: 0, behavior: "smooth" });
            setInfo("Cliente avulso preparado para conversão. Agora selecione o SLA, valor e salve o contrato.");
          } catch (erro) {
            setErro("Falha ao preparar conversão do cliente avulso: " + (erro.message || erro));
          }
        }
      });
    } catch (erro) {
      setErro("Falha ao carregar recorrência: " + (erro.message || erro));
      alvo.innerHTML = panel("Recorrência", "Não foi possível montar o módulo de recorrência.", `<div class="placeholder-big">Verifique o acesso às tabelas tickets, customers, contracts, sla_plans e receivables.</div>`);
    }
  }

  function substituirPlaceholders(template, dados) {
    let s = String(template || "");
    Object.entries(dados || {}).forEach(([k, v]) => {
      s = s.replace(new RegExp("\\{\\{" + k + "\\}\\}", "gi"), String(v ?? ""));
    });
    return s;
  }

  async function abrirModalContratoFromTicket(ctx, ticket, onSalvo) {
    if (!ticket) return;
    const sb = ctx.sb;
    const companyId = ctx.companyId;

    const existenteResp = await sb.db.from("contracts").select("id, name").eq("company_id", companyId).eq("ticket_id", ticket.id).limit(1);
    if (!existenteResp.error && existenteResp.data && existenteResp.data.length > 0) {
      const existente = existenteResp.data[0];
      const criarNovo = window.confirm(
        `Este chamado já possui um contrato associado (${existente.name || "Contrato"}). Deseja criar um novo contrato mesmo assim? Clique em OK para criar novo ou Cancelar para editar o existente em Recorrência.`
      );
      if (!criarNovo) {
        if (typeof onSalvo === "function") await onSalvo();
        window.location.hash = "recorrencia";
        return;
      }
    }

    let customerId = ticket.customer_id;
    let customer = null;

    if (!customerId && (ticket.client_name || ticket.client_phone)) {
      const nome = String(ticket.client_name || "").trim().toLowerCase();
      const fone = String(ticket.client_phone || "").replace(/\D/g, "");
      const existentes = await sb.db.from("customers").select("id, name, phone, email, address").eq("company_id", companyId);
      if (!existentes.error && existentes.data && existentes.data.length) {
        const match = existentes.data.find((c) => {
          const cn = String(c.name || "").trim().toLowerCase();
          const cp = String(c.phone || "").replace(/\D/g, "");
          return (nome && cn === nome) || (fone && cp && cp === fone) || (nome && cn.includes(nome));
        });
        if (match) {
          customerId = match.id;
          customer = match;
          await sb.db.from("tickets").update({ customer_id: customerId }).eq("id", ticket.id).eq("company_id", companyId);
        }
      }
      if (!customerId) {
        const key = "cl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const novo = await sb.db.from("customers").insert({
          company_id: companyId,
          name: ticket.client_name || "Cliente",
          phone: ticket.client_phone || null,
          origem_cadastro: "consultor",
          status_cliente: "ativo",
          data_inicio_relacionamento: new Date().toISOString().slice(0, 10),
          recurring_key: key
        }).select("id, name, phone, email, address").single();
        if (!novo.error && novo.data) {
          customerId = novo.data.id;
          customer = novo.data;
          await sb.db.from("tickets").update({ customer_id: customerId }).eq("id", ticket.id).eq("company_id", companyId);
        }
      }
    }

    if (!customerId) {
      alert("Este chamado não possui nome ou telefone do cliente. Edite o chamado e informe pelo menos o nome do cliente.");
      return;
    }

    const [customerResp, slaResp, templateResp, companyResp] = await Promise.all([
      customer ? Promise.resolve({ data: customer }) : sb.db.from("customers").select("id, name, phone, email, address, document").eq("id", customerId).single(),
      sb.db.from("sla_plans").select("id, name, hours_to_expire").eq("company_id", companyId).order("name"),
      window.ModuloConfiguracoes && typeof window.ModuloConfiguracoes.obterTemplateContrato === "function"
        ? window.ModuloConfiguracoes.obterTemplateContrato(sb)
        : Promise.resolve(""),
      sb.db.from("companies").select("name, document, address").eq("id", companyId).maybeSingle()
    ]);

    const customerData = customerResp.data || {};
    const slaPlans = slaResp.data || [];
    const companyData = companyResp?.data || {};
    let template = String(templateResp || "");
    if (!template) {
      template = "CONTRATO - CONTRATANTE: {{NOME_CLIENTE}}, Tel: {{TELEFONE}}, End: {{ENDERECO}}. Valor: {{VALOR_MENSAL}}. Data: {{DATA_HOJE}}. Atendimento: {{DESCRICAO_ATENDIMENTO}}";
    }

    const hoje = new Date();
    const hojeStr = hoje.toLocaleDateString("pt-BR");
    const hojeISO = hoje.toISOString().slice(0, 10);
    const slaOptions = slaPlans.map((p) => `<option value="${p.id}">${p.name || "Plano"} • ${p.hours_to_expire || 0}h</option>`).join("");
    if (!slaPlans.length) {
      alert("Cadastre pelo menos um Plano SLA em Recorrência antes de criar contratos.");
      return;
    }

    const slaHoras = slaPlans[0] ? (slaPlans[0].hours_to_expire || 0) + " horas" : "conforme plano";
    const dadosPlaceholder = {
      NOME_CLIENTE: customerData.name || ticket.client_name || "",
      CPF_CNPJ: customerData.document || "",
      TELEFONE: customerData.phone || ticket.client_phone || "",
      ENDERECO: customerData.address || "",
      EMAIL: customerData.email || "",
      PLANO_SLA: "",
      VALOR_MENSAL: "0,00",
      DATA_INICIO: hojeISO,
      DATA_HOJE: hojeStr,
      DESCRICAO_ATENDIMENTO: (ticket.description || "").slice(0, 500) || "Conforme atendimento registrado no chamado.",
      SLA_EMERGENCIA_HORAS: slaHoras,
      SLA_MANUTENCAO_HORAS: slaHoras,
      PERIODICIDADE_PREVENTIVA: "mensal",
      CONTRATADA_CNPJ: companyData.document || "[PREENCHER]",
      CONTRATADA_ENDERECO: companyData.address || "[PREENCHER]"
    };
    const conteudoPreenchido = substituirPlaceholders(template, dadosPlaceholder);

    function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" style="max-width:700px;">
        <div class="modal-head">
          <div><div class="modal-title">Criar contrato a partir do chamado</div><div class="panel-sub">Dados do cliente e atendimento preenchidos automaticamente</div></div>
          <button class="btn btn-ghost" id="fecharModalContratoTicket">Fechar</button>
        </div>
        <div class="alert error" id="erroModalContratoTicket"></div>
        <div class="grid-form">
          <div><label class="label">Cliente</label><input class="field" value="${esc(customerData.name || ticket.client_name)}" readonly></div>
          <div><label class="label">Plano SLA *</label><select id="modalContratoSla" class="select" required><option value="">Selecione</option>${slaOptions}</select></div>
          <div><label class="label">Valor mensal *</label><input id="modalContratoAmount" class="field" type="number" min="0" step="0.01" value="0" required></div>
          <div><label class="label">Início</label><input id="modalContratoStart" class="field" type="date" value="${hojeISO}"></div>
          <div><label class="label">Próxima cobrança</label><input id="modalContratoNext" class="field" type="date" value="${hojeISO}"></div>
          <div class="full"><label class="label">Nome do contrato</label><input id="modalContratoName" class="field" placeholder="Ex.: Plano mensal manutenção" value="${esc("Contrato - " + (customerData.name || ticket.client_name))}"></div>
          <div class="full"><label class="label">Conteúdo do contrato (editável)</label><textarea id="modalContratoContent" class="textarea" rows="14" style="font-family:monospace;font-size:13px">${esc(conteudoPreenchido)}</textarea></div>
          <div><label class="label">Assinatura digital</label><input id="modalContratoSignedBy" class="field" placeholder="Nome de quem assinou"></div>
          <div><label class="label">Data da assinatura</label><input id="modalContratoSignedAt" class="field" type="datetime-local"></div>
        </div>
        <div class="modal-actions"><button class="btn btn-secondary" id="cancelarModalContratoTicket">Cancelar</button><button class="btn btn-primary" id="salvarModalContratoTicket">Salvar contrato</button></div>
      </div>`;
    document.body.appendChild(backdrop);

    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalContratoTicket", backdrop).addEventListener("click", fechar);
    $("#cancelarModalContratoTicket", backdrop).addEventListener("click", fechar);
    const erroBox = $("#erroModalContratoTicket", backdrop);

    $("#salvarModalContratoTicket", backdrop).addEventListener("click", async () => {
      erroBox.textContent = "";
      erroBox.classList.remove("show");
      const slaId = $("#modalContratoSla", backdrop).value;
      const amount = Number($("#modalContratoAmount", backdrop).value || 0);
      const startDate = $("#modalContratoStart", backdrop).value;
      const nextDate = $("#modalContratoNext", backdrop).value;
      const name = $("#modalContratoName", backdrop).value.trim();
      const content = $("#modalContratoContent", backdrop).value.trim();
      const signedBy = $("#modalContratoSignedBy", backdrop).value.trim() || null;
      const signedAtVal = $("#modalContratoSignedAt", backdrop).value;

      if (!slaId) {
        erroBox.textContent = "Selecione o plano SLA.";
        erroBox.classList.add("show");
        return;
      }
      if (!startDate || !nextDate) {
        erroBox.textContent = "Informe as datas de início e próxima cobrança.";
        erroBox.classList.add("show");
        return;
      }

      const sigToken = "sig_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
      const payload = {
        company_id: companyId,
        customer_id: customerId,
        sla_plan_id: slaId,
        ticket_id: ticket.id,
        start_date: startDate,
        next_billing_date: nextDate,
        status: "ativo",
        name: name || null,
        amount,
        contract_content: content || null,
        signed_by: signedBy,
        signed_at: signedAtVal ? new Date(signedAtVal).toISOString() : null,
        signature_token: sigToken
      };

      const ins = await sb.db.from("contracts").insert(payload).select().limit(1);
      if (ins.error) {
        erroBox.textContent = ins.error.message || "Falha ao salvar contrato.";
        erroBox.classList.add("show");
        return;
      }
      const contrato = ins.data[0];
      if (contrato && contrato.status === "ativo") {
        await sb.db.from("receivables").insert({
          company_id: companyId,
          contract_id: contrato.id,
          customer_id: customerId,
          due_date: nextDate,
          amount,
          paid: false
        });
      }
      fechar();
      if (typeof onSalvo === "function") await onSalvo();
      const linkAssinatura = linkAssinaturaUrl(sigToken);
      const backdropFeedback = document.createElement("div");
      backdropFeedback.className = "modal-backdrop";
      backdropFeedback.innerHTML = `
        <div class="modal" style="max-width:480px;">
          <div class="modal-head"><div class="modal-title">Contrato criado com sucesso</div><button class="btn btn-ghost" id="fecharFeedbackContrato">Fechar</button></div>
          <div class="panel" style="margin:16px 0;">
            <p style="margin:0 0 12px;">Envie o link abaixo ao cliente para assinatura digital. O cliente abrirá, lerá o contrato e assinará.</p>
            <div class="link-box" style="word-break:break-all;padding:10px;background:rgba(0,0,0,.2);border-radius:8px;font-size:12px;margin-bottom:12px;">${linkAssinatura}</div>
            <button class="btn btn-secondary" id="copiarLinkFeedback">Copiar link</button>
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="fecharFeedbackContrato2">Fechar</button>
            <a href="${linkAssinatura}" target="_blank" rel="noopener" class="btn btn-primary" id="abrirLinkAssinatura">Abrir página de assinatura</a>
            <a href="#recorrencia" class="btn btn-primary" id="irRecorrencia">Ir para Recorrência</a>
          </div>
        </div>`;
      document.body.appendChild(backdropFeedback);
      const fecharFeedback = () => document.body.removeChild(backdropFeedback);
      $("#fecharFeedbackContrato", backdropFeedback).addEventListener("click", fecharFeedback);
      $("#fecharFeedbackContrato2", backdropFeedback).addEventListener("click", fecharFeedback);
      $("#irRecorrencia", backdropFeedback).addEventListener("click", fecharFeedback);
      $("#copiarLinkFeedback", backdropFeedback).addEventListener("click", async () => { try { await navigator.clipboard.writeText(linkAssinatura); alert("Link copiado. Envie ao cliente por WhatsApp."); } catch (_) { alert("Copie manualmente."); } });
    });
  }

  window.ModuloRecorrencia = { renderizarRecorrencia, abrirModalContratoFromTicket, substituirPlaceholders };
})();
