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

  function badgeStatus(status) {
    const s = String(status || "").toLowerCase();
    const mapa = {
      aberta: "Aberta",
      em_execucao: "Em andamento",
      aguardando_peca: "Aguardando material",
      finalizada: "Concluída",
      cancelada: "Cancelada"
    };
    return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(mapa[s] || status || "—")}</span>`;
  }

  function injetarCss() {
    if (document.getElementById("css-ordens-pro-v2")) return;
    const st = document.createElement("style");
    st.id = "css-ordens-pro-v2";
    st.textContent = `
      .os-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:18px}
      .os-list-item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer}
      .os-list-item.active{border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.12)}
      .os-top{display:flex;justify-content:space-between;gap:10px}
      .os-title{font-weight:800;color:#eff6ff}
      .os-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .os-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
      .os-info-box{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-top:12px}
      .check-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:12px}
      .check-item{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid rgba(108,152,232,.10);border-radius:10px;background:rgba(255,255,255,.02)}
      .os-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px}
      .os-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .os-kpi-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .os-kpi-value{font-size:18px;font-weight:800;color:#eff6ff}
      .btn.btn-success{background:#14845f;color:#fff}
      .btn.btn-warning{background:#8a6612;color:#fff}
      @media (max-width:1100px){.os-grid{grid-template-columns:1fr}.check-grid,.os-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }



  async function syncTicketStatusFromWorkorder(ctx, ticketId, workorderStatus) {
    if (!ticketId) return;
    const s = String(workorderStatus || "").toLowerCase();
    let ticketStatus = null;
    if (["aberta", "aguardando_peca", "em_execucao"].includes(s)) ticketStatus = "em_andamento";
    else if (s === "finalizada") ticketStatus = "finalizado";
    else if (s === "cancelada") ticketStatus = "cancelado";
    if (!ticketStatus) return;
    const upd = await ctx.sb.db.from("tickets").update({ status: ticketStatus }).eq("company_id", ctx.companyId).eq("id", ticketId);
    if (upd.error) throw upd.error;
  }

  async function listarOrdens(ctx) {
    injetarCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de ordens não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = { busca: "", status: "", ordens: [], selecionada: null };

    alvo.innerHTML = `
      <div class="toolbar">
        <input id="filtroBuscaOS" class="field" placeholder="Buscar por descrição, ticket, orçamento ou OS">
        <select id="filtroStatusOS" class="select">
          <option value="">Todos os status</option>
          <option value="aberta">Aberta</option>
          <option value="aguardando_peca">Aguardando material</option>
          <option value="em_execucao">Em andamento</option>
          <option value="finalizada">Concluída</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      <div class="os-grid">
        <div class="panel">
          <h2>Lista de Ordens</h2>
          <div class="panel-sub">Produção e instalação</div>
          <div id="listaOrdensWrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe da Ordem</h2>
          <div class="panel-sub">Status, checklist e vínculo operacional</div>
          <div id="detalheOrdemWrap" class="empty">Selecione uma ordem.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaOS", alvo).addEventListener("input", async (e) => { state.busca = e.target.value || ""; await carregarLista(); });
    $("#filtroStatusOS", alvo).addEventListener("change", async (e) => { state.status = e.target.value || ""; await carregarLista(); });

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaOrdensWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando ordens...</div>`;

      let query = ctx.sb.db.from("workorders")
        .select("id, quote_id, ticket_id, desc, status, due_date, created_at, updated_at, priority, notes")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false });

      if (state.status) query = query.eq("status", state.status);

      const { data, error } = await query;
      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar ordens.</div>`;
        throw error;
      }

      const busca = state.busca.trim().toLowerCase();
      state.ordens = (data || []).filter((o) => !busca || [o.id, o.quote_id, o.ticket_id, o.desc, o.status].join(" ").toLowerCase().includes(busca));

      if (!state.ordens.length) {
        wrap.innerHTML = `<div class="empty">Nenhuma ordem encontrada.</div>`;
        $("#detalheOrdemWrap", alvo).innerHTML = `<div class="empty">Selecione uma ordem.</div>`;
        return;
      }

      wrap.innerHTML = state.ordens.map((o) => `
        <div class="os-list-item ${state.selecionada && state.selecionada.id === o.id ? "active" : ""}" data-id="${o.id}">
          <div class="os-top">
            <div>
              <div class="os-title">OS ${escapeHtml(o.id)}</div>
              <div class="os-meta">Orçamento: ${escapeHtml(o.quote_id || "—")}</div>
            </div>
            <div>${badgeStatus(o.status)}</div>
          </div>
          <div class="os-meta">Ticket: ${escapeHtml(o.ticket_id || "—")}</div>
          <div class="os-meta">Criada em: ${escapeHtml(formatarDataHora(o.created_at))}</div>
          <div style="margin-top:8px">${escapeHtml((o.desc || "").slice(0, 90) || "Sem descrição")}</div>
        </div>
      `).join("");

      $$(".os-list-item", wrap).forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          state.selecionada = state.ordens.find((x) => x.id === id) || null;
          await carregarDetalhe();
          await carregarLista();
        });
      });

      if (!state.selecionada) state.selecionada = state.ordens[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheOrdemWrap", alvo);
      if (!state.selecionada) {
        wrap.innerHTML = `<div class="empty">Selecione uma ordem.</div>`;
        return;
      }

      window.__osSelecionadaId = state.selecionada.id;
      wrap.innerHTML = `<div class="empty">Carregando detalhe...</div>`;

      const [ticketResp, quoteResp, checklistResp, comprasResp] = await Promise.all([
        state.selecionada.ticket_id ? ctx.sb.db.from("tickets").select("client_name, client_phone, description, due_date").eq("id", state.selecionada.ticket_id).maybeSingle() : Promise.resolve({ data: null }),
        state.selecionada.quote_id ? ctx.sb.db.from("quotes").select("total, status").eq("id", state.selecionada.quote_id).maybeSingle() : Promise.resolve({ data: null }),
        state.selecionada.ticket_id ? ctx.sb.db.from("ticket_checklist").select("*").eq("ticket_id", state.selecionada.ticket_id).maybeSingle() : Promise.resolve({ data: null }),
        ctx.sb.db.from("purchases").select("id, description, total, status, created_at").eq("workorder_id", state.selecionada.id).order("created_at", { ascending: false })
      ]);

      const ticket = ticketResp.data || null;
      const quote = quoteResp.data || null;
      const checklist = checklistResp.data || {
        measured: false, materials_bought: false, production_started: false,
        finishing_done: false, installed: false, final_paid: false
      };
      const compras = comprasResp.data || [];

      wrap.innerHTML = `
        <div class="os-actions">
          <button id="btnStatusAberta" class="btn btn-secondary">Aberta</button>
          <button id="btnStatusMaterial" class="btn btn-warning">Aguardando Material</button>
          <button id="btnStatusProducao" class="btn btn-primary">Em Produção</button>
          <button id="btnStatusInstalacao" class="btn btn-success">Em Instalação</button>
          <button id="btnStatusConcluida" class="btn btn-success">Concluir</button>
          <button id="btnIrCompras" class="btn btn-secondary">Nova Compra Vinculada</button>
        </div>

        <div class="os-kpis">
          <div class="os-kpi"><div class="os-kpi-label">Status</div><div class="os-kpi-value">${escapeHtml(({aberta:'Aberta', aguardando_peca:'Aguardando material', em_execucao:'Em andamento', finalizada:'Concluída', cancelada:'Cancelada'})[state.selecionada.status || 'aberta'] || state.selecionada.status || 'Aberta')}</div></div>
          <div class="os-kpi"><div class="os-kpi-label">Total do Orçamento</div><div class="os-kpi-value">${quote ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(quote.total || 0)) : "—"}</div></div>
          <div class="os-kpi"><div class="os-kpi-label">Compras vinculadas</div><div class="os-kpi-value">${compras.length}</div></div>
        </div>

        <div class="os-info-box">
          <div class="os-title">Dados da Ordem</div>
          <div class="os-meta">OS: ${escapeHtml(state.selecionada.id)}</div>
          <div class="os-meta">Orçamento: ${escapeHtml(state.selecionada.quote_id || "—")}</div>
          <div class="os-meta">Ticket: ${escapeHtml(state.selecionada.ticket_id || "—")}</div>
          <div class="os-meta">Prazo: ${escapeHtml(formatarData(state.selecionada.due_date || ticket?.due_date || null))}</div>
          <div style="margin-top:8px">${escapeHtml(state.selecionada.desc || ticket?.description || "Sem descrição.")}</div>
        </div>

        <div class="os-info-box">
          <div class="os-title">Cliente</div>
          <div class="os-meta">Nome: ${escapeHtml(ticket?.client_name || "—")}</div>
          <div class="os-meta">Telefone: ${escapeHtml(ticket?.client_phone || "—")}</div>
        </div>

        <div class="os-info-box">
          <div class="os-title">Checklist Operacional</div>
          <div class="check-grid">
            ${renderCheck("measured", "Medição feita", checklist.measured)}
            ${renderCheck("materials_bought", "Materiais comprados", checklist.materials_bought)}
            ${renderCheck("production_started", "Produção iniciada", checklist.production_started)}
            ${renderCheck("finishing_done", "Acabamento concluído", checklist.finishing_done)}
            ${renderCheck("installed", "Instalado", checklist.installed)}
            ${renderCheck("final_paid", "Pagamento final", checklist.final_paid)}
          </div>
          <div class="os-actions" style="margin-top:12px">
            <button id="btnSalvarChecklist" class="btn btn-primary">Salvar Checklist</button>
          </div>
        </div>

        <div class="os-info-box">
          <div class="os-title">Compras vinculadas</div>
          ${compras.length ? compras.map((c) => `
            <div class="os-meta" style="margin-top:8px">
              ${escapeHtml(c.description || "Compra")} • ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(c.total || 0))} • ${escapeHtml(c.status || "draft")}
            </div>
          `).join("") : `<div class="os-meta" style="margin-top:8px">Nenhuma compra vinculada a esta ordem.</div>`}
        </div>
      `;

      $("#btnStatusAberta", wrap).addEventListener("click", () => atualizarStatus("aberta"));
      $("#btnStatusMaterial", wrap).addEventListener("click", () => atualizarStatus("aguardando_peca"));
      $("#btnStatusProducao", wrap).addEventListener("click", () => atualizarStatus("em_execucao"));
      $("#btnStatusInstalacao", wrap).addEventListener("click", () => atualizarStatus("em_execucao"));
      $("#btnStatusConcluida", wrap).addEventListener("click", () => atualizarStatus("finalizada"));
      $("#btnSalvarChecklist", wrap).addEventListener("click", salvarChecklist);
      $("#btnIrCompras", wrap).addEventListener("click", () => {
        window.__osSelecionadaId = state.selecionada.id;
        location.hash = "#compras";
      });

      async function atualizarStatus(novoStatus) {
        const r = await ctx.sb.db.from("workorders").update({
          status: novoStatus
        }).eq("id", state.selecionada.id);

        if (r.error) return alert("Falha ao atualizar status: " + (r.error.message || r.error));
        try {
          await syncTicketStatusFromWorkorder(ctx, state.selecionada.ticket_id, novoStatus);
        } catch (syncErr) {
          return alert("Status da Ordem atualizado, mas falhou ao sincronizar o chamado: " + (syncErr.message || syncErr));
        }
        state.selecionada.status = novoStatus;
        alert("Status da Ordem atualizado.");
        await carregarLista();
      }

      async function salvarChecklist() {
        if (!state.selecionada.ticket_id) return alert("Esta ordem não possui ticket vinculado.");
        const payload = {
          ticket_id: state.selecionada.ticket_id,
          measured: $("#ck_measured", wrap).checked,
          materials_bought: $("#ck_materials_bought", wrap).checked,
          production_started: $("#ck_production_started", wrap).checked,
          finishing_done: $("#ck_finishing_done", wrap).checked,
          installed: $("#ck_installed", wrap).checked,
          final_paid: $("#ck_final_paid", wrap).checked,
          updated_at: new Date().toISOString()
        };

        const up = await ctx.sb.db.from("ticket_checklist").upsert(payload, { onConflict: "ticket_id" });
        if (up.error) return alert("Falha ao salvar checklist: " + (up.error.message || up.error));
        alert("Checklist salvo com sucesso.");
      }
    }

    function renderCheck(field, label, checked) {
      return `
        <label class="check-item">
          <input id="ck_${escapeHtml(field)}" type="checkbox" ${checked ? "checked" : ""}>
          <span>${escapeHtml(label)}</span>
        </label>
      `;
    }
  }

  window.ModuloOrdens = { listarOrdens };
})();