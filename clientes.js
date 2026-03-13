
(function () {
  "use strict";

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.from((r || document).querySelectorAll(s)); }

  function escapeHtml(t) {
    return String(t || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }

  function onlyDigits(v) { return String(v || "").replace(/\D+/g, ""); }
  function normalizeText(v) {
    return String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function badgeAtivo(flag) {
    return flag !== false
      ? '<span class="status-pill" style="background:rgba(20,195,142,.16);color:#dcfff3">Ativo</span>'
      : '<span class="status-pill" style="background:rgba(255,93,108,.16);color:#ffdbe0">Inativo</span>';
  }

  function badgePessoa(tipo) {
    return tipo === "PJ"
      ? '<span class="status-pill" style="background:rgba(61,134,255,.16);color:#dceaff">Pessoa Jurídica</span>'
      : '<span class="status-pill" style="background:rgba(255,192,86,.16);color:#fff0c7">Pessoa Física</span>';
  }

  function fmtCpfCnpj(v) {
    const n = onlyDigits(v);
    if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
    return v || "";
  }

  function fmtPhone(v) {
    const n = onlyDigits(v);
    if (n.length === 11) return n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    if (n.length === 10) return n.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    return v || "";
  }

  function extractMeta(notes) {
    const text = String(notes || "");
    const match = text.match(/^\[SGB_META\](\{.*\})$/m);
    if (!match) {
      return {
        person_type: "PF",
        document: "",
        trade_name: "",
        city: "",
        state: "",
        cep: "",
        notes_text: text
      };
    }
    try {
      const meta = JSON.parse(match[1]);
      const notesText = text.replace(match[0], "").trim();
      return {
        person_type: meta.person_type || "PF",
        document: meta.document || "",
        trade_name: meta.trade_name || "",
        city: meta.city || "",
        state: meta.state || "",
        cep: meta.cep || "",
        notes_text: notesText
      };
    } catch (_) {
      return {
        person_type: "PF",
        document: "",
        trade_name: "",
        city: "",
        state: "",
        cep: "",
        notes_text: text
      };
    }
  }

  function buildNotes(meta, notesText) {
    const payload = {
      person_type: meta.person_type || "PF",
      document: onlyDigits(meta.document || ""),
      trade_name: meta.trade_name || "",
      city: meta.city || "",
      state: meta.state || "",
      cep: onlyDigits(meta.cep || "")
    };
    const body = String(notesText || "").trim();
    return `[SGB_META]${JSON.stringify(payload)}${body ? "\n\n" + body : ""}`;
  }

  function injectCss() {
    if (document.getElementById("css-clientes-v3")) return;
    const st = document.createElement("style");
    st.id = "css-clientes-v3";
    st.textContent = `
      .client-grid{display:grid;grid-template-columns:1.35fr .95fr;gap:14px}
      .client-list{display:flex;flex-direction:column;gap:10px}
      .client-card{padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:14px;background:rgba(255,255,255,.03);cursor:pointer}
      .client-card.active{border-color:rgba(61,134,255,.55);box-shadow:0 0 0 1px rgba(61,134,255,.18) inset}
      .client-name{font-weight:800;color:#eff6ff;font-size:16px}
      .client-meta{font-size:12px;color:#9db3d6}
      .client-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-bottom:14px}
      .client-kpi{padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:14px;background:rgba(255,255,255,.03)}
      .client-kpi-label{font-size:12px;color:#9db3d6}
      .client-kpi-value{font-size:26px;font-weight:800;color:#eff6ff;margin-top:6px}
      .client-tabs{display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid rgba(36,59,97,.55)}
      .client-tab{padding:10px 16px;cursor:pointer;border-radius:8px 8px 0 0;font-weight:700;color:#9db3d6}
      .client-tab:hover{color:#eff6ff;background:rgba(255,255,255,.03)}
      .client-tab.active{color:#eff6ff;background:rgba(61,134,255,.18);border-bottom:2px solid var(--primary)}
      .contact-mini{padding:10px;border:1px solid rgba(108,152,232,.14);border-radius:10px;margin-bottom:8px;background:rgba(255,255,255,.02)}
      .contact-mini-name{font-weight:700;color:#eff6ff}
      .contact-mini-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .grid-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .grid-form .full{grid-column:1/-1}
      .label{display:block;font-size:13px;color:#c8d8f4;font-weight:700;margin-bottom:6px}
      .field[readonly]{opacity:.8;background:rgba(255,255,255,.02)}
      .client-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
      .client-detail-grid .full{grid-column:1/-1}
      .client-detail-box{padding:12px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.02)}
      .client-detail-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .client-detail-value{font-weight:700;color:#eff6ff}
      .client-hint{font-size:12px;color:#9db3d6;margin-top:6px}
      @media (max-width:1100px){
        .client-grid{grid-template-columns:1fr}
        .client-summary{grid-template-columns:repeat(2,minmax(120px,1fr))}
        .client-detail-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(st);
  }

  async function fetchCnpjData(cnpjDigits) {
    const r = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + encodeURIComponent(cnpjDigits));
    if (!r.ok) {
      let msg = "Não foi possível consultar o CNPJ.";
      try {
        const j = await r.json();
        msg = j.message || j.name || msg;
      } catch (_) {}
      throw new Error(msg);
    }
    return r.json();
  }

  function hasClientContactsEnabled() {
    return !!(window.sbConfig && window.sbConfig.enableClientContacts === true);
  }

  async function listarClientes(ctx) {
    injectCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) return;

    const companyId = (ctx.companyId || ctx.sb?.companyId || window.sb?.companyId);
    if (!companyId) {
      alvo.innerHTML = '<div class="empty">company_id não configurado. Verifique config.js.</div>';
      return;
    }

    const state = {
      busca: "",
      ativo: "ativos",
      clientes: [],
      selecionado: null,
      aba: "dados",
      contatos: [],
      contatosHabilitados: hasClientContactsEnabled(),
      contatosDisponiveis: hasClientContactsEnabled()
    };

    alvo.innerHTML = `
      <div class="client-summary">
        <div class="client-kpi"><div class="client-kpi-label">Total de clientes</div><div class="client-kpi-value" id="kpiTotal">0</div></div>
        <div class="client-kpi"><div class="client-kpi-label">Ativos</div><div class="client-kpi-value" id="kpiAtivos">0</div></div>
        <div class="client-kpi"><div class="client-kpi-label">Pessoas jurídicas</div><div class="client-kpi-value" id="kpiPJ">0</div></div>
        <div class="client-kpi"><div class="client-kpi-label">Com contatos</div><div class="client-kpi-value" id="kpiContatos">0</div></div>
      </div>

      <div class="toolbar">
        <input id="clientBusca" class="field" placeholder="Buscar por nome, fantasia, CNPJ, e-mail ou telefone" style="grid-column:span 2" />
        <select id="clientAtivo" class="select">
          <option value="ativos">Somente ativos</option>
          <option value="todos">Todos</option>
          <option value="inativos">Somente inativos</option>
        </select>
        <button id="btnNovoCliente" class="btn btn-primary">Novo Cliente</button>
      </div>

      <div class="client-grid">
        <div class="panel">
          <h2>Lista de Clientes</h2>
          <div class="panel-sub">Selecione um cliente para ver os dados completos, contatos e histórico básico.</div>
          <div id="clientLista" class="client-list"></div>
        </div>
        <div class="panel">
          <h2>Detalhe do Cliente</h2>
          <div class="panel-sub">Visualização e manutenção rápida do cadastro.</div>
          <div id="clientDetalhe" class="empty">Nenhum cliente selecionado.</div>
        </div>
      </div>
    `;

    $("#clientBusca", alvo).addEventListener("input", async () => {
      state.busca = $("#clientBusca", alvo).value || "";
      await carregar();
    });
    $("#clientAtivo", alvo).addEventListener("change", async () => {
      state.ativo = $("#clientAtivo", alvo).value || "ativos";
      await carregar();
    });
    $("#btnNovoCliente", alvo).addEventListener("click", () => abrirModalCliente(ctx, null, carregar));

    await carregar();

    async function carregar() {
      const r = await ctx.sb.db
        .from("customers")
        .select("id, company_id, name, email, phone, address, notes, is_active, created_at, updated_at")
        .eq("company_id", companyId)
        .order("name", { ascending: true });

      if (r.error) {
        $("#clientLista", alvo).innerHTML = '<div class="empty">Falha ao carregar clientes: ' + escapeHtml(r.error.message || "Erro") + '</div>';
        $("#clientDetalhe", alvo).innerHTML = '<div class="empty">Verifique se a tabela customers existe e tem RLS configurado.</div>';
        return;
      }

      const all = (r.data || []).map(c => {
        const meta = extractMeta(c.notes);
        return {
          ...c,
          is_active: c.is_active !== false,
          person_type: meta.person_type || "PF",
          document: meta.document || "",
          trade_name: meta.trade_name || "",
          city: meta.city || "",
          state: meta.state || "",
          cep: meta.cep || "",
          notes_text: meta.notes_text || ""
        };
      });

      state.clientes = all.filter(c => {
        if (state.ativo === "ativos" && c.is_active === false) return false;
        if (state.ativo === "inativos" && c.is_active !== false) return false;
        const busca = normalizeText(state.busca || "");
        if (!busca) return true;
        const txt = normalizeText([c.name, c.trade_name, c.document, fmtCpfCnpj(c.document), c.email, c.phone, c.address, c.city, c.state, c.notes_text].join(" "));
        return txt.includes(busca);
      });

      await renderResumo(all);
      renderLista();

      if (!state.selecionado && state.clientes.length) state.selecionado = state.clientes[0];
      if (state.selecionado && !state.clientes.find(x => x.id === state.selecionado.id)) state.selecionado = state.clientes[0] || null;

      if (state.selecionado && state.contatosDisponiveis) await carregarContatos();
      else state.contatos = [];
      renderDetalhe();
    }

    async function renderResumo(all) {
      $("#kpiTotal", alvo).textContent = String(all.length);
      $("#kpiAtivos", alvo).textContent = String(all.filter(c => c.is_active !== false).length);
      $("#kpiPJ", alvo).textContent = String(all.filter(c => c.person_type === "PJ").length);

      if (!state.contatosHabilitados) {
        $("#kpiContatos", alvo).textContent = "0";
        return;
      }

      try {
        const r = await ctx.sb.db.from("client_contacts").select("client_id").eq("company_id", companyId);
        if (r.error) throw r.error;
        const ids = new Set((r.data || []).map(x => x.client_id));
        $("#kpiContatos", alvo).textContent = String(all.filter(c => ids.has(c.id)).length);
      } catch (_) {
        state.contatosDisponiveis = false;
        $("#kpiContatos", alvo).textContent = "0";
      }
    }

    async function carregarContatos() {
      if (!state.selecionado || !state.contatosDisponiveis) return;
      try {
        const r = await ctx.sb.db
          .from("client_contacts")
          .select("id, client_id, name, email, phone, address, is_primary, created_at")
          .eq("company_id", companyId)
          .eq("client_id", state.selecionado.id)
          .order("name");
        if (r.error) throw r.error;
        state.contatos = r.data || [];
      } catch (_) {
        state.contatos = [];
        state.contatosDisponiveis = false;
      }
    }

    function renderLista() {
      const wrap = $("#clientLista", alvo);
      if (!state.clientes.length) {
        wrap.innerHTML = '<div class="empty">Nenhum cliente encontrado.</div>';
        return;
      }

      wrap.innerHTML = state.clientes.map(c => `
        <div class="client-card ${state.selecionado && state.selecionado.id === c.id ? "active" : ""}" data-id="${escapeHtml(c.id)}">
          <div class="client-name">${escapeHtml(c.name || "Sem nome")}</div>
          <div class="client-meta">${escapeHtml(c.trade_name || "—")} • ${escapeHtml(fmtCpfCnpj(c.document) || "—")}</div>
          <div class="client-meta">${escapeHtml(c.email || "—")} • ${escapeHtml(fmtPhone(c.phone) || "—")}</div>
          <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">${badgePessoa(c.person_type)}${badgeAtivo(c.is_active)}</div>
        </div>
      `).join("");

      $all(".client-card", wrap).forEach(card => {
        card.addEventListener("click", async () => {
          const id = card.getAttribute("data-id");
          state.selecionado = state.clientes.find(x => x.id === id) || null;
          state.aba = "dados";
          if (state.selecionado && state.contatosDisponiveis) await carregarContatos();
          renderLista();
          renderDetalhe();
        });
      });
    }

    function renderDetalhe() {
      const wrap = $("#clientDetalhe", alvo);
      if (!state.selecionado) {
        wrap.innerHTML = '<div class="empty">Nenhum cliente selecionado.</div>';
        return;
      }

      const c = state.selecionado;
      const cidadeUf = [c.city, c.state].filter(Boolean).join(" / ");

      wrap.innerHTML = `
        <div class="client-tabs">
          <span class="client-tab active" data-aba="dados">Dados</span>
          <span class="client-tab" data-aba="contatos">Contatos (${state.contatosDisponiveis ? state.contatos.length : 0})</span>
        </div>

        <div id="clientAbaDados" class="client-aba">
          <div class="mini-card">
            <div class="mini-card-top">
              <div>
                <div class="mini-card-title">${escapeHtml(c.name || "Sem nome")}</div>
                <div class="panel-sub">${escapeHtml(c.trade_name || "")}</div>
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">${badgePessoa(c.person_type)}${badgeAtivo(c.is_active)}</div>
            </div>

            <div class="client-detail-grid">
              <div class="client-detail-box">
                <div class="client-detail-label">Documento</div>
                <div class="client-detail-value">${escapeHtml(fmtCpfCnpj(c.document) || "—")}</div>
              </div>
              <div class="client-detail-box">
                <div class="client-detail-label">Telefone</div>
                <div class="client-detail-value">${escapeHtml(fmtPhone(c.phone) || "—")}</div>
              </div>
              <div class="client-detail-box">
                <div class="client-detail-label">E-mail</div>
                <div class="client-detail-value">${escapeHtml(c.email || "—")}</div>
              </div>
              <div class="client-detail-box">
                <div class="client-detail-label">Cidade / UF</div>
                <div class="client-detail-value">${escapeHtml(cidadeUf || "—")}</div>
              </div>
              <div class="client-detail-box full">
                <div class="client-detail-label">Endereço</div>
                <div class="client-detail-value">${escapeHtml(c.address || "—")}</div>
              </div>
              <div class="client-detail-box">
                <div class="client-detail-label">Criado em</div>
                <div class="client-detail-value">${escapeHtml(fmtDateTime(c.created_at))}</div>
              </div>
              <div class="client-detail-box">
                <div class="client-detail-label">Atualizado em</div>
                <div class="client-detail-value">${escapeHtml(fmtDateTime(c.updated_at))}</div>
              </div>
              <div class="client-detail-box full">
                <div class="client-detail-label">Observações</div>
                <div class="client-detail-value">${escapeHtml(c.notes_text || "—")}</div>
              </div>
            </div>
          </div>
        </div>

        <div id="clientAbaContatos" class="client-aba" style="display:none">
          <div id="clientContatosLista"></div>
          ${state.contatosDisponiveis
            ? '<button id="btnNovoContato" class="btn btn-secondary" style="margin-top:10px">+ Novo contato</button>'
            : '<div class="empty">Contatos vinculados desabilitados no banco atual.</div>'}
        </div>

        <div class="modal-actions" style="margin-top:14px;">
          <button id="btnEditarCliente" class="btn btn-primary">Editar</button>
          <button id="btnToggleCliente" class="btn btn-secondary">${c.is_active !== false ? "Inativar" : "Ativar"}</button>
        </div>
      `;

      $all(".client-tab", wrap).forEach(tab => {
        tab.addEventListener("click", () => {
          state.aba = tab.getAttribute("data-aba");
          $all(".client-tab", wrap).forEach(t => t.classList.toggle("active", t.getAttribute("data-aba") === state.aba));
          $("#clientAbaDados", wrap).style.display = state.aba === "dados" ? "" : "none";
          $("#clientAbaContatos", wrap).style.display = state.aba === "contatos" ? "" : "none";
          if (state.aba === "contatos") renderContatosLista();
        });
      });

      const contatosWrap = $("#clientContatosLista", wrap);

      function renderContatosLista() {
        if (!contatosWrap) return;
        if (!state.contatosDisponiveis) {
          contatosWrap.innerHTML = '<div class="empty">Contatos vinculados desabilitados no banco atual.</div>';
          return;
        }
        if (!state.contatos.length) {
          contatosWrap.innerHTML = '<div class="empty">Nenhum contato cadastrado.</div>';
          return;
        }

        contatosWrap.innerHTML = state.contatos.map(ct => `
          <div class="contact-mini" data-id="${ct.id}">
            <div class="contact-mini-name">${escapeHtml(ct.name || "Sem nome")} ${ct.is_primary ? "(principal)" : ""}</div>
            <div class="contact-mini-meta">${escapeHtml(ct.email || "")} • ${escapeHtml(fmtPhone(ct.phone) || "")}</div>
            <div class="contact-mini-meta">${escapeHtml(ct.address || "")}</div>
            <div style="margin-top:8px">
              <button class="btn btn-secondary js-editar-contato" data-id="${ct.id}">Editar</button>
              <button class="btn btn-ghost js-remover-contato" data-id="${ct.id}">Remover</button>
            </div>
          </div>
        `).join("");

        $all(".js-editar-contato", contatosWrap).forEach(btn => btn.addEventListener("click", () => {
          const ct = state.contatos.find(x => x.id === btn.getAttribute("data-id"));
          if (ct) abrirModalContato(ctx, c, ct, async () => {
            await carregarContatos();
            renderDetalhe();
          });
        }));

        $all(".js-remover-contato", contatosWrap).forEach(btn => btn.addEventListener("click", async () => {
          if (!confirm("Remover este contato?")) return;
          const id = btn.getAttribute("data-id");
          const r = await ctx.sb.db.from("client_contacts").delete().eq("id", id).eq("company_id", companyId);
          if (r.error) return alert("Falha ao remover contato: " + (r.error.message || r.error));
          await carregarContatos();
          renderDetalhe();
        }));
      }

      if (state.contatosDisponiveis) {
        const btnNovoContato = $("#btnNovoContato", wrap);
        if (btnNovoContato) {
          btnNovoContato.addEventListener("click", () => abrirModalContato(ctx, c, null, async () => {
            await carregarContatos();
            renderDetalhe();
          }));
        }
      }

      if (state.aba === "contatos") renderContatosLista();

      $("#btnEditarCliente", wrap).addEventListener("click", () => abrirModalCliente(ctx, c, carregar));
      $("#btnToggleCliente", wrap).addEventListener("click", async () => {
        const isActive = c.is_active === false;
        const r = await ctx.sb.db
          .from("customers")
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .eq("id", c.id);
        if (r.error) return alert("Falha: " + (r.error.message || r.error));
        await carregar();
      });
    }
  }

  function abrirModalCliente(ctx, cliente, refresh) {
    const companyId = (ctx.companyId || ctx.sb?.companyId || window.sb?.companyId);
    if (!companyId) return alert("company_id não configurado.");

    const meta = extractMeta(cliente ? cliente.notes : "");
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" style="width:min(920px, calc(100vw - 32px));">
        <div class="modal-head">
          <div>
            <div class="modal-title">${cliente ? "Editar Cliente" : "Novo Cliente"}</div>
            <div class="panel-sub">Cadastro integrado ao projeto SGB. Para PJ, você pode consultar o CNPJ e preencher automaticamente.</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalCliente">Fechar</button>
        </div>
        <div class="alert error" id="erroModalCliente"></div>
        <div class="grid-form">
          <div>
            <label class="label">Tipo de pessoa</label>
            <select id="clPersonType" class="select">
              <option value="PF" ${meta.person_type !== "PJ" ? "selected" : ""}>Pessoa Física</option>
              <option value="PJ" ${meta.person_type === "PJ" ? "selected" : ""}>Pessoa Jurídica</option>
            </select>
          </div>
          <div>
            <label class="label">Situação</label>
            <select id="clAtivo" class="select">
              <option value="true" ${!cliente || cliente.is_active !== false ? "selected" : ""}>Ativo</option>
              <option value="false" ${cliente && cliente.is_active === false ? "selected" : ""}>Inativo</option>
            </select>
          </div>
          <div>
            <label class="label" id="clDocLabel">${meta.person_type === "PJ" ? "CNPJ" : "CPF"}</label>
            <input id="clDocument" class="field" value="${escapeHtml(fmtCpfCnpj(meta.document || ""))}" placeholder="Somente números ou formatado" />
            <div class="client-hint" id="clDocHint">${meta.person_type === "PJ" ? "Para PJ, consulte o CNPJ para preencher automaticamente." : "Para PF, o preenchimento é manual e o documento ficará salvo no cadastro interno."}</div>
          </div>
          <div id="pjConsultaWrap" style="${meta.person_type === "PJ" ? "" : "display:none"}">
            <label class="label">&nbsp;</label>
            <button id="btnBuscarCnpj" class="btn btn-secondary" style="width:100%">Buscar CNPJ</button>
          </div>
          <div class="full">
            <label class="label">Nome / Razão Social *</label>
            <input id="clNome" class="field" value="${escapeHtml(cliente ? cliente.name || "" : "")}" placeholder="Nome do cliente ou razão social" />
          </div>
          <div class="full" id="fantasiaWrap" style="${meta.person_type === "PJ" ? "" : "display:none"}">
            <label class="label">Nome fantasia</label>
            <input id="clTradeName" class="field" value="${escapeHtml(meta.trade_name || "")}" placeholder="Nome fantasia" />
          </div>
          <div>
            <label class="label">E-mail</label>
            <input id="clEmail" class="field" type="email" value="${escapeHtml(cliente ? cliente.email || "" : "")}" placeholder="email@exemplo.com" />
          </div>
          <div>
            <label class="label">Telefone</label>
            <input id="clPhone" class="field" value="${escapeHtml(fmtPhone(cliente ? cliente.phone || "" : ""))}" placeholder="(34) 99999-9999" />
          </div>
          <div class="full">
            <label class="label">Endereço</label>
            <input id="clAddress" class="field" value="${escapeHtml(cliente ? cliente.address || "" : "")}" placeholder="Rua, número, bairro" />
          </div>
          <div>
            <label class="label">CEP</label>
            <input id="clCep" class="field" value="${escapeHtml(meta.cep || "")}" placeholder="00000-000" />
          </div>
          <div>
            <label class="label">Cidade / UF</label>
            <input id="clCityState" class="field" value="${escapeHtml([meta.city, meta.state].filter(Boolean).join(" / "))}" placeholder="Cidade / UF" />
          </div>
          <div class="full">
            <label class="label">Observações</label>
            <textarea id="clNotes" class="textarea" placeholder="Notas internas">${escapeHtml(meta.notes_text || "")}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button id="salvarModalCliente" class="btn btn-primary">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const erro = $("#erroModalCliente", backdrop);
    const fechar = () => document.body.removeChild(backdrop);

    function setModalError(msg) {
      erro.textContent = msg || "";
      erro.classList.toggle("show", !!msg);
    }

    function syncDocUi() {
      const tipo = $("#clPersonType", backdrop).value;
      $("#clDocLabel", backdrop).textContent = tipo === "PJ" ? "CNPJ" : "CPF";
      $("#clDocHint", backdrop).textContent = tipo === "PJ"
        ? "Para PJ, consulte o CNPJ para preencher automaticamente."
        : "Para PF, o preenchimento é manual e o documento ficará salvo no cadastro interno.";
      $("#pjConsultaWrap", backdrop).style.display = tipo === "PJ" ? "" : "none";
      $("#fantasiaWrap", backdrop).style.display = tipo === "PJ" ? "" : "none";
    }

    function splitCityState(v) {
      const text = String(v || "").trim();
      if (!text) return { city: "", state: "" };
      const parts = text.split("/");
      if (parts.length >= 2) return { city: parts[0].trim(), state: parts[1].trim() };
      return { city: text, state: "" };
    }

    $("#fecharModalCliente", backdrop).addEventListener("click", fechar);
    $("#clPersonType", backdrop).addEventListener("change", syncDocUi);
    $("#clPhone", backdrop).addEventListener("input", e => { e.target.value = fmtPhone(e.target.value); });
    $("#clDocument", backdrop).addEventListener("input", e => { e.target.value = fmtCpfCnpj(e.target.value); });
    $("#clCep", backdrop).addEventListener("input", e => {
      const n = onlyDigits(e.target.value).slice(0, 8);
      e.target.value = n.length > 5 ? n.replace(/(\d{5})(\d{1,3})/, "$1-$2") : n;
    });

    const btnBuscarCnpj = $("#btnBuscarCnpj", backdrop);
    if (btnBuscarCnpj) {
      btnBuscarCnpj.addEventListener("click", async () => {
        setModalError("");
        const cnpj = onlyDigits($("#clDocument", backdrop).value);
        if (cnpj.length !== 14) {
          setModalError("Informe um CNPJ com 14 dígitos.");
          return;
        }
        btnBuscarCnpj.disabled = true;
        btnBuscarCnpj.textContent = "Consultando...";
        try {
          const data = await fetchCnpjData(cnpj);
          $("#clNome", backdrop).value = data.razao_social || $("#clNome", backdrop).value;
          $("#clTradeName", backdrop).value = data.nome_fantasia || $("#clTradeName", backdrop).value;
          $("#clPhone", backdrop).value = fmtPhone(data.ddd_telefone_1 || data.ddd_telefone_2 || $("#clPhone", backdrop).value);
          $("#clEmail", backdrop).value = data.email || $("#clEmail", backdrop).value;
          const endereco = [data.logradouro, data.numero, data.bairro].filter(Boolean).join(", ");
          $("#clAddress", backdrop).value = endereco || $("#clAddress", backdrop).value;
          $("#clCep", backdrop).value = data.cep ? String(data.cep).replace(/^(\d{5})(\d{3})$/, "$1-$2") : $("#clCep", backdrop).value;
          $("#clCityState", backdrop).value = [data.municipio, data.uf].filter(Boolean).join(" / ");
        } catch (e) {
          setModalError(e.message || "Falha ao consultar CNPJ.");
        } finally {
          btnBuscarCnpj.disabled = false;
          btnBuscarCnpj.textContent = "Buscar CNPJ";
        }
      });
    }

    $("#salvarModalCliente", backdrop).addEventListener("click", async () => {
      setModalError("");

      const nome = $("#clNome", backdrop).value.trim();
      if (!nome) {
        setModalError("Informe o nome do cliente.");
        return;
      }

      const tipo = $("#clPersonType", backdrop).value === "PJ" ? "PJ" : "PF";
      const documentDigits = onlyDigits($("#clDocument", backdrop).value);
      if (tipo === "PJ" && documentDigits && documentDigits.length !== 14) {
        setModalError("O CNPJ deve ter 14 dígitos.");
        return;
      }
      if (tipo === "PF" && documentDigits && documentDigits.length !== 11) {
        setModalError("O CPF deve ter 11 dígitos.");
        return;
      }

      const cityState = splitCityState($("#clCityState", backdrop).value);
      const mergedNotes = buildNotes({
        person_type: tipo,
        document: documentDigits,
        trade_name: $("#clTradeName", backdrop) ? $("#clTradeName", backdrop).value.trim() : "",
        city: cityState.city,
        state: cityState.state,
        cep: $("#clCep", backdrop).value
      }, $("#clNotes", backdrop).value);

      const payload = {
        company_id: companyId,
        name: nome,
        email: $("#clEmail", backdrop).value.trim() || null,
        phone: onlyDigits($("#clPhone", backdrop).value) || null,
        address: $("#clAddress", backdrop).value.trim() || null,
        notes: mergedNotes,
        is_active: $("#clAtivo", backdrop).value === "true",
        updated_at: new Date().toISOString()
      };

      let r;
      if (cliente && cliente.id) {
        r = await ctx.sb.db.from("customers").update(payload).eq("company_id", companyId).eq("id", cliente.id);
      } else {
        r = await ctx.sb.db.from("customers").insert(payload);
      }

      if (r.error) {
        setModalError(r.error.message || "Falha ao salvar. Verifique a estrutura da tabela customers.");
        return;
      }

      fechar();
      if (typeof refresh === "function") await refresh();
      alert(cliente && cliente.id ? "Cliente atualizado." : "Cliente criado.");
    });

    syncDocUi();
  }

  function abrirModalContato(ctx, cliente, contato, refresh) {
    const companyId = (ctx.companyId || ctx.sb?.companyId || window.sb?.companyId);
    if (!cliente || !cliente.id || !companyId) return;

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${contato ? "Editar Contato" : "Novo Contato"}</div>
            <div class="panel-sub">Cliente: ${escapeHtml(cliente.name || "")}</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalContato">Fechar</button>
        </div>
        <div class="alert error" id="erroModalContato"></div>
        <div class="grid-form">
          <div class="full">
            <label class="label">Nome *</label>
            <input id="ctNome" class="field" value="${escapeHtml(contato ? contato.name || "" : "")}" placeholder="Nome do contato" />
          </div>
          <div>
            <label class="label">E-mail</label>
            <input id="ctEmail" class="field" type="email" value="${escapeHtml(contato ? contato.email || "" : "")}" />
          </div>
          <div>
            <label class="label">Telefone</label>
            <input id="ctPhone" class="field" value="${escapeHtml(fmtPhone(contato ? contato.phone || "" : ""))}" />
          </div>
          <div class="full">
            <label class="label">Endereço</label>
            <input id="ctAddress" class="field" value="${escapeHtml(contato ? contato.address || "" : "")}" />
          </div>
          <div>
            <label class="label">Contato principal</label>
            <select id="ctPrincipal" class="select">
              <option value="true" ${contato && contato.is_primary ? "selected" : ""}>Sim</option>
              <option value="false" ${!contato || !contato.is_primary ? "selected" : ""}>Não</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button id="salvarModalContato" class="btn btn-primary">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const erro = $("#erroModalContato", backdrop);
    const fechar = () => document.body.removeChild(backdrop);

    function setContatoError(msg) {
      erro.textContent = msg || "";
      erro.classList.toggle("show", !!msg);
    }

    $("#fecharModalContato", backdrop).addEventListener("click", fechar);
    $("#ctPhone", backdrop).addEventListener("input", e => { e.target.value = fmtPhone(e.target.value); });

    $("#salvarModalContato", backdrop).addEventListener("click", async () => {
      setContatoError("");

      const nome = $("#ctNome", backdrop).value.trim();
      if (!nome) {
        setContatoError("Informe o nome do contato.");
        return;
      }

      const payload = {
        company_id: companyId,
        client_id: cliente.id,
        name: nome,
        email: $("#ctEmail", backdrop).value.trim() || null,
        phone: onlyDigits($("#ctPhone", backdrop).value) || null,
        address: $("#ctAddress", backdrop).value.trim() || null,
        is_primary: $("#ctPrincipal", backdrop).value === "true",
        updated_at: new Date().toISOString()
      };

      let r;
      if (contato && contato.id) {
        r = await ctx.sb.db.from("client_contacts").update(payload).eq("company_id", companyId).eq("id", contato.id);
      } else {
        r = await ctx.sb.db.from("client_contacts").insert(payload);
      }

      if (r.error) {
        setContatoError(r.error.message || "Falha ao salvar contato.");
        return;
      }

      fechar();
      if (typeof refresh === "function") await refresh();
      alert(contato && contato.id ? "Contato atualizado." : "Contato adicionado.");
    });
  }

  window.ModuloClientes = { listarClientes };
})();
