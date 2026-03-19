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
      wrap.innerHTML = `
        <div class="cli-actions">
          <button id="btnEditarCliente" class="btn btn-secondary">Editar</button>
          <button id="btnHubCliente" class="btn btn-primary">Ver hub do cliente</button>
          <a href="#chamados" class="btn btn-secondary">Ver chamados</a>
        </div>

        <div class="quote-info-box">
          <div><strong>Nome:</strong> ${escapeHtml(c.name || "—")}</div>
          <div><strong>Telefone:</strong> ${escapeHtml(c.phone || "—")}</div>
          <div><strong>E-mail:</strong> ${escapeHtml(c.email || "—")}</div>
          <div><strong>Endereço:</strong> ${escapeHtml(c.address || "—")}</div>
          <div><strong>Status:</strong> ${statusClientePill(c.status_cliente)}</div>
          <div><strong>Origem cadastro:</strong> ${escapeHtml(c.origem_cadastro || "—")}</div>
          <div><strong>Início relacionamento:</strong> ${formatarData(c.data_inicio_relacionamento)}</div>
          <div><strong>Chave recorrência:</strong> ${escapeHtml(c.recurring_key || "—")}</div>
          ${c.observacoes_comerciais ? `<div><strong>Observações:</strong> ${escapeHtml(c.observacoes_comerciais)}</div>` : ""}
          ${c.notes ? `<div><strong>Notas:</strong> ${escapeHtml(c.notes)}</div>` : ""}
        </div>
      `;

      $("#btnEditarCliente", wrap).addEventListener("click", () => abrirModalCliente(ctx, c, carregarLista));
      const btnHub = $("#btnHubCliente", wrap);
      if (btnHub && window.ModuloClientesRecorrentes && typeof window.ModuloClientesRecorrentes.abrirHubCliente === "function") {
        btnHub.addEventListener("click", () => window.ModuloClientesRecorrentes.abrirHubCliente({ sb: ctx.sb, companyId: ctx.companyId }, c));
      }
    }
  }

  function abrirModalCliente(ctx, cliente, onSalvo) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.id = "modalCliente";
    const hoje = new Date().toISOString().slice(0, 10);
    const isNovo = !cliente;

    backdrop.innerHTML = `
      <div class="modal" style="max-width:520px;">
        <div class="modal-head">
          <div class="modal-title">${isNovo ? "Novo Cliente" : "Editar Cliente"}</div>
          <button type="button" class="btn btn-ghost" id="btnFecharModalClienteX">Fechar</button>
        </div>
        <form id="formCliente" class="form-grid">
          <input type="hidden" id="cliId" value="${cliente ? cliente.id : ""}">
          <div class="field" style="grid-column:1/-1;"><label>Nome *</label><input id="cliName" type="text" required placeholder="Nome do cliente" value="${escapeHtml(cliente ? cliente.name : "")}"></div>
          <div class="field"><label>Telefone</label><input id="cliPhone" type="text" placeholder="(11) 99999-9999" value="${escapeHtml(cliente ? cliente.phone : "")}"></div>
          <div class="field"><label>E-mail</label><input id="cliEmail" type="email" placeholder="email@exemplo.com" value="${escapeHtml(cliente ? cliente.email : "")}"></div>
          <div class="field" style="grid-column:1/-1;"><label>Endereço</label><input id="cliAddress" type="text" placeholder="Endereço completo" value="${escapeHtml(cliente ? cliente.address : "")}"></div>
          <div class="field"><label>Origem cadastro</label><select id="cliOrigem"><option value="consultor" ${cliente && cliente.origem_cadastro === "consultor" ? "selected" : ""}>Consultor</option><option value="telefone" ${cliente && cliente.origem_cadastro === "telefone" ? "selected" : ""}>Telefone</option></select></div>
          <div class="field"><label>Status</label><select id="cliStatus"><option value="ativo" ${cliente && cliente.status_cliente === "ativo" ? "selected" : ""}>Ativo</option><option value="suspenso" ${cliente && cliente.status_cliente === "suspenso" ? "selected" : ""}>Suspenso</option><option value="inativo" ${cliente && cliente.status_cliente === "inativo" ? "selected" : ""}>Inativo</option></select></div>
          <div class="field"><label>Início relacionamento</label><input id="cliDataInicio" type="date" value="${cliente && cliente.data_inicio_relacionamento ? String(cliente.data_inicio_relacionamento).slice(0, 10) : hoje}"></div>
          <div class="field"><label>Chave recorrência</label><input id="cliRecurringKey" type="text" placeholder="Gerada automaticamente" value="${escapeHtml(cliente ? cliente.recurring_key : "")}" ${cliente ? "" : "readonly"}></div>
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

    $("#formCliente", backdrop).addEventListener("submit", async (e) => {
      e.preventDefault();
      ctx.setErro("");
      ctx.setInfo("");

      const payload = {
        company_id: ctx.companyId,
        name: $("#cliName", backdrop).value.trim(),
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

      try {
        if (isNovo) {
          const r = await ctx.sb.db.from("customers").insert(payload).select().limit(1);
          if (r.error) throw r.error;
          ctx.setInfo("Cliente cadastrado com sucesso.");
        } else {
          const id = $("#cliId", backdrop).value;
          const r = await ctx.sb.db.from("customers").update(payload).eq("id", id).select().limit(1);
          if (r.error) throw r.error;
          ctx.setInfo("Cliente atualizado com sucesso.");
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
