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
      em_analise: "Em análise",
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
    return [
      ticket.photo1_path,
      ticket.photo2_path,
      ticket.photo3_path,
      ticket.photo4_path,
      ticket.photo5_path,
      ticket.video1_path
    ].filter(Boolean);
  }

  function montarUrlPublica(nomeArquivo, params) {
    const cfg = window.sbConfig || {};
    const basePathCfg = String(cfg.basePath || "").trim();
    const origin = window.location.origin;
    let basePath = basePathCfg;

    if (!basePath) {
      const pathname = window.location.pathname || "/";
      const partes = pathname.split("/").filter(Boolean);
      if (partes.length > 0) basePath = "/" + partes[0];
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

  function gerarTokenLocal() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "tk_" + Date.now() + "_" + Math.random().toString(16).slice(2);
  }

  function extensao(path) {
    const p = String(path || "").toLowerCase();
    const idx = p.lastIndexOf(".");
    return idx >= 0 ? p.slice(idx + 1) : "";
  }

  function ehVideo(path) {
    return ["mp4", "mov", "avi", "webm", "m4v"].includes(extensao(path));
  }

  function ehImagem(path) {
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp"].includes(extensao(path));
  }

  function obterUrlMidia(path, sb) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    try {
      const result = sb.db.storage.from("tickets-media").getPublicUrl(path);
      return result?.data?.publicUrl || "";
    } catch {
      return "";
    }
  }

  function injetarEstilosGaleria() {
    if (document.getElementById("estilos-galeria-chamados")) return;
    const style = document.createElement("style");
    style.id = "estilos-galeria-chamados";
    style.textContent = `
      .media-preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-top:10px}
      .midia-card{background:rgba(255,255,255,.03);border:1px solid rgba(108,152,232,.18);border-radius:12px;overflow:hidden;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
      .midia-card:hover{transform:translateY(-2px);border-color:rgba(108,152,232,.45);box-shadow:0 10px 24px rgba(0,0,0,.18)}
      .midia-card.midia-erro{cursor:default}
      .midia-thumb{width:100%;height:140px;background:#0b1b33;display:flex;align-items:center;justify-content:center;overflow:hidden}
      .midia-thumb img,.midia-thumb video{width:100%;height:100%;object-fit:cover;display:block}
      .midia-thumb.arquivo{color:#d7e6ff;font-weight:700;letter-spacing:.08em}
      .midia-meta{padding:10px 12px 12px}
      .midia-nome{font-size:12px;line-height:1.35;word-break:break-all;margin-bottom:6px;color:#eff6ff}
      .link-inline{color:#9cc4ff;font-size:12px;text-decoration:none}
      .link-inline:hover{text-decoration:underline}
      .modal-media{width:min(1080px, calc(100vw - 32px))}
      .media-viewer{min-height:60vh;max-height:78vh;background:#06101f;border:1px solid rgba(108,152,232,.16);border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}
      .media-viewer img,.media-viewer video{max-width:100%;max-height:76vh;object-fit:contain;display:block}
      .galeria-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
      .galeria-controles{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .btn-mini{border:none;border-radius:10px;padding:8px 12px;font-weight:700;cursor:pointer;background:#25477a;color:#fff}
      .btn-mini:hover{filter:brightness(1.06)}
      .galeria-indicador{color:#cfe0ff;font-size:13px}
      .zoom-info{color:#9db3d6;font-size:12px}
      @media (max-width:900px){.media-preview-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}.midia-thumb{height:112px}}
    `;
    document.head.appendChild(style);
  }

  async function listarChamados(ctx) {
    injetarEstilosGaleria();
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
      linkPortalGeral: montarUrlPublica("ticket.html", { c: ctx.companyId, t: ctx.portalToken || "" }),
      linkAnexosAtual: ""
    };

    alvo.innerHTML = `
      <div class="toolbar">
        <input id="filtroBuscaChamados" class="field" placeholder="Buscar por nome, telefone ou descrição" />
        <select id="filtroStatusChamados" class="select">
          <option value="">Todos os status</option>
          <option value="aberto">Aberto</option>
          <option value="open">Open</option>
          <option value="em_analise">Em análise</option>
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
      </div>`;

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
      let query = ctx.sb.db.from("tickets").select("id, created_at, client_name, client_phone, description, status, due_date, token, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, video1_path").eq("company_id", ctx.companyId).order("created_at", { ascending: false });
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
          <thead><tr><th>Criado</th><th>Cliente</th><th>Status</th><th>Prazo</th><th>Descrição</th><th>Ações</th></tr></thead>
          <tbody>
            ${state.tickets.map((item) => `
              <tr>
                <td>${escapeHtml(formatarData(item.created_at))}</td>
                <td><div>${escapeHtml(item.client_name || "Sem nome")}</div><div class="muted">${escapeHtml(item.client_phone || "—")}</div></td>
                <td>${badgeStatus(item.status)}</td>
                <td>${escapeHtml(formatarData(item.due_date))}</td>
                <td>${escapeHtml((item.description || "").slice(0, 80) || "—")}</td>
                <td><button class="btn btn-secondary btnAbrirChamado" data-id="${item.id}">Abrir</button></td>
              </tr>`).join("")}
          </tbody>
        </table>`;
      wrap.querySelectorAll(".btnAbrirChamado").forEach((botao) => {
        botao.addEventListener("click", async () => {
          const id = botao.getAttribute("data-id");
          state.selecionado = state.tickets.find((t) => t.id === id) || null;
          state.linkAnexosAtual = "";
          if (typeof ctx.onSelecionarChamado === "function") ctx.onSelecionarChamado(id);
          await carregarDetalhe();
        });
      });
      if (!state.selecionado) state.selecionado = state.tickets[0];
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
        ctx.sb.db.from("ticket_history").select("created_at, action, from_status, to_status, note").eq("ticket_id", state.selecionado.id).order("created_at", { ascending: false }),
        ctx.sb.db.from("ticket_messages").select("created_at, author_type, author_name, message, event_type").eq("ticket_id", state.selecionado.id).order("created_at", { ascending: false })
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
              </div>` : `<div class="empty">Clique em "Gerar Link de Anexos" para enviar este chamado ao cliente e permitir anexar fotos e vídeo.</div>`}
            </div>
          </div>
        </div>
        <div class="separator"></div>
        <div class="detail-block">
          <div class="galeria-toolbar">
            <h3>Mídias</h3>
            <div class="zoom-info">${midias.length ? "Clique na foto para ampliar e navegar." : ""}</div>
          </div>
          ${midias.length ? `<div class="media-grid media-preview-grid">${midias.map((m, idx) => renderMidia(m, ctx.sb, idx)).join("")}</div>` : `<div class="empty">Nenhuma mídia registrada.</div>`}
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
        </div>`;

      $("#btnGerarLinkAnexos", wrap).addEventListener("click", async () => {
        if (!state.selecionado.token) {
          alert("Este chamado não possui token de cliente. Abra o chamado pelo portal ou crie um novo chamado pelo sistema após atualizar este arquivo.");
          return;
        }
        state.linkAnexosAtual = montarUrlPublica("portal-upload.html", { company_id: ctx.companyId, ticket_id: state.selecionado.id, ticket_token: state.selecionado.token });
        await carregarDetalhe();
        abrirModalLinkPortal({
          titulo: "Link de anexos do chamado",
          link: state.linkAnexosAtual,
          subtitulo: "Envie esse link para o cliente anexar fotos e vídeo deste chamado específico."
        });
      });

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

      const imagens = midias.filter(ehImagem).map((path) => ({
        path, url: obterUrlMidia(path, ctx.sb), nome: String(path || "").split("/").pop() || "imagem"
      })).filter((x) => x.url);

      wrap.querySelectorAll(".midia-card").forEach((card) => {
        card.addEventListener("click", () => {
          const tipo = card.getAttribute("data-tipo");
          const url = card.getAttribute("data-url");
          const idx = Number(card.getAttribute("data-idx") || "0");
          if (!url) return;
          if (tipo === "imagem") {
            abrirGaleriaImagens(imagens, idx);
            return;
          }
          if (tipo === "video") abrirVisualizadorMidia(url, true);
        });
      });
    }
  }

  function renderMidia(path, sb, idx) {
    const url = obterUrlMidia(path, sb);
    const nome = String(path || "").split("/").pop() || "arquivo";
    const tipo = ehVideo(path) ? "video" : (ehImagem(path) ? "imagem" : "arquivo");

    if (!url) {
      return `<div class="midia-card midia-erro"><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div><div class="muted">Não foi possível gerar a URL da mídia.</div></div></div>`;
    }
    if (tipo === "imagem") {
      return `<div class="midia-card" data-tipo="imagem" data-url="${escapeHtml(url)}" data-idx="${idx}" title="Clique para ampliar"><div class="midia-thumb"><img src="${escapeHtml(url)}" alt="${escapeHtml(nome)}" loading="lazy"></div><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div><a class="link-inline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir imagem</a></div></div>`;
    }
    if (tipo === "video") {
      return `<div class="midia-card" data-tipo="video" data-url="${escapeHtml(url)}" data-idx="${idx}" title="Clique para abrir vídeo"><div class="midia-thumb"><video src="${escapeHtml(url)}" muted preload="metadata"></video></div><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div><a class="link-inline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir vídeo</a></div></div>`;
    }
    return `<div class="midia-card" data-tipo="arquivo" data-url="${escapeHtml(url)}" data-idx="${idx}"><div class="midia-thumb arquivo">ARQ</div><div class="midia-meta"><div class="midia-nome">${escapeHtml(nome)}</div><a class="link-inline" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir arquivo</a></div></div>`;
  }

  function abrirVisualizadorMidia(url, isVideo) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal modal-media"><div class="modal-head"><div><div class="modal-title">Visualização da mídia</div></div><button class="btn btn-ghost" id="fecharModalMedia">Fechar</button></div><div class="media-viewer">${isVideo ? `<video src="${escapeHtml(url)}" controls autoplay></video>` : `<img src="${escapeHtml(url)}" alt="Mídia do chamado">`}</div><div class="modal-actions"><a class="btn btn-primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir em nova aba</a></div></div>`;
    document.body.appendChild(backdrop);
    $("#fecharModalMedia", backdrop).addEventListener("click", () => document.body.removeChild(backdrop));
  }

  function abrirGaleriaImagens(imagens, idxInicial) {
    let idx = Math.max(0, Math.min(idxInicial || 0, imagens.length - 1));
    if (!imagens.length) return;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    function render() {
      const atual = imagens[idx];
      backdrop.innerHTML = `<div class="modal modal-media"><div class="modal-head"><div><div class="modal-title">Galeria de fotos</div><div class="panel-sub">${idx + 1} de ${imagens.length} • ${escapeHtml(atual.nome)}</div></div><button class="btn btn-ghost" id="fecharGaleria">Fechar</button></div><div class="galeria-toolbar"><div class="galeria-controles"><button class="btn-mini" id="fotoAnterior">← Anterior</button><button class="btn-mini" id="fotoProxima">Próxima →</button></div><div class="galeria-indicador">Use as setas do teclado para navegar</div></div><div class="media-viewer"><img src="${escapeHtml(atual.url)}" alt="${escapeHtml(atual.nome)}"></div><div class="modal-actions"><a class="btn btn-primary" href="${escapeHtml(atual.url)}" target="_blank" rel="noopener">Abrir em nova aba</a></div></div>`;
      $("#fecharGaleria", backdrop).addEventListener("click", fechar);
      $("#fotoAnterior", backdrop).addEventListener("click", () => { idx = idx <= 0 ? imagens.length - 1 : idx - 1; render(); });
      $("#fotoProxima", backdrop).addEventListener("click", () => { idx = idx >= imagens.length - 1 ? 0 : idx + 1; render(); });
    }

    function onKey(e) {
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowLeft") { idx = idx <= 0 ? imagens.length - 1 : idx - 1; render(); }
      if (e.key === "ArrowRight") { idx = idx >= imagens.length - 1 ? 0 : idx + 1; render(); }
    }

    function fechar() {
      document.removeEventListener("keydown", onKey);
      document.body.removeChild(backdrop);
    }

    document.body.appendChild(backdrop);
    document.addEventListener("keydown", onKey);
    render();
  }

  function abrirModalNovoChamado(ctx, recarregar) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal"><div class="modal-head"><div><div class="modal-title">Novo Chamado</div><div class="panel-sub">Cadastro manual pelo atendente</div></div><button class="btn btn-ghost" id="fecharModalChamado">Fechar</button></div><div class="alert error" id="erroModalChamado"></div><div class="grid-form"><div><label class="label">Nome do cliente</label><input id="novoChamadoNome" class="field" /></div><div><label class="label">Telefone</label><input id="novoChamadoTelefone" class="field" /></div><div><label class="label">Status</label><select id="novoChamadoStatus" class="select"><option value="aberto">Aberto</option><option value="aguardando_analise">Aguardando análise</option><option value="em_analise">Em análise</option><option value="em_andamento">Em andamento</option><option value="finalizado">Finalizado</option><option value="cancelado">Cancelado</option></select></div><div><label class="label">Prazo</label><input id="novoChamadoPrazo" class="field" type="date" /></div><div class="full"><label class="label">Descrição</label><textarea id="novoChamadoDescricao" class="textarea"></textarea></div></div><div class="modal-actions"><button class="btn btn-secondary" id="cancelarModalChamado">Cancelar</button><button class="btn btn-primary" id="salvarModalChamado">Salvar Chamado</button></div></div>`;
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
        token: gerarTokenLocal()
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
    backdrop.innerHTML = `<div class="modal"><div class="modal-head"><div><div class="modal-title">${escapeHtml(opts.titulo || "Link do Portal")}</div><div class="panel-sub">${escapeHtml(opts.subtitulo || "")}</div></div><button class="btn btn-ghost" id="fecharModalLink">Fechar</button></div><div class="link-box" id="caixaLinkPortal">${escapeHtml(opts.link || "")}</div><div class="modal-actions"><button class="btn btn-secondary" id="copiarLinkPortal">Copiar Link</button><a class="btn btn-primary" id="abrirLinkPortal" href="${escapeHtml(opts.link || "#")}" target="_blank" rel="noopener">Abrir</a><a class="btn btn-ghost" id="whatsLinkPortal" href="https://wa.me/?text=${encodeURIComponent(opts.link || "")}" target="_blank" rel="noopener">WhatsApp</a></div></div>`;
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
    formatarDataHora
  };
})();