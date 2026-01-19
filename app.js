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

function setSubtitle(text){ els("subtitle").textContent = text; }
function setModeLabel(){ els("app-mode").textContent = state.mode === "supabase" ? "Supabase" : "Mock"; }

function show(viewId){
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  els(viewId).classList.remove("hidden");
}

function showPage(route){
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
  els(`page-${route}`).classList.remove("hidden");

  // bottom nav active
  document.querySelectorAll(".bn-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(`.bn-item[data-route="${route}"]`).forEach(b => b.classList.add("active"));

  // refresh page data
  refreshRoute(route);
}

function openDrawer(){
  const d = els("drawer");
  d.classList.remove("hidden");
  d.setAttribute("aria-hidden","false");
}
function closeDrawer(){
  const d = els("drawer");
  d.classList.add("hidden");
  d.setAttribute("aria-hidden","true");
}

function wireNav(){
  // drawer open/close
  els("btn-menu").addEventListener("click", openDrawer);
  els("btn-drawer-close").addEventListener("click", closeDrawer);
  els("drawer-backdrop").addEventListener("click", closeDrawer);

  // drawer routes
  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const r = btn.dataset.route;
      closeDrawer();
      showPage(r);
    });
  });

  // bottom nav routes
  document.querySelectorAll(".bn-item").forEach(btn=>{
    btn.addEventListener("click", ()=> showPage(btn.dataset.route));
  });

  // Atalhos no dashboard
  document.querySelectorAll('[data-route]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const r = btn.getAttribute("data-route");
      if (!r) return;
      showPage(r);
    });
  });
}

function wireAuth(){
  els("login-form").addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = els("login-email").value.trim();
    const pass = els("login-password").value;
    els("login-status").textContent = "Entrando...";

    try{
      await Data.initFromSettings();
      const ok = await Data.login(email, pass);
      if(!ok) throw new Error("Falha no login.");

      state.user = { email };
      afterLogin();
    }catch(err){
      els("login-status").textContent = `Erro: ${err.message || err}`;
    }
  });

  els("btn-demo").addEventListener("click", async ()=>{
    state.mode = "mock";
    Data.setMode("mock");
    state.user = { email: "demo@local" };
    afterLogin();
  });

  els("btn-logout").addEventListener("click", async ()=>{
    await Data.logout();
    state.user = null;
    show("view-login");
  });
}

function afterLogin(){
  els("app-version").textContent = VERSION;
  els("whoami").textContent = state.user?.email || "Usuário";
  setModeLabel();
  show("view-app");
  showPage("dashboard");
}

function wireSettings(){
  const modeSel = els("settings-mode");
  const urlInp = els("settings-supabase-url");
  const keyInp = els("settings-supabase-key");

  // load saved settings
  const s = Data.getSavedSettings();
  modeSel.value = s.mode || "mock";
  urlInp.value = s.supabaseUrl || "";
  keyInp.value = s.supabaseKey || "";

  els("btn-settings-apply").addEventListener("click", async ()=>{
    const mode = modeSel.value;
    Data.saveSettings({
      mode,
      supabaseUrl: urlInp.value.trim(),
      supabaseKey: keyInp.value.trim(),
    });
    await Data.initFromSettings();
    state.mode = mode;
    setModeLabel();
    els("rep-output").textContent = "Configurações aplicadas.";
  });
}

function wireClients(){
  els("btn-add-client").addEventListener("click", ()=> openClientModal());
  els("btn-client-refresh").addEventListener("click", refreshClients);

  els("client-search").addEventListener("input", ()=> refreshClients());

  els("client-form").addEventListener("submit", async (e)=>{
    e.preventDefault();
  });

  els("btn-client-save").addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveClient();
  });

  els("btn-client-delete").addEventListener("click", async ()=>{
    const id = els("client-id").value;
    if(!id) return;
    if(!confirm("Excluir cliente?")) return;
    await Data.clients.remove(id);
    els("modal-client").close();
    await refreshClients();
  });
}

