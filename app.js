import { Data } from "./data.js";
import { fmtMoney, todayISO, monthISO, parseBRMoney, badgeForStatus } from "./utils.js";

const VERSION = "2026-01-19";

const els = (id) => document.getElementById(id);
const safeText = (id, text) => {
  const el = els(id);
  if (el) el.textContent = text ?? "";
};

const state = {
  mode: "mock",          // mock | supabase
  user: null,            // {email, name?}
  route: "dashboard",
  activeFinanceTab: "ar",
};

function setSubtitle(text) { safeText("subtitle", text); }
function setModeLabel() { safeText("app-mode", state.mode === "supabase" ? "Supabase" : "Mock"); }

function show(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const target = els(viewId);
  if (target) target.classList.remove("hidden");
}

function showPage(route) {
  state.route = route;

  const titles = {
    dashboard: "Dashboard",
    clients: "Clientes",
    quotes: "Orçamentos",
    workorders: "Ordens de Serviço",
    finance: "Financeiro",
    settings: "Configurações",
  };

  setSubtitle(titles[route] || "Sistema");

  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const page = els(`page-${route}`);
  if (page) page.classList.remove("hidden");

  // bottom nav active
  document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.bn-item[data-route="${route}"]`).forEach(b => b.classList.add("active"));

  // refresh page data
  refreshRoute(route);
}

function openDrawer() {
  const d = els("drawer");
  if (!d) return;
  d.classList.remove("hidden");
  d.setAttribute("aria-hidden", "false");
}
function closeDrawer() {
  const d = els("drawer");
  if (!d) return;
  d.classList.add("hidden");
  d.setAttribute("aria-hidden", "true");
}

function wireNav() {
  // drawer open/close
  const btnMenu = els("btn-menu");
  const btnClose = els("btn-drawer-close");
  const backdrop = els("drawer-backdrop");

  if (btnMenu) btnMenu.addEventListener("click", openDrawer);
  if (btnClose) btnClose.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);

  // drawer routes
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.route;
      closeDrawer();
      if (r) showPage(r);
    });
  });

  // bottom nav routes
  document.querySelectorAll(".bn-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = btn.dataset.route;
      if (r) showPage(r);
    });
  });

  // Atalhos APENAS no dashboard (evita duplicar clique em qualquer data-route do app)
  const dash = els("page-dashboard");
  if (dash) {
    dash.querySelectorAll("[data-route]").forEach(btn => {
      btn.addEventListener("click", () => {
        const r = btn.getAttribute("data-route");
        if (r) showPage(r);
      });
    });
  }
}

function wireAuth() {
  const form = els("login-form");
  const btnDemo = els("btn-demo");
  const btnLogout = els("btn-logout");

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = (els("login-email")?.value || "").trim();
      const pass = els("login-password")?.value || "";
      safeText("login-status", "Entrando...");

      try {
        // Data já é inicializado no boot, mas mantemos por segurança
        await Data.initFromSettings();
        const ok = await Data.login(email, pass);
        if (!ok) throw new Error("Falha no login.");

        state.user = { email };
        afterLogin();
      } catch (err) {
        safeText("login-status", `Erro: ${err?.message || err}`);
      }
    });
  }

  if (btnDemo) {
    btnDemo.addEventListener("click", async () => {
      state.mode = "mock";
      Data.setMode("mock");
      state.user = { email: "demo@local" };
      afterLogin();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      await Data.logout();
      state.user = null;
      show("view-login");
    });
  }
}

function afterLogin() {
  safeText("app-version", VERSION);
  safeText("whoami", state.user?.email || "Usuário");
  setModeLabel();
  show("view-app");
  showPage("dashboard");
}

/**
 * Settings: wiring apenas 1x.
 * Quando entrar na tela, chamamos refreshSettingsView() para preencher campos.
 */
function refreshSettingsView() {
  const modeSel = els("settings-mode");
  const urlInp = els("settings-supabase-url");
  const keyInp = els("settings-supabase-key");

  if (!modeSel || !urlInp || !keyInp) return;

  const s = Data.getSavedSettings();
  modeSel.value = s.mode || "mock";
  urlInp.value = s.supabaseUrl || "";
  keyInp.value = s.supabaseKey || "";
}

function wireSettings() {
  const btnApply = els("btn-settings-apply");
  if (!btnApply) return;

  // carregar uma vez ao iniciar
  refreshSettingsView();

  btnApply.addEventListener("click", async () => {
    const modeSel = els("settings-mode");
    const urlInp = els("settings-supabase-url");
    const keyInp = els("settings-supabase-key");

    const mode = modeSel?.value || "mock";

    Data.saveSettings({
      mode,
      supabaseUrl: (urlInp?.value || "").trim(),
      supabaseKey: (keyInp?.value || "").trim(),
    });

    await Data.initFromSettings();
    state.mode = mode;
    setModeLabel();
    safeText("rep-output", "Configurações aplicadas.");
  });
}

function wireClients() {
  const addBtn = els("btn-add-client");
  const refreshBtn = els("btn-client-refresh");
  const search = els("client-search");
  const form = els("client-form");
  const saveBtn = els("btn-client-save");
  const delBtn = els("btn-client-delete");

  if (addBtn) addBtn.addEventListener("click", () => openClientModal());
  if (refreshBtn) refreshBtn.addEventListener("click", refreshClients);
  if (search) search.addEventListener("input", () => refreshClients());

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await saveClient();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await saveClient();
    });
  }

  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      const id = els("client-id")?.value;
      if (!id) return;
      if (!confirm("Excluir cliente?")) return;
      await Data.clients.remove(id);
      els("modal-client")?.close();
      await refreshClients();
    });
  }
}

function openClientModal(client = null) {
  safeText("client-status", "");
  if (els("client-id")) els("client-id").value = client?.id || "";
  if (els("client-name")) els("client-name").value = client?.name || "";
  if (els("client-phone")) els("client-phone").value = client?.phone || "";
  if (els("client-address")) els("client-address").value = client?.address || "";
  if (els("client-notes")) els("client-notes").value = client?.notes || "";

  safeText("client-form-title", client ? "Editar cliente" : "Novo cliente");

  const del = els("btn-client-delete");
  if (del) del.classList.toggle("hidden", !client);

  els("modal-client")?.showModal();
}

async function saveClient() {
  const id = els("client-id")?.value || null;
  const payload = {
    name: (els("client-name")?.value || "").trim(),
    phone: (els("client-phone")?.value || "").trim(),
    address: (els("client-address")?.value || "").trim(),
    notes: (els("client-notes")?.value || "").trim(),
  };

  safeText("client-status", "Salvando...");
  try {
    if (id) await Data.clients.update(id, payload);
    else await Data.clients.create(payload);

    safeText("client-status", "Salvo.");
    els("modal-client")?.close();
    await refreshClients();
  } catch (err) {
    safeText("client-status", `Erro: ${err?.message || err}`);
  }
}

async function refreshClients() {
  const q = (els("client-search")?.value || "").trim().toLowerCase();
  const list = await Data.clients.list();

  const filtered = !q ? list : list.filter(c =>
    (c.name || "").toLowerCase().includes(q) ||
    (c.phone || "").toLowerCase().includes(q)
  );

  const root = els("clients-list");
  if (!root) return;
  root.innerHTML = "";

  if (filtered.length === 0) {
    root.innerHTML = `<div class="card muted">Nenhum cliente encontrado.</div>`;
    return;
  }

  for (const c of filtered) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(c.name || "Sem nome")}</div>
        <div class="item-sub">${escapeHtml(c.phone || "")}</div>
        <div class="item-sub">${escapeHtml(c.address || "")}</div>
      </div>
      <div class="item-right">
        <button class="btn small-btn">Editar</button>
      </div>
    `;
    el.querySelector("button")?.addEventListener("click", () => openClientModal(c));
    root.appendChild(el);
  }
}

