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
  function fmtPhone(v) {
    const d = onlyDigits(v);
    if (!d) return "";
    if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
    if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
    return v || "";
  }
  function fmtCnpj(v) {
    const d = onlyDigits(v).slice(0, 14);
    if (d.length !== 14) return d;
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  function badgeAtivo(flag) {
    return flag !== false
      ? '<span class="status-pill" style="background:rgba(20,195,142,.16);color:#dcfff3">Ativo</span>'
      : '<span class="status-pill" style="background:rgba(255,93,108,.16);color:#ffdbe0">Inativo</span>';
  }
  function personTypeLabel(tipo) {
    return tipo === "pj"
      ? '<span class="status-pill" style="background:rgba(61,134,255,.16);color:#dbeaff">Pessoa Jurídica</span>'
      : '<span class="status-pill" style="background:rgba(255,184,77,.16);color:#ffe6b3">Pessoa Física</span>';
  }

  const META_MARKER = "[SGB_META_CLIENTE]";

  function extractMetaAndCleanNotes(notes) {
    const raw = String(notes || "");
    const idx = raw.indexOf(META_MARKER);
    if (idx < 0) {
      return {
        cleanNotes: raw.trim(),
        meta: { tipo: "pf", documento: "", fantasia: "", cep: "", municipio: "", uf: "" }
      };
    }
    const cleanNotes = raw.slice(0, idx).trim();
    const jsonPart = raw.slice(idx + META_MARKER.length).trim();
    try {
      const meta = JSON.parse(jsonPart || "{}");
      return {
        cleanNotes,
        meta: {
          tipo: meta.tipo === "pj" ? "pj" : "pf",
          documento: meta.documento || "",
          fantasia: meta.fantasia || "",
          cep: meta.cep || "",
          municipio: meta.municipio || "",
          uf: meta.uf || ""
        }
      };
    } catch (_) {
      return {
        cleanNotes: raw.trim(),
        meta: { tipo: "pf", documento: "", fantasia: "", cep: "", municipio: "", uf: "" }
      };
    }
  }

  function buildNotes(cleanNotes, meta) {
    const body = String(cleanNotes || "").trim();
    const safeMeta = {
      tipo: meta?.tipo === "pj" ? "pj" : "pf",
      documento: meta?.documento || "",
      fantasia: meta?.fantasia || "",
      cep: meta?.cep || "",
      municipio: meta?.municipio || "",
      uf: meta?.uf || ""
    };
    const serialized = META_MARKER + JSON.stringify(safeMeta);
    return body ? `${body}\n\n${serialized}` : serialized;
  }

  async function fetchCnpjData(cnpj) {
    const digits = onlyDigits(cnpj);
    if (digits.length !== 14) throw new Error("Informe um CNPJ válido com 14 dígitos.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.message || data?.errors?.[0]?.message || "Falha ao consultar o CNPJ.");
      }
      return data;
    } catch (err) {
      if (err?.name === "AbortError") throw new Error("A consulta ao CNPJ demorou demais. Tente novamente.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function buildAddressFromBrasilApi(data) {
    const parts = [
      data.descricao_tipo_de_logradouro && data.logradouro ? `${data.descricao_tipo_de_logradouro} ${data.logradouro}` : (data.logradouro || ""),
      data.numero || "",
      data.bairro || "",
      [data.municipio || "", data.uf || ""].filter(Boolean).join("/") || "",
      data.cep ? `CEP ${fmtCep(data.cep)}` : ""
    ].filter(Boolean);
    return parts.join(", ");
  }

  function fmtCep(v) {
    const d = onlyDigits(v).slice(0, 8);
    if (d.length !== 8) return d;
    return d.replace(/(\d{5})(\d{3})/, "$1-$2");
  }

  function injectCss() {
    if (document.getElementById("css-clientes-sgb-v2")) return;
    const st = document.createElement("style");
    st.id = "css-clientes-sgb-v2";
    st.textContent = `
      .client-summary{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:12px;margin-bottom:14px}
      .client-kpi{padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:14px;background:rgba(255,255,255,.03)}
      .client-kpi-label{font-size:12px;color:#9db3d6}
      .client-kpi-value{font-size:26px;font-weight:800;color:#eff6ff;margin-top:6px}
      .client-grid{display:grid;grid-template-columns:1.08fr .92fr;gap:16px}
      .client-list{display:flex;flex-direction:column;gap:10px;margin-top:10px}
      .client-card{padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:14px;background:rgba(255,255,255,.03);cursor:pointer;transition:.15s ease}
      .client-card:hover{border-color:rgba(61,134,255,.35);transform:translateY(-1px)}
      .client-card.active{border-color:rgba(61,134,255,.55);box-shadow:0 0 0 1px rgba(61,134,255,.18) inset}
      .client-card-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .client-name{font-weight:800;color:#eff6ff;line-height:1.25}
      .client-fantasy{font-size:12px;color:#9db3d6;margin-top:4px}
      .client-meta{font-size:12px;color:#9db3d6;margin-top:6px}
      .client-doc{font-size:12px;color:#c8d8f4;margin-top:8px;font-weight:700}
      .client-tabs{display:flex;gap:6px;margin-bottom:12px;border-bottom:1px solid rgba(36,59,97,.55)}
      .client-tab{padding:10px 16px;cursor:pointer;border-radius:8px 8px 0 0;font-weight:700;color:#9db3d6}
      .client-tab:hover{color:#eff6ff;background:rgba(255,255,255,.03)}
      .client-tab.active{color:#eff6ff;background:rgba(61,134,255,.18);border-bottom:2px solid var(--primary)}
      .client-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:12px;margin:12px 0}
      .client-detail-box{padding:12px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.02)}
      .client-detail-label{font-size:12px;color:#9db3d6;margin-bottom:4px}
      .client-detail-value{font-weight:700;color:#eff6ff;word-break:break-word}
      .client-notes{margin-top:12px;padding:12px;border:1px solid rgba(108,152,232,.14);border-radius:12px;background:rgba(255,255,255,.02);white-space:pre-wrap;color:#dfe9fb}
      .contact-mini{padding:10px;border:1px solid rgba(108,152,232,.14);border-radius:10px;margin-bottom:8px;background:rgba(255,255,255,.02)}
      .contact-mini-name{font-weight:700;color:#eff6ff}
      .contact-mini-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .client-form-grid{display:grid;grid-template-columns:repeat(2,minmax(180px,1fr));gap:12px}
      .client-form-grid .full{grid-column:1/-1}
      .cnpj-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}
      .client-tip{font-size:12px;color:#9db3d6;margin-top:6px}
      .client-readonly{background:rgba(255,255,255,.04)}
      @media (max-width:1100px){.client-grid{grid-template-columns:1fr}.client-summary{grid-template-columns:repeat(2,minmax(120px,1fr))}}
      @media (max-width:760px){.client-form-grid,.client-detail-grid{grid-template-columns:1fr}.cnpj-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function listarClientes(ctx) {
    injectCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) return;

    const companyId = (ctx.companyId || ctx.sb?.companyId || window.sb?.companyId);
    if (!companyId) {
      alvo.innerHTML = '<div class="empty">company_id não configurado.</div>';
      return;
    }

    const state = {
      busca: "",
      ativo: "ativos",
      clientes: [],
      selecionado: null,
      aba: "dados",
      contatos: []
    };

    alvo.innerHTML = `
      <div class="panel">
        <h2>Clientes</h2>
        <div class="panel-sub">Cadastro de clientes integrado ao projeto. Suporta PF/PJ, contatos vinculados e preenchimento automático por CNPJ.</div>
        <div class="client-summary">
          <div class="client-kpi"><div class="client-kpi-label">Total de clientes</div><div class="client-kpi-value" id="kpiTotal">0</div></div>
          <div class="client-kpi"><div class="client-kpi-label">Ativos</div><div class="client-kpi-value" id="kpiAtivos">0</div></div>
          <div class="client-kpi"><div class="client-kpi-label">Pessoas jurídicas</div><div class="client-kpi-value" id="kpiPj">0</div></div>
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
      </div>

      <div class="client-grid" style="margin-top:16px">
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

    $("#clientBusca", alvo).addEventListener("input", async () => { state.busca = $("#clientBusca", alvo).value || ""; await carregar(); });
    $("#clientAtivo", alvo).addEventListener("change", async () => { state.ativo = $("#clientAtivo", alvo).value || "ativos"; await carregar(); });
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
        $("#clientDetalhe", alvo).innerHTML = '<div class="empty">Verifique a tabela customers e a RLS.</div>';
        return;
      }

      const all = (r.data || []).map(c => {
        const parsed = extractMetaAndCleanNotes(c.notes);
        return {
          ...c,
          is_active: c.is_active !== false,
          cleanNotes: parsed.cleanNotes,
          meta: parsed.meta
        };
      });

      state.clientes = all.filter(c => {
        if (state.ativo === "ativos" && c.is_active === false) return false;
        if (state.ativo === "inativos" && c.is_active !== false) return false;
        const busca = String(state.busca || "").trim().toLowerCase();
        if (!busca) return true;
        const txt = [c.name, c.meta?.fantasia, c.meta?.documento, c.email, c.phone, c.address, c.cleanNotes].join(" ").toLowerCase();
        return txt.includes(busca);
      });

      await renderResumo(all);
      renderLista();

      if (!state.selecionado && state.clientes.length) state.selecionado = state.clientes[0];
      if (state.selecionado && !state.clientes.find(x => x.id === state.selecionado.id)) state.selecionado = state.clientes[0] || null;

      if (state.selecionado) await carregarContatos();
      else state.contatos = [];
      renderDetalhe();
    }

    async function renderResumo(all) {
      const ativos = all.filter(c => c.is_active !== false).length;
      const pjs = all.filter(c => c.meta?.tipo === "pj").length;
      $("#kpiTotal", alvo).textContent = String(all.length);
      $("#kpiAtivos", alvo).textContent = String(ativos);
      $("#kpiPj", alvo).textContent = String(pjs);
      try {
        const r = await ctx.sb.db.from("client_contacts").select("client_id").eq("company_id", companyId);
        if (r.data && r.data.length) {
          const ids = new Set(r.data.map(x => x.client_id));
          $("#kpiContatos", alvo).textContent = String(all.filter(c => ids.has(c.id)).length);
        } else {
          $("#kpiContatos", alvo).textContent = "0";
        }
      } catch (_) {
        $("#kpiContatos", alvo).textContent = "—";
      }
    }

    async function carregarContatos() {
      if (!state.selecionado) return;
      try {
        const r = await ctx.sb.db
          .from("client_contacts")
          .select("id, client_id, name, email, phone, address, is_primary, created_at")
          .eq("company_id", companyId)
          .eq("client_id", state.selecionado.id)
          .order("name");
        state.contatos = r.data || [];
      } catch (_) {
        state.contatos = [];
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
          <div class="client-card-top">
            <div>
              <div class="client-name">${escapeHtml(c.name || "Sem nome")}</div>
              ${c.meta?.fantasia ? `<div class="client-fantasy">Fantasia: ${escapeHtml(c.meta.fantasia)}</div>` : ""}
            </div>
            <div>${badgeAtivo(c.is_active)}</div>
          </div>
          <div class="client-meta">${escapeHtml(c.email || "—")} • ${escapeHtml(fmtPhone(c.phone) || "—")}</div>
          <div class="client-doc">${personTypeLabel(c.meta?.tipo)} ${c.meta?.documento ? `• ${escapeHtml(c.meta.tipo === 'pj' ? fmtCnpj(c.meta.documento) : c.meta.documento)}` : ""}</div>
        </div>
      `).join("");

      $all(".client-card", wrap).forEach(card => {
        card.addEventListener("click", async () => {
          const id = card.getAttribute("data-id");
          state.selecionado = state.clientes.find(x => x.id === id) || null;
          state.aba = "dados";
          await carregarContatos();
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
      wrap.innerHTML = `
        <div class="client-tabs">
          <span class="client-tab active" data-aba="dados">Dados</span>
          <span class="client-tab" data-aba="contatos">Contatos (${state.contatos.length})</span>
        </div>
        <div id="clientAbaDados" class="client-aba">
          <div class="mini-card">
            <div class="mini-card-top">
              <div>
                <div class="mini-card-title">${escapeHtml(c.name || "Sem nome")}</div>
                ${c.meta?.fantasia ? `<div class="panel-sub">Nome fantasia: ${escapeHtml(c.meta.fantasia)}</div>` : ""}
              </div>
              <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${personTypeLabel(c.meta?.tipo)} ${badgeAtivo(c.is_active)}</div>
            </div>
            <div class="client-detail-grid">
              <div class="client-detail-box"><div class="client-detail-label">Documento</div><div class="client-detail-value">${escapeHtml(c.meta?.tipo === 'pj' ? fmtCnpj(c.meta?.documento) : (c.meta?.documento || '—'))}</div></div>
              <div class="client-detail-box"><div class="client-detail-label">Telefone</div><div class="client-detail-value">${escapeHtml(fmtPhone(c.phone) || '—')}</div></div>
              <div class="client-detail-box"><div class="client-detail-label">E-mail</div><div class="client-detail-value">${escapeHtml(c.email || '—')}</div></div>
              <div class="client-detail-box"><div class="client-detail-label">Cidade / UF</div><div class="client-detail-value">${escapeHtml([c.meta?.municipio || '', c.meta?.uf || ''].filter(Boolean).join(' / ') || '—')}</div></div>
              <div class="client-detail-box" style="grid-column:1/-1"><div class="client-detail-label">Endereço</div><div class="client-detail-value">${escapeHtml(c.address || '—')}</div></div>
              <div class="client-detail-box"><div class="client-detail-label">Criado em</div><div class="client-detail-value">${escapeHtml(fmtDateTime(c.created_at))}</div></div>
              <div class="client-detail-box"><div class="client-detail-label">Atualizado em</div><div class="client-detail-value">${escapeHtml(fmtDateTime(c.updated_at))}</div></div>
            </div>
            ${c.cleanNotes ? `<div class="client-notes">${escapeHtml(c.cleanNotes)}</div>` : ""}
          </div>
        </div>
        <div id="clientAbaContatos" class="client-aba" style="display:none">
          <div id="clientContatosLista"></div>
          <button id="btnNovoContato" class="btn btn-secondary" style="margin-top:10px">+ Novo contato</button>
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
          if (state.aba === "contatos") renderContatosLista(wrap);
        });
      });

      const contatosWrap = $("#clientContatosLista", wrap);
      function renderContatosLista(parent) {
        if (!contatosWrap) return;
        if (!state.contatos.length) {
          contatosWrap.innerHTML = '<div class="empty">Nenhum contato cadastrado.</div>';
          return;
        }
        contatosWrap.innerHTML = state.contatos.map(ct => `
          <div class="contact-mini" data-id="${ct.id}">
            <div class="contact-mini-name">${escapeHtml(ct.name || "Sem nome")} ${ct.is_primary ? "(principal)" : ""}</div>
            <div class="contact-mini-meta">${escapeHtml(ct.email || "—")} • ${escapeHtml(fmtPhone(ct.phone) || "—")}</div>
            <div class="contact-mini-meta">${escapeHtml(ct.address || "—")}</div>
            <div style="margin-top:8px">
              <button class="btn btn-secondary js-editar-contato" data-id="${ct.id}">Editar</button>
              <button class="btn btn-ghost js-remover-contato" data-id="${ct.id}">Remover</button>
            </div>
          </div>
        `).join("");
        $all(".js-editar-contato", contatosWrap).forEach(btn => btn.addEventListener("click", () => {
          const ct = state.contatos.find(x => x.id === btn.getAttribute("data-id"));
          if (ct) abrirModalContato(ctx, c, ct, carregar);
        }));
        $all(".js-remover-contato", contatosWrap).forEach(btn => btn.addEventListener("click", async () => {
          if (!confirm("Remover este contato?")) return;
          const id = btn.getAttribute("data-id");
          await ctx.sb.db.from("client_contacts").delete().eq("id", id).eq("company_id", companyId);
          await carregarContatos();
          renderContatosLista(parent);
        }));
      }

      $("#btnNovoContato", wrap).addEventListener("click", () => abrirModalContato(ctx, c, null, async () => { await carregarContatos(); renderDetalhe(); }));
      if (state.aba === "contatos") renderContatosLista(wrap);

      $("#btnEditarCliente", wrap).addEventListener("click", () => abrirModalCliente(ctx, c, carregar));
      $("#btnToggleCliente", wrap).addEventListener("click", async () => {
        const isActive = c.is_active === false;
        const r = await ctx.sb.db
          .from("customers")
          .update({ is_active: isActive })
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

    const parsed = extractMetaAndCleanNotes(cliente?.notes || "");
    const meta = parsed.meta;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" style="width:min(980px, calc(100vw - 32px));">
        <div class="modal-head">
          <div>
            <div class="modal-title">${cliente ? "Editar Cliente" : "Novo Cliente"}</div>
            <div class="panel-sub">Cadastro alinhado ao projeto SGB. Para PJ, você pode consultar o CNPJ e preencher automaticamente.</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalCliente">Fechar</button>
        </div>
        <div class="alert error" id="erroModalCliente"></div>
        <div class="client-form-grid">
          <div>
            <label class="label">Tipo de pessoa</label>
            <select id="clTipo" class="select">
              <option value="pf" ${meta.tipo !== 'pj' ? 'selected' : ''}>Pessoa Física</option>
              <option value="pj" ${meta.tipo === 'pj' ? 'selected' : ''}>Pessoa Jurídica</option>
            </select>
          </div>
          <div>
            <label class="label">Situação</label>
            <select id="clAtivo" class="select">
              <option value="true" ${!cliente || cliente.is_active !== false ? "selected" : ""}>Ativo</option>
              <option value="false" ${cliente && cliente.is_active === false ? "selected" : ""}>Inativo</option>
            </select>
          </div>
          <div class="full" id="wrapDocumento">
            <label class="label" id="labelDocumento">CPF</label>
            <div class="cnpj-row">
              <input id="clDocumento" class="field" value="${escapeHtml(meta.tipo === 'pj' ? fmtCnpj(meta.documento) : meta.documento)}" placeholder="Somente números ou formatado" />
              <button id="btnBuscarCnpj" class="btn btn-secondary" type="button" ${meta.tipo === 'pj' ? '' : 'style="display:none"'}>Buscar CNPJ</button>
            </div>
            <div class="client-tip" id="clientTipDocumento">Para PJ, o sistema consulta automaticamente os dados cadastrais do CNPJ.</div>
          </div>
          <div class="full">
            <label class="label">Nome / Razão Social *</label>
            <input id="clNome" class="field" value="${escapeHtml(cliente ? cliente.name || "" : "")}" placeholder="Nome do cliente ou razão social" />
          </div>
          <div class="full" id="wrapFantasia" ${meta.tipo === 'pj' ? '' : 'style="display:none"'}>
            <label class="label">Nome Fantasia</label>
            <input id="clFantasia" class="field" value="${escapeHtml(meta.fantasia || "")}" placeholder="Nome fantasia" />
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
            <input id="clAddress" class="field" value="${escapeHtml(cliente ? cliente.address || "" : "")}" placeholder="Rua, número, bairro, cidade" />
          </div>
          <div>
            <label class="label">CEP</label>
            <input id="clCep" class="field client-readonly" value="${escapeHtml(fmtCep(meta.cep || ''))}" readonly />
          </div>
          <div>
            <label class="label">Cidade / UF</label>
            <input id="clCidadeUf" class="field client-readonly" value="${escapeHtml([meta.municipio || '', meta.uf || ''].filter(Boolean).join(' / '))}" readonly />
          </div>
          <div class="full">
            <label class="label">Observações</label>
            <textarea id="clNotes" class="textarea" placeholder="Notas internas">${escapeHtml(parsed.cleanNotes || "")}</textarea>
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
    $("#fecharModalCliente", backdrop).addEventListener("click", fechar);

    const clTipo = $("#clTipo", backdrop);
    const clDocumento = $("#clDocumento", backdrop);
    const labelDocumento = $("#labelDocumento", backdrop);
    const btnBuscarCnpj = $("#btnBuscarCnpj", backdrop);
    const wrapFantasia = $("#wrapFantasia", backdrop);
    const clientTipDocumento = $("#clientTipDocumento", backdrop);

    function syncTipoUI() {
      const isPj = clTipo.value === "pj";
      labelDocumento.textContent = isPj ? "CNPJ" : "CPF";
      btnBuscarCnpj.style.display = isPj ? "" : "none";
      wrapFantasia.style.display = isPj ? "" : "none";
      clientTipDocumento.textContent = isPj
        ? "Digite o CNPJ e clique em Buscar CNPJ para preencher os dados da empresa."
        : "Para PF, o preenchimento é manual e o documento ficará salvo no cadastro interno.";
    }
    clTipo.addEventListener("change", syncTipoUI);
    syncTipoUI();

    btnBuscarCnpj.addEventListener("click", async () => {
      erro.textContent = "";
      erro.classList.remove("show");
      btnBuscarCnpj.disabled = true;
      btnBuscarCnpj.textContent = "Buscando...";
      try {
        const data = await fetchCnpjData(clDocumento.value);
        $("#clNome", backdrop).value = data.razao_social || $("#clNome", backdrop).value;
        $("#clFantasia", backdrop).value = data.nome_fantasia || $("#clFantasia", backdrop).value;
        $("#clPhone", backdrop).value = fmtPhone(data.ddd_telefone_1 || data.ddd_telefone_2 || $("#clPhone", backdrop).value);
        $("#clEmail", backdrop).value = data.email || $("#clEmail", backdrop).value;
        $("#clAddress", backdrop).value = buildAddressFromBrasilApi(data) || $("#clAddress", backdrop).value;
        $("#clCep", backdrop).value = fmtCep(data.cep || "");
        $("#clCidadeUf", backdrop).value = [data.municipio || "", data.uf || ""].filter(Boolean).join(" / ");
        clDocumento.value = fmtCnpj(onlyDigits(clDocumento.value));
      } catch (e) {
        erro.textContent = e.message || String(e);
        erro.classList.add("show");
      } finally {
        btnBuscarCnpj.disabled = false;
        btnBuscarCnpj.textContent = "Buscar CNPJ";
      }
    });

    $("#salvarModalCliente", backdrop).addEventListener("click", async () => {
      erro.textContent = "";
      erro.classList.remove("show");

      const tipo = clTipo.value === "pj" ? "pj" : "pf";
      const nome = $("#clNome", backdrop).value.trim();
      const documento = onlyDigits(clDocumento.value);

      if (!nome) {
        erro.textContent = tipo === "pj" ? "Informe a razão social." : "Informe o nome do cliente.";
        erro.classList.add("show");
        return;
      }
      if (tipo === "pj" && documento.length !== 14) {
        erro.textContent = "Informe um CNPJ válido com 14 dígitos.";
        erro.classList.add("show");
        return;
      }

      const metaPayload = {
        tipo,
        documento,
        fantasia: $("#clFantasia", backdrop)?.value.trim() || "",
        cep: onlyDigits($("#clCep", backdrop).value),
        municipio: ($("#clCidadeUf", backdrop).value.split("/")[0] || "").trim(),
        uf: ($("#clCidadeUf", backdrop).value.split("/")[1] || "").trim()
      };

      const payload = {
        company_id: companyId,
        name: nome,
        email: $("#clEmail", backdrop).value.trim() || null,
        phone: onlyDigits($("#clPhone", backdrop).value) || null,
        address: $("#clAddress", backdrop).value.trim() || null,
        notes: buildNotes($("#clNotes", backdrop).value, metaPayload),
        is_active: $("#clAtivo", backdrop).value === "true"
      };

      let r;
      if (cliente && cliente.id) {
        r = await ctx.sb.db.from("customers").update(payload).eq("company_id", companyId).eq("id", cliente.id);
      } else {
        r = await ctx.sb.db.from("customers").insert(payload);
      }

      if (r.error) {
        erro.textContent = r.error.message || "Falha ao salvar cliente.";
        erro.classList.add("show");
        return;
      }

      fechar();
      if (typeof refresh === "function") await refresh();
      alert(cliente && cliente.id ? "Cliente atualizado." : "Cliente cadastrado.");
    });
  }

  function abrirModalContato(ctx, cliente, contato, refresh) {
    const companyId = (ctx.companyId || ctx.sb?.companyId || window.sb?.companyId);
    if (!companyId) return alert("company_id não configurado.");

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${contato ? "Editar Contato" : "Novo Contato"}</div>
            <div class="panel-sub">Contato vinculado ao cliente ${escapeHtml(cliente.name || "")}</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalContato">Fechar</button>
        </div>
        <div class="alert error" id="erroModalContato"></div>
        <div class="client-form-grid">
          <div class="full">
            <label class="label">Nome do contato *</label>
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
    $("#fecharModalContato", backdrop).addEventListener("click", fechar);

    $("#salvarModalContato", backdrop).addEventListener("click", async () => {
      erro.textContent = "";
      erro.classList.remove("show");

      const nome = $("#ctNome", backdrop).value.trim();
      if (!nome) {
        erro.textContent = "Informe o nome do contato.";
        erro.classList.add("show");
        return;
      }

      const payload = {
        company_id: companyId,
        client_id: cliente.id,
        name: nome,
        email: $("#ctEmail", backdrop).value.trim() || null,
        phone: onlyDigits($("#ctPhone", backdrop).value) || null,
        address: $("#ctAddress", backdrop).value.trim() || null,
        is_primary: $("#ctPrincipal", backdrop).value === "true"
      };

      let r;
      try {
        if (contato && contato.id) {
          r = await ctx.sb.db.from("client_contacts").update(payload).eq("company_id", companyId).eq("id", contato.id);
        } else {
          r = await ctx.sb.db.from("client_contacts").insert(payload);
        }
      } catch (e) {
        erro.textContent = "Tabela client_contacts não encontrada. Crie-a no banco para usar contatos vinculados.";
        erro.classList.add("show");
        return;
      }

      if (r && r.error) {
        erro.textContent = r.error.message || "Falha ao salvar contato.";
        erro.classList.add("show");
        return;
      }

      fechar();
      if (typeof refresh === "function") await refresh();
      alert(contato && contato.id ? "Contato atualizado." : "Contato adicionado.");
    });
  }

  window.ModuloClientes = {
    listarClientes
  };
})();