function openClientModal(client=null){
  els("client-status").textContent = "";
  els("client-id").value = client?.id || "";
  els("client-name").value = client?.name || "";
  els("client-phone").value = client?.phone || "";
  els("client-address").value = client?.address || "";
  els("client-notes").value = client?.notes || "";

  els("client-form-title").textContent = client ? "Editar cliente" : "Novo cliente";
  els("btn-client-delete").classList.toggle("hidden", !client);

  els("modal-client").showModal();
}

async function saveClient(){
  const id = els("client-id").value || null;
  const payload = {
    name: els("client-name").value.trim(),
    phone: els("client-phone").value.trim(),
    address: els("client-address").value.trim(),
    notes: els("client-notes").value.trim(),
  };
  els("client-status").textContent = "Salvando...";
  try{
    if(id) await Data.clients.update(id, payload);
    else await Data.clients.create(payload);
    els("client-status").textContent = "Salvo.";
    els("modal-client").close();
    await refreshClients();
  }catch(err){
    els("client-status").textContent = `Erro: ${err.message || err}`;
  }
}

async function refreshClients(){
  const q = els("client-search").value.trim().toLowerCase();
  const list = await Data.clients.list();

  const filtered = !q ? list : list.filter(c =>
    (c.name||"").toLowerCase().includes(q) ||
    (c.phone||"").toLowerCase().includes(q)
  );

  const root = els("clients-list");
  root.innerHTML = "";

  if(filtered.length === 0){
    root.innerHTML = `<div class="card muted">Nenhum cliente encontrado.</div>`;
    return;
  }

  for(const c of filtered){
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
    el.querySelector("button").addEventListener("click", ()=> openClientModal(c));
    root.appendChild(el);
  }
}

function wireQuotes(){
  els("btn-add-quote").addEventListener("click", ()=> openQuoteModal());
  els("btn-quote-refresh").addEventListener("click", refreshQuotes);
  els("quote-search").addEventListener("input",f => refreshQuotes());
  els("quote-status-filter").addEventListener("change", refreshQuotes);

  els("btn-quote-save").addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveQuote();
  });

  els("btn-quote-delete").addEventListener("click", async ()=>{
    const id = els("quote-id").value;
    if(!id) return;
    if(!confirm("Excluir orçamento?")) return;
    await Data.quotes.remove(id);
    els("modal-quote").close();
    await refreshQuotes();
  });
}

async function openQuoteModal(quote=null){
  els("quote-status-msg").textContent = "";
  els("quote-id").value = quote?.id || "";

  await fillClientSelect("quote-client", quote?.client_id);

  els("quote-desc").value = quote?.desc || "";
  els("quote-total").value = quote ? fmtMoney(quote.total) : "";
  els("quote-status").value = quote?.status || "aberto";
  els("quote-deadline-days").value = quote?.deadline_days ?? "";

  els("quote-form-title").textContent = quote ? "Editar orçamento" : "Novo orçamento";
  els("btn-quote-delete").classList.toggle("hidden", !quote);

  els("modal-quote").showModal();
}

async function saveQuote(){
  const id = els("quote-id").value || null;
  const payload = {
    client_id: els("quote-client").value,
    desc: els("quote-desc").value.trim(),
    total: parseBRMoney(els("quote-total").value),
    status: els("quote-status").value,
    deadline_days: Number(els("quote-deadline-days").value || 0) || null,
  };

  els("quote-status-msg").textContent = "Salvando...";
  try{
    if(id) await Data.quotes.update(id, payload);
    else await Data.quotes.create(payload);
    els("quote-status-msg").textContent = "Salvo.";
    els("modal-quote").close();
    await refreshQuotes();
  }catch(err){
    els("quote-status-msg").textContent = `Erro: ${err.message || err}`;
  }
}