function wireQuotes() {
  const add = els("btn-add-quote");
  const refresh = els("btn-quote-refresh");
  const search = els("quote-search");
  const filter = els("quote-status-filter");
  const save = els("btn-quote-save");
  const del = els("btn-quote-delete");

  if (add) add.addEventListener("click", () => openQuoteModal());
  if (refresh) refresh.addEventListener("click", refreshQuotes);
  if (search) search.addEventListener("input", () => refreshQuotes());
  if (filter) filter.addEventListener("change", refreshQuotes);

  if (save) {
    save.addEventListener("click", async (e) => {
      e.preventDefault();
      await saveQuote();
    });
  }

  if (del) {
    del.addEventListener("click", async () => {
      const id = els("quote-id")?.value;
      if (!id) return;
      if (!confirm("Excluir orçamento?")) return;
      await Data.quotes.remove(id);
      els("modal-quote")?.close();
      await refreshQuotes();
    });
  }
}

async function openQuoteModal(quote = null) {
  safeText("quote-status-msg", "");
  if (els("quote-id")) els("quote-id").value = quote?.id || "";

  await fillClientSelect("quote-client", quote?.client_id);

  if (els("quote-desc")) els("quote-desc").value = quote?.desc || "";
  if (els("quote-total")) els("quote-total").value = quote ? fmtMoney(quote.total) : "";
  if (els("quote-status")) els("quote-status").value = quote?.status || "aberto";
  if (els("quote-deadline-days")) els("quote-deadline-days").value = quote?.deadline_days ?? "";

  safeText("quote-form-title", quote ? "Editar orçamento" : "Novo orçamento");

  const del = els("btn-quote-delete");
  if (del) del.classList.toggle("hidden", !quote);

  els("modal-quote")?.showModal();
}

