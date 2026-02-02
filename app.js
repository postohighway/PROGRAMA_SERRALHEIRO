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
      const msg = (err?.message || String(err));
      const hint = msg.includes("Supabase") ? " (Dica: abra Configurações e informe Supabase URL + Anon Key, ou use Modo Demonstração.)" : "";
      safeText("login-status", `Erro: ${msg}${hint}`);
      console.error("LOGIN ERROR:", err);
    }
  });

  els("btn-demo")?.addEventListener("click", async ()=>{
    try{
      // Demo deve funcionar mesmo sem Supabase
      state.mode = "mock";
      Data.setMode("mock");
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
    await Data.clients.remove(id);
    els("modal-client")?.close();
    await refreshClients();
  });
}

function openClientModal(client=null){
  safeText("client-status", "");
  if (els("client-id")) els("client-id").value = client?.id || "";
  if (els("client-name")) els("client-name").value = client?.name || "";
  if (els("client-phone")) els("client-phone").value = client?.phone || "";
  if (els("client-address")) els("client-address").value = client?.address || "";
  if (els("client-notes")) els("client-notes").value = client?.notes || "";

  safeText("client-form-title", client ? "Editar cliente" : "Novo cliente");
  els("btn-client-delete")?.classList.toggle("hidden", !client);

  els("modal-client")?.showModal();
}

async function saveClient(){
  const id = els("client-id")?.value || null;
  const payload = {
    name: (els("client-name")?.value || "").trim(),
    phone: (els("client-phone")?.value || "").trim(),
    address: (els("client-address")?.value || "").trim(),
    notes: (els("client-notes")?.value || "").trim(),
  };
  safeText("client-status", "Salvando...");
  try{
    if(id) await Data.clients.update(id, payload);
    else await Data.clients.create(payload);
    safeText("client-status", "Salvo.");
    els("modal-client")?.close();
    await refreshClients();
  }catch(err){
    safeText("client-status", `Erro: ${err?.message || err}`);
    console.error("SAVE CLIENT ERROR:", err);
  }
}

async function refreshClients(){
  const q = (els("client-search")?.value || "").trim().toLowerCase();
  const list = await Data.clients.list();
  const filtered = !q ? list : list.filter(c =>
    (c.name||"").toLowerCase().includes(q) ||
    (c.phone||"").toLowerCase().includes(q)
  );

  const root = els("clients-list");
  if(!root) return;
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
    el.querySelector("button")?.addEventListener("click", ()=> openClientModal(c));
    root.appendChild(el);
  }
}

function wireQuotes(){
  els("btn-add-quote")?.addEventListener("click", ()=> openQuoteModal());
  els("btn-quote-refresh")?.addEventListener("click", refreshQuotes);
  els("quote-search")?.addEventListener("input", ()=> refreshQuotes());
  els("quote-status-filter")?.addEventListener("change", refreshQuotes);

  els("btn-quote-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveQuote();
  });

  els("btn-quote-delete")?.addEventListener("click", async ()=>{
    const id = els("quote-id")?.value;
    if(!id) return;
    if(!confirm("Excluir orçamento?")) return;
    await Data.quotes.remove(id);
    els("modal-quote")?.close();
    await refreshQuotes();
  });
}

async function openQuoteModal(quote=null){
  safeText("quote-status-msg", "");
  if (els("quote-id")) els("quote-id").value = quote?.id || "";
  await fillClientSelect("quote-client", quote?.client_id);

  if (els("quote-desc")) els("quote-desc").value = quote?.desc || "";
  if (els("quote-total")) els("quote-total").value = quote ? fmtMoney(quote.total) : "";
  if (els("quote-status")) els("quote-status").value = quote?.status || "aberto";
  if (els("quote-deadline-days")) els("quote-deadline-days").value = quote?.deadline_days ?? "";

  safeText("quote-form-title", quote ? "Editar orçamento" : "Novo orçamento");
  els("btn-quote-delete")?.classList.toggle("hidden", !quote);

  els("modal-quote")?.showModal();
}

