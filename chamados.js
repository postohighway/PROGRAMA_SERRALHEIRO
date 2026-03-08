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
    return mapa[String(status || "").toLowerCase()] || (status || "—");
  }

  function badgeStatus(status) {
    const s = String(status || "").toLowerCase().trim();
    return `<span class="status-pill status-${escapeHtml(s)}">${escapeHtml(traduzirStatus(s))}</span>`;
  }

  function caminhosMidia(ticket) {
    return [ticket.photo1_path, ticket.photo2_path, ticket.photo3_path, ticket.photo4_path, ticket.photo5_path, ticket.video1_path].filter(Boolean);
  }

  function montarUrlPublica(nomeArquivo, params) {
    const cfg = window.sbConfig || {};
    const basePathCfg = String(cfg.basePath || "").trim();
    const origin = window.location.origin;
    let basePath = basePathCfg;

    if (!basePath) {
      const pathname = window.location.pathname || "/";
      const partes = pathname.split("/").filter(Boolean);
      if (partes.length > 0) {
        basePath = "/" + partes[0];
      }
    }

    if (basePath && !basePath.startsWith("/")) basePath = "/" + basePath;
    const base = origin + (basePath || "");
    const url = new URL(`${base}/${nomeArquivo}`.replace(/([^:]\/)\/+/g, "$1"));
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v != null && String(v).trim() !== "") url.searchParams.set(k, String(v));
    });
    return url.toString();
  }

  function copiarTexto(texto) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(texto);
    }
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
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
      mensagens: [],
      linkPortalGeral: montarUrlPublica("ticket.html", {
        c: ctx.companyId,
        t: ctx.portalToken || ""
      }),
      linkAnexosAtual: "",
      linkAnexosExpiraEm: ""
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
        <button id="btnPortalCliente" class="btn btn-secondary">Link do Portal</button>
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

    $("#btnNovoChamado", alvo).addEventListener("click", () => abrirModalNovoChamado(ctx, carregarLista));

    $("#btnPortalCliente", alvo).addEventListener("click", () => {
      abrirModalLinkPortal({
        titulo: "Link público para abertura de chamado",
        link: state.linkPortalGeral,
        subtitulo: "Envie este link para o cliente abrir o chamado, descrever o problema e depois anexar as fotos e o vídeo."
      });
    });

    await carregarLista();

    async function carregarLista() {
      const wrap = $("#listaChamadosWrap", alvo);
      wrap.innerHTML = `<div class="empty">Carregando chamados...</div>`;

      let query = ctx.sb.db
        .from("tickets")
        .select("id, created_at, client_name, client_phone, description, status, due_date, token, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, video1_path")
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
          state.linkAnexosAtual = "";
          state.linkAnexosExpiraEm = "";
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
        <div class="detail-actions">
          <button id="btnGerarLinkAnexos" class="btn btn-primary">Gerar Link de Anexos</button>
          <button id="btnPortalGeralDetalhe" class="btn btn-ghost">Portal de Abertura</button>
        </div>

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
          <h3>Links do Cliente</h3>
          <div class="kv-list">
            <div class="muted">Link para abrir novo chamado</div>
            <div><a class="link-inline" href="${escapeHtml(state.linkPortalGeral)}" target="_blank" rel="noopener">Abrir portal público</a></div>
            <div class="muted">Link de anexos deste chamado</div>
            <div id="boxLinkAnexos">${state.linkAnexosAtual ? `
              <div class="link-box">${escapeHtml(state.linkAnexosAtual)}</div>
              <div class="detail-actions">
                <button id="btnCopiarLinkAnexos" class="btn btn-secondary">Copiar Link</button>
                <a class="btn btn-ghost" href="${escapeHtml(state.linkAnexosAtual)}" target="_blank" rel="noopener">Abrir</a>
              </div>
              <div class="muted">Validade: ${escapeHtml(state.linkAnexosExpiraEm || "—")}</div>
            ` : `<div class="empty">Clique em "Gerar Link de Anexos" para enviar este chamado ao cliente e permitir anexar fotos e vídeo.</div>`}</div>
          </div>
        </div>

        <div class="separator"></div>

        <div class="detail-block">
          <h3>Mídias</h3>
          ${midias.length ? `<div class="media-grid">${midias.map((m) => renderMidia(m)).join("")}</div>` : `<div class="empty">Nenhuma mídia registrada.</div>`}
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

      $("#btnGerarLinkAnexos", wrap).addEventListener("click", gerarLinkDeAnexos);
      $("#btnPortalGeralDetalhe", wrap).addEventListener("click", () => {
        abrirModalLinkPortal({
          titulo: "Link público para abertura de chamado",
          link: state.linkPortalGeral,
          subtitulo: "Esse link cria um chamado novo e, ao final, o cliente já é levado para a tela de anexar fotos e vídeo."
        });
      });

      const btnCopiar = $("#btnCopiarLinkAnexos", wrap);
      if (btnCopiar) {
        btnCopiar.addEventListener("click", async () => {
          await copiarTexto(state.linkAnexosAtual);
          alert("Link copiado.");
        });
      }
    }

    async function gerarLinkDeAnexos() {
      if (!state.selecionado) return;
      if (!ctx.sb || !ctx.sb.db) throw new Error("Supabase não disponível.");

      const resp = await ctx.sb.db.rpc("generate_ticket_upload_link", {
        p_ticket_id: state.selecionado.id
      });

      if (resp.error) {
        alert("Falha ao gerar link: " + (resp.error.message || resp.error));
        return;
      }

      const dados = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
      if (!dados || !dados.upload_token) {
        alert("A função não retornou upload_token.");
        return;
      }

      state.linkAnexosAtual = montarUrlPublica("portal-upload.html", {
        company_id: dados.company_id || ctx.companyId,
        upload_token: dados.upload_token
      });
      state.linkAnexosExpiraEm = formatarDataHora(dados.expires_at);

      await carregarDetalhe();
      abrirModalLinkPortal({
        titulo: "Link de anexos do chamado",
        link: state.linkAnexosAtual,
        subtitulo: "Envie esse link para o cliente anexar fotos e vídeo deste chamado específico."
      });
    }
  }

  function renderMidia(path) {
    const texto = escapeHtml(path);
    const ehLink = /^https?:\/\//i.test(path || "");
    if (ehLink) {
      return `<a class="media-path link-inline" href="${texto}" target="_blank" rel="noopener">${texto}</a>`;
    }
    return `<div class="media-path">${texto}</div>`;
  }

  function abrirModalNovoChamado(ctx, recarregar) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">Novo Chamado</div>
            <div class="panel-sub">Cadastro manual pelo atendente</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalChamado">Fechar</button>
        </div>

        <div class="alert error" id="erroModalChamado"></div>

        <div class="grid-form">
          <div>
            <label class="label">Nome do cliente</label>
            <input id="novoChamadoNome" class="field" />
          </div>
          <div>
            <label class="label">Telefone</label>
            <input id="novoChamadoTelefone" class="field" />
          </div>
          <div>
            <label class="label">Status</label>
            <select id="novoChamadoStatus" class="select">
              <option value="aberto">Aberto</option>
              <option value="aguardando_analise">Aguardando análise</option>
              <option value="em_andamento">Em andamento</option>
              <option value="finalizado">Finalizado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
          <div>
            <label class="label">Prazo</label>
            <input id="novoChamadoPrazo" class="field" type="date" />
          </div>
          <div class="full">
            <label class="label">Descrição</label>
            <textarea id="novoChamadoDescricao" class="textarea"></textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary" id="cancelarModalChamado">Cancelar</button>
          <button class="btn btn-primary" id="salvarModalChamado">Salvar Chamado</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalChamado", backdrop).addEventListener("click", fechar);
    $("#cancelarModalChamado", backdrop).addEventListener("click", fechar);

    const erroBox = $("#erroModalChamado", backdrop);

    $("#salvarModalChamado", backdrop).addEventListener("click", async () => {
      erroBox.textContent = "";
      erroBox.classList.remove("show");

      const payload = {
        company_id: ctx.companyId,
        client_name: $("#novoChamadoNome", backdrop).value.trim() || null,
        client_phone: $("#novoChamadoTelefone", backdrop).value.trim() || null,
        description: $("#novoChamadoDescricao", backdrop).value.trim(),
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
    });
  }

  function abrirModalLinkPortal(opts) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">${escapeHtml(opts.titulo || "Link do Portal")}</div>
            <div class="panel-sub">${escapeHtml(opts.subtitulo || "")}</div>
          </div>
          <button class="btn btn-ghost" id="fecharModalLink">Fechar</button>
        </div>

        <div class="link-box" id="caixaLinkPortal">${escapeHtml(opts.link || "")}</div>

        <div class="modal-actions">
          <button class="btn btn-secondary" id="copiarLinkPortal">Copiar Link</button>
          <a class="btn btn-primary" id="abrirLinkPortal" href="${escapeHtml(opts.link || "#")}" target="_blank" rel="noopener">Abrir</a>
          <a class="btn btn-ghost" id="whatsLinkPortal" href="https://wa.me/?text=${encodeURIComponent(opts.link || "")}" target="_blank" rel="noopener">WhatsApp</a>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const fechar = () => document.body.removeChild(backdrop);
    $("#fecharModalLink", backdrop).addEventListener("click", fechar);
    $("#copiarLinkPortal", backdrop).addEventListener("click", async () => {
      await copiarTexto(opts.link || "");
      alert("Link copiado.");
    });
  }

  window.ModuloChamados = {
    listarChamados,
    formatarData,
    formatarDataHora,
  };
})();