async function saveQuote() {
  const id = els("quote-id")?.value || null;
  const payload = {
    client_id: els("quote-client")?.value || null,
    desc: (els("quote-desc")?.value || "").trim(),
    total: parseBRMoney(els("quote-total")?.value || ""),
    status: els("quote-status")?.value || "aberto",
    deadline_days: Number(els("quote-deadline-days")?.value || 0) || null,
  };

  safeText("quote-status-msg", "Salvando...");
  try {
    if (id) await Data.quotes.update(id, payload);
    else await Data.quotes.create(payload);

    safeText("quote-status-msg", "Salvo.");
    els("modal-quote")?.close();
    await refreshQuotes();
  } catch (err) {
    safeText("quote-status-msg", `Erro: ${err?.message || err}`);
  }
}

async function refreshQuotes() {
  const q = (els("quote-search")?.value || "").trim().toLowerCase();
  const status = els("quote-status-filter")?.value || "";

  const [quotes, clients] = await Promise.all([Data.quotes.list(), Data.clients.list()]);
  const clientMap = new Map(clients.map(c => [c.id, c]));

  let filtered = quotes;
  if (status) filtered = filtered.filter(x => x.status === status);

  if (q) {
    filtered = filtered.filter(x => {
      const c = clientMap.get(x.client_id);
      const hay = `${c?.name || ""} ${x.desc || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const root = els("quotes-list");
  if (!root) return;
  root.innerHTML = "";

  if (filtered.length === 0) {
    root.innerHTML = `<div class="card muted">Nenhum orçamento encontrado.</div>`;
    return;
  }

  for (const qu of filtered) {
    const c = clientMap.get(qu.client_id);
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(c?.name || "Cliente")}</div>
        <div class="item-sub">${escapeHtml(qu.desc || "")}</div>
        <span class="badge">${escapeHtml(qu.status)}</span>
      </div>
      <div class="item-right">
        <div class="item-title">${fmtMoney(qu.total || 0)}</div>
        <button class="btn small-btn">Abrir</button>
      </div>
    `;
    el.querySelector("button")?.addEventListener("click", () => openQuoteModal(qu));
    root.appendChild(el);
  }
}

function wireWorkorders() {
  const add = els("btn-add-wo");
  const refresh = els("btn-wo-refresh");
  const search = els("wo-search");
  const filter = els("wo-status-filter");
  const save = els("btn-wo-save");
  const del = els("btn-wo-delete");

  if (add) add.addEventListener("click", () => openWoModal());
  if (refresh) refresh.addEventListener("click", refreshWorkorders);
  if (search) search.addEventListener("input", refreshWorkorders);
  if (filter) filter.addEventListener("change", refreshWorkorders);

  if (save) {
    save.addEventListener("click", async (e) => {
      e.preventDefault();
      await saveWo();
    });
  }

  if (del) {
    del.addEventListener("click", async () => {
      const id = els("wo-id")?.value;
      if (!id) return;
      if (!confirm("Excluir OS?")) return;
      await Data.workorders.remove(id);
      els("modal-wo")?.close();
      await refreshWorkorders();
    });
  }
}

async function openWoModal(wo = null) {
  safeText("wo-status-msg", "");
  if (els("wo-id")) els("wo-id").value = wo?.id || "";
  await fillClientSelect("wo-client", wo?.client_id);

  if (els("wo-desc")) els("wo-desc").value = wo?.desc || "";
  if (els("wo-status")) els("wo-status").value = wo?.status || "producao";
  if (els("wo-due")) els("wo-due").value = wo?.due_date || "";

  safeText("wo-form-title", wo ? "Editar OS" : "Nova OS");

  const del = els("btn-wo-delete");
  if (del) del.classList.toggle("hidden", !wo);

  els("modal-wo")?.showModal();
}

async function saveWo() {
  const id = els("wo-id")?.value || null;
  const payload = {
    client_id: els("wo-client")?.value || null,
    desc: (els("wo-desc")?.value || "").trim(),
    status: els("wo-status")?.value || "producao",
    due_date: els("wo-due")?.value || null,
  };

  safeText("wo-status-msg", "Salvando...");
  try {
    if (id) await Data.workorders.update(id, payload);
    else await Data.workorders.create(payload);

    safeText("wo-status-msg", "Salvo.");
    els("modal-wo")?.close();
    await refreshWorkorders();
  } catch (err) {
    safeText("wo-status-msg", `Erro: ${err?.message || err}`);
  }
}

async function refreshWorkorders() {
  const q = (els("wo-search")?.value || "").trim().toLowerCase();
  const status = els("wo-status-filter")?.value || "";

  const [items, clients] = await Promise.all([Data.workorders.list(), Data.clients.list()]);
  const clientMap = new Map(clients.map(c => [c.id, c]));

  let filtered = items;
  if (status) filtered = filtered.filter(x => x.status === status);

  if (q) {
    filtered = filtered.filter(x => {
      const c = clientMap.get(x.client_id);
      const hay = `${c?.name || ""} ${x.desc || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const root = els("wo-list");
  if (!root) return;
  root.innerHTML = "";

  if (filtered.length === 0) {
    root.innerHTML = `<div class="card muted">Nenhuma OS encontrada.</div>`;
    return;
  }

  for (const wo of filtered) {
    const c = clientMap.get(wo.client_id);
    const due = wo.due_date ? `Entrega: ${wo.due_date}` : "Sem data";
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(c?.name || "Cliente")}</div>
        <div class="item-sub">${escapeHtml(wo.desc || "")}</div>
        <span class="badge">${escapeHtml(wo.status)} • ${escapeHtml(due)}</span>
      </div>
      <div class="item-right">
        <button class="btn small-btn">Abrir</button>
      </div>
    `;
    el.querySelector("button")?.addEventListener("click", () => openWoModal(wo));
    root.appendChild(el);
  }
}

function wireFinance() {
  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      state.activeFinanceTab = tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      const panel = els(`tab-${tab}`);
      if (panel) panel.classList.remove("hidden");
    });
  });

  // Default months
  const m = monthISO(new Date());
  if (els("ar-month")) els("ar-month").value = m;
  if (els("ap-month")) els("ap-month").value = m;
  if (els("cash-month")) els("cash-month").value = m;
  if (els("rep-month")) els("rep-month").value = m;

  // Refresh buttons
  els("btn-ar-refresh")?.addEventListener("click", refreshFinance);
  els("btn-ap-refresh")?.addEventListener("click", refreshFinance);
  els("btn-cash-refresh")?.addEventListener("click", refreshFinance);
  els("btn-rep-refresh")?.addEventListener("click", refreshFinance);

  els("ar-search")?.addEventListener("input", refreshFinance);
  els("ap-search")?.addEventListener("input", refreshFinance);

  // Modal Tx
  els("btn-add-tx")?.addEventListener("click", () => openTxModal());

  els("btn-tx-save")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await saveTx();
  });

  els("btn-tx-delete")?.addEventListener("click", async () => {
    const id = els("tx-id")?.value;
    if (!id) return;
    if (!confirm("Excluir lançamento?")) return;
    await Data.txs.remove(id);
    els("modal-tx")?.close();
    await refreshFinance();
    await refreshDashboard();
  });

  els("btn-rep-export")?.addEventListener("click", async () => {
    const m = els("rep-month")?.value || monthISO(new Date());
    const rep = await Data.reports.monthSummary(m);
    safeText("rep-output", rep.whatsappText);
  });
}