async function saveQuote(){
  const id = els("quote-id")?.value || null;
  const payload = {
    client_id: els("quote-client")?.value,
    desc: (els("quote-desc")?.value || "").trim(),
    total: parseBRMoney(els("quote-total")?.value || ""),
    status: els("quote-status")?.value || "aberto",
    deadline_days: Number(els("quote-deadline-days")?.value || 0) || null,
  };

  safeText("quote-status-msg", "Salvando...");
  try{
    if(id) await Data.quotes.update(id, payload);
    else await Data.quotes.create(payload);
    safeText("quote-status-msg", "Salvo.");
    els("modal-quote")?.close();
    await refreshQuotes();
  }catch(err){
    safeText("quote-status-msg", `Erro: ${err?.message || err}`);
    console.error("SAVE QUOTE ERROR:", err);
  }
}

async function refreshQuotes(){
  const q = (els("quote-search")?.value || "").trim().toLowerCase();
  const status = els("quote-status-filter")?.value;

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
  if(!root) return;
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
    el.querySelector("button")?.addEventListener("click", ()=> openQuoteModal(qu));
    root.appendChild(el);
  }
}

function wireWorkorders(){
  els("btn-add-wo")?.addEventListener("click", ()=> openWoModal());
  els("btn-wo-refresh")?.addEventListener("click", refreshWorkorders);
  els("wo-search")?.addEventListener("input", refreshWorkorders);
  els("wo-status-filter")?.addEventListener("change", refreshWorkorders);

  els("btn-wo-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveWo();
  });

  els("btn-wo-delete")?.addEventListener("click", async ()=>{
    const id = els("wo-id")?.value;
    if(!id) return;
    if(!confirm("Excluir ticket?")) return;
    await Data.workorders.remove(id);
    els("modal-wo")?.close();
    await refreshWorkorders();
  });
}

async function openWoModal(wo=null){
  safeText("wo-status-msg", "");

  // Se vier da lista, geralmente vem sem histórico → buscamos completo (premium)
  let woObj = wo;
  try{
    if (wo?.id && (!Array.isArray(wo.history) || wo.history.length === 0)){
      const full = await Data.workorders.get(wo.id);
      if (full) woObj = full;
    }
  }catch(err){
    console.warn("Falha ao carregar ticket completo:", err);
  }

  if (els("wo-id")) els("wo-id").value = woObj?.id || "";
  await fillClientSelect("wo-client", woObj?.client_id);

  if (els("wo-desc")) els("wo-desc").value = woObj?.desc || "";
  if (els("wo-status")) els("wo-status").value = woObj?.status || "aberto";
  if (els("wo-due")) els("wo-due").value = woObj?.due_date || "";

  safeText("wo-form-title", woObj ? "Editar Ticket" : "Novo Ticket");
  els("btn-wo-delete")?.classList.toggle("hidden", !woObj?.id);

  // Histórico do ticket (premium)
  const histObj = woObj ? woObj : { id: null, history: [] };
  wireWoHistory(histObj);

  els("modal-wo")?.showModal();
}

function fmtDateTime(dt){
  if(!dt) return "";
  try{
    const d = new Date(dt);
    if(isNaN(d.getTime())) return String(dt);
    return d.toLocaleString("pt-BR");
  }catch{
    return String(dt);
  }
}

async function saveWo(){
  const id = els("wo-id")?.value || null;
  const payload = {
    client_id: els("wo-client")?.value,
    desc: (els("wo-desc")?.value || "").trim(),
    status: els("wo-status")?.value || "aberto",
    due_date: els("wo-due")?.value || null,
  };

  safeText("wo-status-msg", "Salvando...");
  try{
    if(id) await Data.workorders.update(id, payload);
    else await Data.workorders.create(payload);
    safeText("wo-status-msg", "Salvo.");
    els("modal-wo")?.close();
    await refreshWorkorders();
  }catch(err){
    safeText("wo-status-msg", `Erro: ${err?.message || err}`);
    console.error("SAVE WO ERROR:", err);
  }
}

