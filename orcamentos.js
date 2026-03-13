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

  function formatarMoeda(v) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
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

  function hojeISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDias(dataISO, dias) {
    const d = new Date(`${dataISO}T12:00:00`);
    d.setDate(d.getDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  function badgeStatus(status) {
    const s = String(status || "").toLowerCase();
    if (s === "approved") return '<span class="status-pill status-approved">Aprovado</span>';
    if (s === "sent") return '<span class="status-pill status-sent">Enviado</span>';
    if (s === "rejected") return '<span class="status-pill status-rejected">Recusado</span>';
    return '<span class="status-pill status-draft">Rascunho</span>';
  }

  function injectCss() {
    if (document.getElementById("css-orcamentos-v2")) return;
    const st = document.createElement("style");
    st.id = "css-orcamentos-v2";
    st.textContent = `
      .orc-resumo{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
      .orc-card{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px}
      .orc-card-label{font-size:12px;color:#9db3d6;margin-bottom:6px}
      .orc-card-value{font-size:20px;font-weight:800;color:#eff6ff}
      .orc-toolbar{display:grid;grid-template-columns:1.3fr .7fr;gap:10px;margin-bottom:14px}
      .orc-grid{display:grid;grid-template-columns:1fr 1.35fr;gap:16px}
      .orc-list-item{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:12px;padding:12px;margin-bottom:10px;cursor:pointer}
      .orc-list-item.active{border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.12)}
      .orc-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .orc-title{font-weight:800;color:#eff6ff}
      .orc-id,.orc-meta{font-size:12px;color:#9db3d6;margin-top:4px}
      .orc-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
      .orc-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
      .orc-kpi{border:1px solid rgba(108,152,232,.14);background:rgba(255,255,255,.02);border-radius:10px;padding:10px}
      .orc-kpi-label{font-size:12px;color:#9db3d6}
      .orc-kpi-value{font-size:16px;font-weight:800;color:#eff6ff}
      .receber-line{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid rgba(108,152,232,.10)}
      .receber-line:last-child{border-bottom:none}
      @media (max-width: 1100px){.orc-grid,.orc-toolbar,.orc-resumo,.orc-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(st);
  }

  async function listarOrcamentos(ctx) {
    injectCss();

    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de orçamentos não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = {
      busca: "",
      status: "",
      orcamentos: [],
      selecionado: null,
      focusQuoteId: null,
      focusTicketId: null
    };

    try {
      state.focusQuoteId = sessionStorage.getItem("sgb_orcamentos_focus_quote_id") || null;
      state.focusTicketId = sessionStorage.getItem("sgb_orcamentos_focus_ticket_id") || null;
      if (state.focusQuoteId && !state.busca) state.busca = state.focusQuoteId;
      else if (state.focusTicketId && !state.busca) state.busca = state.focusTicketId;
    } catch (_) {}

    alvo.innerHTML = `
      <div class="orc-resumo">
        <div class="orc-card"><div class="orc-card-label">Total de Orçamentos</div><div class="orc-card-value" id="resumoTotalOrc">0</div></div>
        <div class="orc-card"><div class="orc-card-label">Rascunhos</div><div class="orc-card-value" id="resumoDraft">0</div></div>
        <div class="orc-card"><div class="orc-card-label">Enviados</div><div class="orc-card-value" id="resumoSent">0</div></div>
        <div class="orc-card"><div class="orc-card-label">Aprovados</div><div class="orc-card-value" id="resumoApproved">0</div></div>
      </div>

      <div class="orc-toolbar">
        <input id="filtroBuscaOrc" class="field" placeholder="Buscar por cliente, ticket ou ID do orçamento" value="${escapeHtml(state.busca)}">
        <select id="filtroStatusOrc" class="select">
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="sent">Enviado</option>
          <option value="approved">Aprovado</option>
          <option value="rejected">Recusado</option>
        </select>
      </div>

      <div class="orc-grid">
        <div class="panel">
          <h2>Lista de orçamentos</h2>
          <div class="panel-sub">Orçamentos gerados a partir dos chamados</div>
          <div id="listaOrcamentosWrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe do orçamento</h2>
          <div class="panel-sub">Itens, totais, aprovação e contas a receber</div>
          <div id="detalheOrcamentoWrap" class="empty">Selecione um orçamento.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaOrc", alvo).addEventListener("input", async (e) => {
      state.busca = e.target.value || "";
      await carregarLista();
    });

    $("#filtroStatusOrc", alvo).addEventListener("change", async (e) => {
      state.status = e.target.value || "";
      await carregarLista();
    });

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaOrcamentosWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando orçamentos...</div>`;

      let query = ctx.sb.db
        .from("quotes")
        .select("id, ticket_id, customer_id, status, subtotal, discount, surcharge, total, created_at, updated_at, version")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false });

      if (state.status) query = query.eq("status", state.status);

      const { data, error } = await query;
      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar orçamentos.</div>`;
        throw error;
      }

      const busca = state.busca.trim().toLowerCase();
      state.orcamentos = (data || []).filter((x) => {
        if (!busca) return true;
        return [x.id, x.ticket_id, x.customer_id, x.status].join(" ").toLowerCase().includes(busca);
      });

      if (state.focusQuoteId) {
        const foco = state.orcamentos.find((x) => x.id === state.focusQuoteId) || null;
        if (foco) {
          state.selecionado = foco;
          try {
            sessionStorage.removeItem("sgb_orcamentos_focus_quote_id");
            sessionStorage.removeItem("sgb_orcamentos_focus_ticket_id");
          } catch (_) {}
          state.focusQuoteId = null;
          state.focusTicketId = null;
        }
      }

      $("#resumoTotalOrc").textContent = String(state.orcamentos.length);
      $("#resumoDraft").textContent = String(state.orcamentos.filter((x) => x.status === "draft").length);
      $("#resumoSent").textContent = String(state.orcamentos.filter((x) => x.status === "sent").length);
      $("#resumoApproved").textContent = String(state.orcamentos.filter((x) => x.status === "approved").length);

      if (!state.orcamentos.length) {
        wrap.innerHTML = `<div class="empty">Nenhum orçamento encontrado.</div>`;
        $("#detalheOrcamentoWrap", alvo).innerHTML = `<div class="empty">Selecione um orçamento.</div>`;
        return;
      }

      wrap.innerHTML = state.orcamentos.map((x) => `
        <div class="orc-list-item ${state.selecionado && state.selecionado.id === x.id ? "active" : ""}" data-id="${x.id}">
          <div class="orc-top">
            <div>
              <div class="orc-title">Orçamento v${escapeHtml(x.version || 1)}</div>
              <div class="orc-id">ID: ${escapeHtml(x.id)}</div>
            </div>
            <div>${badgeStatus(x.status)}</div>
          </div>
          <div class="orc-meta">Ticket: ${escapeHtml(x.ticket_id || "—")}</div>
          <div class="orc-meta">Criado em: ${escapeHtml(formatarDataHora(x.created_at))}</div>
          <div style="margin-top:8px"><strong>Total:</strong> ${formatarMoeda(x.total || 0)}</div>
        </div>
      `).join("");

      $$(".orc-list-item", wrap).forEach((el) => {
        el.addEventListener("click", async () => {
          const id = el.getAttribute("data-id");
          state.selecionado = state.orcamentos.find((y) => y.id === id) || null;
          await carregarDetalhe();
          await carregarLista();
        });
      });

      if (!state.selecionado) state.selecionado = state.orcamentos[0];
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheOrcamentoWrap", alvo);
      if (!state.selecionado) {
        wrap.innerHTML = `<div class="empty">Selecione um orçamento.</div>`;
        return;
      }

      wrap.innerHTML = `<div class="empty">Carregando detalhe...</div>`;

      const [ticketResp, workorderResp, recResp] = await Promise.all([
        state.selecionado.ticket_id
          ? ctx.sb.db.from("tickets").select("id, client_name, client_phone, description, customer_id").eq("id", state.selecionado.ticket_id).maybeSingle()
          : Promise.resolve({ data: null }),
        ctx.sb.db.from("workorders").select("id, status, created_at").eq("quote_id", state.selecionado.id).maybeSingle(),
        ctx.sb.db.from("receivables").select("id, due_date, amount, paid, paid_at").eq("quote_id", state.selecionado.id).order("due_date", { ascending: true })
      ]);

      const ticket = ticketResp.data || null;
      const workorder = workorderResp.data || null;
      const recs = recResp.data || [];

      wrap.innerHTML = `
        <div class="orc-actions">
          ${state.selecionado.status === "draft" ? `<button id="btnMarcarEnviado" class="btn btn-primary">Marcar como Enviado</button>` : ""}
          ${state.selecionado.status !== "approved" ? `<button id="btnAprovarOrc" class="btn btn-success">Aprovar + Gerar Recebíveis</button>` : `<button class="btn btn-secondary" disabled>Já aprovado</button>`}
          ${state.selecionado.status !== "rejected" ? `<button id="btnRecusarOrc" class="btn btn-danger">Recusar</button>` : `<button class="btn btn-secondary" disabled>Já recusado</button>`}
        </div>

        <div class="orc-kpis">
          <div class="orc-kpi"><div class="orc-kpi-label">Subtotal</div><div class="orc-kpi-value">${formatarMoeda(state.selecionado.subtotal || 0)}</div></div>
          <div class="orc-kpi"><div class="orc-kpi-label">Desconto / Acréscimo</div><div class="orc-kpi-value">${formatarMoeda((state.selecionado.surcharge || 0) - (state.selecionado.discount || 0))}</div></div>
          <div class="orc-kpi"><div class="orc-kpi-label">Total Final</div><div class="orc-kpi-value">${formatarMoeda(state.selecionado.total || 0)}</div></div>
        </div>

        <div class="quote-info-box">
          <div><strong>Cliente:</strong> ${escapeHtml(ticket?.client_name || "—")}</div>
          <div><strong>Telefone:</strong> ${escapeHtml(ticket?.client_phone || "—")}</div>
          <div><strong>Status:</strong> ${escapeHtml(state.selecionado.status || "—")}</div>
          <div><strong>Ticket:</strong> ${escapeHtml(state.selecionado.ticket_id || "—")}</div>
          <div><strong>OS:</strong> ${escapeHtml(workorder?.id || "—")}</div>
          <div><strong>Descrição:</strong> ${escapeHtml(ticket?.description || "—")}</div>
        </div>

        <div class="quote-info-box" style="margin-top:12px">
          <div class="mini-card-title">Contas a receber deste orçamento</div>
          ${recs.length ? recs.map((r) => `
            <div class="receber-line">
              <div>
                <div>Vencimento: ${escapeHtml(formatarData(r.due_date))}</div>
                <div class="mini-muted">Pago em: ${escapeHtml(formatarDataHora(r.paid_at))}</div>
              </div>
              <div style="text-align:right">
                <div>${formatarMoeda(r.amount || 0)}</div>
                <div>${r.paid ? "Pago" : "Em aberto"}</div>
              </div>
            </div>
          `).join("") : `<div class="mini-muted">Nenhum recebível criado ainda.</div>`}
        </div>
      `;

      const btnEnv = $("#btnMarcarEnviado", wrap);
      if (btnEnv) {
        btnEnv.addEventListener("click", async () => {
          const upd = await ctx.sb.db.from("quotes").update({ status: "sent" }).eq("id", state.selecionado.id);
          if (upd.error) return alert("Falha ao marcar como enviado: " + (upd.error.message || upd.error));
          alert("Orçamento marcado como enviado.");
          state.selecionado = null;
          await carregarLista();
        });
      }

      const btnRec = $("#btnRecusarOrc", wrap);
      if (btnRec) {
        btnRec.addEventListener("click", async () => {
          const upd = await ctx.sb.db.from("quotes").update({ status: "rejected" }).eq("id", state.selecionado.id);
          if (upd.error) return alert("Falha ao recusar orçamento: " + (upd.error.message || upd.error));
          alert("Orçamento recusado.");
          state.selecionado = null;
          await carregarLista();
        });
      }

      const btnApr = $("#btnAprovarOrc", wrap);
      if (btnApr) {
        btnApr.addEventListener("click", async () => {
          await abrirModalAprovacao(ctx, state.selecionado, ticket, workorder, async () => {
            state.selecionado = null;
            await carregarLista();
          });
        });
      }
    }
  }

  async function abrirModalAprovacao(ctx, quote, ticket, workorderAtual, onSaved) {
    const total = Number(quote.total || 0);

    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">Aprovar Orçamento e Gerar Recebíveis</div>
            <div class="panel-sub">Ao confirmar, o sistema aprova o orçamento, cria a OS se necessário e gera as parcelas.</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalAprovacao">Fechar</button>
        </div>

        <div class="alert error" id="erroModalAprovacao"></div>

        <div class="quote-info-box">
          <div><strong>Cliente:</strong> ${escapeHtml(ticket?.client_name || "—")}</div>
          <div><strong>Valor total:</strong> ${formatarMoeda(total)}</div>
          <div><strong>Ticket:</strong> ${escapeHtml(quote.ticket_id || "—")}</div>
          <div><strong>OS atual:</strong> ${escapeHtml(workorderAtual?.id || "Será criada automaticamente")}</div>
        </div>

        <div class="grid-form" style="margin-top:12px">
          <div>
            <label class="label">Quantidade de parcelas</label>
            <input id="qtdParcelasAprovacao" class="field" type="number" min="1" max="12" value="1">
          </div>
          <div>
            <label class="label">Primeiro vencimento</label>
            <input id="primeiroVencAprovacao" class="field" type="date" value="${hojeISO()}">
          </div>
          <div>
            <label class="label">Intervalo em dias</label>
            <input id="intervaloAprovacao" class="field" type="number" min="1" value="30">
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelarModalAprovacao">Cancelar</button>
          <button class="btn btn-success" id="confirmarModalAprovacao">Confirmar Aprovação</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalAprovacao", backdrop).addEventListener("click", fechar);
    $("#cancelarModalAprovacao", backdrop).addEventListener("click", fechar);
    const erro = $("#erroModalAprovacao", backdrop);

    $("#confirmarModalAprovacao", backdrop).addEventListener("click", async () => {
      erro.textContent = "";
      erro.classList.remove("show");

      const qtd = Math.max(1, Number($("#qtdParcelasAprovacao", backdrop).value || 1));
      const primeiroVenc = $("#primeiroVencAprovacao", backdrop).value || hojeISO();
      const intervalo = Math.max(1, Number($("#intervaloAprovacao", backdrop).value || 30));

      try {
        const existente = await ctx.sb.db.from("receivables").select("id").eq("quote_id", quote.id);
        if (existente.error) throw existente.error;
        if ((existente.data || []).length) {
          erro.textContent = "Este orçamento já possui contas a receber geradas.";
          erro.classList.add("show");
          return;
        }

        const updQuote = await ctx.sb.db.from("quotes").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", quote.id);
        if (updQuote.error) throw updQuote.error;

        let workorderId = workorderAtual?.id || null;
        if (!workorderId) {
          const criaOS = await ctx.sb.db
            .from("workorders")
            .insert({
              company_id: ctx.companyId,
              quote_id: quote.id,
              ticket_id: quote.ticket_id || null,
              desc: ticket?.description || "Ordem criada automaticamente a partir do orçamento aprovado",
              status: "aberta",
              due_date: primeiroVenc
            })
            .select("id")
            .maybeSingle();

          if (criaOS.error) throw criaOS.error;
          workorderId = criaOS.data?.id || null;
        }

        const baseValor = Math.floor((total / qtd) * 100) / 100;
        const resto = Number((total - (baseValor * qtd)).toFixed(2));
        const parcelas = [];

        for (let i = 0; i < qtd; i++) {
          let valor = baseValor;
          if (i === qtd - 1) valor = Number((baseValor + resto).toFixed(2));

          parcelas.push({
            company_id: ctx.companyId,
            customer_id: ticket?.customer_id || quote.customer_id || null,
            quote_id: quote.id,
            workorder_id: workorderId,
            amount: valor,
            due_date: addDias(primeiroVenc, intervalo * i),
            paid: false
          });
        }

        const insReceber = await ctx.sb.db.from("receivables").insert(parcelas);
        if (insReceber.error) throw insReceber.error;

        alert("Orçamento aprovado, OS garantida e contas a receber geradas com sucesso.");
        fechar();
        await onSaved();
      } catch (e) {
        erro.textContent = e.message || String(e);
        erro.classList.add("show");
      }
    });
  }

  window.ModuloOrcamentos = { listarOrcamentos };
})();