function openTxModal(tx = null) {
  safeText("tx-status-msg", "");
  if (els("tx-id")) els("tx-id").value = tx?.id || "";
  if (els("tx-type")) els("tx-type").value = tx?.type || "receber";
  if (els("tx-desc")) els("tx-desc").value = tx?.desc || "";
  if (els("tx-amount")) els("tx-amount").value = tx ? fmtMoney(tx.amount) : "";
  if (els("tx-due")) els("tx-due").value = tx?.due_date || todayISO();
  if (els("tx-category")) els("tx-category").value = tx?.category || "";
  if (els("tx-status")) els("tx-status").value = tx?.status || "aberto";

  safeText("tx-form-title", tx ? "Editar lançamento" : "Novo lançamento");

  const del = els("btn-tx-delete");
  if (del) del.classList.toggle("hidden", !tx);

  els("modal-tx")?.showModal();
}

async function saveTx() {
  const id = els("tx-id")?.value || null;

  const payload = {
    type: els("tx-type")?.value || "receber",  // receber | pagar
    desc: (els("tx-desc")?.value || "").trim(),
    amount: parseBRMoney(els("tx-amount")?.value || ""),
    due_date: els("tx-due")?.value || null,
    category: els("tx-category")?.value || null,
    status: els("tx-status")?.value || "aberto", // aberto | parcial | quitado
  };

  safeText("tx-status-msg", "Salvando...");
  try {
    if (id) await Data.txs.update(id, payload);
    else await Data.txs.create(payload);

    safeText("tx-status-msg", "Salvo.");
    els("modal-tx")?.close();
    await refreshFinance();
    await refreshDashboard();
  } catch (err) {
    safeText("tx-status-msg", `Erro: ${err?.message || err}`);
  }
}