async function refreshWorkorders(){
  const q = (els("wo-search")?.value || "").trim().toLowerCase();
  const status = els("wo-status-filter")?.value;

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
  if(!root) return;
  root.innerHTML = "";

  if(filtered.length === 0){
    root.innerHTML = `<div class="card muted">Nenhum ticket encontrado.</div>`;
    return;
  }

  for(const wo of filtered){
    const c = clientMap.get(wo.client_id);
    const due = wo.due_date ? `Entrega: ${wo.due_date}` : "";
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div class="item-title">${escapeHtml(c?.name || "Cliente")}</div>
        <div class="item-sub">${escapeHtml(wo.desc || "")}</div>
        <span class="badge">${escapeHtml(labelStatus(wo.status))}${due ? ` • ${escapeHtml(due)}` : ""}</span>
      </div>
      <div class="item-right">
        <button class="btn small-btn">Abrir</button>
      </div>
    `;
    el.querySelector("button")?.addEventListener("click", ()=> openWoModal(wo));
    root.appendChild(el);
  }
}


function labelStatus(s){
  const v = String(s || "").toLowerCase();
  if(v === "aberto") return "Aberto";
  if(v === "recebido") return "Recebido";
  if(v === "em_analise") return "Em análise";
  if(v === "concluido") return "Concluído";
  return s || "";
}

function fmtHistTime(iso){
  try{
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  }catch(_){
    return iso;
  }
}


async function renderWoHistory(wo, opts = {}) {
  const el = document.getElementById("wo-history");
  if (!el) return;

  const filter = opts.filter ?? document.getElementById("wo-history-filter")?.value ?? "all";
  const qRaw = opts.search ?? document.getElementById("wo-history-search")?.value ?? "";
  const q = String(qRaw).trim().toLowerCase();

  const list = Array.isArray(wo.history) ? wo.history.slice() : [];
  // já vem ordenado no get(), mas garantimos
  list.sort((a, b) => new Date(a.at || a.created_at || 0) - new Date(b.at || b.created_at || 0));

  const norm = (ev) => {
    const action = String(ev.action || "");
    const at = ev.at || ev.created_at || ev.createdAt || null;

    if (action === "create") {
      return { at, action, kind: "ok", label: "Criado", msg: `Ticket criado • Status: ${labelStatus(ev.to_status || ev.toStatus || wo.status)}` };
    }

    if (action === "status_change") {
      return { at, action, kind: "warn", label: "Status", msg: `Status: ${labelStatus(ev.from_status)} → ${labelStatus(ev.to_status)}` };
    }

    if (action === "note") {
      return { at, action, kind: "info", label: "Nota", msg: String(ev.note || "") };
    }

    // fallback
    return { at, action, kind: "muted", label: action || "Evento", msg: String(ev.note || ev.message || "") };
  };

  const filtered = list
    .map(norm)
    .filter((ev) => {
      const isManual = ev.action === "note";
      if (filter === "manual" && !isManual) return false;
      if (filter === "system" && isManual) return false;
      if (!q) return true;
      const hay = `${ev.label} ${ev.msg}`.toLowerCase();
      return hay.includes(q);
    });

  if (!filtered.length) {
    el.innerHTML = `<div class="muted small">Sem histórico ainda.</div>`;
    return;
  }

  el.innerHTML = filtered
    .map((ev) => {
      const at = fmtHistTime(ev.at);
      const msg = escapeHtml(String(ev.msg || ""));
      return `
        <div class="tl-item">
          <div class="tl-dot ${ev.kind}"></div>
          <div class="tl-card">
            <div class="tl-head">
              <div class="tl-badge ${ev.kind}">${escapeHtml(ev.label)}</div>
              <div class="tl-time small muted">${escapeHtml(at)}</div>
            </div>
            <div class="tl-msg">${msg}</div>
          </div>
        </div>
      `;
    })
    .join("");
}

function wireWoHistory(wo) {
  const sel = document.getElementById("wo-history-filter");
  const search = document.getElementById("wo-history-search");
  const btnRefresh = document.getElementById("btn-wo-history-refresh");
  const btnAdd = document.getElementById("btn-wo-history-add");
  const note = document.getElementById("wo-history-note");

  const rerender = () => renderWoHistory(wo);

  // remove handlers antigos (evitar duplicação ao abrir modal várias vezes)
  const cloneAndReplace = (node) => {
    if (!node) return null;
    const clone = node.cloneNode(true);
    node.parentNode.replaceChild(clone, node);
    return clone;
  };

  const sel2 = cloneAndReplace(sel);
  const search2 = cloneAndReplace(search);
  const btnRefresh2 = cloneAndReplace(btnRefresh);
  const btnAdd2 = cloneAndReplace(btnAdd);
  const note2 = note; // textarea não precisa clonar

  sel2?.addEventListener("change", rerender);
  search2?.addEventListener("input", rerender);

  btnRefresh2?.addEventListener("click", async () => {
    if (!wo.id) return;
    try{
      const fresh = await Data.workorders.get(wo.id);
      if (fresh) Object.assign(wo, fresh);
      await renderWoHistory(wo);
      toast("Histórico atualizado.");
    }catch(e){
      console.error(e);
      toast("Falha ao atualizar histórico.");
    }
  });

  btnAdd2?.addEventListener("click", async () => {
    if (!wo.id) return toast("Salve o ticket primeiro para liberar o histórico.");
    const text = String(note2?.value || "").trim();
    if (!text) return toast("Escreva uma nota primeiro.");
    btnAdd2.disabled = true;
    try {
      const updated = await Data.workorders.addNote(wo.id, text);
      if (updated) Object.assign(wo, updated);
      if (note2) note2.value = "";
      await renderWoHistory(wo);
      toast("Nota adicionada no histórico.");
    } catch (e) {
      console.error(e);
      toast("Erro ao adicionar nota.");
    } finally {
      btnAdd2.disabled = false;
    }
  });

  // primeira renderização
  renderWoHistory(wo);
}

function wireFinance(){
  document.querySelectorAll(".tab").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const tab = btn.dataset.tab;
      if(!tab) return;
      state.activeFinanceTab = tab;
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
      els(`tab-${tab}`)?.classList.remove("hidden");
    });
  });

  const m = monthISO(new Date());
  if (els("ar-month")) els("ar-month").value = m;
  if (els("ap-month")) els("ap-month").value = m;
  if (els("cash-month")) els("cash-month").value = m;
  if (els("rep-month")) els("rep-month").value = m;

  els("btn-ar-refresh")?.addEventListener("click", refreshFinance);
  els("btn-ap-refresh")?.addEventListener("click", refreshFinance);
  els("btn-cash-refresh")?.addEventListener("click", refreshFinance);
  els("btn-rep-refresh")?.addEventListener("click", refreshFinance);

  els("ar-search")?.addEventListener("input", refreshFinance);
  els("ap-search")?.addEventListener("input", refreshFinance);

  els("btn-add-tx")?.addEventListener("click", ()=> openTxModal());

  els("btn-tx-save")?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await saveTx();
  });

  els("btn-tx-delete")?.addEventListener("click", async ()=>{
    const id = els("tx-id")?.value;
    if(!id) return;
    if(!confirm("Excluir lançamento?")) return;
    await Data.txs.remove(id);
    els("modal-tx")?.close();
    await refreshFinance();
    await refreshDashboard();
  });

  els("btn-rep-export")?.addEventListener("click", async ()=>{
    const mm = els("rep-month")?.value;
    const rep = await Data.reports.monthSummary(mm);
    safeText("rep-output", rep.whatsappText);
  });
}

function openTxModal(tx=null){
  safeText("tx-status-msg", "");
  if (els("tx-id")) els("tx-id").value = tx?.id || "";
  if (els("tx-type")) els("tx-type").value = tx?.type || "receber";
  if (els("tx-desc")) els("tx-desc").value = tx?.desc || "";
  if (els("tx-amount")) els("tx-amount").value = tx ? fmtMoney(tx.amount) : "";
  if (els("tx-due")) els("tx-due").value = tx?.due_date || todayISO();
  if (els("tx-category")) els("tx-category").value = tx?.category || "";
  if (els("tx-status")) els("tx-status").value = tx?.status || "aberto";

  safeText("tx-form-title", tx ? "Editar lançamento" : "Novo lançamento");
  els("btn-tx-delete")?.classList.toggle("hidden", !tx);

  els("modal-tx")?.showModal();
}

async function saveTx(){
  const id = els("tx-id")?.value || null;
  const payload = {
    type: els("tx-type")?.value,           // receber | pagar
    desc: (els("tx-desc")?.value || "").trim(),
    amount: parseBRMoney(els("tx-amount")?.value || ""),
    due_date: els("tx-due")?.value || null,
    category: els("tx-category")?.value || null,
    status: els("tx-status")?.value,       // aberto | parcial | quitado
  };

  safeText("tx-status-msg", "Salvando...");
  try{
    if(id) await Data.txs.update(id, payload);
    else await Data.txs.create(payload);
    safeText("tx-status-msg", "Salvo.");
    els("modal-tx")?.close();
    await refreshFinance();
    await refreshDashboard();
  }catch(err){
    safeText("tx-status-msg", `Erro: ${err?.message || err}`);
    console.error("SAVE TX ERROR:", err);
  }
}

async function refreshFinance(){
  const txs = await Data.txs.list();

  const arMonth = els("ar-month")?.value;
  const arQ = (els("ar-search")?.value || "").trim().toLowerCase();
  const arList = txs.filter(t => t.type === "receber" && inMonth(t.due_date, arMonth));
  const arFiltered = !arQ ? arList : arList.filter(t => (t.desc||"").toLowerCase().includes(arQ));
  renderTxList("ar-list", arFiltered, (tx)=> openTxModal(tx));

  const apMonth = els("ap-month")?.value;
  const apQ = (els("ap-search")?.value || "").trim().toLowerCase();
  const apList = txs.filter(t => t.type === "pagar" && inMonth(t.due_date, apMonth));
  const apFiltered = !apQ ? apList : apList.filter(t =>
    `${t.desc||""} ${t.category||""}`.toLowerCase().includes(apQ)
  );
  renderTxList("ap-list", apFiltered, (tx)=> openTxModal(tx));

  const cashMonth = els("cash-month")?.value;
  const cashTxs = txs.filter(t => inMonth(t.due_date, cashMonth) && t.status === "quitado");
  const totalIn = sum(cashTxs.filter(t=>t.type==="receber").map(t=>t.amount));
  const totalOut = sum(cashTxs.filter(t=>t.type==="pagar").map(t=>t.amount));
  safeText("cash-in", fmtMoney(totalIn));
  safeText("cash-out", fmtMoney(totalOut));
  safeText("cash-balance", fmtMoney(totalIn - totalOut));
  renderTxList("cash-list", cashTxs.sort(sortByDate), (tx)=> openTxModal(tx));

  const repMonth = els("rep-month")?.value;
  const rep = await Data.reports.monthSummary(repMonth);
  safeText("rep-output", rep.text);
}

function renderTxList(rootId, list, onOpen){
  const root = els(rootId);
  if (!root) return;
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

    el.querySelector("button")?.addEventListener("click", ()=> onOpen(tx));
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

  safeText("kpi-ar", fmtMoney(arSum));
  safeText("kpi-ap", fmtMoney(apSum));
  safeText("kpi-cash", fmtMoney(cashBal));
  safeText("kpi-ar-sub", `${ar.length} itens`);
  safeText("kpi-ap-sub", `${ap.length} itens`);
  safeText("kpi-cash-sub", `Mês ${m}`);

  const pending = [...ar, ...ap].sort(sortByDate).slice(0,6);
  const root = els("dash-pending");
  if(!root) return;
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
  if(!sel) return;
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
