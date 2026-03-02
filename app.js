// app.js
// Módulo "Chamados" (Tickets) + Histórico
// REGRA: não usa fetch direto em /rest/v1. Usa SEMPRE window.sb (Supabase client).

(function () {
  const sb = window.sb;
  const sbCfg = window.sbConfig || {};

  const $ = (sel) => document.querySelector(sel);

  // ----------------------------
  // Estado
  // ----------------------------
  const state = {
    companyId: sbCfg.defaultCompanyId || null,
    userId: null,
    session: null,

    tickets: [],
    selectedTicket: null,
    ticketHistory: [],

    loading: false,
    error: null,

    filterText: "",
    filterStatus: "(todos)",
  };

  // ----------------------------
  // Helpers UI
  // ----------------------------
  function setStatusBadge(ok) {
    const el = $("#connBadge");
    if (!el) return;
    el.textContent = ok ? "Conectado" : "Desconectado";
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("bad", !ok);
  }

  function setTopMessage(msg, type = "info") {
    const box = $("#topMessage");
    if (!box) return;
    if (!msg) {
      box.classList.add("hidden");
      box.textContent = "";
      return;
    }
    box.classList.remove("hidden");
    box.classList.remove("err", "info", "ok");
    box.classList.add(type);
    box.textContent = msg;
  }

  function fmtDate(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function fmtDateBR(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    const day = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ----------------------------
  // Guardas de sessão/empresa
  // ----------------------------
  function ensureAuthReady() {
    if (!sb) {
      setStatusBadge(false);
      setTopMessage("Supabase não inicializado. Verifique supabaseClient.js e config.local.js", "err");
      return false;
    }
    if (!state.userId) {
      setTopMessage("Sessão não carregou. Recarregue (Ctrl+Shift+R) e faça login.", "err");
      return false;
    }
    if (!state.companyId) {
      setTopMessage("Company ID não definido. Confira DEFAULT_COMPANY_ID ou company_users.", "err");
      return false;
    }
    return true;
  }

  // Espera a sessão estar disponível (fix principal do GH Pages)
  async function waitForSession(maxTries = 30, delayMs = 200) {
    for (let i = 0; i < maxTries; i++) {
      const { data, error } = await sb.auth.getSession();
      if (!error && data?.session?.user?.id) return data.session;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return null;
  }

  async function loadCompanyIdFromCompanyUsers() {
    if (!state.userId) return null;
    const { data, error } = await sb
      .from("company_users")
      .select("company_id")
      .eq("user_id", state.userId)
      .limit(1);

    if (error) return null;
    const cid = data?.[0]?.company_id || null;
    return cid;
  }

  function syncSidebarInfo() {
    const u = $("#infoUser");
    const c = $("#infoCompany");
    if (u) u.textContent = state.userId || "-";
    if (c) c.textContent = state.companyId || "-";
  }

  // ----------------------------
  // BOOT
  // ----------------------------
  async function boot() {
    try {
      if (!sb) {
        setStatusBadge(false);
        setTopMessage("Supabase não inicializado. Verifique supabaseClient.js e config.local.js", "err");
        return;
      }

      setTopMessage("", "info");
      setStatusBadge(true);

      // FIX: aguarda sessão de verdade (GH Pages muitas vezes abre com hasSession false no primeiro tick)
      const session = await waitForSession();
      state.session = session;
      state.userId = session?.user?.id || null;

      // Se ainda não tiver sessão, não executa queries (evita companyId null e RLS quebrando)
      if (!state.userId) {
        syncSidebarInfo();
        setTopMessage("Sem sessão ativa. Faça login ou recarregue a página.", "err");
        return;
      }

      // CompanyId: primeiro config, senão busca company_users
      if (!state.companyId) {
        const cid = await loadCompanyIdFromCompanyUsers();
        if (cid) state.companyId = cid;
      }

      syncSidebarInfo();
      bindUI();

      if (!state.companyId) {
        setTopMessage("Company ID não definido. Confira DEFAULT_COMPANY_ID ou company_users.", "err");
        return;
      }

      await loadTickets();
      render();

      // Reagir a mudanças de auth
      sb.auth.onAuthStateChange(async (_event, newSession) => {
        state.session = newSession || null;
        state.userId = newSession?.user?.id || null;

        if (!state.userId) {
          state.companyId = sbCfg.defaultCompanyId || null;
          state.tickets = [];
          state.selectedTicket = null;
          state.ticketHistory = [];
          syncSidebarInfo();
          render();
          return;
        }

        if (!state.companyId) {
          const cid = await loadCompanyIdFromCompanyUsers();
          if (cid) state.companyId = cid;
        }

        syncSidebarInfo();
        if (state.companyId) {
          await loadTickets();
          render();
        }
      });
    } catch (e) {
      console.error(e);
      setStatusBadge(false);
      setTopMessage("Erro no boot: " + (e?.message || e), "err");
    }
  }

  // ----------------------------
  // Data: Tickets / History
  // ----------------------------
  async function loadTickets() {
    if (!ensureAuthReady()) return;

    state.loading = true;
    state.error = null;
    setTopMessage("", "info");

    try {
      // Ajuste se seu schema tiver mais campos; estes são os essenciais
      const { data, error } = await sb
        .from("tickets")
        .select("id, company_id, status, created_at, description, due_date")
        .eq("company_id", state.companyId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      state.tickets = data || [];
      const countEl = $("#ticketsCount");
      if (countEl) countEl.textContent = String(state.tickets.length);
    } catch (e) {
      state.error = e?.message || String(e);
      setTopMessage("Erro ao carregar chamados: " + state.error, "err");
    } finally {
      state.loading = false;
    }
  }

  async function loadTicketHistory(ticketId) {
    if (!ensureAuthReady()) return [];
    if (!ticketId) return [];

    const { data, error } = await sb
      .from("ticket_history")
      .select("id, ticket_id, company_id, action, from_status, to_status, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return data || [];
  }

  async function selectTicket(ticketId) {
    try {
      state.selectedTicket = state.tickets.find((t) => t.id === ticketId) || null;
      state.ticketHistory = [];
      renderDetail();

      if (!state.selectedTicket) return;

      const hist = await loadTicketHistory(ticketId);
      state.ticketHistory = hist;
      renderDetail();
    } catch (e) {
      console.error(e);
      setTopMessage("Erro ao abrir chamado: " + (e?.message || e), "err");
    }
  }

  async function createTicketFromForm() {
    if (!ensureAuthReady()) return;

    const name = $("#fClientName")?.value?.trim() || "";
    const phone = $("#fClientPhone")?.value?.trim() || "";
    const desc = $("#fDesc")?.value?.trim() || "";
    const due = $("#fDueDate")?.value || "";
    const status = $("#fStatus")?.value || "aberto";

    if (!desc) {
      setTopMessage("Descrição é obrigatória.", "err");
      return;
    }

    try {
      setTopMessage("", "info");

      // Token obrigatório no seu schema (você já pegou erro de token null)
      const payload = {
        id: crypto.randomUUID(),
        company_id: state.companyId,
        token: crypto.randomUUID(),
        status,
        description: desc,
        due_date: due ? due : null,
        client_name: name || null,
        client_phone: phone || null,
        created_at: new Date().toISOString(),
      };

      const ins = await sb.from("tickets").insert(payload).select("id").single();
      if (ins.error) throw ins.error;

      // Limpa form
      if ($("#fClientName")) $("#fClientName").value = "";
      if ($("#fClientPhone")) $("#fClientPhone").value = "";
      if ($("#fDesc")) $("#fDesc").value = "";
      if ($("#fDueDate")) $("#fDueDate").value = "";

      setTopMessage("Chamado criado com sucesso.", "ok");

      await loadTickets();
      render();

      // Seleciona o ticket criado (pra você ver detalhe e histórico)
      if (ins.data?.id) {
        await selectTicket(ins.data.id);
      }
    } catch (e) {
      console.error(e);
      setTopMessage("Erro ao criar chamado: " + (e?.message || e), "err");
    }
  }

  // ----------------------------
  // Render
  // ----------------------------
  function filteredTickets() {
    const q = state.filterText.trim().toLowerCase();
    const st = state.filterStatus;

    return (state.tickets || []).filter((t) => {
      const okStatus = st === "(todos)" ? true : (t.status || "") === st;
      const okText =
        !q ||
        String(t.description || "").toLowerCase().includes(q) ||
        String(t.client_name || "").toLowerCase().includes(q) ||
        String(t.client_phone || "").toLowerCase().includes(q);
      return okStatus && okText;
    });
  }

  function renderTicketsTable() {
    const tbody = $("#ticketsTbody");
    if (!tbody) return;

    const list = filteredTickets();
    tbody.innerHTML = "";

    for (const t of list) {
      const tr = document.createElement("tr");
      tr.className = "row";

      const created = fmtDate(t.created_at);
      const prazo = t.due_date ? fmtDateBR(t.due_date) : "";
      const status = t.status || "";
      const desc = t.description || "";

      tr.innerHTML = `
        <td class="cell">${escapeHtml(created)}</td>
        <td class="cell">${escapeHtml(status)}</td>
        <td class="cell">${escapeHtml(prazo)}</td>
        <td class="cell">${escapeHtml(desc)}</td>
        <td class="cell actions">
          <button class="btn small" data-open="${escapeHtml(t.id)}">Abrir</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-open]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-open");
        selectTicket(id);
      });
    });
  }

  function renderDetail() {
    const box = $("#detailBox");
    if (!box) return;

    if (!state.selectedTicket) {
      box.innerHTML = `
        <div class="detailEmpty">
          <div class="detailTitle">Detalhe do chamado</div>
          <div class="muted">Selecione um chamado ou clique em Novo.</div>
        </div>
      `;
      return;
    }

    const t = state.selectedTicket;
    const hist = state.ticketHistory || [];

    box.innerHTML = `
      <div class="detailHeader">
        <div>
          <div class="detailTitle">Chamado</div>
          <div class="muted">${escapeHtml(t.id)}</div>
        </div>
        <div class="pill">${escapeHtml(t.status || "")}</div>
      </div>

      <div class="detailSection">
        <div class="label">Descrição</div>
        <div class="detailText">${escapeHtml(t.description || "")}</div>
      </div>

      <div class="detailSection grid2">
        <div>
          <div class="label">Criado</div>
          <div class="detailText">${escapeHtml(fmtDateBR(t.created_at))}</div>
        </div>
        <div>
          <div class="label">Prazo</div>
          <div class="detailText">${escapeHtml(t.due_date ? fmtDateBR(t.due_date) : "-")}</div>
        </div>
      </div>

      <div class="detailSection">
        <div class="label">Histórico</div>
        <div class="history">
          ${
            hist.length
              ? hist
                  .map(
                    (h) => `
                      <div class="historyItem">
                        <div class="historyTop">
                          <span class="tag">${escapeHtml(h.action || "")}</span>
                          <span class="muted">${escapeHtml(new Date(h.created_at).toLocaleString())}</span>
                        </div>
                        <div class="historyBody">
                          <span class="muted">de</span> <b>${escapeHtml(h.from_status || "-")}</b>
                          <span class="muted">para</span> <b>${escapeHtml(h.to_status || "-")}</b>
                        </div>
                      </div>
                    `
                  )
                  .join("")
              : `<div class="muted">Sem histórico.</div>`
          }
        </div>
      </div>
    `;
  }

  function render() {
    renderTicketsTable();
    renderDetail();
  }

  // ----------------------------
  // UI / Bind
  // ----------------------------
  function bindUI() {
    const ft = $("#filterText");
    const fs = $("#filterStatus");
    const br = $("#btnReload");
    const bn = $("#btnNew");
    const bc = $("#btnCreateTicket");
    const lo = $("#btnLogout");
    const lo2 = $("#btnLogout2");

    if (ft) {
      ft.addEventListener("input", (e) => {
        state.filterText = e.target.value;
        renderTicketsTable();
      });
    }

    if (fs) {
      fs.addEventListener("change", (e) => {
        state.filterStatus = e.target.value;
        renderTicketsTable();
      });
    }

    if (br) {
      br.addEventListener("click", async () => {
        await loadTickets();
        render();
      });
    }

    if (bn) {
      bn.addEventListener("click", () => {
        const form = $("#newTicketBox");
        if (form) form.classList.toggle("hidden");
      });
    }

    if (bc) {
      bc.addEventListener("click", async () => {
        await createTicketFromForm();
      });
    }

    const doLogout = async () => {
      try {
        await sb.auth.signOut();
        location.reload();
      } catch (e) {
        console.error(e);
        setTopMessage("Erro ao sair: " + (e?.message || e), "err");
      }
    };

    if (lo) lo.addEventListener("click", doLogout);
    if (lo2) lo2.addEventListener("click", doLogout);
  }

  // ----------------------------
  // DOM base (só cria se não existir)
  // ----------------------------
  function ensureBaseDOM() {
    if ($("#appRoot")) return;

    document.body.innerHTML = `
      <div id="appRoot" class="app">
        <aside class="sidebar">
          <div class="logoBox">
            <img src="logo.png" class="logo" alt="Logo" />
            <div class="muted">Módulos</div>
          </div>

          <nav class="nav">
            <button class="navItem active">Chamados</button>
          </nav>

          <div class="sidebarFooter">
            <div class="kv"><span class="muted">user:</span> <span id="infoUser">-</span></div>
            <div class="kv"><span class="muted">company:</span> <span id="infoCompany">-</span></div>
            <button id="btnLogout" class="btn danger ghost">Sair</button>
          </div>
        </aside>

        <main class="main">
          <header class="topbar">
            <div class="title">Chamados</div>
            <div class="right">
              <span id="connBadge" class="conn ok">Conectado</span>
              <button id="btnLogout2" class="btn danger">Sair</button>
            </div>
          </header>

          <div id="topMessage" class="message hidden"></div>

          <section class="panel">
            <div class="panelTop">
              <div class="muted">Chamados carregados: <b id="ticketsCount">0</b></div>

              <div class="filters">
                <input id="filterText" class="input" placeholder="nome, telefone ou descrição" />
                <select id="filterStatus" class="select">
                  <option>(todos)</option>
                  <option>aberto</option>
                  <option>em_andamento</option>
                  <option>finalizado</option>
                  <option>cancelado</option>
                </select>

                <button id="btnNew" class="btn">Novo chamado</button>
                <button id="btnReload" class="btn ghost">Aplicar / Recarregar</button>
              </div>
            </div>

            <div id="newTicketBox" class="newBox hidden">
              <div class="newTitle">Criar ticket</div>

              <div class="grid2">
                <div>
                  <div class="label">Nome do cliente</div>
                  <input id="fClientName" class="input" placeholder="Nome" />
                </div>
                <div>
                  <div class="label">Telefone</div>
                  <input id="fClientPhone" class="input" placeholder="DDD + número" />
                </div>
              </div>

              <div>
                <div class="label">Descrição</div>
                <textarea id="fDesc" class="textarea" placeholder="Descreva o problema"></textarea>
              </div>

              <div class="grid2">
                <div>
                  <div class="label">Status inicial</div>
                  <select id="fStatus" class="select">
                    <option value="aberto">Aberto</option>
                    <option value="em_andamento">Em andamento</option>
                  </select>
                </div>
                <div>
                  <div class="label">Prazo (opcional)</div>
                  <input id="fDueDate" type="date" class="input" />
                </div>
              </div>

              <button id="btnCreateTicket" class="btn">Criar ticket</button>
            </div>

            <div class="contentGrid">
              <div class="card">
                <div class="cardTitle">Lista de chamados</div>
                <table class="table">
                  <thead>
                    <tr>
                      <th>Criado</th>
                      <th>Status</th>
                      <th>Prazo</th>
                      <th>Descrição</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody id="ticketsTbody"></tbody>
                </table>
              </div>

              <div class="card" id="detailBox"></div>
            </div>
          </section>
        </main>
      </div>
    `;
  }

  ensureBaseDOM();
  boot();
})();