async function refreshFinance() {
  const txs = await Data.txs.list();

  // A receber
  const arMonth = els("ar-month")?.value || monthISO(new Date());
  const arQ = (els("ar-search")?.value || "").trim().toLowerCase();
  const arList = txs.filter(t => t.type === "receber" && inMonth(t.due_date, arMonth));
  const arFiltered = !arQ ? arList : arList.filter(t => (t.desc || "").toLowerCase().includes(arQ));
  renderTxList("ar-list", arFiltered, (tx) => openTxModal(tx));

  // A pagar
  const apMonth = els("ap-month")?.value || monthISO(new Date());
  const apQ = (els("ap-search")?.value || "").trim().toLowerCase();
  const apList = txs.filter(t => t.type === "pagar" && inMonth(t.due_date, apMonth));
  const apFiltered = !apQ ? apList : apList.filter(t =>
    `${t.desc || ""} ${t.category || ""}`.toLowerCase().includes(apQ)
  );
  renderTxList("ap-list", apFiltered, (tx) => openTxModal(tx));

  // Caixa
  const cashMonth = els("cash-month")?.value || monthISO(new Date());
  const cashTxs = txs.filter(t => inMonth(t.due_date, cashMonth) && t.status === "quitado");
  const totalIn = sum(cashTxs.filter(t => t.type === "receber").map(t => t.amount));
  const totalOut = sum(cashTxs.filter(t => t.type === "pagar").map(t => t.amount));

  safeText("cash-in", fmtMoney(totalIn));
  safeText("cash-out", fmtMoney(totalOut));
  safeText("cash-balance", fmtMoney(totalIn - totalOut));

  renderTxList("cash-list", cashTxs.sort(sortByDate), (tx) => openTxModal(tx));

  // Relatórios
  const repMonth = els("rep-month")?.value || monthISO(new Date());
  const rep = await Data.reports.monthSummary(repMonth);
  safeText("rep-output", rep.text);
}

