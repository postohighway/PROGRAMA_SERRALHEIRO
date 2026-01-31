import { Data } from "./data.js";
import { fmtMoney, todayISO, monthISO, parseBRMoney, badgeForStatus } from "./utils.js";

const VERSION = "2026-01-19";
const els = (id) => document.getElementById(id);

const state = {
  mode: "mock",          // mock | supabase
  user: null,            // {email, name?}
  route: "dashboard",
  activeFinanceTab: "ar",
};

function safeText(id, text){
  const el = els(id);
  if (el) el.textContent = text ?? "";
}

function setSubtitle(text){ safeText("subtitle", text); }
function setModeLabel(){ safeText("app-mode", state.mode === "supabase" ? "Supabase" : "Mock"); }

function show(viewId){
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const target = els(viewId);
  if (target) target.classList.remove("hidden");
}

function showPage(route){
  state.route = route;

  const titles = {
    dashboard: "Dashboard",
    clients: "Clientes",
    quotes: "Orçamentos",
    workorders: "Tickets",
    finance: "Financeiro",
    settings: "Configurações",
  };

  setSubtitle(titles[route] || "Sistema");

  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const page = els(`page-${route}`);
  if (page) page.classList.remove("hidden");

  document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.bn-item[data-route="${route}"]`).forEach(b => b.classList.add("active"));

  refreshRoute(route);
}

function openDrawer(){
  const d = els("drawer");
  if (!d) return;
  d.classList.remove("hidden");
  d.setAttribute("aria-hidden","false");
}
function closeDrawer(){
  const d = els("drawer");
  if (!d) return;
  d.classList.add("hidden");
  d.setAttribute("aria-hidden","true");
}

function wireNav(){
  els("btn-menu")?.addEventListener("click", openDrawer);
  els("btn-drawer-close")?.addEventListener("click", closeDrawer);
  els("drawer-backdrop")?.addEventListener("click", closeDrawer);

  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const r = btn.dataset.route;
      closeDrawer();
      if (r) showPage(r);
    });
  });

  document.querySelectorAll(".bn-item").forEach(btn=>{
    btn.addEventListener("click", ()=> {
      const r = btn.dataset.route;
      if (r) showPage(r);
    });
  });

  // Atalhos apenas no dashboard para evitar duplicação
  const dash = els("page-dashboard");
  if (dash){
    dash.querySelectorAll("[data-route]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const r = btn.getAttribute("data-route");
        if (r) showPage(r);
      });
    });
  }
}

function wireAuth(){
  els("login-form")?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = (els("login-email")?.value || "").trim();
    const pass = els("login-password")?.value || "";
    safeText("login-status", "Entrando...");

    try{
      // importante: se init falhar por settings, a gente tenta de novo aqui
      await Data.initFromSettings();
      const ok = await Data.login(email, pass);
      if(!ok) throw new Error("Falha no login.");
      state.user = { email };
      afterLogin();
    }catch(err){
      safeText("login-status", `Erro: ${err?.message || err}`);
      console.error("LOGIN ERROR:", err);
    }
  });

  els("btn-demo")?.addEventListener("click", async ()=>{
    try{
      // Demo deve funcionar mesmo sem Supabase
      const cur = Data.getSavedSettings?.() || {};
      Data.saveSettings({
        ...cur,
        mode: "mock",
      });

      await Data.initFromSettings();
      state.mode = Data.mode();
      state.user = { email: "demo@local" };
      afterLogin();
    }catch(err){
      safeText("login-status", `Erro (demo): ${err?.message || err}`);
      console.error("DEMO ERROR:", err);
    }
  });

  els("btn-logout")?.addEventListener("click", async ()=>{
    try{
      await Data.logout();
    } finally {
      state.user = null;
      show("view-login");
    }
  });
}

function afterLogin(){
  safeText("app-version", VERSION);
  safeText("whoami", state.user?.email || "Usuário");
  setModeLabel();
  show("view-app");
  showPage("dashboard");
}

function refreshSettingsView(){
  const modeSel = els("settings-mode");
  const urlInp = els("settings-supabase-url");
  const keyInp = els("settings-supabase-key");
  if(!modeSel || !urlInp || !keyInp) return;

  const s = Data.getSavedSettings();
  modeSel.value = s.mode || "mock";
  urlInp.value = s.supabaseUrl || "";
  keyInp.value = s.supabaseKey || "";
}

function wireSettings(){
  refreshSettingsView();

  els("btn-settings-apply")?.addEventListener("click", async ()=>{
    const modeSel = els("settings-mode");
    const urlInp = els("settings-supabase-url");
    const keyInp = els("settings-supabase-key");

    const mode = modeSel?.value || "mock";
    Data.saveSettings({
      mode,
      supabaseUrl: (urlInp?.value || "").trim(),
      supabaseKey: (keyInp?.value || "").trim(),
    });

    try{
      await Data.initFromSettings();
      state.mode = mode;
      setModeLabel();
      safeText("rep-output", "Configurações aplicadas.");
    }catch(err){
      safeText("rep-output", `Erro ao aplicar: ${err?.message || err}`);
      console.error("SETTINGS APPLY ERROR:", err);
    }
  });
}

function wireClients(){
  els("btn-add-client")?.addEventListener("click", ()=> openClientModal());
  els("btn-client-refresh")?.addEventListener("click", refreshClients);
  els("client-search")?.addEventListener("input", ()=> refreshClients());

  els("btn-client-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveClient();
  });

  els("btn-client-delete")?.addEventListener("click", async ()=>{
    const id = els("client-id")?.value;
    if(!id) return;
    if(!confirm("Excluir cliente?")) return;
    try{
      await Data.clients.remove(id);
      closeModal("modal-client");
      await refreshClients();
      safeText("clients-status", "Cliente excluído.");
    }catch(err){
      safeText("clients-status", `Erro: ${err?.message || err}`);
      console.error("CLIENT DELETE ERROR:", err);
    }
  });

  els("btn-client-cancel")?.addEventListener("click", ()=> closeModal("modal-client"));
}

async function refreshClients(){
  safeText("clients-status", "Carregando...");
  try{
    const q = (els("client-search")?.value || "").trim().toLowerCase();
    const rows = await Data.clients.list();

    const filtered = !q ? rows : rows.filter(r =>
      String(r.name||"").toLowerCase().includes(q) ||
      String(r.phone||"").toLowerCase().includes(q)
    );

    renderClients(filtered);
    safeText("clients-status", `OK (${filtered.length})`);
  }catch(err){
    safeText("clients-status", `Erro: ${err?.message || err}`);
    console.error("CLIENT LIST ERROR:", err);
  }
}

function renderClients(rows){
  const list = els("clients-list");
  if(!list) return;
  list.innerHTML = "";

  if(!rows || rows.length === 0){
    list.innerHTML = `<div class="empty">Nenhum cliente.</div>`;
    return;
  }

  for(const r of rows){
    const card = document.createElement("div");
    card.className = "card row";

    const left = document.createElement("div");
    left.className = "row-left";
    left.innerHTML = `
      <div class="title">${escapeHtml(r.name)}</div>
      <div class="muted">${escapeHtml(r.phone || "")}</div>
      <div class="muted">${escapeHtml(r.address || "")}</div>
    `;

    const right = document.createElement("div");
    right.className = "row-right";

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Editar";
    btn.addEventListener("click", ()=> openClientModal(r));

    right.appendChild(btn);
    card.appendChild(left);
    card.appendChild(right);
    list.appendChild(card);
  }
}

function openClientModal(row){
  els("client-id").value = row?.id || "";
  els("client-name").value = row?.name || "";
  els("client-phone").value = row?.phone || "";
  els("client-address").value = row?.address || "";
  els("client-notes").value = row?.notes || "";
  showModal("modal-client");
}

async function saveClient(){
  const id = els("client-id")?.value || "";
  const payload = {
    name: (els("client-name")?.value || "").trim(),
    phone: (els("client-phone")?.value || "").trim(),
    address: (els("client-address")?.value || "").trim(),
    notes: (els("client-notes")?.value || "").trim(),
  };

  if(!payload.name){
    alert("Nome é obrigatório.");
    return;
  }

  try{
    if(id){
      await Data.clients.update(id, payload);
      safeText("clients-status", "Cliente atualizado.");
    }else{
      await Data.clients.create({ ...payload, created_at: todayISO() });
      safeText("clients-status", "Cliente criado.");
    }
    closeModal("modal-client");
    await refreshClients();
  }catch(err){
    safeText("clients-status", `Erro: ${err?.message || err}`);
    console.error("CLIENT SAVE ERROR:", err);
  }
}

/* =======================
   Orçamentos (Quotes)
======================= */

function wireQuotes(){
  els("btn-add-quote")?.addEventListener("click", ()=> openQuoteModal());
  els("btn-quote-refresh")?.addEventListener("click", refreshQuotes);
  els("quote-search")?.addEventListener("input", ()=> refreshQuotes());

  els("btn-quote-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveQuote();
  });

  els("btn-quote-delete")?.addEventListener("click", async ()=>{
    const id = els("quote-id")?.value;
    if(!id) return;
    if(!confirm("Excluir orçamento?")) return;
    try{
      await Data.quotes.remove(id);
      closeModal("modal-quote");
      await refreshQuotes();
      safeText("quotes-status", "Orçamento excluído.");
    }catch(err){
      safeText("quotes-status", `Erro: ${err?.message || err}`);
      console.error("QUOTE DELETE ERROR:", err);
    }
  });

  els("btn-quote-cancel")?.addEventListener("click", ()=> closeModal("modal-quote"));
}

async function refreshQuotes(){
  safeText("quotes-status", "Carregando...");
  try{
    const q = (els("quote-search")?.value || "").trim().toLowerCase();
    const rows = await Data.quotes.list();

    const clients = await Data.clients.list();
    const byId = new Map(clients.map(c=> [c.id, c]));

    const enriched = rows.map(r => ({
      ...r,
      client: byId.get(r.client_id) || null
    }));

    const filtered = !q ? enriched : enriched.filter(r =>
      String(r.desc||"").toLowerCase().includes(q) ||
      String(r.client?.name||"").toLowerCase().includes(q)
    );

    renderQuotes(filtered);
    safeText("quotes-status", `OK (${filtered.length})`);
  }catch(err){
    safeText("quotes-status", `Erro: ${err?.message || err}`);
    console.error("QUOTE LIST ERROR:", err);
  }
}

function renderQuotes(rows){
  const list = els("quotes-list");
  if(!list) return;
  list.innerHTML = "";

  if(!rows || rows.length === 0){
    list.innerHTML = `<div class="empty">Nenhum orçamento.</div>`;
    return;
  }

  for(const r of rows){
    const card = document.createElement("div");
    card.className = "card row";

    const left = document.createElement("div");
    left.className = "row-left";
    left.innerHTML = `
      <div class="title">${escapeHtml(r.desc || "Orçamento")}</div>
      <div class="muted">${escapeHtml(r.client?.name || "Sem cliente")}</div>
      <div class="muted">${badgeForStatus(r.status)} • ${fmtMoney(r.total || 0)} • ${escapeHtml(r.created_at || "")}</div>
    `;

    const right = document.createElement("div");
    right.className = "row-right";

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Editar";
    btn.addEventListener("click", ()=> openQuoteModal(r));

    right.appendChild(btn);
    card.appendChild(left);
    card.appendChild(right);
    list.appendChild(card);
  }
}

function openQuoteModal(row){
  els("quote-id").value = row?.id || "";
  els("quote-client-id").value = row?.client_id || "";
  els("quote-desc").value = row?.desc || "";
  els("quote-total").value = row?.total ? String(row.total) : "";
  els("quote-status").value = row?.status || "aberto";
  els("quote-deadline-days").value = row?.deadline_days ? String(row.deadline_days) : "7";
  showModal("modal-quote");
  populateClientSelect("quote-client-id", row?.client_id);
}

async function populateClientSelect(selectId, selected){
  const sel = els(selectId);
  if(!sel) return;

  const clients = await Data.clients.list();
  sel.innerHTML = `<option value="">Selecione...</option>` + clients.map(c =>
    `<option value="${escapeHtml(c.id)}"${c.id === selected ? " selected" : ""}>${escapeHtml(c.name)}</option>`
  ).join("");
}

async function saveQuote(){
  const id = els("quote-id")?.value || "";
  const payload = {
    client_id: els("quote-client-id")?.value || null,
    desc: (els("quote-desc")?.value || "").trim(),
    total: Number(els("quote-total")?.value || 0),
    status: els("quote-status")?.value || "aberto",
    deadline_days: Number(els("quote-deadline-days")?.value || 7),
    created_at: todayISO(),
  };

  if(!payload.desc){
    alert("Descrição é obrigatória.");
    return;
  }

  try{
    if(id){
      await Data.quotes.update(id, payload);
      safeText("quotes-status", "Orçamento atualizado.");
    }else{
      await Data.quotes.create(payload);
      safeText("quotes-status", "Orçamento criado.");
    }
    closeModal("modal-quote");
    await refreshQuotes();
  }catch(err){
    safeText("quotes-status", `Erro: ${err?.message || err}`);
    console.error("QUOTE SAVE ERROR:", err);
  }
}

/* =======================
   Tickets / Workorders
======================= */

function wireWorkorders(){
  els("btn-add-wo")?.addEventListener("click", ()=> openWorkorderModal());
  els("btn-wo-refresh")?.addEventListener("click", refreshWorkorders);
  els("wo-search")?.addEventListener("input", ()=> refreshWorkorders());

  els("btn-wo-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveWorkorder();
  });

  els("btn-wo-delete")?.addEventListener("click", async ()=>{
    const id = els("wo-id")?.value;
    if(!id) return;
    if(!confirm("Excluir ticket?")) return;
    try{
      await Data.workorders.remove(id);
      closeModal("modal-wo");
      await refreshWorkorders();
      safeText("wo-status", "Ticket excluído.");
    }catch(err){
      safeText("wo-status", `Erro: ${err?.message || err}`);
      console.error("WO DELETE ERROR:", err);
    }
  });

  els("btn-wo-cancel")?.addEventListener("click", ()=> closeModal("modal-wo"));
}

async function refreshWorkorders(){
  safeText("wo-status", "Carregando...");
  try{
    const q = (els("wo-search")?.value || "").trim().toLowerCase();
    const rows = await Data.workorders.list();

    const clients = await Data.clients.list();
    const byId = new Map(clients.map(c=> [c.id, c]));

    const enriched = rows.map(r => ({
      ...r,
      client: byId.get(r.client_id) || null
    }));

    const filtered = !q ? enriched : enriched.filter(r =>
      String(r.desc||"").toLowerCase().includes(q) ||
      String(r.client?.name||"").toLowerCase().includes(q) ||
      String(r.status||"").toLowerCase().includes(q)
    );

    renderWorkorders(filtered);
    safeText("wo-status", `OK (${filtered.length})`);
  }catch(err){
    safeText("wo-status", `Erro: ${err?.message || err}`);
    console.error("WO LIST ERROR:", err);
  }
}

function renderWorkorders(rows){
  const list = els("wo-list");
  if(!list) return;
  list.innerHTML = "";

  if(!rows || rows.length === 0){
    list.innerHTML = `<div class="empty">Nenhum ticket.</div>`;
    return;
  }

  for(const r of rows){
    const card = document.createElement("div");
    card.className = "card row";

    const left = document.createElement("div");
    left.className = "row-left";
    left.innerHTML = `
      <div class="title">${escapeHtml(r.desc || "Ticket")}</div>
      <div class="muted">${escapeHtml(r.client?.name || "Sem cliente")}</div>
      <div class="muted">${badgeForStatus(r.status)} • Prazo: ${escapeHtml(r.due_date || "")}</div>
    `;

    const right = document.createElement("div");
    right.className = "row-right";

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Editar";
    btn.addEventListener("click", ()=> openWorkorderModal(r));

    right.appendChild(btn);
    card.appendChild(left);
    card.appendChild(right);
    list.appendChild(card);
  }
}

function openWorkorderModal(row){
  els("wo-id").value = row?.id || "";
  els("wo-client-id").value = row?.client_id || "";
  els("wo-desc").value = row?.desc || "";
  els("wo-status").value = row?.status || "aberto";
  els("wo-due-date").value = row?.due_date || todayISO();
  showModal("modal-wo");
  populateClientSelect("wo-client-id", row?.client_id);
}

async function saveWorkorder(){
  const id = els("wo-id")?.value || "";
  const payload = {
    client_id: els("wo-client-id")?.value || null,
    desc: (els("wo-desc")?.value || "").trim(),
    status: els("wo-status")?.value || "aberto",
    due_date: els("wo-due-date")?.value || todayISO(),
    created_at: todayISO(),
  };

  if(!payload.desc){
    alert("Descrição é obrigatória.");
    return;
  }

  try{
    if(id){
      await Data.workorders.update(id, payload);
      safeText("wo-status", "Ticket atualizado.");
    }else{
      await Data.workorders.create(payload);
      safeText("wo-status", "Ticket criado.");
    }
    closeModal("modal-wo");
    await refreshWorkorders();
  }catch(err){
    safeText("wo-status", `Erro: ${err?.message || err}`);
    console.error("WO SAVE ERROR:", err);
  }
}

/* =======================
   Financeiro
======================= */

function wireFinance(){
  els("btn-fin-refresh")?.addEventListener("click", refreshFinance);
  document.querySelectorAll(".fin-tab").forEach(b=>{
    b.addEventListener("click", ()=>{
      document.querySelectorAll(".fin-tab").forEach(x=> x.classList.remove("active"));
      b.classList.add("active");
      state.activeFinanceTab = b.dataset.tab || "ar";
      refreshFinance();
    });
  });

  els("btn-tx-add")?.addEventListener("click", ()=> openTxModal());
  els("btn-tx-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveTx();
  });
  els("btn-tx-cancel")?.addEventListener("click", ()=> closeModal("modal-tx"));
  els("btn-tx-delete")?.addEventListener("click", async ()=>{
    const id = els("tx-id")?.value;
    if(!id) return;
    if(!confirm("Excluir lançamento?")) return;
    try{
      await Data.txs.remove(id);
      closeModal("modal-tx");
      await refreshFinance();
      safeText("fin-status", "Excluído.");
    }catch(err){
      safeText("fin-status", `Erro: ${err?.message || err}`);
      console.error("TX DELETE ERROR:", err);
    }
  });
}

async function refreshFinance(){
  safeText("fin-status", "Carregando...");
  try{
    const rows = await Data.txs.list();

    const tab = state.activeFinanceTab;
    const filtered = rows.filter(r => (tab === "ar" ? r.type === "receber" : r.type === "pagar"));

    renderTxs(filtered);
    refreshFinanceSummary(rows);
    safeText("fin-status", `OK (${filtered.length})`);
  }catch(err){
    safeText("fin-status", `Erro: ${err?.message || err}`);
    console.error("FIN LIST ERROR:", err);
  }
}

function renderTxs(rows){
  const list = els("tx-list");
  if(!list) return;
  list.innerHTML = "";

  if(!rows || rows.length === 0){
    list.innerHTML = `<div class="empty">Nenhum lançamento.</div>`;
    return;
  }

  const sorted = [...rows].sort(sortByDate);

  for(const r of sorted){
    const card = document.createElement("div");
    card.className = "card row";

    const left = document.createElement("div");
    left.className = "row-left";
    left.innerHTML = `
      <div class="title">${escapeHtml(r.desc || "")}</div>
      <div class="muted">${escapeHtml(r.category || "")}</div>
      <div class="muted">${badgeForStatus(r.status)} • ${escapeHtml(r.due_date || "")}</div>
    `;

    const right = document.createElement("div");
    right.className = "row-right";

    const amt = document.createElement("div");
    amt.className = "amount";
    amt.textContent = fmtMoney(r.amount || 0);

    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Editar";
    btn.addEventListener("click", ()=> openTxModal(r));

    right.appendChild(amt);
    right.appendChild(btn);

    card.appendChild(left);
    card.appendChild(right);

    list.appendChild(card);
  }
}

function refreshFinanceSummary(rows){
  const now = new Date();
  const mm = monthISO(now);

  const inThisMonth = rows.filter(r => inMonth(r.due_date, mm));
  const receb = inThisMonth.filter(r=> r.type === "receber");
  const pagar = inThisMonth.filter(r=> r.type === "pagar");

  const recebAberto = receb.filter(r=> r.status !== "quitado");
  const pagarAberto = pagar.filter(r=> r.status !== "quitado");

  safeText("sum-receber", fmtMoney(sum(receb.map(r=> r.amount))));
  safeText("sum-pagar", fmtMoney(sum(pagar.map(r=> r.amount))));
  safeText("sum-saldo", fmtMoney(sum(receb.map(r=> r.amount)) - sum(pagar.map(r=> r.amount))));
  safeText("sum-receber-aberto", fmtMoney(sum(recebAberto.map(r=> r.amount))));
  safeText("sum-pagar-aberto", fmtMoney(sum(pagarAberto.map(r=> r.amount))));
}

function openTxModal(row){
  els("tx-id").value = row?.id || "";
  els("tx-type").value = row?.type || (state.activeFinanceTab === "ar" ? "receber" : "pagar");
  els("tx-desc").value = row?.desc || "";
  els("tx-category").value = row?.category || "";
  els("tx-status").value = row?.status || "aberto";
  els("tx-amount").value = row?.amount ? String(row.amount) : "";
  els("tx-due-date").value = row?.due_date || todayISO();
  showModal("modal-tx");
}

async function saveTx(){
  const id = els("tx-id")?.value || "";
  const payload = {
    type: els("tx-type")?.value || "receber",
    desc: (els("tx-desc")?.value || "").trim(),
    category: (els("tx-category")?.value || "").trim(),
    status: els("tx-status")?.value || "aberto",
    amount: Number(els("tx-amount")?.value || 0),
    due_date: els("tx-due-date")?.value || todayISO(),
  };

  if(!payload.desc){
    alert("Descrição é obrigatória.");
    return;
  }

  try{
    if(id){
      await Data.txs.update(id, payload);
      safeText("fin-status", "Atualizado.");
    }else{
      await Data.txs.create({ ...payload, created_at: todayISO() });
      safeText("fin-status", "Criado.");
    }
    closeModal("modal-tx");
    await refreshFinance();
  }catch(err){
    safeText("fin-status", `Erro: ${err?.message || err}`);
    console.error("TX SAVE ERROR:", err);
  }
}

/* =======================
   Dashboard
======================= */

async function refreshDashboard(){
  try{
    const clients = await Data.clients.list();
    const quotes = await Data.quotes.list();
    const wos = await Data.workorders.list();
    const txs = await Data.txs.list();

    safeText("kpi-clients", String(clients.length));
    safeText("kpi-quotes", String(quotes.length));
    safeText("kpi-tickets", String(wos.length));

    const openQuotes = quotes.filter(q=> q.status !== "concluido");
    const openTickets = wos.filter(w=> w.status !== "concluido");

    safeText("kpi-open-quotes", String(openQuotes.length));
    safeText("kpi-open-tickets", String(openTickets.length));

    // Finance summary
    const now = new Date();
    const mm = monthISO(now);
    const thisMonth = txs.filter(t=> inMonth(t.due_date, mm));

    const receb = thisMonth.filter(t=> t.type === "receber");
    const pagar = thisMonth.filter(t=> t.type === "pagar");
    safeText("kpi-month-receber", fmtMoney(sum(receb.map(r=> r.amount))));
    safeText("kpi-month-pagar", fmtMoney(sum(pagar.map(r=> r.amount))));
    safeText("kpi-month-saldo", fmtMoney(sum(receb.map(r=> r.amount)) - sum(pagar.map(r=> r.amount))));
  }catch(err){
    console.error("DASH ERROR:", err);
  }
}

/* =======================
   Modal helpers
======================= */

function showModal(id){
  const m = els(id);
  if(!m) return;
  m.classList.remove("hidden");
  m.setAttribute("aria-hidden","false");
}
function closeModal(id){
  const m = els(id);
  if(!m) return;
  m.classList.add("hidden");
  m.setAttribute("aria-hidden","true");
}

function refreshRoute(route){
  if(route === "dashboard") return refreshDashboard();
  if(route === "clients") return refreshClients();
  if(route === "quotes") return refreshQuotes();
  if(route === "workorders") return refreshWorkorders();
  if(route === "finance") return refreshFinance();
  if(route === "settings") return refreshSettingsView();
}

function wireGlobal(){
  els("btn-sync")?.addEventListener("click", async ()=>{
    try{
      await Data.initFromSettings();
      await refreshRoute(state.route);
      if(state.route !== "dashboard") await refreshDashboard();
      alert("Atualizado.");
    }catch(err){
      alert(`Erro ao atualizar: ${err?.message || err}`);
      console.error("SYNC ERROR:", err);
    }
  });
}

function inMonth(dateStr, yyyyMm){
  if(!dateStr || !yyyyMm) return false;
  return String(dateStr).startsWith(yyyyMm);
}
function sum(arr){ return arr.reduce((a,b)=> a + (Number(b)||0), 0); }
function sortByDate(a,b){
  const da = a.due_date || "9999-12-31";
  const db = b.due_date || "9999-12-31";
  return da.localeCompare(db);
}
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Instrumentação: mostra erros críticos que impedem boot
window.addEventListener("error", (e) => {
  console.error("WINDOW ERROR:", e.error || e.message, e);
  safeText("login-status", `Erro JS: ${e.message || e.error}`);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("UNHANDLED REJECTION:", e.reason);
  safeText("login-status", `Erro: ${e.reason?.message || e.reason}`);
});

(async function boot(){
  // 1) Wire primeiro (para demo funcionar mesmo se settings quebrar)
  wireNav();
  wireAuth();
  wireClients();
  wireQuotes();
  wireWorkorders();
  wireFinance();
  wireSettings();
  wireGlobal();

  // 2) Mostra login imediatamente
  show("view-login");

  // 3) Agora tenta inicializar settings/mode sem matar a UI
  try{
    await Data.initFromSettings();
    state.mode = Data.mode();
    setModeLabel();
  }catch(err){
    console.error("BOOT INIT ERROR:", err);
    safeText("login-status", `Erro ao iniciar (settings): ${err?.message || err}. Você ainda pode usar Demo.`);
  }
})();