async function refreshQuotes(){
  const q = els("quote-search").value.trim().toLowerCase();
  const status = els("quote-status-filter").value;

  const [quotes, clients] = await Promise.all([Data.quotes.list(), Data.clients.list()]);
  const clientMap = new Map(clients.map(c => [c.id, c]));

  let filtered = quotes;
  if(status) filtered = filtered.filter(x => x.status === status);

  if(q){
    filtered = filtered.filter(x => {
      const c = clientMap.get(x.client_id);
      const hay = `${c?.name||""} ${x.desc||""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const root = els("quotes-list");
  root.innerHTML = "";

  if(filtered.length === 0){
    root.innerHTML = `<div class="card muted">Nenhum orçamento encontrado.</div>`;
    return;
  }

  for(const qu of filtered){
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
    el.querySelector("button").addEventListener("click", ()=> openQuoteModal(qu));
    root.appendChild(el);
  }
}

function wireWorkorders(){
  els("btn-add-wo").addEventListener("click", ()=> openWoModal());
  els("btn-wo-refresh").addEventListener("click", refreshWorkorders);
  els("wo-search").addEventListener("input", refreshWorkorders);
  els("wo-status-filter").addEventListener("change", refreshWorkorders);

  els("btn-wo-save").addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveWo();
  });

  els("btn-wo-delete").addEventListener("click", async ()=>{
    const id = els("wo-id").value;
    if(!id) return;
    if(!confirm("Excluir OS?")) return;
    await Data.workorders.remove(id);
    els("modal-wo").close();
    await refreshWorkorders();
  });
}

async function openWoModal(wo=null){
  els("wo-status-msg").textContent = "";
  els("wo-id").value = wo?.id || "";
  await fillClientSelect("wo-client", wo?.client_id);

  els("wo-desc").value = wo?.desc || "";
  els("wo-status").value = wo?.status || "producao";
  els("wo-due").value = wo?.due_date || "";

  els("wo-form-title").textContent = wo ? "Editar OS" : "Nova OS";
  els("btn-wo-delete").classList.toggle("hidden", !wo);

  els("modal-wo").showModal();
}

async function saveWo(){
  const id = els("wo-id").value || null;
  const payload = {
    client_id: els("wo-client").value,
    desc: els("wo-desc").value.trim(),
    status: els("wo-status").value,
    due_date: els("wo-due").value || null,
  };

  els("wo-status-msg").textContent = "Salvando...";
  try{
    if(id) await Data.workorders.update(id, payload);
    else await Data.workorders.create(payload);
    els("wo-status-msg").textContent = "Salvo.";
    els("modal-wo").close();
    await refreshWorkorders();
  }catch(err){
    els("wo-status-msg").textContent = `Erro: ${err.message || err}`;
  }
}

async function refreshWorkorders(){
  const q = els("wo-search").value.trim().toLowerCase();
  const status = els("wo-status-filter").value;

  const [items, clients] = await Promise.all([Data.workorders.list(), Data.clients.list()]);
  const clientMap = new Map(clients.map(c => [c.id, c]));

  let filtered = items;
  if(status) filtered = filtered.filter(x => x.status === status);

  if(q){
    filtered = filtered.filter(x => {
      const c = clientMap.get(x.client_id);
      const hay = `${c?.name||""} ${x.desc||""}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const root = els("wo-list");
  root.innerHTML = "";

  if(filtered.length === 0){
    root.innerHTML = `<div class="card muted">Nenhuma OS encontrada.</div>`;
    return;
  }

  for(const wo of filtered){
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
    el.querySelector("button").addEventListener("click", ()=> openWoModal(wo));
    root.appendChild(el);
  }
}

function wireFinance(){
  // Tabs
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tab = btn.dataset.tab;
      state.activeFinanceTab = tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      els(`tab-${tab}`).classList.remove("hidden");
    });
  });

  // Default months
  const m = monthISO(new Date());
  els("ar-month").value = m;
  els("ap-month").value = m;
  els("cash-month").value = m;
  els("rep-month").value = m;

  // Refresh buttons
  els("btn-ar-refresh").addEventListener("click", refreshFinance);
  els("btn-ap-refresh").addEventListener("click", refreshFinance);
  els("btn-cash-refresh").addEventListener("click", refreshFinance);
  els("btn-rep-refresh").addEventListener("click", refreshFinance);

  els("ar-search").addEventListener("input", refreshFinance);
  els("ap-search").addEventListener("input", refreshFinance);

  // Modal Tx
  els("btn-add-tx").addEventListener("click", ()=> openTxModal());
  els("btn-tx-save").addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveTx();
  });
  els("btn-tx-delete").addEventListener("click", async ()=>{
    const id = els("tx-id").value;
    if(!id) return;
    if(!confirm("Excluir lançamento?")) return;
    await Data.txs.remove(id);
    els("modal-tx").close();
    await refreshFinance();
    await refreshDashboard();
  });

  els("btn-rep-export").addEventListener("click", async ()=>{
    const m = els("rep-month").value;
    const rep = await Data.reports.monthSummary(m);
    els("rep-output").textContent = rep.whatsappText;
  });
}