function renderTxList(rootId, list, onOpen) {
  const root = els(rootId);
  if (!root) return;
  root.innerHTML = "";

  if (list.length === 0) {
    root.innerHTML = `<div class="card muted">Sem itens neste período.</div>`;
    return;
  }

  for (const tx of list) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(tx.desc || "")}</div>
        <div class="item-sub">${escapeHtml(tx.due_date || "")} • ${escapeHtml(tx.category || "")}</div>
        <span class="badge">${escapeHtml(badgeForStatus(tx))}</span>
      </div>
      <div class="item-right">
        <div class="item-title">${fmtMoney(tx.amount || 0)}</div>
        <button class="btn small-btn">Abrir</button>
      </div>
    `;
    el.querySelector("button")?.addEventListener("click", () => onOpen(tx));
    root.appendChild(el);
  }
}

async function refreshDashboard() {
  const m = monthISO(new Date());
  const txs = await Data.txs.list();

  const ar = txs.filter(t => t.type === "receber" && inMonth(t.due_date, m) && t.status !== "quitado");
  const ap = txs.filter(t => t.type === "pagar" && inMonth(t.due_date, m) && t.status !== "quitado");
  const cash = txs.filter(t => inMonth(t.due_date, m) && t.status === "quitado");

  const arSum = sum(ar.map(t => t.amount));
  const apSum = sum(ap.map(t => t.amount));
  const cashIn = sum(cash.filter(t => t.type === "receber").map(t => t.amount));
  const cashOut = sum(cash.filter(t => t.type === "pagar").map(t => t.amount));
  const cashBal = cashIn - cashOut;

  safeText("kpi-ar", fmtMoney(arSum));
  safeText("kpi-ap", fmtMoney(apSum));
  safeText("kpi-cash", fmtMoney(cashBal));
  safeText("kpi-ar-sub", `${ar.length} itens`);
  safeText("kpi-ap-sub", `${ap.length} itens`);
  safeText("kpi-cash-sub", `Mês ${m}`);

  // Pendências (top 6 por vencimento)
  const pending = [...ar, ...ap].sort(sortByDate).slice(0, 6);
  const root = els("dash-pending");
  if (!root) return;
  root.innerHTML = "";

  if (pending.length === 0) {
    root.innerHTML = `<div class="card muted">Sem pendências no momento.</div>`;
    return;
  }

  for (const tx of pending) {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(tx.desc || "")}</div>
        <div class="item-sub">${escapeHtml(tx.type === "receber" ? "A receber" : "A pagar")} • ${escapeHtml(tx.due_date || "")}</div>
        <span class="badge">${escapeHtml(badgeForStatus(tx))}</span>
      </div>
      <div class="item-right">
        <div class="item-title">${fmtMoney(tx.amount || 0)}</div>
      </div>
    `;
    root.appendChild(el);
  }
}

async function fillClientSelect(selectId, selectedId = null) {
  const sel = els(selectId);
  if (!sel) return;

  const clients = await Data.clients.list();
  sel.innerHTML = `<option value="" disabled ${selectedId ? "" : "selected"}>Selecione...</option>`;

  for (const c of clients) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name || "Sem nome";
    if (selectedId && c.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function refreshRoute(route) {
  if (route === "dashboard") return refreshDashboard();
  if (route === "clients") return refreshClients();
  if (route === "quotes") return refreshQuotes();
  if (route === "workorders") return refreshWorkorders();
  if (route === "finance") return refreshFinance();
  if (route === "settings") return refreshSettingsView();
}

function wireGlobal() {
  const btnSync = els("btn-sync");
  if (!btnSync) return;

  btnSync.addEventListener("click", async () => {
    await Data.initFromSettings();
    await refreshRoute(state.route);
    if (state.route !== "dashboard") await refreshDashboard();
    alert("Atualizado.");
  });
}

function inMonth(dateStr, yyyyMm) {
  if (!dateStr || !yyyyMm) return false;
  return String(dateStr).startsWith(yyyyMm);
}
function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }
function sortByDate(a, b) {
  const da = a.due_date || "9999-12-31";
  const db = b.due_date || "9999-12-31";
  return da.localeCompare(db);
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

(async function boot() {
  // Initialize Data from saved settings
  await Data.initFromSettings();
  state.mode = Data.mode();
  setModeLabel();

  wireNav();
  wireAuth();
  wireClients();
  wireQuotes();
  wireWorkorders();
  wireFinance();
  wireSettings(); // wired 1x
  wireGlobal();

  show("view-login");
})();
