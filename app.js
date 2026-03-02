// app.js
// Módulo Chamados (Tickets) + Histórico
// ✅ Compatível com Supabase JS v2
// ✅ Corrige o bug: sb.from(...).select(...).eq is not a function (encadeamento errado)
// ✅ Insere histórico com campos corretos (company_id + actor_user_id)
// ✅ Não usa fetch manual, só window.sb

(function () {
  "use strict";

  const sb = window.sb;

  // tenta pegar companyId de qualquer lugar comum (config.local.js / sbConfig / etc.)
  const cfg = window.sbConfig || window.CONFIG || {};
  const FALLBACK_COMPANY_ID =
    cfg.defaultCompanyId ||
    cfg.DEFAULT_COMPANY_ID ||
    window.DEFAULT_COMPANY_ID ||
    null;

  const $ = (sel) => document.querySelector(sel);

  const state = {
    companyId: FALLBACK_COMPANY_ID,
    userId: null,
    session: null,

    tickets: [],
    selectedTicket: null,
    history: [],

    slaPlans: [],
    loading: false,

    filterText: "",
    filterStatus: "(todos)",
  };

  // ----------------------------
  // UI helpers
  // ----------------------------
  function setBadge(ok) {
    const el = $("#connBadge");
    if (!el) return;
    el.textContent = ok ? "Conectado" : "Desconectado";
    el.classList.toggle("ok", !!ok);
    el.classList.toggle("bad", !ok);
  }

  function setMsg(msg, type = "info") {
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

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtDateBR(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    const day = String(d.getDate()).padStart(2, "0");
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const y = d.getFullYear();
    return `${day}/${m}/${y}`;
  }

  function fmtDateISO(dt) {
    if (!dt) return "";
    const d = new Date(dt);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // ----------------------------
  // Supabase safe-query builder
  // (evita o erro select().eq não existir)
  // ----------------------------
  async function q(builder) {
    // o segredo é: montar o builder inteiro (com eq/order/limit)
    // e só depois await no final
    return await builder;
  }

  // ----------------------------
  // Boot/Auth
  // ----------------------------
  async function boot() {
    try {
      if (!sb) {
        setBadge(false);
        setMsg("Supabase não inicializado (window.sb). Confira supabaseClient.js.", "err");
        return;
      }

      const { data: sess, error: sessErr } = await sb.auth.getSession();
      if (sessErr) console.warn("getSession error:", sessErr);

      state.session = sess?.session || null;
      state.userId = state.session?.user?.id || null;

      setBadge(true);

      // Company do usuário (se não veio por config)
      if (!state.companyId && state.userId) {
        const { data, error } = await q(
          sb
            .from("company_users")
            .select("company_id")
            .eq("user_id", state.userId)
            .limit(1)
        );

        if (!error && data && data[0]?.company_id) {
          state.companyId = data[0].company_id;
        }
      }

      if ($("#infoUser")) $("#infoUser").textContent = state.userId || "-";
      if ($("#infoCompany")) $("#infoCompany").textContent = state.companyId || "-";

      bindUI();

      await loadAll();
      renderAll();

      sb.auth.onAuthStateChange(async (_event, session) => {
        state.session = session || null;
        state.userId = session?.user?.id || null;
        if ($("#infoUser")) $("#infoUser").textContent = state.userId || "-";

        if (!state.companyId && state.userId) {
          const { data } = await q(
            sb.from("company_users").select("company_id").eq("user_id", state.userId).limit(1)
          );
          if (data && data[0]?.company_id) state.companyId = data[0].company_id;
          if ($("#infoCompany")) $("#infoCompany").textContent = state.companyId || "-";
        }

        await loadAll();
        renderAll();
      });

      console.log("[app] BOOT READY");
    } catch (e) {
      console.error(e);
      setBadge(false);
      setMsg("Erro no boot: " + (e?.message || e), "err");
    }
  }

  async function loadAll() {
    if (!state.companyId) {
      setMsg("Company ID não definido. Verifique config.local.js (DEFAULT_COMPANY_ID) ou company_users.", "err");
      return;
    }
    setMsg("", "info");
    await loadSlaPlans();   // <-- aqui era onde seu app explodia
    await loadTickets();
  }

  // ----------------------------
  // Data
  // ----------------------------
  async function loadSlaPlans() {
    // Se não existir tabela/colunas, só ignora sem derrubar o app
    try {
      const { data, error } = await q(
        sb
          .from("sla_plans")
          .select("id, name, hours_to_expire, created_at")
          .eq("company_id", state.companyId)     // ✅ encadeamento seguro
          .order("created_at", { ascending: false })
      );

      if (error) {
        console.warn("sla_plans load error:", error);
        state.slaPlans = [];
        return;
      }
      state.slaPlans = data || [];
    } catch (e) {
      console.warn("sla_plans load crashed:", e);
      state.slaPlans = [];
    }
  }

  async function loadTickets() {
    try {
      state.loading = true;

      const { data, error } = await q(
        sb
          .from("tickets")
          .select("id, company_id, status, created_at, description, due_date, client_name, client_phone, token")
          .eq("company_id", state.companyId)
          .order("created_at", { ascending: false })
          .limit(200)
      );

      if (error) throw error;

      state.tickets = data || [];
      if ($("#ticketsCount")) $("#ticketsCount").textContent = String(state.tickets.length);
    } catch (e) {
      console.error(e);
      setMsg("Erro ao carregar chamados: " + (e?.message || e), "err");
    } finally {
      state.loading = false;
    }
  }

  async function loadHistory(ticketId) {
    const { data, error } = await q(
      sb
        .from("ticket_history")
        .select("id, ticket_id, company_id, action, from_status, to_status, note, created_at, actor_user_id")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(200)
    );
    if (error) throw error;
    return data || [];
  }

  async function selectTicket(ticketId) {
    try {
      state.selectedTicket = state.tickets.find((t) => t.id === ticketId) || null;
      state.history = [];
      renderDetail();

      if (!state.selectedTicket) return;

      const rows = await loadHistory(ticketId);
      state.history = rows;
      renderDetail();
    } catch (e) {
      console.error(e);
      setMsg("Erro ao abrir chamado: " + (e?.message || e), "err");
    }
  }

  async function createTicket() {
    if (!state.companyId) {
      setMsg("Company ID não definido.", "err");
      return;
    }
    if (!state.userId) {
      setMsg("Usuário não autenticado.", "err");
      return;
    }

    const name = ($("#fClientName")?.value || "").trim() || null;
    const phone = ($("#fClientPhone")?.value || "").trim() || null;
    const desc = ($("#fDesc")?.value || "").trim();
    const due = $("#fDueDate")?.value || null;
    const status = $("#fStatus")?.value || "aberto";

    if (!desc) {
      setMsg("Descrição é obrigatória.", "err");
      return;
    }

    try {
      setMsg("", "info");

      const ticketPayload = {
        id: crypto.randomUUID(),
        company_id: state.companyId,
        token: crypto.randomUUID(), // nunca nulo
        status,
        description: desc,
        due_date: due ? due : null,
        client_name: name,
        client_phone: phone,
        created_at: new Date().toISOString(),
      };

      // cria ticket e pega id de volta
      const ins = await q(
        sb.from("tickets").insert(ticketPayload).select("id, status").single()
      );
      if (ins.error) throw ins.error;

      const ticketId = ins.data.id;

      // cria histórico "create" com campos que sua tabela realmente tem
      // (pela sua imagem do schema: actor_user_id e company_id existem)
      const histPayload = {
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        company_id: state.companyId,
        actor_user_id: state.userId,
        action: "create",
        meta: { source: "app", kind: "ticket_create" },
        from_status: null,
        to_status: status,
        note: null,
        created_at: new Date().toISOString(),
      };

      const h = await q(sb.from("ticket_history").insert(histPayload));
      if (h.error) {
        console.error("[ticket_history insert] payload=", histPayload);
        console.error("[ticket_history insert] error=", h.error);
        throw h.error;
      }

      // limpa form
      if ($("#fClientName")) $("#fClientName").value = "";
      if ($("#fClientPhone")) $("#fClientPhone").value = "";
      if ($("#fDesc")) $("#fDesc").value = "";
      if ($("#fDueDate")) $("#fDueDate").value = "";

      setMsg("Chamado criado com sucesso.", "ok");

      await loadTickets();
      renderAll();
    } catch (e) {
      console.error("createTicket error:", e);
      setMsg("Erro ao criar chamado: " + (e?.message || e), "err");
    }
  }

  // ----------------------------
  // Render
  // ----------------------------
  function filteredTickets() {
    const qtxt = state.filterText.trim().toLowerCase();
    const st = state.filterStatus;

    return state.tickets.filter((t) => {
      const okStatus = st === "(todos)" ? true : (t.status || "") === st;

      const okText =
        !qtxt ||
        String(t.description || "").toLowerCase().includes(qtxt) ||
        String(t.client_name || "").toLowerCase().includes(qtxt) ||
        String(t.client_phone || "").toLowerCase().includes(qtxt);

      return okStatus && okText;
    });
  }

  function renderTable() {
    const tbody = $("#ticketsTbody");
    if (!tbody) return;

    const list = filteredTickets();
    tbody.innerHTML = "";

    for (const t of list) {
      const tr = document.createElement("tr");
      const created = fmtDateISO(t.created_at);
      const prazo = t.due_date ? fmtDateBR(t.due_date) : "";
      tr.innerHTML = `
        <td class="cell">${escapeHtml(created)}</td>
        <td class="cell">${escapeHtml(t.status || "")}</td>
        <td class="cell">${escapeHtml(prazo)}</td>
        <td class="cell">${escapeHtml(t.description || "")}</td>
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
    const hist = state.history || [];

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
                        ${
                          h.note
                            ? `<div class="muted" style="margin-top:6px;">${escapeHtml(h.note)}</div>`
                            : ``
                        }
                      </div>
                    `
                  )
                  .join("")
              : `<div class="muted">Sem histórico (ou ainda carregando)...</div>`
          }
        </div>
      </div>
    `;
  }

  function renderAll() {
    renderTable();
    renderDetail();
  }

  // ----------------------------
  // Bind
  // ----------------------------
  function bindUI() {
    const ft = $("#filterText");
    const fs = $("#filterStatus");
    const br = $("#btnReload");
    const bn = $("#btnNew");
    const bc = $("#btnCreateTicket");
    const bl = $("#btnLogout");

    if (ft) {
      ft.addEventListener("input", (e) => {
        state.filterText = e.target.value;
        renderTable();
      });
    }

    if (fs) {
      fs.addEventListener("change", (e) => {
        state.filterStatus = e.target.value;
        renderTable();
      });
    }

    if (br) {
      br.addEventListener("click", async () => {
        await loadAll();
        renderAll();
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
        await createTicket();
      });
    }

    if (bl) {
      bl.addEventListener("click", async () => {
        try {
          await sb.auth.signOut();
          location.reload();
        } catch (e) {
          console.error(e);
          setMsg("Erro ao sair: " + (e?.message || e), "err");
        }
      });
    }

    const bl2 = $("#btnLogout2");
    if (bl2 && bl) bl2.addEventListener("click", () => bl.click());
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
                  <option>aguardando_cliente</option>
                  <option>em_analise</option>
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
                    <option value="em_analise">Em análise</option>
                    <option value="aguardando_cliente">Aguardando cliente</option>
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