function openTxModal(tx=null){
  els("tx-status-msg").textContent = "";
  els("tx-id").value = tx?.id || "";
  els("tx-type").value = tx?.type || "receber";
  els("tx-desc").value = tx?.desc || "";
  els("tx-amount").value = tx ? fmtMoney(tx.amount) : "";
  els("tx-due").value = tx?.due_date || todayISO();
  els("tx-category").value = tx?.category || "";
  els("tx-status").value = tx?.status || "aberto";

  els("tx-form-title").textContent = tx ? "Editar lançamento" : "Novo lançamento";
  els("btn-tx-delete").classList.toggle("hidden", !tx);

  els("modal-tx").showModal();
}

async function saveTx(){
  const id = els("tx-id").value || null;

  const payload = {
    type: els("tx-type").value,           // receber | pagar
    desc: els("tx-desc").value.trim(),
    amount: parseBRMoney(els("tx-amount").value),
    due_date: els("tx-due").value || null,
    category: els("tx-category").value || null,
    status: els("tx-status").value,       // aberto | parcial | quitado
  };

  els("tx-status-msg").textContent = "Salvando...";
  try{
    if(id) await Data.txs.update(id, payload);
    else await Data.txs.create(payload);
    els("tx-status-msg").textContent = "Salvo.";
    els("modal-tx").close();
    await refreshFinance();
    await refreshDashboard();
  }catch(err){
    els("tx-status-msg").textContent = `Erro: ${err.message || err}`;
  }
}

async function refreshFinance(){
  const [txs, clients] = await Promise.all([Data.txs.list(), Data.clients.list()]);
  const clientMap = new Map(clients.map(c => [c.id, c]));

  // A receber
  const arMonth = els("ar-month").value;
  const arQ = els("ar-search").value.trim().toLowerCase();
  const arList = txs.filter(t => t.type === "receber" && inMonth(t.due_date, arMonth));
  const arFiltered = !arQ ? arList : arList.filter(t => (t.desc||"").toLowerCase().includes(arQ));
  renderTxList("ar-list", arFiltered, (tx)=> openTxModal(tx));

  // A pagar
  const apMonth = els("ap-month").value;
  const apQ = els("ap-search").value.trim().toLowerCase();
  const apList = txs.filter(t => t.type === "pagar" && inMonth(t.due_date, apMonth));
  const apFiltered = !apQ ? apList : apList.filter(t =>
    `${t.desc||""} ${t.category||""}`.toLowerCase().includes(apQ)
  );
  renderTxList("ap-list", apFiltered, (tx)=> openTxModal(tx));

  // Caixa
  const cashMonth = els("cash-month").value;
  const cashTxs = txs.filter(t => inMonth(t.due_date, cashMonth) && t.status === "quitado");
  const totalIn = sum(cashTxs.filter(t=>t.type==="receber").map(t=>t.amount));
  const totalOut = sum(cashTxs.filter(t=>t.type==="pagar").map(t=>t.amount));
  els("cash-in").textContent = fmtMoney(totalIn);
  els("cash-out").textContent = fmtMoney(totalOut);
  els("cash-balance").textContent = fmtMoney(totalIn - totalOut);
  renderTxList("cash-list", cashTxs.sort(sortByDate), (tx)=> openTxModal(tx));

  // Relatórios
  const repMonth = els("rep-month").value;
  const rep = await Data.reports.monthSummary(repMonth);
  els("rep-output").textContent = rep.text;
}

