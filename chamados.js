(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function escapeHtml(texto) {
    return String(texto || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function formatarData(data) {
    if (!data) return "—";
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return String(data);
    return d.toLocaleDateString("pt-BR");
  }
  function formatarDataHora(data) {
    if (!data) return "—";
    const d = new Date(data);
    if (Number.isNaN(d.getTime())) return String(data);
    return d.toLocaleString("pt-BR");
  }
  function badgeStatus(status) {
    const s = String(status || "").toLowerCase().trim();
    return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(traduzirStatus(s))}</span>`;
  }
  function traduzirStatus(status) {
    const mapa = {
      open: "Aberto",
      aberto: "Aberto",
      aguardando_analise: "Aguardando análise",
      em_andamento: "Em andamento",
      finalizado: "Finalizado",
      cancelado: "Cancelado",
      draft: "Rascunho",
      sent: "Enviado",
      approved: "Aprovado",
      rejected: "Recusado",
      aprovado: "Aprovado",
      recusado: "Recusado"
    };
    return mapa[status] || (status || "—");
  }
  function caminhosMidia(ticket) {
    return [ticket.photo1_path, ticket.photo2_path, ticket.photo3_path, ticket.photo4_path, ticket.photo5_path, ticket.video1_path]
      .filter(Boolean);
  }

  async function listarChamados(ctx) {
    const alvo = document.getElementById(ctx.areaId);
    if (!alvo) throw new Error("Área de chamados não encontrada.");
    if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");
    if (!ctx.companyId) throw new Error("Company ID não configurado.");

    const state = {
      busca: "",
      status: "",
      selecionado: null,
      tickets: [],
      historico: [],
      mensagens: []
    };

    alvo.innerHTML = `
      <div class="toolbar">
        <input id="filtroBuscaChamados" class="field" placeholder="Buscar por nome, telefone ou descrição" />
        <select id="filtroStatusChamados" class="select">
          <option value="">Todos os status</option>
          <option value="aberto">Aberto</option>
          <option value="open">Open</option>
          <option value="aguardando_analise">Aguardando análise</option>
          <option value="em_andamento">Em andamento</option>
          <option value="finalizado">Finalizado</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <div></div>
        <button id="btnNovoChamado" class="btn btn-primary">Novo Chamado</button>
      </div>

      <div class="grid-2">
        <div class="panel">
          <h2>Lista de chamados</h2>
          <div class="panel-sub">Buscando registros no banco</div>
          <div id="listaChamadosWrap" class="table-wrap"></div>
        </div>
        <div class="panel">
          <h2>Detalhe do chamado</h2>
          <div class="panel-sub">Selecione um ticket para visualizar</div>
          <div id="detalheChamadoWrap" class="empty">Nenhum chamado selecionado.</div>
        </div>
      </div>
    `;

    $("#filtroBuscaChamados", alvo).addEventListener("input", async (e) => {
      state.busca = e.target.value || "";
      await carregarLista();
    });

    $("#filtroStatusChamados", alvo).addEventListener("change", async (e) => {
      state.status = e.target.value || "";
      await carregarLista();
    });

    $("#btnNovoChamado", alvo).addEventListener("click", () => abrirModalNovoChamado(ctx, state, carregarLista));

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaChamadosWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando chamados...</div>`;

      let query = ctx.sb.db
        .from("tickets")
        .select("id, created_at, client_name, client_phone, description, status, due_date, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, video1_path")
        .eq("company_id", ctx.companyId)
        .order("created_at", { ascending: false });

      if (state.status) query = query.eq("status", state.status);

      const { data, error } = await query;
      if (error) {
        wrap.innerHTML = `<div class="empty">Falha ao carregar chamados.</div>`;
        throw error;
      }

      const busca = state.busca.trim().toLowerCase();
      state.tickets = (data || []).filter((item) => {
        if (!busca) return true;
        const texto = [item.client_name, item.client_phone, item.description, item.status].join(" ").toLowerCase();
        return texto.includes(busca);
      });

      if (!state.tickets.length) {
        wrap.innerHTML = `<div class="empty">Nenhum chamado encontrado.</div>`;
        $("#detalheChamadoWrap", alvo).innerHTML = `<div class="empty">Nenhum chamado selecionado.</div>`;
        return;
      }

      wrap.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Criado</th>
              <th>Cliente</th>
              <th>Status</th>
              <th>Prazo</th>
              <th>Descrição</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${state.tickets.map((item) => `
              <tr>
                <td>${escapeHtml(formatarData(item.created_at))}</td>
                <td>
                  <div>${escapeHtml(item.client_name || "Sem nome")}</div>
                  <div class="muted">${escapeHtml(item.client_phone || "—")}</div>
                </td>
                <td>${badgeStatus(item.status)}</td>
                <td>${escapeHtml(formatarData(item.due_date))}</td>
                <td>${escapeHtml((item.description || "").slice(0, 80) || "—")}</td>
                <td><button class="btn btn-secondary btnAbrirChamado" data-id="${item.id}">Abrir</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;

      wrap.querySelectorAll(".btnAbrirChamado").forEach((botao) => {
        botao.addEventListener("click", async () => {
          const id = botao.getAttribute("data-id");
          state.selecionado = state.tickets.find((t) => t.id === id) || null;
          if (typeof ctx.onSelecionarChamado === "function") ctx.onSelecionarChamado(id);
          await carregarDetalhe();
        });
      });

      if (!state.selecionado) {
        state.selecionado = state.tickets[0];
      }
      await carregarDetalhe();
    }

    async function carregarDetalhe() {
      const wrap = $("#detalheChamadoWrap", alvo);
      if (!state.selecionado) {
        wrap.innerHTML = `<div class="empty">Nenhum chamado selecionado.</div>`;
        return;
      }

      wrap.innerHTML = `<div class="empty">Carregando detalhe...</div>`;

      const [historicoResp, mensagensResp] = await Promise.all([
        ctx.sb.db
          .from("ticket_history")
          .select("created_at, action, from_status, to_status, note")
          .eq("ticket_id", state.selecionado.id)
          .order("created_at", { ascending: false }),
        ctx.sb.db
          .from("ticket_messages")
          .select("created_at, author_type, author_name, message, event_type")
          .eq("ticket_id", state.selecionado.id)
          .order("created_at", { ascending: false })
      ]);

      state.historico = historicoResp.data || [];
      state.mensagens = mensagensResp.data || [];
      const midias = caminhosMidia(state.selecionado);

      wrap.innerHTML = `
        <div class="detail-block">
          <h3>Dados</h3>
          <div class="kv-list">
            <div class="muted">Cliente</div><div>${escapeHtml(state.selecionado.client_name || "Sem nome")}</div>
            <div class="muted">Telefone</div><div>${escapeHtml(state.selecionado.client_phone || "—")}</div>
            <div class="muted">Status</div><div>${badgeStatus(state.selecionado.status)}</div>
            <div class="muted">Prazo</div><div>${escapeHtml(formatarData(state.selecionado.due_date))}</div>
            <div class="muted">Criado em</div><div>${escapeHtml(formatarDataHora(state.selecionado.created_at))}</div>
            <div class="muted">Descrição</div><div>${escapeHtml(state.selecionado.description || "—")}</div>
          </div>
        </div>
        <div class="separator"></div>
        <div class="detail-block">
          <h3>Mídias</h3>
          ${midias.length ? `<div class="media-grid">${midias.map((m) => `<div class="media-path">${escapeHtml(m)}</div>`).join("")}</div>` : `<div class="empty">Nenhuma mídia registrada.</div>`}
        </div>
        <div class="separator"></div>
        <div class="detail-block">
          <h3>Histórico</h3>
          ${state.historico.length ? `<div class="list-lines">${state.historico.map((h) => `
            <div class="line-item">
              <div class="line-top"><span>${escapeHtml(formatarDataHora(h.created_at))}</span><span>${escapeHtml(h.action || "evento")}</span></div>
              <div>${escapeHtml(h.note || `${h.from_status || ""} → ${h.to_status || ""}` || "Sem observação")}</div>
            </div>`).join("")}</div>` : `<div class="empty">Sem histórico.</div>`}
        </div>
        <div class="separator"></div>
        <div class="detail-block">
          <h3>Mensagens</h3>
          ${state.mensagens.length ? `<div class="list-lines">${state.mensagens.map((m) => `
            <div class="line-item">
              <div class="line-top"><span>${escapeHtml(formatarDataHora(m.created_at))}</span><span>${escapeHtml(m.author_name || m.author_type || "autor")}</span></div>
              <div>${escapeHtml(m.message || "")}</div>
            </div>`).join("")}</div>` : `<div class="empty">Sem mensagens.</div>`}
        </div>
      `;
    }
  }

  function abrirModalNovoChamado(ctx, state, recarregar) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div class="modal-title">Novo Chamado</div>
          <button class="btn btn-ghost" id="fecharModalNovoChamado">Fechar</button>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">Nome do cliente</label>
            <input id="novoChamadoNome" class="field" />
          </div>
          <div class="form-row">
            <label class="form-label">Telefone</label>
            <input id="novoChamadoTelefone" class="field" />
          </div>
          <div class="form-row">
            <label class="form-label">Prazo</label>
            <input id="novoChamadoPrazo" type="date" class="field" />
          </div>
          <div class="form-row">
            <label class="form-label">Status inicial</label>
            <select id="novoChamadoStatus" class="select">
              <option value="aberto">Aberto</option>
              <option value="aguardando_analise">Aguardando análise</option>
            </select>
          </div>
          <div class="form-row span-2">
            <label class="form-label">Descrição</label>
            <textarea id="novoChamadoDescricao" class="textarea"></textarea>
          </div>
        </div>
        <div id="erroNovoChamado" class="alert error"></div>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="cancelarNovoChamado">Cancelar</button>
          <button class="btn btn-primary" id="salvarNovoChamado">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    function fechar() { backdrop.remove(); }
    $("#fecharModalNovoChamado", backdrop).onclick = fechar;
    $("#cancelarNovoChamado", backdrop).onclick = fechar;
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) fechar(); });

    $("#salvarNovoChamado", backdrop).onclick = async () => {
      const erroBox = $("#erroNovoChamado", backdrop);
      erroBox.classList.remove("show");
      erroBox.textContent = "";

      const payload = {
        company_id: ctx.companyId,
        client_name: $("#novoChamadoNome", backdrop).value.trim() || null,
        client_phone: $("#novoChamadoTelefone", backdrop).value.trim() || null,
        description: $("#novoChamadoDescricao", backdrop).value.trim() || null,
        status: $("#novoChamadoStatus", backdrop).value,
        due_date: $("#novoChamadoPrazo", backdrop).value || null,
      };

      if (!payload.description) {
        erroBox.textContent = "Descrição é obrigatória.";
        erroBox.classList.add("show");
        return;
      }

      const { error } = await ctx.sb.db.from("tickets").insert(payload);
      if (error) {
        erroBox.textContent = error.message || "Falha ao salvar chamado.";
        erroBox.classList.add("show");
        return;
      }

      fechar();
      await recarregar();
    };
  }

  window.ModuloChamados = {
    listarChamados,
    formatarData,
    formatarDataHora,
  };
})();
