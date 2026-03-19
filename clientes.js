(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function escapeHtml(t) {
    return String(t || "")
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

  function gerarRecurringKey() {
    const prefix = "cl";
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return prefix + ts + rand;
  }

  function mostrarModalLinkAssinatura(linkUrl, nomeCliente) {
    const b = document.createElement("div");
    b.className = "modal-backdrop";
    b.id = "modalLinkAssinatura";
    b.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-head">
          <div class="modal-title">Link para assinatura do contrato</div>
          <button type="button" class="btn btn-ghost" id="btnFecharLinkAssinatura">Fechar</button>
        </div>
        <p style="margin:0 0 12px;color:var(--muted);">Cliente <strong style="color:var(--text);">${escapeHtml(nomeCliente)}</strong>. Envie o link abaixo para o cliente assinar o contrato digitalmente.</p>
        <div style="margin-bottom:14px;">
          <input type="text" id="inputLinkAssinatura" class="field" value="${escapeHtml(linkUrl)}" readonly style="font-size:12px;word-break:break-all;">
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" id="btnCopiarLinkAssinatura" class="btn btn-primary">Copiar link</button>
          <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener" class="btn btn-secondary">Abrir página de assinatura</a>
          <a href="#recorrencia" class="btn btn-secondary">Ir para Recorrência</a>
        </div>
      </div>
    `;
    document.body.appendChild(b);
    const input = $("#inputLinkAssinatura", b);
    const copiar = () => {
      input.select();
      navigator.clipboard?.writeText(linkUrl).then(() => { $("#btnCopiarLinkAssinatura", b).textContent = "Copiado!"; setTimeout(() => { $("#btnCopiarLinkAssinatura", b).textContent = "Copiar link"; }, 2000); }).catch(() => document.execCommand("copy"));
    };
    $("#btnCopiarLinkAssinatura", b).addEventListener("click", copiar);
    copiar();
    const fechar = () => { if (b.parentNode) document.body.removeChild(b); };
    $("#btnFecharLinkAssinatura", b).addEventListener("click", fechar);
    b.addEventListener("click", (e) => { if (e.target === b) fechar(); });
  }

  function statusClientePill(status) {
    const s = String(status || "").toLowerCase().trim();
    let cls = "status-pill";
    if (s === "ativo") cls += " status-finalizado";
    else if (s === "suspenso") cls += " status-aguardando_analise";
    else if (s === "inativo" || s === "cancelado") cls += " status-cancelado";
    else cls += " status-aberto";
    return `<span class="${cls}">${escapeHtml(status || "—")}</span>`;
  }

  function injetarCss() {
    if (document.getElementById("css-clientes-modulo")) return;
    const st = document.createElement("style");
    st.id = "css-clientes-modulo";
    st.textContent = `
      .cli-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .cli-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .cli-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .cli-kpi-value{font-size:20px;font-weight:800;color:#eff6ff}
      .cli-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:18px}
      .cli-list-item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer}
      .cli-list-item.active{border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.12)}
      .cli-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .cli-title{font-weight:800;color:#eff6ff}
      .cli-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .cli-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      @media (max-width: 1100px){.cli-grid,.cli-kpis{grid-template-columns:1fr}}
      @media (max-width: 600px){
        .cli-kpis{grid-template-columns:1fr 1fr;gap:8px}
        .cli-kpi-value{font-size:16px}
        .toolbar{grid-template-columns:1fr;gap:8px}
        .toolbar .btn{padding:14px 18px;min-height:48px;font-size:15px}
        #modalCliente .modal{max-width:100%;max-height:90vh;overflow-y:auto;padding:14px}
        #modalCliente .form-grid input,#modalCliente .form-grid select,#modalCliente .form-grid textarea{min-height:48px;font-size:16px}
        #modalCliente .form-grid .btn{padding:14px 20px;min-height:48px;font-size:15px}
        #cliContratoCampos.form-grid{grid-template-columns:1fr!important}
      }
    `;
    document.head.appendChild(st);
  }

  async function listarClientes(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de clientes não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = { busca: "", status: "", clientes: [], selecionado: null };

    alvo.innerHTML = `
      <div class="cli-kpis">
        <div class="cli-kpi"><div class="cli-kpi-label">Total</div><div class="cli-kpi-value" id="kpiClientesTotal">0</div></div>
        <div class="cli-kpi"><div class="cli-kpi-label">Ativos</div><div class="cli-kpi-value" id="kpiClientesAtivos">0</div></div>
        <div class="cli-kpi"><div class="cli-kpi-label">Suspensos</div><div class="cli-kpi-value" id="kpiClientesSuspensos">0</div></div>
        <div class="cli-kpi"><div class="cli-kpi-label">Inativos</div><div class="cli-kpi-value" id="kpiClientesInativos">0</div></div>
      </div>

      <div class="toolbar">
        <input id="filtroBuscaCliente" class="field" placeholder="Buscar por nome, telefone ou e-mail">
        <select id="filtroStatusCliente" class="select">
          <option value="">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="suspenso">Suspensos</option>
          <option value="inativo">Inativos</option>
        </select>
        <button id="btnNovoCliente" class="btn btn-primary">Novo Cliente</button>
      </div>

      <div class="cli-grid">
        <div class="panel">
          <h2>Lista de Clientes</h2>
          <div class="panel-sub">Clientes recorrentes cadastrados</div>
          <div id="listaClientesWrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe do Cliente</h2>
          <div class="panel-sub">Dados e ações</div>
          <div id="detalheClienteWrap" class="empty">Selecione um cliente.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaCliente", alvo).addEventListener("input", async (e) => {
      state.busca = e.target.value || "";
      await carregarLista();
    });

    $("#filtroStatusCliente", alvo).addEventListener("change", async (e) => {
      state.status = e.target.value || "";
      await carregarLista();
    });

    $("#btnNovoCliente", alvo).addEventListener("click", () => abrirModalCliente(ctx, null, carregarLista));

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaClientesWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando clientes...</div>`;

      const cols = "id, name, phone, email, address, notes, origem_cadastro, data_inicio_relacionamento, status_cliente, observacoes_comerciais, recurring_key, created_at";
      const { data, error } = await ctx.sb.db
        .from("customers")
        .select(cols)
        .eq("company_id", ctx.companyId)
        .order("name", { ascending: true });

      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar clientes.</div>`;
        throw error;
      }

      let lista = data || [];

      if (state.status) {
        const s = state.status.toLowerCase();
        lista = lista.filter((c) => String(c.status_cliente || "").toLowerCase() === s);
      }

      const busca = state.busca.trim().toLowerCase();
      if (busca) {
        lista = lista.filter((c) =>
          [c.name, c.phone, c.email].join(" ").toLowerCase().includes(busca)
        );
      }

      state.clientes = lista;

      const ativos = lista.filter((c) => String(c.status_cliente || "").toLowerCase() === "ativo");
      const suspensos = lista.filter((c) => String(c.status_cliente || "").toLowerCase() === "suspenso");
      const inativos = lista.filter((c) => ["inativo", "cancelado"].includes(String(c.status_cliente || "").toLowerCase()));

      $("#kpiClientesTotal").textContent = String(lista.length);
      $("#kpiClientesAtivos").textContent = String(ativos.length);
      $("#kpiClientesSuspensos").textContent = String(suspensos.length);
      $("#kpiClientesInativos").textContent = String(inativos.length);

      if (!lista.length) {
        wrap.innerHTML = `<div class="empty">Nenhum cliente encontrado.</div>`;
        $("#detalheClienteWrap", alvo).innerHTML = `<div class="empty">Selecione um cliente.</div>`;
        return;
      }

      wrap.innerHTML = lista.map((c) => `
        <div class="cli-list-item ${state.selecionado && state.selecionado.id === c.id ? "active" : ""}" data-id="${c.id}">
          <div class="cli-top">
            <div>
              <div class="cli-title">${escapeHtml(c.name || "Sem nome")}</div>
              <div class="cli-meta">${escapeHtml(c.phone || "—")}${c.email ? " • " + escapeHtml(c.email) : ""}</div>
            </div>
            <div>${statusClientePill(c.status_cliente)}</div>
          </div>
          <div class="cli-meta">${c.recurring_key ? "Chave: " + escapeHtml(c.recurring_key) : "—"}</div>
          <div class="cli-meta">Início: ${formatarData(c.data_inicio_relacionamento)}</div>
        </div>
      `).join("");

      $$(".cli-list-item", wrap).forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          state.selecionado = state.clientes.find((x) => x.id === id) || null;
          await carregarDetalhe();
          await carregarLista();
        });
      });

      if (!state.selecionado) state.selecionado = state.clientes[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheClienteWrap", alvo);
      if (!state.selecionado) {
        wrap.innerHTML = `<div class="empty">Selecione um cliente.</div>`;
        return;
      }

      const c = state.selecionado;
      let contratoPendente = null;
      try {
        const r = await ctx.sb.db.from("contracts").select("id, signature_token, signed_at").eq("company_id", ctx.companyId).eq("customer_id", c.id).is("signed_at", null).not("signature_token", "is", null).limit(1);
        if (!r.error && r.data && r.data[0]) contratoPendente = r.data[0];
      } catch (_) {}
      const path = (window.location.pathname || "").replace(/\/[^/]*$/, "") || "";
      const base = path ? (path.endsWith("/") ? path : path + "/") : "/";
      const linkAssinatura = contratoPendente ? (window.location.origin || "") + base + "assinatura-contrato.html?t=" + encodeURIComponent(contratoPendente.signature_token || "") : "";
      const htmlBtnAssinatura = contratoPendente ? "<button id=\"btnEnviarContratoAssinatura\" class=\"btn btn-primary\" data-link=\"" + escapeHtml(linkAssinatura) + "\">Enviar contrato para assinatura</button>" : "";
      const htmlObs = c.observacoes_comerciais ? "<div><strong>Observações:</strong> " + escapeHtml(c.observacoes_comerciais) + "</div>" : "";
      const htmlNotes = c.notes ? "<div><strong>Notas:</strong> " + escapeHtml(c.notes) + "</div>" : "";
      wrap.innerHTML = "<div class=\"cli-actions\">" +
        "<button id=\"btnEditarCliente\" class=\"btn btn-secondary\">Editar</button>" +
        "<button id=\"btnHubCliente\" class=\"btn btn-primary\">Ver hub do cliente</button>" +
        "<a href=\"#chamados\" class=\"btn btn-secondary\">Ver chamados</a>" +
        "<a href=\"#recorrencia\" class=\"btn btn-secondary\">Recorrência</a>" +
        htmlBtnAssinatura +
        "</div>" +
        "<div class=\"quote-info-box\">" +
        "<div><strong>Nome:</strong> " + escapeHtml(c.name || "—") + "</div>" +
        "<div><strong>Telefone:</strong> " + escapeHtml(c.phone || "—") + "</div>" +
        "<div><strong>E-mail:</strong> " + escapeHtml(c.email || "—") + "</div>" +
        "<div><strong>Endereço:</strong> " + escapeHtml(c.address || "—") + "</div>" +
        "<div><strong>Status:</strong> " + statusClientePill(c.status_cliente) + "</div>" +
        "<div><strong>Origem cadastro:</strong> " + escapeHtml(c.origem_cadastro || "—") + "</div>" +
        "<div><strong>Início relacionamento:</strong> " + formatarData(c.data_inicio_relacionamento) + "</div>" +
        "<div><strong>Chave recorrência:</strong> " + escapeHtml(c.recurring_key || "—") + "</div>" +
        htmlObs + htmlNotes +
        "</div>";

      $("#btnEditarCliente", wrap).addEventListener("click", () => abrirModalCliente(ctx, c, carregarLista));
      const btnHub = $("#btnHubCliente", wrap);
      if (btnHub && window.ModuloClientesRecorrentes && typeof window.ModuloClientesRecorrentes.abrirHubCliente === "function") {
        btnHub.addEventListener("click", () => window.ModuloClientesRecorrentes.abrirHubCliente({ sb: ctx.sb, companyId: ctx.companyId }, c));
      }
      const elEnviarAssinatura = $("#btnEnviarContratoAssinatura", wrap);
      if (elEnviarAssinatura) {
        const link = elEnviarAssinatura.getAttribute("data-link") || "";
        elEnviarAssinatura.addEventListener("click", () => mostrarModalLinkAssinatura(link, c.name || "Cliente"));
      }
    }
  }

  function abrirModalCliente(ctx, cliente, onSalvo) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "modalCliente";
    const hoje = new Date().toISOString().slice(0, 10);
    const isNovo = !cliente;
    const tituloModal = isNovo ? "Novo Cliente" : "Editar Cliente";
    const selOrigem = cliente && cliente.origem_cadastro === "consultor" ? "selected" : "";
    const selOrigemTel = cliente && cliente.origem_cadastro === "telefone" ? "selected" : "";
    const selAtivo = cliente && cliente.status_cliente === "ativo" ? "selected" : "";
    const selSuspenso = cliente && cliente.status_cliente === "suspenso" ? "selected" : "";
    const selInativo = cliente && cliente.status_cliente === "inativo" ? "selected" : "";
    const readonlyKey = cliente ? "" : "readonly";

    backdrop.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-head">
          <div class="modal-title">${tituloModal}</div>
          <button type="button" class="btn btn-ghost" id="btnFecharModalClienteX">Fechar</button>
        </div>
        <form id="formCliente" class="form-grid">
          <input type="hidden" id="cliId" value="${cliente ? cliente.id : ""}">
          <div class="field" style="grid-column:1/-1;"><label>Nome *</label><input id="cliName" type="text" required placeholder="Nome do cliente" value="${escapeHtml(cliente ? cliente.name : "")}"></div>
          <div class="field"><label>CPF/CNPJ</label><input id="cliDocument" type="text" placeholder="Apenas números - preenche automático" value="${escapeHtml(cliente ? cliente.document : "")}" maxlength="18"></div>
          <div class="field"><label>Telefone</label><input id="cliPhone" type="text" placeholder="(11) 99999-9999" value="${escapeHtml(cliente ? cliente.phone : "")}"></div>
          <div class="field"><label>E-mail</label><input id="cliEmail" type="email" placeholder="email@exemplo.com" value="${escapeHtml(cliente ? cliente.email : "")}"></div>
          <div class="field" style="grid-column:1/-1;"><label>Endereço</label><input id="cliAddress" type="text" placeholder="Endereço completo" value="${escapeHtml(cliente ? cliente.address : "")}"></div>
          <div class="field" style="grid-column:1/-1;border-top:1px solid var(--line);padding-top:12px;margin-top:8px;"><strong>Portão (consultor em campo)</strong></div>
          <div class="field"><label>Tipo portão</label><select id="cliGateModel"><option value="">Selecione</option></select></div>
          <div class="field"><label>Motorização</label><select id="cliMotorModel"><option value="">Selecione</option></select></div>
          <div class="field"><label>Largura (cm)</label><input id="cliGateLargura" type="number" placeholder="Ex: 300" min="0" step="1"></div>
          <div class="field"><label>Altura (cm)</label><input id="cliGateAltura" type="number" placeholder="Ex: 220" min="0" step="1"></div>
          <div class="field" style="grid-column:1/-1;border-top:1px solid var(--line);padding-top:12px;margin-top:8px;"><label><input type="checkbox" id="cliCriarContrato"> Criar contrato e enviar link de assinatura</label></div>
          <div id="cliContratoCampos" style="grid-column:1/-1;display:none;grid-template-columns:1fr 1fr;gap:12px;" class="form-grid">
            <div class="field"><label>Plano SLA *</label><select id="cliContratoSla"><option value="">Selecione</option></select></div>
            <div class="field"><label>Valor mensal *</label><input id="cliContratoValor" type="number" min="0" step="0.01" placeholder="0,00"></div>
          </div>
          <div class="field"><label>Origem cadastro</label><select id="cliOrigem"><option value="consultor" ${selOrigem}>Consultor</option><option value="telefone" ${selOrigemTel}>Telefone</option></select></div>
          <div class="field"><label>Status</label><select id="cliStatus"><option value="ativo" ${selAtivo}>Ativo</option><option value="suspenso" ${selSuspenso}>Suspenso</option><option value="inativo" ${selInativo}>Inativo</option></select></div>
          <div class="field"><label>Início relacionamento</label><input id="cliDataInicio" type="date" value="${cliente && cliente.data_inicio_relacionamento ? String(cliente.data_inicio_relacionamento).slice(0, 10) : hoje}"></div>
          <div class="field"><label>Chave recorrência</label><input id="cliRecurringKey" type="text" placeholder="Gerada automaticamente" value="${escapeHtml(cliente ? cliente.recurring_key : "")}" ${readonlyKey}></div>
          <div class="field" style="grid-column:1/-1;"><label>Observações comerciais</label><textarea id="cliObsComerciais" rows="2" placeholder="Observações do consultor">${escapeHtml(cliente ? cliente.observacoes_comerciais : "")}</textarea></div>
          <div class="field" style="grid-column:1/-1;"><label>Notas</label><textarea id="cliNotes" rows="2" placeholder="Notas gerais">${escapeHtml(cliente ? cliente.notes : "")}</textarea></div>
          <div style="grid-column:1/-1;display:flex;gap:10px;margin-top:10px;">
            <button type="submit" class="btn btn-primary">Salvar</button>
            <button type="button" id="btnFecharModalCliente" class="btn btn-secondary">Cancelar</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    if (isNovo) {
      $("#cliRecurringKey", backdrop).value = gerarRecurringKey();
    }

    async function carregarGateMotorModels() {
      try {
        const [gates, motors, slas] = await Promise.all([
          ctx.sb.db.from("gate_models").select("id, name, gate_type, default_width_cm, default_height_cm").eq("company_id", ctx.companyId).eq("is_active", true).order("name"),
          ctx.sb.db.from("motorization_models").select("id, name").eq("company_id", ctx.companyId).eq("is_active", true).order("name"),
          ctx.sb.db.from("sla_plans").select("id, name").eq("company_id", ctx.companyId).order("name")
        ]);
        const gateOpts = (gates.data || []).map((g) => `<option value="${g.id}" data-w="${g.default_width_cm || ""}" data-h="${g.default_height_cm || ""}">${escapeHtml(g.name)} (${g.gate_type})</option>`).join("");
        const motorOpts = (motors.data || []).map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
        const slaOpts = (slas.data || []).map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
        $("#cliGateModel", backdrop).innerHTML = "<option value=\"\">Selecione</option>" + gateOpts;
        $("#cliMotorModel", backdrop).innerHTML = "<option value=\"\">Selecione</option>" + motorOpts;
        $("#cliContratoSla", backdrop).innerHTML = "<option value=\"\">Selecione</option>" + slaOpts;
      } catch (_) {}
    }
    carregarGateMotorModels();

    $("#cliGateModel", backdrop).addEventListener("change", function () {
      const opt = this.options[this.selectedIndex];
      if (opt && opt.value && opt.dataset.w) { $("#cliGateLargura", backdrop).value = opt.dataset.w || ""; $("#cliGateAltura", backdrop).value = opt.dataset.h || ""; }
    });

    $("#cliCriarContrato", backdrop).addEventListener("change", function () {
      $("#cliContratoCampos", backdrop).style.display = this.checked ? "grid" : "none";
      if (this.checked) $("#cliContratoCampos", backdrop).style.gridTemplateColumns = "1fr 1fr";
    });

    $("#cliDocument", backdrop).addEventListener("blur", async function () {
      const doc = this.value.replace(/\D/g, "");
      if (doc.length !== 14) return;
      try {
        const r = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + doc);
        if (!r.ok) return;
        const d = await r.json();
        if (d.razao_social && !$("#cliName", backdrop).value.trim()) $("#cliName", backdrop).value = d.razao_social || d.nome_fantasia || "";
        if (d.logradouro && !$("#cliAddress", backdrop).value.trim()) {
          const end = [d.logradouro, d.numero, d.complemento, d.bairro, d.municipio, d.uf, d.cep].filter(Boolean).join(", ");
          $("#cliAddress", backdrop).value = end;
        }
      } catch (_) {}
    });

    $("#formCliente", backdrop).addEventListener("submit", async (e) => {
      e.preventDefault();
      ctx.setErro("");
      ctx.setInfo("");

      const doc = $("#cliDocument", backdrop).value.trim().replace(/\D/g, "");
      const payload = {
        company_id: ctx.companyId,
        name: $("#cliName", backdrop).value.trim(),
        document: doc || null,
        phone: $("#cliPhone", backdrop).value.trim() || null,
        email: $("#cliEmail", backdrop).value.trim() || null,
        address: $("#cliAddress", backdrop).value.trim() || null,
        origem_cadastro: $("#cliOrigem", backdrop).value || "consultor",
        status_cliente: $("#cliStatus", backdrop).value || "ativo",
        data_inicio_relacionamento: $("#cliDataInicio", backdrop).value || null,
        observacoes_comerciais: $("#cliObsComerciais", backdrop).value.trim() || null,
        notes: $("#cliNotes", backdrop).value.trim() || null
      };

      const recurringKey = $("#cliRecurringKey", backdrop).value.trim();
      if (recurringKey) payload.recurring_key = recurringKey;

      if (!payload.name) return ctx.setErro("Informe o nome do cliente.");

      const criarContrato = $("#cliCriarContrato", backdrop).checked;
      const slaId = criarContrato ? $("#cliContratoSla", backdrop).value : null;
      const valorContrato = criarContrato ? Number($("#cliContratoValor", backdrop).value || 0) : 0;
      if (criarContrato && (!slaId || valorContrato <= 0)) return ctx.setErro("Para criar contrato, selecione o SLA e informe o valor mensal.");

      try {
        let customerId;
        if (isNovo) {
          const r = await ctx.sb.db.from("customers").insert(payload).select().limit(1);
          if (r.error) throw r.error;
          customerId = r.data[0].id;
          const gateModelId = $("#cliGateModel", backdrop).value || null;
          const motorId = $("#cliMotorModel", backdrop).value || null;
          const largura = $("#cliGateLargura", backdrop).value || null;
          const altura = $("#cliGateAltura", backdrop).value || null;
          if (gateModelId || motorId || largura || altura) {
            try {
              await ctx.sb.db.from("customer_gates").insert({ company_id: ctx.companyId, customer_id: customerId, gate_model_id: gateModelId || null, motorization_model_id: motorId || null, width_cm: largura || null, height_cm: altura || null });
            } catch (_) {}
          }
          ctx.setInfo("Cliente cadastrado com sucesso.");
        } else {
          customerId = $("#cliId", backdrop).value;
          const r = await ctx.sb.db.from("customers").update(payload).eq("id", customerId).select().limit(1);
          if (r.error) throw r.error;
          ctx.setInfo("Cliente atualizado com sucesso.");
        }

        if (criarContrato && customerId) {
          const hoje = new Date().toISOString().slice(0, 10);
          const templateResp = window.ModuloConfiguracoes && typeof window.ModuloConfiguracoes.obterTemplateContrato === "function" ? await window.ModuloConfiguracoes.obterTemplateContrato(ctx.sb) : "";
          const customerData = isNovo ? { ...payload, id: customerId } : (await ctx.sb.db.from("customers").select("*").eq("id", customerId).single()).data || {};
          const slaPlans = (await ctx.sb.db.from("sla_plans").select("id, name, hours_to_expire").eq("company_id", ctx.companyId).order("name")).data || [];
          const sla = slaPlans.find((p) => p.id === slaId) || slaPlans[0];
          const slaHoras = sla ? (sla.hours_to_expire || 0) + " horas" : "conforme plano";
          let content = String(templateResp || "").replace(/\{\{NOME_CLIENTE\}\}/gi, customerData.name || "").replace(/\{\{CPF_CNPJ\}\}/gi, customerData.document || "").replace(/\{\{TELEFONE\}\}/gi, customerData.phone || "").replace(/\{\{ENDERECO\}\}/gi, customerData.address || "").replace(/\{\{EMAIL\}\}/gi, customerData.email || "").replace(/\{\{VALOR_MENSAL\}\}/gi, valorContrato.toFixed(2)).replace(/\{\{PLANO_SLA\}\}/gi, sla ? sla.name : "").replace(/\{\{DATA_INICIO\}\}/gi, hoje).replace(/\{\{DATA_HOJE\}\}/gi, new Date().toLocaleDateString("pt-BR")).replace(/\{\{DESCRICAO_ATENDIMENTO\}\}/gi, "Cadastro em campo").replace(/\{\{SLA_EMERGENCIA_HORAS\}\}/gi, slaHoras).replace(/\{\{SLA_MANUTENCAO_HORAS\}\}/gi, slaHoras).replace(/\{\{PERIODICIDADE_PREVENTIVA\}\}/gi, "mensal");
          const sigToken = "sig_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 12);
          const insContract = await ctx.sb.db.from("contracts").insert({ company_id: ctx.companyId, customer_id: customerId, sla_plan_id: slaId, start_date: hoje, next_billing_date: hoje, status: "ativo", name: "Contrato - " + (customerData.name || "Cliente"), amount: valorContrato, contract_content: content, signature_token: sigToken }).select().limit(1);
          if (!insContract.error && insContract.data[0]) {
            await ctx.sb.db.from("receivables").insert({ company_id: ctx.companyId, contract_id: insContract.data[0].id, customer_id: customerId, due_date: hoje, amount: valorContrato, paid: false });
            const path = (window.location.pathname || "").replace(/\/[^/]*$/, "") || "";
            const base = path ? (path.endsWith("/") ? path : path + "/") : "/";
            const linkUrl = (window.location.origin || "") + base + "assinatura-contrato.html?t=" + encodeURIComponent(sigToken);
            document.body.removeChild(backdrop);
            if (typeof onSalvo === "function") await onSalvo();
            mostrarModalLinkAssinatura(linkUrl, customerData.name || "Cliente");
            return;
          }
        }

        document.body.removeChild(backdrop);
        if (typeof onSalvo === "function") await onSalvo();
      } catch (err) {
        ctx.setErro("Erro ao salvar: " + (err.message || err));
      }
    });

    const fechar = () => { if (backdrop.parentNode) document.body.removeChild(backdrop); };
    $("#btnFecharModalCliente", backdrop).addEventListener("click", fechar);
    const btnFecharX = $("#btnFecharModalClienteX", backdrop);
    if (btnFecharX) btnFecharX.addEventListener("click", fechar);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) fechar();
    });
  }

  window.ModuloClientes = window.ModuloClientes || {};
  window.ModuloClientes.listarClientes = listarClientes;
  window.ModuloClientes.abrirModalCliente = abrirModalCliente;
})();
