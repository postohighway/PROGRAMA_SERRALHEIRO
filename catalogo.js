
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
  function money(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
  }
  function parseNumber(v) {
    const n = Number(String(v || "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }
  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
  }
  function badgeTipo(tipo) {
    const txt = String(tipo || "").toLowerCase() === "servico" ? "Serviço" : "Produto";
    return `<span class="status-pill">${escapeHtml(txt)}</span>`;
  }
  function badgeAtivo(flag) {
    return `<span class="status-pill">${flag ? "Ativo" : "Inativo"}</span>`;
  }

  function injectCss() {
    if (document.getElementById("css-catalogo-v1")) return;
    const st = document.createElement("style");
    st.id = "css-catalogo-v1";
    st.textContent = `
      .catalog-grid{display:grid;grid-template-columns:1.35fr .95fr;gap:16px}
      .catalog-list{display:flex;flex-direction:column;gap:10px}
      .catalog-card{padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:14px;background:rgba(255,255,255,.03);cursor:pointer}
      .catalog-card.active{border-color:rgba(61,134,255,.55);box-shadow:0 0 0 1px rgba(61,134,255,.18) inset}
      .catalog-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .catalog-name{font-weight:800;color:#eff6ff}
      .catalog-meta{font-size:12px;color:#9db3d6}
      .catalog-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .catalog-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-bottom:14px}
      .catalog-kpi{padding:14px;border:1px solid rgba(108,152,232,.14);border-radius:14px;background:rgba(255,255,255,.03)}
      .catalog-kpi-label{font-size:12px;color:#9db3d6}
      .catalog-kpi-value{font-size:30px;font-weight:800;color:#eff6ff;margin-top:6px}
      @media (max-width:1100px){.catalog-grid{grid-template-columns:1fr}.catalog-summary{grid-template-columns:repeat(2,minmax(120px,1fr));}}
    `;
    document.head.appendChild(st);
  }

  async function listarCatalogo(ctx) {
    injectCss();
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) return;

    const state = {
      busca: "",
      tipo: "",
      ativo: "ativos",
      itens: [],
      selecionado: null
    };

    alvo.innerHTML = `
      <div class="catalog-summary">
        <div class="catalog-kpi"><div class="catalog-kpi-label">Itens ativos</div><div class="catalog-kpi-value" id="kpiAtivos">0</div></div>
        <div class="catalog-kpi"><div class="catalog-kpi-label">Produtos</div><div class="catalog-kpi-value" id="kpiProdutos">0</div></div>
        <div class="catalog-kpi"><div class="catalog-kpi-label">Serviços</div><div class="catalog-kpi-value" id="kpiServicos">0</div></div>
        <div class="catalog-kpi"><div class="catalog-kpi-label">Categorias</div><div class="catalog-kpi-value" id="kpiCategorias">0</div></div>
      </div>

      <div class="toolbar">
        <input id="catalogBusca" class="field" placeholder="Buscar por nome, categoria ou descrição" />
        <select id="catalogTipo" class="select">
          <option value="">Todos os tipos</option>
          <option value="produto">Produtos</option>
          <option value="servico">Serviços</option>
        </select>
        <select id="catalogAtivo" class="select">
          <option value="ativos">Somente ativos</option>
          <option value="todos">Todos</option>
          <option value="inativos">Somente inativos</option>
        </select>
        <button id="btnNovoItemCatalogo" class="btn btn-primary">Novo Item</button>
      </div>

      <div class="catalog-grid">
        <div class="panel">
          <h2>Produtos e Serviços</h2>
          <div class="panel-sub">Cadastre preços sem depender de alteração no código.</div>
          <div id="catalogLista" class="catalog-list"></div>
        </div>
        <div class="panel">
          <h2>Detalhe do Item</h2>
          <div class="panel-sub">Selecione um item para editar.</div>
          <div id="catalogDetalhe" class="empty">Nenhum item selecionado.</div>
        </div>
      </div>
    `;

    $("#catalogBusca", alvo).addEventListener("input", async e => { state.busca = e.target.value || ""; await carregar(); });
    $("#catalogTipo", alvo).addEventListener("change", async e => { state.tipo = e.target.value || ""; await carregar(); });
    $("#catalogAtivo", alvo).addEventListener("change", async e => { state.ativo = e.target.value || "ativos"; await carregar(); });
    $("#btnNovoItemCatalogo", alvo).addEventListener("click", () => abrirModalCatalogo(ctx, null, carregar));

    await carregar();

    async function carregar() {
      const r = await ctx.sb.db
        .from("products_services")
        .select("id, company_id, item_type, category, name, description, unit, sale_price, cost_price, is_active, created_at, updated_at")
        .eq("company_id", ctx.companyId)
        .order("name", { ascending: true });

      if (r.error) {
        $("#catalogLista", alvo).innerHTML = `<div class="empty">Falha ao carregar catálogo.</div>`;
        $("#catalogDetalhe", alvo).innerHTML = `<div class="empty">${escapeHtml(r.error.message || "Erro")}</div>`;
        return;
      }

      state.itens = (r.data || []).filter(item => {
        if (state.tipo && item.item_type !== state.tipo) return false;
        if (state.ativo === "ativos" && !item.is_active) return false;
        if (state.ativo === "inativos" && item.is_active) return false;
        const busca = String(state.busca || "").trim().toLowerCase();
        if (!busca) return true;
        const txt = [item.name, item.category, item.description, item.item_type, item.unit].join(" ").toLowerCase();
        return txt.includes(busca);
      });

      renderResumo(r.data || []);
      renderLista();
      if (!state.selecionado && state.itens.length) state.selecionado = state.itens[0];
      if (state.selecionado && !state.itens.find(x => x.id === state.selecionado.id)) state.selecionado = state.itens[0] || null;
      renderDetalhe();
    }

    function renderResumo(all) {
      const ativos = all.filter(x => x.is_active).length;
      const produtos = all.filter(x => x.item_type === "produto").length;
      const servicos = all.filter(x => x.item_type === "servico").length;
      const categorias = new Set(all.map(x => String(x.category || "").trim()).filter(Boolean)).size;
      $("#kpiAtivos", alvo).textContent = String(ativos);
      $("#kpiProdutos", alvo).textContent = String(produtos);
      $("#kpiServicos", alvo).textContent = String(servicos);
      $("#kpiCategorias", alvo).textContent = String(categorias);
    }

    function renderLista() {
      const wrap = $("#catalogLista", alvo);
      if (!state.itens.length) {
        wrap.innerHTML = `<div class="empty">Nenhum item encontrado.</div>`;
        return;
      }
      wrap.innerHTML = state.itens.map(item => `
        <div class="catalog-card ${state.selecionado && state.selecionado.id === item.id ? "active" : ""}" data-id="${item.id}">
          <div class="catalog-top">
            <div>
              <div class="catalog-name">${escapeHtml(item.name)}</div>
              <div class="catalog-meta">${escapeHtml(item.category || "Sem categoria")} • ${escapeHtml(item.unit || "un")}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${badgeTipo(item.item_type)}${badgeAtivo(item.is_active)}</div>
          </div>
          <div class="catalog-actions">
            <div class="catalog-meta">Venda: ${money(item.sale_price || 0)}</div>
            <div class="catalog-meta">Custo: ${money(item.cost_price || 0)}</div>
          </div>
        </div>
      `).join("");

      $all(".catalog-card", wrap).forEach(card => card.addEventListener("click", () => {
        const id = card.getAttribute("data-id");
        state.selecionado = state.itens.find(x => x.id === id) || null;
        renderLista();
        renderDetalhe();
      }));
    }

    function renderDetalhe() {
      const wrap = $("#catalogDetalhe", alvo);
      if (!state.selecionado) {
        wrap.innerHTML = `<div class="empty">Nenhum item selecionado.</div>`;
        return;
      }
      const margem = Number(state.selecionado.sale_price || 0) - Number(state.selecionado.cost_price || 0);
      wrap.innerHTML = `
        <div class="mini-card">
          <div class="mini-card-top">
            <div class="mini-card-title">${escapeHtml(state.selecionado.name)}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${badgeTipo(state.selecionado.item_type)}${badgeAtivo(state.selecionado.is_active)}</div>
          </div>
          <div class="mini-card-meta">Categoria: ${escapeHtml(state.selecionado.category || "Sem categoria")}</div>
          <div class="mini-card-meta">Unidade: ${escapeHtml(state.selecionado.unit || "un")}</div>
          <div class="mini-card-meta">Criado em: ${escapeHtml(fmtDate(state.selecionado.created_at))}</div>
          <div class="mini-card-meta">Atualizado em: ${escapeHtml(fmtDate(state.selecionado.updated_at))}</div>
          <div style="margin-top:10px">${escapeHtml(state.selecionado.description || "Sem descrição")}</div>
        </div>
        <div class="mini-card">
          <div class="mini-card-top"><div class="mini-card-title">Preço</div></div>
          <div class="mini-card-meta">Venda: ${money(state.selecionado.sale_price || 0)}</div>
          <div class="mini-card-meta">Custo: ${money(state.selecionado.cost_price || 0)}</div>
          <div class="mini-card-meta">Margem unitária: ${money(margem)}</div>
        </div>
        <div class="modal-actions" style="margin-top:12px;">
          <button id="btnEditarCatalogo" class="btn btn-primary">Editar</button>
          <button id="btnToggleCatalogo" class="btn btn-secondary">${state.selecionado.is_active ? "Inativar" : "Ativar"}</button>
        </div>
      `;

      $("#btnEditarCatalogo", wrap).addEventListener("click", () => abrirModalCatalogo(ctx, state.selecionado, carregar));
      $("#btnToggleCatalogo", wrap).addEventListener("click", async () => {
        const upd = await ctx.sb.db
          .from("products_services")
          .update({ is_active: !state.selecionado.is_active, updated_at: new Date().toISOString() })
          .eq("company_id", ctx.companyId)
          .eq("id", state.selecionado.id);
        if (upd.error) return alert("Falha ao atualizar item: " + (upd.error.message || upd.error));
        await carregar();
      });
    }
  }

  function abrirModalCatalogo(ctx, item, refresh) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${item ? "Editar Item" : "Novo Item"}</div>
            <div class="panel-sub">Cadastre produtos e serviços sem depender de alteração no código.</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalCatalogo">Fechar</button>
        </div>
        <div class="alert error" id="erroModalCatalogo"></div>
        <div class="grid-form">
          <div>
            <label class="label">Tipo</label>
            <select id="catTipo" class="select">
              <option value="produto" ${item && item.item_type === "produto" ? "selected" : ""}>Produto</option>
              <option value="servico" ${item && item.item_type === "servico" ? "selected" : ""}>Serviço</option>
            </select>
          </div>
          <div>
            <label class="label">Categoria</label>
            <input id="catCategoria" class="field" value="${escapeHtml(item ? item.category || "" : "")}" placeholder="Motores, instalação, manutenção..." />
          </div>
          <div class="full">
            <label class="label">Nome</label>
            <input id="catNome" class="field" value="${escapeHtml(item ? item.name || "" : "")}" placeholder="Nome do item" />
          </div>
          <div class="full">
            <label class="label">Descrição</label>
            <textarea id="catDescricao" class="textarea" placeholder="Descrição comercial / técnica">${escapeHtml(item ? item.description || "" : "")}</textarea>
          </div>
          <div>
            <label class="label">Unidade</label>
            <input id="catUnidade" class="field" value="${escapeHtml(item ? item.unit || "un" : "un")}" placeholder="un, m, m², kg, hora" />
          </div>
          <div>
            <label class="label">Preço de venda</label>
            <input id="catVenda" class="field" type="number" step="0.01" min="0" value="${escapeHtml(item ? item.sale_price || 0 : 0)}" />
          </div>
          <div>
            <label class="label">Preço de custo</label>
            <input id="catCusto" class="field" type="number" step="0.01" min="0" value="${escapeHtml(item ? item.cost_price || 0 : 0)}" />
          </div>
          <div>
            <label class="label">Situação</label>
            <select id="catAtivo" class="select">
              <option value="true" ${!item || item.is_active !== false ? "selected" : ""}>Ativo</option>
              <option value="false" ${item && item.is_active === false ? "selected" : ""}>Inativo</option>
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button id="salvarModalCatalogo" class="btn btn-primary">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const erro = $("#erroModalCatalogo", backdrop);
    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalCatalogo", backdrop).addEventListener("click", fechar);

    $("#salvarModalCatalogo", backdrop).addEventListener("click", async () => {
      erro.textContent = "";
      erro.classList.remove("show");

      const payload = {
        company_id: ctx.companyId,
        item_type: $("#catTipo", backdrop).value,
        category: $("#catCategoria", backdrop).value.trim() || null,
        name: $("#catNome", backdrop).value.trim(),
        description: $("#catDescricao", backdrop).value.trim() || null,
        unit: $("#catUnidade", backdrop).value.trim() || "un",
        sale_price: parseNumber($("#catVenda", backdrop).value),
        cost_price: parseNumber($("#catCusto", backdrop).value),
        is_active: $("#catAtivo", backdrop).value === "true",
        updated_at: new Date().toISOString()
      };

      if (!payload.name) {
        erro.textContent = "Informe o nome do item.";
        erro.classList.add("show");
        return;
      }

      let r;
      if (item && item.id) {
        r = await ctx.sb.db
          .from("products_services")
          .update(payload)
          .eq("company_id", ctx.companyId)
          .eq("id", item.id);
      } else {
        r = await ctx.sb.db
          .from("products_services")
          .insert(payload);
      }

      if (r.error) {
        erro.textContent = r.error.message || "Falha ao salvar item.";
        erro.classList.add("show");
        return;
      }

      fechar();
      if (typeof refresh === "function") await refresh();
      alert(item && item.id ? "Item atualizado com sucesso." : "Item criado com sucesso.");
    });
  }

  window.ModuloCatalogo = {
    listarCatalogo
  };
})();