function renderTxList(rootId, list, onOpen){
  const root = els(rootId);
  root.innerHTML = "";

  if(list.length === 0){
    root.innerHTML = `<div class="card muted">Sem itens neste período.</div>`;
    return;
  }

  for(const tx of list){
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

    el.querySelector("button").addEventListener("click", ()=> onOpen(tx));
    root.appendChild(el);
  }
}

async function refreshDashboard(){
  const m = monthISO(new Date());
  const txs = await Data.txs.list();

  const ar = txs.filter(t => t.type==="receber" && inMonth(t.due_date, m) && t.status!=="quitado");
  const ap = txs.filter(t => t.type==="pagar" && inMonth(t.due_date, m) && t.status!=="quitado");
  const cash = txs.filter(t => inMonth(t.due_date, m) && t.status==="quitado");

  const arSum = sum(ar.map(t=>t.amount));
  const apSum = sum(ap.map(t=>t.amount));
  const cashIn = sum(cash.filter(t=>t.type==="receber").map(t=>t.amount));
  const cashOut = sum(cash.filter(t=>t.type==="pagar").map(t=>t.amount));
  const cashBal = cashIn - cashOut;

  els("kpi-ar").textContent = fmtMoney(arSum);
  els("kpi-ap").textContent = fmtMoney(apSum);
  els("kpi-cash").textContent = fmtMoney(cashBal);
  els("kpi-ar-sub").textContent = `${ar.length} itens`;
  els("kpi-ap-sub").textContent = `${ap.length} itens`;
  els("kpi-cash-sub").textContent = `Mês ${m}`;

  // Pendências (top 6 por vencimento)
  const pending = [...ar, ...ap].sort(sortByDate).slice(0,6);
  const root = els("dash-pending");
  root.innerHTML = "";
  if(pending.length === 0){
    root.innerHTML = `<div class="card muted">Sem pendências no momento.</div>`;
    return;
  }

  for(const tx of pending){
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(tx.desc)}</div>
        <div class="item-sub">${escapeHtml(tx.type==="receber" ? "A receber" : "A pagar")} • ${escapeHtml(tx.due_date||"")}</div>
        <span class="badge">${escapeHtml(badgeForStatus(tx))}</span>
      </div>
      <div class="item-right">
        <div class="item-title">${fmtMoney(tx.amount)}</div>
      </div>
    `;
    root.appendChild(el);
  }
}

async function fillClientSelect(selectId, selectedId=null){
  const sel = els(selectId);
  const clients = await Data.clients.list();
  sel.innerHTML = `<option value="" disabled ${selectedId? "" : "selected"}>Selecione...</option>`;
  for(const c of clients){
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name || "Sem nome";
    if(selectedId && c.id === selectedId) opt.selected = true;
    sel.appendChild(opt);
  }
}

function refreshRoute(route){
  if(route === "dashboard") return refreshDashboard();
  if(route === "clients") return refreshClients();
  if(route === "quotes") return refreshQuotes();
  if(route === "workorders") return refreshWorkorders();
  if(route === "finance") return refreshFinance();
  if(route === "settings") return wireSettings();
}

function wireGlobal(){
  els("btn-sync").addEventListener("click", async ()=>{
    await Data.initFromSettings();
    await refreshRoute(state.route);
    if(state.route !== "dashboard") await refreshDashboard();
    alert("Atualizado.");
  });
}

function inMonth(dateStr, yyyyMm){
  if(!dateStr || !yyyyMm) return false;
  return dateStr.startsWith(yyyyMm);
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

(async function boot(){
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
  wireSettings();
  wireGlobal();

  show("view-login");
})();
