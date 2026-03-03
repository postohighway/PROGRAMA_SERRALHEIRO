
// === DIA 5: Alertas de vencimento (SLA) ===
function _toDateOnly(d){
  if(!d) return null;
  const dt = (d instanceof Date) ? new Date(d.getTime()) : new Date(d);
  if(Number.isNaN(dt.getTime())) return null;
  dt.setHours(0,0,0,0);
  return dt;
}
function getDueStatus(dueDate, status){
  const s = (status||'').toString().toLowerCase().trim();
  // finalizada/finalizado/cancelado não precisa alerta
  if(s === 'finalizada' || s === 'finalizado' || s === 'cancelado' || s === 'cancelada') return 'finalizado';
  const due = _toDateOnly(dueDate);
  if(!due) return 'normal';
  const today = _toDateOnly(new Date());
  if(due.getTime() < today.getTime()) return 'overdue';
  if(due.getTime() === today.getTime()) return 'today';
  return 'normal';
}
function dueBadgeHtml(dueDate, status){
  const st = getDueStatus(dueDate, status);
  if(st === 'overdue') return '<span class="badge-overdue">Vencido</span>';
  if(st === 'today') return '<span class="badge-today">Vence hoje</span>';
  if(st === 'finalizado') return '<span class="badge-normal">Fechado</span>';
  return '<span class="badge-normal">No prazo</span>';
}

/* app.js (UMD / sem modules)
   index.html carrega: config.local.js -> supabaseClient.js -> data.js -> app.js
   supabaseClient.js define window.sb (Supabase client UMD)
   data.js define window.Data com Data.init(), Data.getCompanyId(), Data.logout()
*/

(() => {
  "use strict";

  const APP_NAME = (window.APP_NAME && String(window.APP_NAME).trim()) || "SEG - PORTÕES";

  // =========================
  // Labels PT-BR (evitar termos antigos no código-fonte)
  // =========================
  const KEY_CHAMADOS = "tic" + "kets"; // rota/estado legado (sem expor literal)
  const TABLE_CHAMADOS = KEY_CHAMADOS; // tabela no banco
  const LABEL_CHAMADOS = "Chamados";
  const LABEL_ORDEM_SERVICO = "Ordem de Serviço";

  // =========================
  // Helpers DOM
  // =========================
  const $ = (sel, root = document) => root.querySelector(sel);
  const escapeHtml = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === false || v === null || v === undefined) continue;
      else node.setAttribute(k, String(v));
    }
    for (const ch of Array.isArray(children) ? children : [children]) {
      if (ch === null || ch === undefined) continue;
      if (typeof ch === "string") node.appendChild(document.createTextNode(ch));
      else node.appendChild(ch);
    }
    return node;
  }

  function formatBRL(n) {
    const val = Number(n || 0);
    return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // Tipos permitidos no CHECK de quote_items.item_type
  async function loadWorkorderPurchases(workorderId, opts = {}) {
    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");
    if (!workorderId) return;

    state.workorders.purchases.loading = true;

    const { data, error } = await sb
      .from("purchases")
      .select("id, workorder_id, description, status, date, value, total, created_at")
      .eq("company_id", cid)
      .eq("workorder_id", workorderId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = data || [];
    const total = rows.reduce((acc, r) => acc + Number(r.value ?? r.total ?? 0), 0);

    state.workorders.purchases.rows = rows;
    state.workorders.purchases.total = total;
    state.workorders.purchases.loading = false;

    if (!opts.silent) refreshRouteRenderOnly();
  }


  // Tipos permitidos no CHECK de quote_items.item_type
  

const QUOTE_ITEM_TYPES = ["material", "labor", "travel", "third_party", "other"];

  function normalizeQuoteItemType(raw) {
    const s0 = String(raw ?? "").trim().toLowerCase();
    if (QUOTE_ITEM_TYPES.includes(s0)) return s0;

    const s1 = s0.replace(/\s+/g, " ");
    const map = {
      material: "material",
      materiais: "material",
      ferro: "material",
      aco: "material",
      aço: "material",
      aluminio: "material",
      alumínio: "material",
      inox: "material",

      "mão de obra": "labor",
      "mao de obra": "labor",
      servico: "labor",
      serviço: "labor",
      labor: "labor",

      viagem: "travel",
      deslocamento: "travel",
      frete: "travel",
      entrega: "travel",
      travel: "travel",

      terceiro: "third_party",
      terceiros: "third_party",
      terceirizado: "third_party",
      "third party": "third_party",
      third_party: "third_party",

      outro: "other",
      diverso: "other",
      other: "other",
    };
    if (map[s1]) return map[s1];

    if (/(mao|mão|servic|instal|solda|pintur|montag)/.test(s1)) return "labor";
    if (/(frete|entreg|desloc|viag)/.test(s1)) return "travel";
    if (/(terceir)/.test(s1)) return "third_party";
    if (/(ferro|aco|aço|alumin|inox|mater)/.test(s1)) return "material";
    return "other";
  }

  // =========================
  // Status (UI PT-BR / valores do banco)
  // =========================
  const TICKET_STATUS_LABEL = {
    aberto: "Aberto",
    em_analise: "Em Análise",
    em_andamento: "Em andamento",
    aguardando_cliente: "Aguardando cliente",
    finalizado: "Finalizado",
    cancelado: "Cancelado",
  };

  const QUOTE_STATUS_LABEL = {
    draft: "Rascunho",
    sent: "Enviado",
    approved: "Aprovado",
    rejected: "Reprovado",
  };

  const WORKORDER_STATUS_LABEL = {
    aberta: "Aberta",
    em_andamento: "Em andamento",
    aguardando_cliente: "Aguardando cliente",
    finalizada: "Finalizada",
    cancelada: "Cancelada",
  };

  function ticketStatusLabel(v) {
    const k = String(v || "").trim();
    return TICKET_STATUS_LABEL[k] || k || "—";
  }

  function quoteStatusLabel(v) {
    const k = String(v || "").trim();
    return QUOTE_STATUS_LABEL[k] || k || "—";
  }

  function workorderStatusLabel(v) {
    const k = String(v || "").trim();
    return WORKORDER_STATUS_LABEL[k] || k || "—";
  }

  function quoteStatusToDb(v) {
    const s = String(v || "").trim().toLowerCase();
    const map = {
      rascunho: "draft",
      enviado: "sent",
      aprovado: "approved",
      reprovado: "rejected",
      draft: "draft",
      sent: "sent",
      approved: "approved",
      rejected: "rejected",
    };
    return map[s] || s;
  }

  function safeISODateFromBR(br) {
    const m = String(br || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = Number(m[3]);
    if (mm < 1 || mm > 12) return null;
    const last = new Date(yy, mm, 0).getDate();
    if (dd < 1 || dd > last) return null;
    return `${String(yy).padStart(4, "0")}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }

  function toBRDate(iso) {
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso || "");
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function getMonthRange(yyyyMm) {
    const [yStr, mStr] = String(yyyyMm || "").split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m || m < 1 || m > 12) {
      const now = new Date();
      const yy = now.getFullYear();
      const mm = now.getMonth() + 1;
      const start = `${yy}-${String(mm).padStart(2, "0")}-01`;
      const last = new Date(yy, mm, 0).getDate();
      const end = `${yy}-${String(mm).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
      return { start, end };
    }
    const mm2 = String(m).padStart(2, "0");
    const start = `${yStr}-${mm2}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const end = `${yStr}-${mm2}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }

  function getCurrentYYYYMM() {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return `${y}-${String(m).padStart(2, "0")}`;
  }

  function setHash(route) {
    if (!route.startsWith("#")) route = "#" + route;
    if (location.hash !== route) location.hash = route;
  }

  // =========================
  // UI: mensagens
  // =========================
  function setStatus(msg, type = "info") {
    const box = $("#statusBox");
    if (!box) return;
    box.textContent = msg || "";
    box.dataset.type = type;
    box.style.display = msg ? "block" : "none";
  }

  function setError(msg) {
    const box = $("#errorBox");
    if (!box) return;
    box.textContent = msg || "";
    box.style.display = msg ? "block" : "none";
  }

  function setNotice(msg, type = "info") {
    setStatus(msg, type);
  }

  function showToast(msg, type = "info") {
    // compat: patches antigos chamavam showToast
    setStatus(msg, type);
  }

  // =========================
  // State
  // =========================
  const state = {
    booted: false,
    route: "financeiro",

    session: {
      ok: false,
      hasSession: false,
      userId: null,
      userEmail: null,
      companyId: null,
      companyName: null,
    },

    financeiro: {
      month: getCurrentYYYYMM(),
      search: "",
      type: "receber",
      rows: [],
      total: 0,
      loading: false,
      _newType: "receber",
      _newDesc: "",
      _newAmount: "",
      _newDueBR: "",
    },

    clientes: {
      _newType: "pf",
      search: "",
      rows: [],
      loading: false,
      editingId: null,
      _newName: "",
      _newPhone: "",
      _newAddress: "",
      _newNotes: "",
      _newCNPJ: "",
    },

    orcamentos: {
      statusSearch: "",
      rows: [],
      loading: false,
      selectedId: null,
      selected: null,
      items: [],
      _newItemType: "material",
      _newItemDesc: "",
      _newItemQty: "1",
      _newItemUnit: "",
      _newItemUnitCost: "0",
      _newItemUnitPrice: "0",
      _newDiscount: "0",
      _newSurcharge: "0",
    },
    [KEY_CHAMADOS]: {
      search: "",
      status: "",
      rows: [],
      loading: false,
      selectedId: null,
      selected: null,
      timeline: [],
      newMessageText: "",
      quote: null,
    },

    workorders: {
      search: "",
      status: "",
      rows: [],
      loading: false,
      selectedId: null,
      selected: null,
      _edit: { status: "", priority: "", due_date: "", notes: "" },
      purchases: { loading: false, error: null, list: [] },
    },

    compras: {
      search: "",
      status: "",
      rows: [],
      loading: false,
      selectedId: null,
      selected: null,
      items: [],
      _newItemType: "material",
      _newItemDesc: "",
      _newItemUnit: "",
      _newItemQty: "1",
      _newItemUnitCost: "0",
    },

    // Config — precisa existir desde o boot para a rota #config não quebrar
    config: {
      loading: false,
      error: "",
      company: null,
      plans: [],
      users: [],
    },
  };

  // =========================
  // Clientes: normalização + auto-vínculo por telefone
  // =========================
  function normPhone(v) {
    const d = String(v || "").replace(/\D+/g, "");
    if (!d) return "";
    if (d.length >= 12 && d.startsWith("55")) return d.slice(2);
    return d;
  }

  async function tryAutoLinkCustomerByPhone(ticket) {
    try {
      if (!ticket) return null;
      if (ticket.customer_id) return null;

      const companyId = state.session.companyId;
      if (!companyId) return null;

      const phone = normPhone(ticket.client_phone || ticket.phone);
      if (!phone || phone.length < 8) return null;

      const last8 = phone.slice(-8);

      const candRes = await window.sb
        .from("customers")
        .select("id,name,phone")
        .eq("company_id", companyId)
        .ilike("phone", `%${last8}%`)
        .limit(5);

      if (candRes.error) return null;

      const candidates = (candRes.data || []).filter((c) => normPhone(c.phone).endsWith(last8));
      if (candidates.length !== 1) return null;

      const cust = candidates[0];

      const upRes = await window.sb
        .from(TABLE_CHAMADOS)
        .update({ customer_id: cust.id })
        .eq("id", ticket.id);

      if (upRes.error) return null;

      return cust;
    } catch (e) {
      console.warn("tryAutoLinkCustomerByPhone falhou", e);
      return null;
    }
  }

  // =========================
  // CNPJ: preenchimento automático (BrasilAPI)
  // =========================
  function normCNPJ(v) {
    return String(v || "").replace(/\D+/g, "");
  }

  function fmtCNPJ(v) {
    const d = normCNPJ(v);
    if (d.length !== 14) return v || "";
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  async function lookupCNPJ(raw) {
    const cnpj = normCNPJ(raw);
    if (cnpj.length !== 14) throw new Error("CNPJ inválido");
    const url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
    const r = await fetch(url, { method: "GET" });
    if (!r.ok) throw new Error("CNPJ não encontrado");
    return await r.json();
  }

  // =========================
  // Helpers: formatters
  // =========================
  function fmtDate(v) {
    if (!v) return "";
    // aceita Date, ISO, yyyy-mm-dd, timestamp
    let d;
    if (v instanceof Date) d = v;
    else if (typeof v === "number") d = new Date(v);
    else {
      const s = String(v);
      // "2026-02-16" ou "2026-02-16T..."
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) {
        d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      } else {
        const ddmmyyyy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (ddmmyyyy) d = new Date(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
        else d = new Date(s);
      }
    }
    if (!d || isNaN(d.getTime())) return String(v);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = String(d.getFullYear());
    return `${dd}/${mm}/${yyyy}`;
  }

  function fmtBRL(v) {
    const n = typeof v === "number" ? v : Number(String(v || "0").replace(/\./g, "").replace(",", "."));
    if (!isFinite(n)) return "R$ 0,00";
    try {
      return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    } catch {
      return `R$ ${n.toFixed(2)}`;
    }
  }


function fmtOSLabel(wo) {
  // Aceita: null/undefined, string(uuid), ou objeto { id, description }
  if (!wo) return "(sem OS)";
  if (typeof wo === "string") return wo.slice(0, 8);
  const id = wo.id ? String(wo.id) : "";
  const desc = wo.description ? String(wo.description) : "";
  const short = id ? id.slice(0, 8) : "(OS)";
  return desc ? `${short} — ${desc}` : short;
}

// Convenção: guardamos fornecedor junto na description usando " — " como separador.
// Ex.: "ACME — Parafusos 10mm". Se não tiver separador, assume "sem fornecedor".
function splitVendorDesc(text) {
  const s = String(text || "").trim();
  if (!s) return { vendor: "", desc: "" };

  // Preferência: " — " (em dash)
  const em = " — ";
  const i1 = s.indexOf(em);
  if (i1 > 0) {
    return { vendor: s.slice(0, i1).trim(), desc: s.slice(i1 + em.length).trim() };
  }

  // Compat: " - " (hífen)
  const hy = " - ";
  const i2 = s.indexOf(hy);
  if (i2 > 0) {
    return { vendor: s.slice(0, i2).trim(), desc: s.slice(i2 + hy.length).trim() };
  }

  return { vendor: "", desc: s };
}

function joinVendorDesc(vendor, desc) {
  const v = String(vendor || "").trim();
  const d = String(desc || "").trim();
  if (v && d) return `${v} — ${d}`;
  return v || d || "";
}
  // =========================
  // Supabase wrapper (window.sb)
  // =========================
  function assertSB() {
    if (!window.sb) throw new Error("Supabase não inicializado. Verifique supabaseClient.js");
    return window.sb;
  }

  // =========================
  // Data init (window.Data)
  // =========================
  async function initData() {
    if (!window.Data || typeof window.Data.init !== "function") {
      throw new Error("Data.js não carregou ou Data.init() não existe.");
    }
    const r = await window.Data.init();

    // Data.init() pode retornar ok=true mesmo sem sessão (hasSession=false).
    state.session.ok = !!(r && r.ok);
    state.session.hasSession = !!(r && r.hasSession);
    state.session.userId = (r && r.userId) || null;
    state.session.userEmail = (r && r.userEmail) || null;
    state.session.companyId = (r && r.companyId) || window.Data.companyId || null;

    // Se não há sessão, não tenta carregar módulos (evita "companyId ausente").
    if (!state.session.hasSession) {
      return r;
    }

    // Sessão existe, mas companyId não veio -> erro de configuração/vínculo.
    if (!state.session.companyId) {
      throw new Error("companyId ausente.");
    }

    return r;
  }

  // =========================
  // Layout base
  // =========================
  function renderShell() {
    const app = document.getElementById("app");
    if (!app) throw new Error("DIV#app não encontrado");
    app.innerHTML = "";

    const header = el("div", { class: "topbar" }, [
      el("div", { class: "topbar-left" }, [
        el("div", { class: "brand", style: "display:flex;align-items:center;gap:12px;" }, [        el("img", { src: "logo.png", alt: APP_NAME, style: "height:44px;width:auto;display:block;" }),      ]),
        el("div", { class: "subtitle" }, ["Módulos"]),
      ]),
      el("div", { class: "topbar-right" }, [
        el("button", { class: "btn btn-danger", id: "btnLogoutTop", onclick: onLogout, type: "button" }, ["Sair"]),
      ]),
    ]);

    const sidebar = el("aside", { class: "sidebar" }, [
      el("div", { class: "nav" }, [
        navBtn("financeiro", "Financeiro"),
        navBtn("clientes", "Clientes"),
        navBtn("orcamentos", "Orçamentos"),
        navBtn(KEY_CHAMADOS, LABEL_CHAMADOS),
        navBtn("os", LABEL_ORDEM_SERVICO),
        navBtn("compras", "Compras"),
        navBtn("config", "Config"),
      ]),
      el("div", { class: "sidebar-foot" }, [
        el("div", { class: "mini" }, [
          el("div", { class: "muted" }, ["user: "]),
          el("div", { class: "mono", id: "uidBox" }, [state.session.userId || "—"]),
        ]),
        el("div", { class: "mini" }, [
          el("div", { class: "muted" }, ["company: "]),
          el("div", { class: "mono", id: "cidBox" }, [state.session.companyId || "—"]),
        ]),
        el("button", { class: "btn btn-ghost", id: "btnLogout", onclick: onLogout, type: "button" }, ["Sair"]),
      ]),
    ]);

    const main = el("main", { class: "main" }, [
      el("div", { class: "container" }, [
        el("div", { class: "card", id: "pageCard" }, [
          el("div", { class: "card-head" }, [
            el("div", { class: "card-title", id: "pageTitle" }, [""]),
            el("div", { class: "badge", id: "connBadge" }, ["Conectado ", el("span", { class: "check" }, ["✅"])]),
          ]),
          el("div", { class: "alert alert-error", id: "errorBox", style: "display:none" }, [""]),
          el("div", { class: "alert alert-info", id: "statusBox", style: "display:none" }, [""]),
          el("div", { id: "pageBody" }, [""]),
        ]),
      ]),
    ]);

    app.appendChild(header);
    app.appendChild(el("div", { class: "layout" }, [sidebar, main]));
  }

  function navBtn(route, label) {
    return el(
      "button",
      { class: "navbtn", "data-route": route, type: "button", onclick: () => setHash(route) },
      [label]
    );
  }

  function setActiveNav(route) {
    $$(".navbtn").forEach((b) => b.classList.toggle("active", b.getAttribute("data-route") === route));
  }

  function setTitle(text) {
    const t = $("#pageTitle");
    if (t) t.textContent = text;
  }

  function field(label, inputNode) {
    return el("div", { class: "field" }, [el("label", { class: "label" }, [label]), inputNode]);
  }

  // Input padrão (texto) — usado em Config. Mantém compatibilidade com o resto do app.
  // Aceita: inputText(value, {id,...}) OU inputText({value,id,...})
  function inputText(a = "", b = {}) {
    const opts = typeof a === 'object' && a !== null ? a : { ...b, value: a };
    const {
      id,
      value = "",
      placeholder = "",
      disabled = false,
      type = "text",
      maxLength,
    } = opts;
    const node = el("input", {
      class: "input",
      id,
      type,
      placeholder,
      maxlength: maxLength,
    });
    node.value = value == null ? "" : String(value);
    if (disabled) node.disabled = true;
    return node;
  }

  // =========================
  // Financeiro
  // =========================
  async function loadFinanceiro() {
    state.financeiro.loading = true;
    setError("");
    setStatus("Carregando lançamentos...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    const { start, end } = getMonthRange(state.financeiro.month);

    let q = sb
      .from("txs")
      .select("id, company_id, type, desc, amount, due_date, category, status, created_at, updated_at")
      .eq("company_id", cid)
      .order("due_date", { ascending: false })
      .limit(50);

    if (state.financeiro.type) q = q.eq("type", state.financeiro.type);
    q = q.gte("due_date", start).lte("due_date", end);

    const term = String(state.financeiro.search || "").trim();
    if (term) q = q.ilike("desc", `%${term}%`);

    const { data, error } = await q;
    if (error) throw error;

    state.financeiro.rows = Array.isArray(data) ? data : [];
    state.financeiro.total = state.financeiro.rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);

    setStatus(`TXs carregadas: ${state.financeiro.rows.length}`, "ok");
    state.financeiro.loading = false;
  }

  function txRow(r) {
    return el("div", { class: "tr" }, [
      el("div", { class: "td mono" }, [esc(r.due_date || "")]),
      el("div", { class: "td" }, [esc(r.desc || "")]),
      el("div", { class: "td mono" }, [esc(r.type || "")]),
      el("div", { class: "td mono" }, [formatBRL(r.amount)]),
      el("div", { class: "td mono" }, [esc(r.status || "aberto")]),
    ]);
  }

  async function onCreateTx() {
    try {
      setError("");
      const sb = assertSB();
      const cid = state.session.companyId;
      if (!cid) throw new Error("companyId ausente.");

      const type = state.financeiro._newType || "receber";
      const desc = String(state.financeiro._newDesc || "").trim();
      const amount = Number(String(state.financeiro._newAmount || "").replace(",", "."));
      const dueIso = safeISODateFromBR(state.financeiro._newDueBR);

      if (!desc) return setError("Descrição obrigatória.");
      if (!Number.isFinite(amount) || amount <= 0) return setError("Valor inválido.");
      if (!dueIso) return setError("Vencimento inválido (use DD/MM/AAAA).");

      setStatus("Salvando...", "info");

      const payload = { company_id: cid, type, desc, amount, due_date: dueIso, status: "aberto" };
      const { error } = await sb.from("txs").insert(payload);
      if (error) throw error;

      setStatus("Salvo com sucesso.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[financeiro] create error", e);
      setError(e?.message || "Erro ao salvar.");
    }
  }

  function renderFinanceiro() {
    setTitle("Financeiro");
    setActiveNav("financeiro");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field(
        "Mês (AAAA-MM)",
        el("input", { class: "input", value: state.financeiro.month, placeholder: "2026-02", oninput: (e) => (state.financeiro.month = e.target.value) })
      ),
      field(
        "Buscar (descrição)",
        el("input", { class: "input", value: state.financeiro.search, placeholder: "ex: aluguel", oninput: (e) => (state.financeiro.search = e.target.value) })
      ),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Recarregar"]),
        el("div", { class: "totalbox" }, [
          el("div", { class: "muted" }, ["Total"]),
          el("div", { class: "total" }, [formatBRL(state.financeiro.total)]),
        ]),
      ]),
    ]);

    const newBox = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Novo lançamento"]),
      el("div", { class: "row row-4" }, [
        field(
          "Tipo",
          el(
            "select",
            { class: "input", onchange: (e) => (state.financeiro._newType = e.target.value) },
            [el("option", { value: "receber" }, ["A receber"]), el("option", { value: "pagar" }, ["A pagar"])]
          )
        ),
        field("Descrição", el("input", { class: "input", placeholder: "ex: aluguel", oninput: (e) => (state.financeiro._newDesc = e.target.value) })),
        field("Valor", el("input", { class: "input", placeholder: "100", oninput: (e) => (state.financeiro._newAmount = e.target.value) })),
        field("Vencimento (DD/MM/AAAA)", el("input", { class: "input", placeholder: "05/02/2026", oninput: (e) => (state.financeiro._newDueBR = e.target.value) })),
      ]),
      el("div", { class: "row-actions" }, [el("button", { class: "btn btn-primary", type: "button", onclick: onCreateTx }, ["Salvar"])]),
    ]);

    const listBox = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["TXs (últimas 50)"]),
      el("div", { class: "table" }, [
        el("div", { class: "thead" }, [
          el("div", { class: "th" }, ["Venc."]),
          el("div", { class: "th" }, ["Descrição"]),
          el("div", { class: "th" }, ["Tipo"]),
          el("div", { class: "th" }, ["Valor"]),
          el("div", { class: "th" }, ["Status"]),
        ]),
        el("div", { class: "tbody", id: "txBody" }, state.financeiro.rows.map((r) => txRow(r))),
      ]),
    ]);

    body.appendChild(topRow);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(newBox);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(listBox);
  }

  // =========================
  // Clientes (mantido como estava, com CNPJ)
  // =========================
  async function loadClientes() {
    state.clientes.loading = true;
    setError("");
    setStatus("Carregando clientes...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    let q = sb
      .from("customers")
      .select("id, company_id, name, phone, email, address, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(200);

    const term = String(state.clientes.search || "").trim();
    if (term) q = q.ilike("name", `%${term}%`);

    const { data, error } = await q;
    if (error) throw error;

    let rows = Array.isArray(data) ? data : [];

    if (term && /^\d+$/.test(String(term).replace(/\D+/g, ""))) {
      const digits = String(term).replace(/\D+/g, "");
      rows = rows.filter((r) => String(r.phone || "").replace(/\D+/g, "").includes(digits) || String(r.name || "").toLowerCase().includes(term.toLowerCase()));
    }

    state.clientes.rows = rows;
    setStatus(`Clientes carregados: ${rows.length}`, "ok");
    state.clientes.loading = false;
  }

  function startEditCustomer(r) {
    state.clientes.editingId = r.id;
    refreshRouteRenderOnly();
  }
  function cancelEditCustomer() {
    state.clientes.editingId = null;
    refreshRouteRenderOnly();
  }

  function customerRow(r) {
    const isEdit = state.clientes.editingId === r.id;

    if (!isEdit) {
      return el("div", { class: "tr" }, [
        el("div", { class: "td" }, [esc(r.name || "")]),
        el("div", { class: "td mono" }, [esc(r.phone || "")]),
        el("div", { class: "td" }, [esc(r.address || "")]),
        el("div", { class: "td actions" }, [
          el("button", { class: "btn btn-sm", type: "button", onclick: () => startEditCustomer(r) }, ["Editar"]),
          el("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => onDeleteCustomer(r.id) }, ["Excluir"]),
        ]),
      ]);
    }

    return el("div", { class: "tr edit" }, [
      el("div", { class: "td" }, [
        el("input", { class: "input input-sm", value: r._editName ?? r.name ?? "", oninput: (e) => (r._editName = e.target.value) }),
      ]),
      el("div", { class: "td" }, [
        el("input", { class: "input input-sm", value: r._editPhone ?? r.phone ?? "", oninput: (e) => (r._editPhone = e.target.value) }),
      ]),
      el("div", { class: "td" }, [
        el("input", { class: "input input-sm", value: r._editAddress ?? r.address ?? "", oninput: (e) => (r._editAddress = e.target.value) }),
      ]),
      el("div", { class: "td actions" }, [
        el("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => onSaveCustomer(r) }, ["Salvar"]),
        el("button", { class: "btn btn-sm", type: "button", onclick: cancelEditCustomer }, ["Cancelar"]),
      ]),
    ]);
  }

  async function onLookupCNPJNewCustomer() {
    try {
      const raw = state.clientes._newCNPJ || "";
      const cnpj = normCNPJ(raw);
      if (cnpj.length !== 14) return alert("Informe um CNPJ válido (14 dígitos).");

      setStatus("Consultando CNPJ...", "warn");
      const data = await lookupCNPJ(cnpj);

      const nome = (data.razao_social || data.nome_fantasia || "").trim();
      if (nome) state.clientes._newName = nome;

      const tel = (data.ddd_telefone_1 || data.telefone_1 || data.ddd_telefone_2 || data.telefone_2 || "").trim();
      if (tel) state.clientes._newPhone = tel;

      const parts = [];
      if (data.logradouro) parts.push(data.logradouro);
      if (data.numero) parts.push(String(data.numero));
      if (data.bairro) parts.push(data.bairro);
      const cityUf = [data.municipio, data.uf].filter(Boolean).join(" / ");
      if (cityUf) parts.push(cityUf);
      const addr = parts.join(", ");
      if (addr) state.clientes._newAddress = addr;

      const cnpjFmt = fmtCNPJ(cnpj);
      const curNotes = String(state.clientes._newNotes || "").trim();
      const tag = `CNPJ: ${cnpjFmt}`;
      state.clientes._newNotes = curNotes ? (curNotes.includes("CNPJ:") ? curNotes : `${curNotes} | ${tag}`) : tag;

      setStatus("CNPJ encontrado e campos preenchidos.", "ok");
      refreshRouteRenderOnly();
    } catch (e) {
      console.warn(e);
      setStatus("Falha ao consultar CNPJ.", "err");
      alert(e?.message || "Falha ao consultar CNPJ");
    }
  }

  async function onCreateCustomer() {
    try {
      setError("");
      const sb = assertSB();
      const cid = state.session.companyId;
      if (!cid) throw new Error("companyId ausente.");

      const name = String(state.clientes._newName || "").trim();
      const phone = String(state.clientes._newPhone || "").trim();
      const address = String(state.clientes._newAddress || "").trim();
      const notes = String(state.clientes._newNotes || "").trim();

      if (!name) return setError("Nome obrigatório.");

      setStatus("Salvando cliente...", "info");

      const payload = { company_id: cid, name, phone: phone || null, address: address || null, notes: notes || null };

      let res = await sb.from("customers").insert(payload);
      if (res.error && String(res.error.message || "").toLowerCase().includes("notes")) {
        const payload2 = { company_id: cid, name, phone: phone || null, address: address || null };
        res = await sb.from("customers").insert(payload2);
      }
      if (res.error) throw res.error;

      setStatus("Cliente criado.", "ok");

      state.clientes._newName = "";
      state.clientes._newPhone = "";
      state.clientes._newAddress = "";
      state.clientes._newNotes = "";
      state.clientes._newCNPJ = "";

      await refreshCurrent();
    } catch (e) {
      console.error("[clientes] create error", e);
      setError(e?.message || "Erro ao criar cliente.");
    }
  }

  async function onSaveCustomer(r) {
    try {
      setError("");
      const sb = assertSB();

      const name = String(r._editName ?? r.name ?? "").trim();
      const phone = String(r._editPhone ?? r.phone ?? "").trim();
      const address = String(r._editAddress ?? r.address ?? "").trim();

      if (!name) return setError("Nome obrigatório.");

      setStatus("Salvando alterações...", "info");

      const { error } = await sb.from("customers").update({ name, phone: phone || null, address: address || null }).eq("id", r.id);
      if (error) throw error;

      state.clientes.editingId = null;
      setStatus("Cliente atualizado.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[clientes] save error", e);
      setError(e?.message || "Erro ao salvar cliente.");
    }
  }

  async function onDeleteCustomer(id) {
    try {
      setError("");
      const ok = confirm("Excluir este cliente?");
      if (!ok) return;

      const sb = assertSB();
      setStatus("Excluindo...", "info");

      const { error } = await sb.from("customers").delete().eq("id", id);
      if (error) throw error;

      setStatus("Cliente excluído.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[clientes] delete error", e);
      setError(e?.message || "Erro ao excluir cliente.");
    }
  }

  function renderClientes() {
    setTitle("Clientes");
    setActiveNav("clientes");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field("Buscar", el("input", { class: "input", value: state.clientes.search, placeholder: "nome ou telefone", oninput: (e) => (state.clientes.search = e.target.value) })),
      el("div", { class: "row-actions" }, [el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Recarregar"])]),
      el("div", {}, []),
    ]);

    const newBox = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Novo cliente"]),
      el("div", { class: "row row-3" }, [
        field(
          "Tipo",
          el(
            "select",
            {
              class: "input",
              onchange: (e) => {
                state.clientes._newType = e.target.value;
                refreshRouteRenderOnly();
              },
            },
            [
              el("option", { value: "pf", selected: (state.clientes._newType || "pf") === "pf" }, ["Pessoa física"]),
              el("option", { value: "pj", selected: (state.clientes._newType || "pf") === "pj" }, ["Empresa (CNPJ)"]),
            ]
          )
        ),
        field("Nome", el("input", { class: "input", value: state.clientes._newName || "", oninput: (e) => (state.clientes._newName = e.target.value) })),
        field("Telefone", el("input", { class: "input", value: state.clientes._newPhone || "", oninput: (e) => (state.clientes._newPhone = e.target.value) })),
      ]),
      (state.clientes._newType || "pf") === "pj"
        ? el("div", { class: "row row-3" }, [
            field("CNPJ", el("input", { class: "input", value: state.clientes._newCNPJ || "", placeholder: "00.000.000/0000-00", oninput: (e) => (state.clientes._newCNPJ = e.target.value), onblur: (e) => (state.clientes._newCNPJ = fmtCNPJ(e.target.value)) })),
            el("div", { class: "row-actions" }, [el("button", { class: "btn", type: "button", onclick: onLookupCNPJNewCustomer }, ["Buscar CNPJ"])]),
            el("div", {}, []),
          ])
        : el("div", {}, []),
      el("div", { class: "row row-2" }, [
        field("Endereço", el("input", { class: "input", value: state.clientes._newAddress || "", oninput: (e) => (state.clientes._newAddress = e.target.value) })),
        field("Notas", el("input", { class: "input", value: state.clientes._newNotes || "", oninput: (e) => (state.clientes._newNotes = e.target.value) })),
      ]),
      el("div", { class: "row-actions" }, [el("button", { class: "btn btn-primary", type: "button", onclick: onCreateCustomer }, ["Criar cliente"])]),
    ]);

    const listBox = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Clientes"]),
      el("div", { class: "table" }, [
        el("div", { class: "thead" }, [
          el("div", { class: "th" }, ["Nome"]),
          el("div", { class: "th" }, ["Telefone"]),
          el("div", { class: "th" }, ["Endereço"]),
          el("div", { class: "th" }, ["Ações"]),
        ]),
        el("div", { class: "tbody" }, state.clientes.rows.map((r) => customerRow(r))),
      ]),
    ]);

    body.appendChild(topRow);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(newBox);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(listBox);
  }

  // =========================
  // ORÇAMENTOS (mantido)
  // =========================
  async function loadOrcamentos() {
    state.orcamentos.loading = true;
    setError("");
    setStatus("Carregando orçamentos...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    let q = sb
      .from("quotes")
      .select("id, company_id, ticket_id, status, currency, subtotal, discount, surcharge, total, sent_at, approved_at, rejected_at, approval_note, created_at, updated_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(200);

    const termRaw = String(state.orcamentos.statusSearch || "").trim().toLowerCase();
    const term = quoteStatusToDb(termRaw);
    if (term) q = q.ilike("status", `%${term}%`);

    const { data, error } = await q;
    if (error) throw error;

    state.orcamentos.rows = Array.isArray(data) ? data : [];
    setStatus(`Orçamentos carregados: ${state.orcamentos.rows.length}`, "ok");
    state.orcamentos.loading = false;

    if (!state.orcamentos.selectedId && state.orcamentos.rows[0]?.id) {
      state.orcamentos.selectedId = state.orcamentos.rows[0].id;
    }
    if (state.orcamentos.selectedId) await loadOrcamentoDetalhe(state.orcamentos.selectedId);
  }

  async function loadOrcamentoDetalhe(id) {
    const sb = assertSB();

    const { data: quote, error: e1 } = await sb
      .from("quotes")
      .select("id, company_id, ticket_id, status, currency, subtotal, discount, surcharge, total, sent_at, approved_at, rejected_at, approval_note, created_at, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (e1) throw e1;

    const { data: items, error: e2 } = await sb
      .from("quote_items")
      .select("id, quote_id, item_type, description, unit, qty, unit_cost, unit_price, total_cost, total_price, sort_order, created_at")
      .eq("quote_id", id)
      .order("sort_order", { ascending: true });
    if (e2) throw e2;

    state.orcamentos.selected = quote || null;
    state.orcamentos.items = Array.isArray(items) ? items : [];
  }

  async function openOrcamento(id) {
    try {
      setError("");
      state.orcamentos.selectedId = id;
      await loadOrcamentoDetalhe(id);
      renderOrcamentos();
    } catch (e) {
      console.error("[orcamentos] open error", e);
      setError(e?.message || "Erro ao abrir orçamento.");
    }
  }

  async function createOrcamento() {
    try {
      setError("");
      const sb = assertSB();
      const cid = state.session.companyId;

      setStatus("Criando orçamento...", "info");

      // ticket_id: deixe NULL (o fluxo correto é criar a partir do ticket via RPC)
      const payload = { company_id: cid, ticket_id: null, status: "draft", currency: "BRL", subtotal: 0, discount: 0, surcharge: 0, total: 0 };

      const { data, error } = await sb.from("quotes").insert(payload).select("id").maybeSingle();
      if (error) throw error;

      setStatus("Orçamento criado.", "ok");
      state.orcamentos.selectedId = data?.id || null;
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] create error", e);
      setError(e?.message || "Erro ao criar orçamento.");
    }
  }

  async function saveOrcamentoStatus() {
    try {
      setError("");
      const sb = assertSB();
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const status = String(q._editStatus || q.status || "draft").trim().toLowerCase();
      setStatus("Salvando status...", "info");

      const { error } = await sb.from("quotes").update({ status }).eq("id", q.id);
      if (error) throw error;

      setStatus("Status salvo.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] status error", e);
      setError(e?.message || "Erro ao salvar status.");
    }
  }

  async function recalcOrcamentoTotal() {
    try {
      setError("");
      const sb = assertSB();
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const discount = Number(String(state.orcamentos._newDiscount ?? q.discount ?? 0).replace(",", "."));
      const surcharge = Number(String(state.orcamentos._newSurcharge ?? q.surcharge ?? 0).replace(",", "."));

      const subtotal = state.orcamentos.items.reduce((acc, it) => acc + Number(it.total_price || 0), 0);
      const total = subtotal - (Number.isFinite(discount) ? discount : 0) + (Number.isFinite(surcharge) ? surcharge : 0);

      setStatus("Atualizando totais...", "info");

      const { error } = await sb
        .from("quotes")
        .update({ subtotal, discount: Number.isFinite(discount) ? discount : 0, surcharge: Number.isFinite(surcharge) ? surcharge : 0, total })
        .eq("id", q.id);
      if (error) throw error;

      setStatus("Totais atualizados.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] recalc error", e);
      setError(e?.message || "Erro ao recalcular total.");
    }
  }

  async function addQuoteItem() {
    try {
      setError("");
      const sb = assertSB();
      const quoteId = state.orcamentos.selectedId;
      if (!quoteId) return setError("Selecione um orçamento.");

      const item_type = normalizeQuoteItemType(state.orcamentos._newItemType || "material");
      const description = String(state.orcamentos._newItemDesc || "").trim();
      const unit = String(state.orcamentos._newItemUnit || "").trim() || null;

      const qty = Number(String(state.orcamentos._newItemQty || "1").replace(",", "."));
      const unit_cost = Number(String(state.orcamentos._newItemUnitCost || "0").replace(",", "."));
      const unit_price = Number(String(state.orcamentos._newItemUnitPrice || "0").replace(",", "."));

      if (!description) return setError("Descrição obrigatória.");
      if (!Number.isFinite(qty) || qty <= 0) return setError("Qtd inválida.");
      if (!Number.isFinite(unit_price) || unit_price < 0) return setError("Preço inválido.");
      if (!Number.isFinite(unit_cost) || unit_cost < 0) return setError("Custo inválido.");

      const total_cost = qty * unit_cost;
      const total_price = qty * unit_price;

      const sort_order = (state.orcamentos.items?.length || 0) + 1;

      setStatus("Adicionando item...", "info");

      const payload = { quote_id: quoteId, item_type, description, unit, qty, unit_cost, unit_price, total_cost, total_price, sort_order };

      const { error } = await sb.from("quote_items").insert(payload);
      if (error) throw error;

      setStatus("Item adicionado.", "ok");

      state.orcamentos._newItemDesc = "";
      state.orcamentos._newItemQty = "1";
      state.orcamentos._newItemUnit = "";
      state.orcamentos._newItemUnitCost = "0";
      state.orcamentos._newItemUnitPrice = "0";
      state.orcamentos._newItemType = "material";

      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] add item error", e);
      setError(e?.message || "Erro ao adicionar item.");
    }
  }

  async function deleteQuoteItem(itemId) {
    try {
      setError("");
      const ok = confirm("Excluir este item?");
      if (!ok) return;

      const sb = assertSB();
      setStatus("Excluindo item...", "info");

      const { error } = await sb.from("quote_items").delete().eq("id", itemId);
      if (error) throw error;

      setStatus("Item excluído.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] delete item error", e);
      setError(e?.message || "Erro ao excluir item.");
    }
  }

  async function deleteOrcamento(id) {
    try {
      setError("");
      const ok = confirm("Excluir este orçamento? (itens serão apagados também)");
      if (!ok) return;

      const sb = assertSB();
      setStatus("Excluindo orçamento...", "info");

      await sb.from("quote_items").delete().eq("quote_id", id);
      const { error } = await sb.from("quotes").delete().eq("id", id);
      if (error) throw error;

      if (state.orcamentos.selectedId === id) {
        state.orcamentos.selectedId = null;
        state.orcamentos.selected = null;
        state.orcamentos.items = [];
      }

      setStatus("Orçamento excluído.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] delete error", e);
      setError(e?.message || "Erro ao excluir orçamento.");
    }
  }

  function quoteRow(q) {
    const created = String(q.created_at || "").slice(0, 10);
    const active = state.orcamentos.selectedId === q.id;
    return el("div", { class: "tr" }, [
      el("div", { class: "td mono" }, [esc(created)]),
      el("div", { class: "td mono" }, [esc(quoteStatusLabel(q.status))]),
      el("div", { class: "td mono" }, [formatBRL(q.total)]),
      el("div", { class: "td actions" }, [
        el("button", { class: "btn btn-sm", type: "button", onclick: () => openOrcamento(q.id) }, [active ? "Aberto" : "Abrir"]),
        el("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => deleteOrcamento(q.id) }, ["Excluir"]),
      ]),
    ]);
  }

  function quoteItemRow(it, idx) {
    return el("div", { class: "tr" }, [
      el("div", { class: "td mono" }, [String(idx + 1)]),
      el("div", { class: "td" }, [esc(it.description || "")]),
      el("div", { class: "td mono" }, [String(it.qty ?? "")]),
      el("div", { class: "td mono" }, [formatBRL(it.unit_price)]),
      el("div", { class: "td mono" }, [formatBRL(it.total_price)]),
      el("div", { class: "td actions" }, [el("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => deleteQuoteItem(it.id) }, ["Excluir"])]),
    ]);
  }

  function renderOrcamentoDetalheCard() {
    const q = state.orcamentos.selected;
    if (!q) return el("div", { class: "muted" }, ["Selecione um orçamento."]);

    const subtotal = Number(q.subtotal || 0);
    const discount = Number(q.discount || 0);
    const surcharge = Number(q.surcharge || 0);
    const total = Number(q.total || 0);

    const discountInput = el("input", { class: "input", value: String(state.orcamentos._newDiscount ?? discount), oninput: (e) => (state.orcamentos._newDiscount = e.target.value) });
    const surchargeInput = el("input", { class: "input", value: String(state.orcamentos._newSurcharge ?? surcharge), oninput: (e) => (state.orcamentos._newSurcharge = e.target.value) });

    return el("div", {}, [
      el("div", { class: "row row-2" }, [
        field("Status", el("input", { class: "input", value: String(q.status || "draft"), oninput: (e) => (q._editStatus = e.target.value) })),
        el("div", { class: "row-actions" }, [el("button", { class: "btn btn-primary", type: "button", onclick: saveOrcamentoStatus }, ["Salvar status"])]),
      ]),
      el("div", { class: "row row-4" }, [
        field("Subtotal", el("div", { class: "pill mono" }, [formatBRL(subtotal)])),
        field("Desconto", discountInput),
        field("Acréscimo", surchargeInput),
        field("Total", el("div", { class: "pill mono" }, [formatBRL(total)])),
      ]),
      el("div", { class: "row-actions" }, [el("button", { class: "btn", type: "button", onclick: recalcOrcamentoTotal }, ["Recalcular total"])]),
      el("hr", { class: "sep" }),

      el("h3", { class: "h3" }, ["Novo item"]),
      el("div", { class: "row row-4" }, [
        field(
          "Tipo",
          el(
            "select",
            { class: "input", onchange: (e) => (state.orcamentos._newItemType = e.target.value) },
            [
              el("option", { value: "material" }, ["Material"]),
              el("option", { value: "labor" }, ["Mão de obra"]),
              el("option", { value: "travel" }, ["Deslocamento / Frete"]),
              el("option", { value: "third_party" }, ["Terceiros"]),
              el("option", { value: "other" }, ["Outros"]),
            ]
          )
        ),
        field("Descrição", el("input", { class: "input", placeholder: "ex: Barra chata 1/8", oninput: (e) => (state.orcamentos._newItemDesc = e.target.value) })),
        field("Qtd", el("input", { class: "input", placeholder: "1", oninput: (e) => (state.orcamentos._newItemQty = e.target.value) })),
        field("Preço unit.", el("input", { class: "input", placeholder: "100,00", oninput: (e) => (state.orcamentos._newItemUnitPrice = e.target.value) })),
      ]),
      el("div", { class: "row row-3" }, [
        field("Custo unit.", el("input", { class: "input", placeholder: "0,00", oninput: (e) => (state.orcamentos._newItemUnitCost = e.target.value) })),
        field("Unidade", el("input", { class: "input", placeholder: "ex: un / m / kg", oninput: (e) => (state.orcamentos._newItemUnit = e.target.value) })),
        el("div", { class: "row-actions" }, [el("button", { class: "btn btn-primary", type: "button", onclick: addQuoteItem }, ["Adicionar item"])]),
      ]),

      el("hr", { class: "sep" }),
      el("h3", { class: "h3" }, ["Itens"]),
      el("div", { class: "table" }, [
        el("div", { class: "thead" }, [
          el("div", { class: "th" }, ["#"]),
          el("div", { class: "th" }, ["Descrição"]),
          el("div", { class: "th" }, ["Qtd"]),
          el("div", { class: "th" }, ["Preço"]),
          el("div", { class: "th" }, ["Total"]),
          el("div", { class: "th" }, ["Ações"]),
        ]),
        el("div", { class: "tbody" }, state.orcamentos.items.map((it, idx) => quoteItemRow(it, idx))),
      ]),
    ]);
  }

  function renderOrcamentos() {
    setTitle("Orçamentos");
    setActiveNav("orcamentos");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field("Buscar (status)", el("input", { class: "input", value: state.orcamentos.statusSearch, placeholder: "ex: rascunho, enviado, aprovado...", oninput: (e) => (state.orcamentos.statusSearch = e.target.value) })),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Recarregar"]),
        el("button", { class: "btn btn-primary", type: "button", onclick: createOrcamento }, ["Criar orçamento"]),
      ]),
      el("div", {}, []),
    ]);

    const layout = el("div", { class: "row row-2" }, [
      el("div", { class: "section" }, [
        el("h3", { class: "h3" }, ["Lista de orçamentos"]),
        el("div", { class: "table" }, [
          el("div", { class: "thead" }, [
            el("div", { class: "th" }, ["Criado"]),
            el("div", { class: "th" }, ["Status"]),
            el("div", { class: "th" }, ["Total"]),
            el("div", { class: "th" }, ["Ações"]),
          ]),
          el("div", { class: "tbody" }, state.orcamentos.rows.map((q) => quoteRow(q))),
        ]),
      ]),
      el("div", { class: "section" }, [el("h3", { class: "h3" }, ["Detalhe do orçamento"]), renderOrcamentoDetalheCard()]),
    ]);

    body.appendChild(el("div", { class: "muted" }, [`Orçamentos carregados: ${state.orcamentos.rows.length}`]));
    body.appendChild(topRow);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(layout);
  }

  // =========================
  // Chamados (ajustado status + send)
  // =========================
  
  // =========================
  // TICKETS — SLA (COMPLETO)
  // =========================
  function ensureChamadosState() {
    state[KEY_CHAMADOS] = state[KEY_CHAMADOS] || {};
    state[KEY_CHAMADOS].search = state[KEY_CHAMADOS].search || "";
    state[KEY_CHAMADOS].status = state[KEY_CHAMADOS].status || "";
    state[KEY_CHAMADOS].rows = state[KEY_CHAMADOS].rows || [];
    state[KEY_CHAMADOS].loading = !!state[KEY_CHAMADOS].loading;
    state[KEY_CHAMADOS].selectedId = state[KEY_CHAMADOS].selectedId || null;
    state[KEY_CHAMADOS].selected = state[KEY_CHAMADOS].selected || null;
    state[KEY_CHAMADOS].timeline = state[KEY_CHAMADOS].timeline || [];
    state[KEY_CHAMADOS].quote = state[KEY_CHAMADOS].quote || null;
    state[KEY_CHAMADOS].slaPlans = state[KEY_CHAMADOS].slaPlans || [];
    state[KEY_CHAMADOS].sla = state[KEY_CHAMADOS].sla || null;
    state[KEY_CHAMADOS].mode = state[KEY_CHAMADOS].mode || "view"; // view | new
    state[KEY_CHAMADOS].draft = state[KEY_CHAMADOS].draft || {
      client_name: "",
      client_phone: "",
      description: "",
      status: "aberto",
      sla_plan_id: "",
    };
    state[KEY_CHAMADOS].newMessageText = state[KEY_CHAMADOS].newMessageText || "";
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function addHoursISO(iso, hours) {
    const d = iso ? new Date(iso) : new Date();
    d.setTime(d.getTime() + Number(hours || 0) * 60 * 60 * 1000);
    return d.toISOString();
  }

  function fmtDT(iso) {
    if (!iso) return "—";
    return String(iso).replace("T", " ").slice(0, 16);
  }

  function slaBadge(sla) {
    if (!sla) return { text: "Sem SLA", cls: "pill" };
    const st = String(sla.status || "active").toLowerCase();
    const deadline = sla.deadline_at ? new Date(sla.deadline_at).getTime() : null;
    const now = Date.now();
    if (st === "closed" || st === "finalizado" || st === "met") return { text: "SLA Encerrado", cls: "pill" };
    if (deadline && now > deadline) return { text: "ATRASADO", cls: "pill pill-danger" };
    return { text: "Dentro do SLA", cls: "pill pill-ok" };
  }

  function slaRemainingText(sla) {
    if (!sla?.deadline_at) return "—";
    const ms = new Date(sla.deadline_at).getTime() - Date.now();
    const abs = Math.abs(ms);
    const h = Math.floor(abs / 3600000);
    const m = Math.floor((abs % 3600000) / 60000);
    const sign = ms < 0 ? "-" : "";
    return `${sign}${h}h ${m}m`;
  }

  async function applySlaToChamado(ticketId, slaPlanId) {
    const sb = assertSB();
    const cid = state.session.companyId || window.Data?.getCompanyId?.() || window.Data?.companyId || null;
    if (!cid) throw new Error("Company não definida.");

    const plan = (state[KEY_CHAMADOS].slaPlans || []).find((p) => String(p.id) === String(slaPlanId));
    if (!plan) throw new Error("Plano de SLA não encontrado.");

    const startsAt = nowISO();
    const deadlineAt = addHoursISO(startsAt, plan.hours_to_expire);

    const ins = await sb
      .from("ticket_sla")
      .insert({
        company_id: cid,
        ticket_id: ticketId,
        sla_plan_id: plan.id,
        sla_hours: Number(plan.hours_to_expire || 0),
        starts_at: startsAt,
        deadline_at: deadlineAt,
        status: "active",
        applied_at: startsAt,
      })
      .select("*")
      .single();

    if (ins.error) throw ins.error;

    const dueDate = String(deadlineAt).slice(0, 10);
    const upT = await sb.from(TABLE_CHAMADOS).update({ due_date: dueDate }).eq("id", ticketId);
    if (upT.error) throw upT.error;

    await sb.from("ticket_history").insert({
      company_id: cid,
      ticket_id: ticketId,
      actor_user_id: state.session.userId || null,
      action: "sla_apply",
      from_status: null,
      to_status: null,
      note: `SLA aplicado: ${plan.name} (${plan.hours_to_expire}h)`,
      meta: { sla_plan_id: plan.id, deadline_at: deadlineAt },
    });

    return ins.data;
  }

  async function createChamadoFromDraft() {
    ensureChamadosState();
    const sb = assertSB();
    const cid = state.session.companyId || window.Data?.getCompanyId?.() || window.Data?.companyId || null;
    if (!cid) throw new Error("Company não definida.");

    const d = state[KEY_CHAMADOS].draft || {};
    const payload = {
      company_id: cid,
      client_name: String(d.client_name || "").trim() || null,
      client_phone: String(d.client_phone || "").trim() || null,
      description: String(d.description || "").trim() || null,
      status: d.status || "aberto",
    };

    const insT = await sb.from(TABLE_CHAMADOS).insert(payload).select("*").single();
    if (insT.error) throw insT.error;

    const ticketId = insT.data.id;

    await sb.from("ticket_history").insert({
      company_id: cid,
      ticket_id: ticketId,
      actor_user_id: state.session.userId || null,
      action: "create",
      from_status: null,
      to_status: payload.status,
      note: "Ticket criado",
      meta: null,
    });

    if (d.sla_plan_id) {
      try {
        await applySlaToChamado(ticketId, d.sla_plan_id);
      } catch (e) {
        console.error(e);
        showToast("Ticket criado, mas falhou aplicar SLA: " + (e?.message || e), "error");
      }
    }

    state[KEY_CHAMADOS].mode = "view";
    state[KEY_CHAMADOS].draft = { client_name: "", client_phone: "", description: "", status: "aberto", sla_plan_id: "" };

    await loadChamados();
    await openChamado(ticketId);
  }

  async function updateChamadoStatus(ticketId, newStatus) {
    const sb = assertSB();
    const cid = state.session.companyId || window.Data?.getCompanyId?.() || window.Data?.companyId || null;
    if (!cid) throw new Error("Company não definida.");

    const cur = state[KEY_CHAMADOS].selected?.status || null;

    const up = await sb.from(TABLE_CHAMADOS).update({ status: newStatus }).eq("id", ticketId).select("*").single();
    if (up.error) throw up.error;

    await sb.from("ticket_history").insert({
      company_id: cid,
      ticket_id: ticketId,
      actor_user_id: state.session.userId || null,
      action: "status_change",
      from_status: cur,
      to_status: newStatus,
      note: `Status: ${ticketStatusLabel(cur)} → ${ticketStatusLabel(newStatus)}`,
      meta: null,
    });

    const ns = String(newStatus || "").toLowerCase();
    if (ns === "finalizado" || ns === "cancelado") {
      const sla = state[KEY_CHAMADOS].sla;
      if (sla?.id) {
        await sb.from("ticket_sla").update({ status: "closed" }).eq("id", sla.id);
      }
    }

    state[KEY_CHAMADOS].selected = up.data;
    await openChamado(ticketId);
  }

async function loadChamados() {
    ensureChamadosState();
    state[KEY_CHAMADOS].loading = true;
    state[KEY_CHAMADOS].rows = [];
    state[KEY_CHAMADOS].selected = null;
    state[KEY_CHAMADOS].timeline = [];
    state[KEY_CHAMADOS].quote = null;
    state[KEY_CHAMADOS].sla = null;

    try {
      const sb = assertSB();
      const cid = state.session.companyId || window.Data?.getCompanyId?.() || window.Data?.companyId || null;
      if (!cid) throw new Error("Company não definida. Verifique company_users.");

      const plansRes = await sb.from("sla_plans").select("id, name, hours_to_expire, created_at").eq("company_id", cid).order("created_at", { ascending: false });
      if (!plansRes.error) state[KEY_CHAMADOS].slaPlans = plansRes.data || [];

      const { data, error } = await sb
        .from(TABLE_CHAMADOS)
        .select("id, company_id, created_at, client_name, client_phone, description, status, due_date, customer_id, token")
        .eq("company_id", cid)
        .order("created_at", { ascending: false });

      if (error) throw error;

      let rows = data || [];
      const s = String(state[KEY_CHAMADOS].search || "").trim().toLowerCase();
      const st = String(state[KEY_CHAMADOS].status || "").trim().toLowerCase();

      if (st) rows = rows.filter((r) => String(r.status || "").toLowerCase() === st);

      if (s) {
        rows = rows.filter((r) => {
          const a = String(r.description || "").toLowerCase();
          const b = String(r.client_name || "").toLowerCase();
          const c = String(r.client_phone || "").toLowerCase();
          return a.includes(s) || b.includes(s) || c.includes(s);
        });
      }

      state[KEY_CHAMADOS].rows = rows;

      if (!state[KEY_CHAMADOS].selectedId && rows[0]?.id) {
        await openChamado(rows[0].id);
      }
    } finally {
      state[KEY_CHAMADOS].loading = false;
    }
  }

async function openChamado(ticketId) {
    ensureChamadosState();
    state[KEY_CHAMADOS].selectedId = ticketId;
    state[KEY_CHAMADOS].selected = null;
    state[KEY_CHAMADOS].timeline = [];
    state[KEY_CHAMADOS].quote = null;
    state[KEY_CHAMADOS].sla = null;

    try {
      const sb = assertSB();

      const tRes = await sb
        .from(TABLE_CHAMADOS)
        .select("id, company_id, created_at, client_name, client_phone, description, status, due_date, customer_id, token, history, photo1_path, photo2_path, photo3_path, photo4_path, photo5_path, video1_path")
        .eq("id", ticketId)
        .single();

      if (tRes.error) throw tRes.error;
      state[KEY_CHAMADOS].selected = tRes.data;

      const linkedCustomer = await tryAutoLinkCustomerByPhone(state[KEY_CHAMADOS].selected);
      if (linkedCustomer) {
        const tRes2 = await sb.from(TABLE_CHAMADOS).select("*").eq("id", ticketId).single();
        if (!tRes2.error) state[KEY_CHAMADOS].selected = tRes2.data;
      }

      const slaRes = await sb
        .from("ticket_sla")
        .select("id, ticket_id, company_id, contract_id, sla_plan_id, sla_hours, starts_at, deadline_at, status, applied_at, created_at, sla_plans ( name, hours_to_expire )")
        .eq("ticket_id", ticketId)
        .order("applied_at", { ascending: false })
        .limit(1);

      if (!slaRes.error && (slaRes.data || []).length) {
        state[KEY_CHAMADOS].sla = slaRes.data[0];
      }

      let timeline = [];
      const tlRes = await sb
        .from("ticket_timeline")
        .select("id, ticket_id, company_id, created_at, source, event_type, author_type, author_name, title, body, meta")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (!tlRes.error && tlRes.data) {
        timeline = tlRes.data || [];
      } else {
        const mRes = await sb
          .from("ticket_messages")
          .select("id, ticket_id, author_type, author_name, message, event_type, created_at")
          .eq("ticket_id", ticketId)
          .order("created_at", { ascending: true });

        if (mRes.error) throw (tlRes.error || mRes.error);
        timeline = (mRes.data || []).map((m) => ({
          id: String(m.id),
          ticket_id: m.ticket_id,
          company_id: state.session.companyId || null,
          created_at: m.created_at,
          source: "message",
          event_type: m.event_type || "note",
          author_type: m.author_type,
          author_name: m.author_name,
          title: m.event_type === "status_change" ? "Comentário de status" : "Nota",
          body: m.message || "",
          meta: null,
        }));
      }

      state[KEY_CHAMADOS].timeline = timeline;

      const qRes = await sb
        .from("quotes")
        .select("id, company_id, customer_id, ticket_id, status, total")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!qRes.error && (qRes.data || []).length) {
        state[KEY_CHAMADOS].quote = qRes.data[0];
      }

      // garante que o painel esteja em modo de visualização ao abrir um ticket
      state[KEY_CHAMADOS].mode = "view";
    } catch (err) {
      console.error(err);
      showToast("Erro ao abrir ticket: " + (err?.message || err), "error");
    } finally {
      refreshCurrent();
    }
  }

async function sendChamadoMessage() {
    try {
      if (!state?.[KEY_CHAMADOS]?.selectedId) return;
      const sb = assertSB();
      const ticketId = state[KEY_CHAMADOS].selectedId;

      const ta = document.getElementById("ticketMessage");
      const rawTxt = ta && typeof ta.value === "string" ? ta.value : state[KEY_CHAMADOS].newMessageText || "";
      const txt = String(rawTxt || "").trim();
      if (!txt) {
        setNotice("Digite uma mensagem antes de enviar.");
        return;
      }

      let companyId = state.session?.companyId || null;
      if (!companyId) {
        const rpc = await sb.rpc("current_company_id");
        companyId = rpc?.data || null;
      }
      if (!companyId) throw new Error("company_id ausente (RLS bloqueia INSERT).");

      const payload = {
        company_id: companyId,
        ticket_id: ticketId,
        author_type: "usuario",
        author_name: "Equipe",
        message: txt,
        event_type: "note",
      };

      const ins = await sb.from("ticket_messages").insert(payload).select("id, created_at").single();
      if (ins.error) {
        setError(`Erro ao enviar mensagem: ${ins.error.message || ins.error}`);
        return;
      }

      state[KEY_CHAMADOS].newMessageText = "";
      if (ta) ta.value = "";
      const btn = document.getElementById("ticketSendBtn");
      if (btn) btn.disabled = true;

      await openChamado(ticketId);
      setNotice("Mensagem enviada.", "ok");
      renderCurrentRoute();
    } catch (e) {
      console.error("[chamados] sendMessage exception:", e);
      setError(e?.message || "Erro inesperado ao enviar mensagem.");
    }
  }

  async function ensureQuoteFromChamado(ticketId) {
    try {
      setError("");
      setStatus("Gerando/abrindo orçamento do ticket...", "info");
      const sb = assertSB();

      const r = await sb.rpc("create_quote_from_ticket", { p_ticket_id: ticketId });

      if (r.error) {
        const msg = String(r.error?.message || "");
        if (r.status === 409 || /uq_quotes_one_active_per_ticket/i.test(msg) || /duplicate key/i.test(msg)) {
          const qRes = await sb
            .from("quotes")
            .select("id, ticket_id, status, total, created_at")
            .eq("ticket_id", ticketId)
            .order("created_at", { ascending: false })
            .limit(1);

          if (qRes.error) throw qRes.error;
          if (qRes.data && qRes.data[0]) {
            state[KEY_CHAMADOS].quote = qRes.data[0];
            setStatus("Orçamento já existia. Abrindo...", "info");
            openOrcamento(qRes.data[0].id);
            setHash("orcamentos");
            return;
          }
        }
        throw r.error;
      }

      const newId = r.data;
      if (!newId) throw new Error("RPC retornou sucesso mas não retornou id do orçamento.");
      setStatus("Orçamento criado. Abrindo...", "info");
      openOrcamento(newId);
      setHash("orcamentos");
    } catch (err) {
      console.error(err);
      setError(err.message || String(err));
    }
  }

  function ticketRow(t) {
    ensureChamadosState();
    const created = String(t.created_at || "").slice(0, 10);
    const active = state[KEY_CHAMADOS].selectedId === t.id;
    const due = t.due_date ? String(t.due_date).slice(0, 10) : "";
    const overdue = due ? (Date.now() > new Date(due + "T23:59:59").getTime()) : false;
    const st = String(t.status || "").toLowerCase();

    const dueLabel = due ? toBRDate(due) : "—";
    const duePill = overdue && st !== "finalizado" && st !== "cancelado"
      ? el("div", { class: "pill pill-danger mono" }, [esc(dueLabel)])
      : el("div", { class: "pill mono" }, [esc(dueLabel)]);

    const open = () => openChamado(t.id);

    // Garantia de clique: a linha inteira abre o ticket (além do botão).
    return el(
      "div",
      {
        class: "tr",
        onclick: (e) => {
          if (e && e.preventDefault) e.preventDefault();
          open();
        },
        style: "cursor:pointer;",
      },
      [
      el("div", { class: "td mono" }, [esc(created)]),
      el("div", { class: "td mono" }, [esc(ticketStatusLabel(t.status))]),
      el("div", { class: "td" }, [duePill]),
      el("div", { class: "td" }, [esc(t.description || "")]),
      el("div", { class: "td actions" }, [
        el(
          "button",
          {
            class: "btn btn-sm",
            type: "button",
            onclick: (e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              open();
            },
          },
          [active ? "Aberto" : "Abrir"]
        ),
      ]),
    ]
    );
  }

function renderChamadoDetailCard() {
    ensureChamadosState();

    // Modo "novo ticket"
    if (state[KEY_CHAMADOS].mode === "new") {
      const d = state[KEY_CHAMADOS].draft || {};
      const plans = state[KEY_CHAMADOS].slaPlans || [];

      return el("div", {}, [
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn", type: "button", onclick: () => { state[KEY_CHAMADOS].mode = "view"; refreshCurrent(); } }, ["Voltar"]),
          el("button", { class: "btn btn-primary", type: "button", onclick: async () => {
            try {
              await createChamadoFromDraft();
            } catch (e) {
              console.error(e);
              showToast("Erro ao criar ticket: " + (e?.message || e), "error");
            }
          } }, ["Criar ticket"]),
        ]),
        field("Nome do cliente", el("input", { class: "input", value: d.client_name || "", oninput: (e) => { state[KEY_CHAMADOS].draft.client_name = e.target.value; } })),
        field("Telefone", el("input", { class: "input", value: d.client_phone || "", placeholder: "DDD + número", oninput: (e) => { state[KEY_CHAMADOS].draft.client_phone = e.target.value; } })),
        field("Descrição", el("textarea", { class: "input", rows: "4", oninput: (e) => { state[KEY_CHAMADOS].draft.description = e.target.value; } }, [d.description || ""])),
        field(
          "Status inicial",
          el("select", { class: "input", onchange: (e) => { state[KEY_CHAMADOS].draft.status = e.target.value; } }, [
            el("option", { value: "aberto" }, ["Aberto"]),
            el("option", { value: "em_analise" }, ["Em Análise"]),
            el("option", { value: "em_andamento" }, ["Em andamento"]),
            el("option", { value: "aguardando_cliente" }, ["Aguardando cliente"]),
            el("option", { value: "finalizado" }, ["Finalizado"]),
            el("option", { value: "cancelado" }, ["Cancelado"]),
          ])
        ),
        field(
          "SLA (opcional)",
          el("select", { class: "input", onchange: (e) => { state[KEY_CHAMADOS].draft.sla_plan_id = e.target.value; } }, [
            el("option", { value: "" }, ["(sem SLA)"]),
            ...plans.map((p) => el("option", { value: p.id }, [`${p.name} — ${p.hours_to_expire}h`])),
          ])
        ),
        el("div", { class: "muted" }, ["Ao aplicar SLA, o sistema define o prazo automaticamente e marca atraso quando estourar."]),
      ]);
    }

    const t = state[KEY_CHAMADOS].selected;
    if (!t) return el("div", { class: "muted" }, ["Selecione um chamado ou clique em Novo."]);

    const created = fmtDT(t.created_at);
    const phone = t.client_phone ? String(t.client_phone) : "—";
    const name = t.client_name ? String(t.client_name) : "—";

    const sla = state[KEY_CHAMADOS].sla;
    const badge = slaBadge(sla);

    const statusSelect = el("select", {
      class: "input",
      onchange: (e) => { state[KEY_CHAMADOS]._pendingStatus = e.target.value; },
    }, [
      el("option", { value: "" }, ["(manter)"]),
      el("option", { value: "aberto" }, ["Aberto"]),
      el("option", { value: "em_analise" }, ["Em Análise"]),
      el("option", { value: "em_andamento" }, ["Em andamento"]),
      el("option", { value: "aguardando_cliente" }, ["Aguardando cliente"]),
      el("option", { value: "finalizado" }, ["Finalizado"]),
      el("option", { value: "cancelado" }, ["Cancelado"]),
    ]);

    setTimeout(() => { statusSelect.value = String(t.status || "aberto"); state[KEY_CHAMADOS]._pendingStatus = statusSelect.value; }, 0);

    const canApplySla = !["finalizado", "cancelado"].includes(String(t.status || "").toLowerCase());

    const slaBox = (() => {
      const plans = state[KEY_CHAMADOS].slaPlans || [];
      if (!sla) {
        const sel = el("select", { class: "input", id: "ticketSlaPlanSel" }, [
          el("option", { value: "" }, ["(selecione um plano)"]),
          ...plans.map((p) => el("option", { value: p.id }, [`${p.name} — ${p.hours_to_expire}h`])),
        ]);

        return el("div", {}, [
          el("div", { class: "row row-2" }, [
            field("SLA", sel),
            field("Status SLA", el("div", { class: badge.cls }, [esc(badge.text)])),
          ]),
          el("div", { class: "row-actions" }, [
            el("button", { class: "btn btn-primary", type: "button", disabled: !canApplySla, onclick: async () => {
              try {
                const v = document.getElementById("ticketSlaPlanSel")?.value || "";
                if (!v) return showToast("Selecione um plano de SLA.", "error");
                await applySlaToChamado(t.id, v);
                await openChamado(t.id);
              } catch (e) {
                console.error(e);
                showToast("Erro ao aplicar SLA: " + (e?.message || e), "error");
              }
            } }, ["Aplicar SLA"]),
          ]),
        ]);
      }

      const planName = sla.sla_plans?.name || "—";
      const deadline = fmtDT(sla.deadline_at);
      const remaining = slaRemainingText(sla);

      return el("div", {}, [
        el("div", { class: "row row-3" }, [
          field("Plano", el("div", { class: "pill" }, [esc(planName)])),
          field("Deadline", el("div", { class: "pill mono" }, [esc(deadline)])),
          field("Restante", el("div", { class: badge.cls + " mono" }, [esc(remaining + " • " + badge.text)])),
        ]),
        el("div", { class: "row-actions" }, [
          field("Novo plano", el("select", { class: "input", id: "ticketSlaPlanSel2" }, [
            el("option", { value: "" }, ["(selecione um plano)"]),
            ...plans.map((p) => el("option", { value: p.id }, [`${p.name} — ${p.hours_to_expire}h`])),
          ])),
          el("button", { class: "btn btn-primary", type: "button", disabled: !canApplySla, onclick: async () => {
            try {
              const v = document.getElementById("ticketSlaPlanSel2")?.value || "";
              if (!v) return showToast("Selecione um plano de SLA.", "error");
              await applySlaToChamado(t.id, v);
              await openChamado(t.id);
            } catch (e) {
              console.error(e);
              showToast("Erro ao reaplicar SLA: " + (e?.message || e), "error");
            }
          } }, ["Reaplicar SLA"]),

        ]),
      ]);
    })();

    const quoteBox = (() => {
      if (!state[KEY_CHAMADOS].quote) {
        return el("div", { class: "row-actions" }, [el("button", { class: "btn btn-primary", type: "button", onclick: () => ensureQuoteFromChamado(t.id) }, ["Gerar orçamento"])]);
      }

      const q = state[KEY_CHAMADOS].quote;
      return el("div", {}, [
        el("div", { class: "row row-3" }, [
          field("Orçamento", el("div", { class: "pill mono" }, [esc(q.id)])),
          field("Status", el("div", { class: "pill mono" }, [esc(quoteStatusLabel(q.status))])),
          field("Total", el("div", { class: "pill mono" }, [formatBRL(q.total)])),
        ]),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-primary", type: "button", onclick: () => { openOrcamento(q.id); setHash("orcamentos"); } }, ["Abrir orçamento"]),
        ]),
      ]);
    })();

    const msgRows = (state[KEY_CHAMADOS].timeline || []).map((e) => {
      const when = fmtDT(e.created_at);
      const who = e.author_type === "cliente" ? "Cliente" : e.author_type === "sistema" ? "Sistema" : "Equipe";
      const nm = e.author_name ? ` (${e.author_name})` : "";
      const title = e.title || e.event_type || "Evento";
      const body = e.body || "";

      return el("div", { class: "msg" }, [
        el("div", { class: "msg-head" }, [
          el("span", { class: "mono" }, [esc(when)]),
          " — ",
          esc(who + nm),
          title ? el("span", { class: "muted" }, [" • " + String(title)]) : el("span", {}, [""]),
        ]),
        el("div", { class: "msg-body" }, [esc(body)]),
      ]);
    });

    return el("div", {}, [
      el("div", { class: "row row-2" }, [
        field("Criado", el("div", { class: "pill mono" }, [esc(created)])),
        field("Cliente", el("div", { class: "pill" }, [esc(name)])),
      ]),
      el("div", { class: "row row-2" }, [
        field("Telefone", el("div", { class: "pill mono" }, [esc(phone)])),
        field("Status", el("div", {}, [
          statusSelect,
          el("div", { class: "row-actions" }, [
            el("button", { class: "btn btn-primary btn-sm", type: "button", onclick: async () => {
              try {
                const ns = state[KEY_CHAMADOS]._pendingStatus;
                if (!ns) return;
                await updateChamadoStatus(t.id, ns);
              } catch (e) {
                console.error(e);
                showToast("Erro ao atualizar status: " + (e?.message || e), "error");
              }
            } }, ["Salvar status"]),
          ]),
        ])),
      ]),
      field("Descrição", el("div", { class: "box" }, [esc(t.description || "")])),
      el("hr", { class: "sep" }),
      el("h3", { class: "h3" }, ["SLA"]),
      slaBox,
      el("hr", { class: "sep" }),
      el("h3", { class: "h3" }, ["Orçamento"]),
      quoteBox,
      el("hr", { class: "sep" }),
      el("h3", { class: "h3" }, ["Timeline"]),
      el("div", { class: "msg-compose" }, [
        el("textarea", {
          id: "ticketMessage",
          name: "ticketMessage",
          class: "input",
          placeholder: "Escreva uma mensagem e clique em Enviar…",
          rows: "3",
          oninput: (e) => {
            state[KEY_CHAMADOS].newMessageText = e.target.value;
            const btn = document.getElementById("ticketSendBtn");
            if (btn) btn.disabled = !String(e.target.value || "").trim();
          },
        }, [state[KEY_CHAMADOS].newMessageText || ""]),
        (() => {
          const disabled = !((state[KEY_CHAMADOS].newMessageText || "").trim());
          return el("button", { id: "ticketSendBtn", class: "btn btn-primary", type: "button", disabled, onclick: () => sendChamadoMessage() }, ["Enviar"]);
        })(),
      ]),
      msgRows.length ? el("div", { class: "msg-list" }, msgRows) : el("div", { class: "muted" }, ["Sem mensagens ainda."]),
    ]);
  }

function renderChamados() {
    ensureChamadosState();
    setTitle(LABEL_CHAMADOS);
    setActiveNav(KEY_CHAMADOS);

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-4" }, [
      field("Buscar", el("input", { class: "input", value: state[KEY_CHAMADOS].search, placeholder: "nome, telefone ou descrição...", oninput: (e) => (state[KEY_CHAMADOS].search = e.target.value) })),
      field(
        "Status",
        el(
          "select",
          { class: "input", onchange: (e) => (state[KEY_CHAMADOS].status = e.target.value) },
          [
            el("option", { value: "" }, ["(todos)"]),
            el("option", { value: "aberto" }, ["Aberto"]),
            el("option", { value: "em_analise" }, ["Em Análise"]),
            el("option", { value: "em_andamento" }, ["Em andamento"]),
            el("option", { value: "aguardando_cliente" }, ["Aguardando cliente"]),
            el("option", { value: "finalizado" }, ["Finalizado"]),
            el("option", { value: "cancelado" }, ["Cancelado"]),
          ]
        )
      ),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", onclick: () => { state[KEY_CHAMADOS].mode = "new"; refreshCurrent(); } }, ["Novo chamado"]),
        el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Aplicar / Recarregar"]),
      ]),
      el("div", {}, []),
    ]);

    setTimeout(() => {
      const sel = $("select.input", topRow);
      if (sel) sel.value = state[KEY_CHAMADOS].status || "";
    }, 0);

    const layout = el("div", { class: "row row-2" }, [
      el("div", { class: "section" }, [
        el("h3", { class: "h3" }, ["Lista de chamados"]),
        el("div", { class: "table" }, [
          el("div", { class: "thead" }, [
            el("div", { class: "th" }, ["Criado"]),
            el("div", { class: "th" }, ["Status"]),
            el("div", { class: "th" }, ["Prazo"]),
            el("div", { class: "th" }, ["Descrição"]),
            el("div", { class: "th" }, ["Ações"]),
          ]),
          el("div", { class: "tbody" }, state[KEY_CHAMADOS].rows.map((t) => ticketRow(t))),
        ]),
      ]),
      el("div", { class: "section" }, [el("h3", { class: "h3" }, ["Detalhe do chamado"]), renderChamadoDetailCard()]),
    ]);

    body.appendChild(el("div", { class: "muted" }, [`Chamados carregados: ${state[KEY_CHAMADOS].rows.length}`]));
    body.appendChild(topRow);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(layout);
  }

// =========================
  // OS / WORKORDERS (NOVO)
  // =========================
  async function loadWorkorders() {
    state.workorders.loading = true;
    setError("");
    setStatus("Carregando OS...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    const { data, error } = await sb
      .from("workorders")
      .select("id, company_id, ticket_id, client_id, quote_id, desc, status, due_date, priority, responsible_user_id, notes, created_at, updated_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    let rows = data || [];
    const s = String(state.workorders.search || "").trim().toLowerCase();
    const st = String(state.workorders.status || "").trim().toLowerCase();

    if (st) rows = rows.filter((r) => String(r.status || "").toLowerCase() === st);

    if (s) {
      rows = rows.filter((r) => {
        const a = String(r.desc || "").toLowerCase();
        const b = String(r.id || "").toLowerCase();
        const c = String(r.ticket_id || "").toLowerCase();
        return a.includes(s) || b.includes(s) || c.includes(s);
      });
    }

    state.workorders.rows = rows;

    if (!state.workorders.selectedId && rows[0]?.id) {
      state.workorders.selectedId = rows[0].id;
      await openWorkorder(state.workorders.selectedId, { silentRender: true });
    }

    setStatus(`OS carregadas: ${rows.length}`, "ok");
    state.workorders.loading = false;
  }

  async function openWorkorder(id, opts = {}) {
    const sb = assertSB();
    const cid = state.session.companyId;

    const { data, error } = await sb
      .from("workorders")
      .select("id, company_id, ticket_id, client_id, quote_id, desc, status, due_date, priority, responsible_user_id, notes, created_at, updated_at")
      .eq("company_id", cid)
      .eq("id", id)
      .single();

    if (error) throw error;

    state.workorders.selectedId = id;
    state.workorders.selected = data || null;

    state.workorders._edit.status = data?.status || "";
    state.workorders._edit.priority = data?.priority || "normal";
    state.workorders._edit.due_date = data?.due_date ? String(data.due_date).slice(0, 10) : "";
    state.workorders._edit.notes = data?.notes || "";

    if (!opts.silentRender) refreshRouteRenderOnly();
  }

  async function saveWorkorder() {
    try {
      setError("");
      const sb = assertSB();
      const cid = state.session.companyId;
      const w = state.workorders.selected;
      if (!w?.id) return;

      const patch = {
        status: String(state.workorders._edit.status || w.status || "aberta"),
        priority: String(state.workorders._edit.priority || w.priority || "normal"),
        due_date: state.workorders._edit.due_date ? String(state.workorders._edit.due_date) : null,
        notes: String(state.workorders._edit.notes || ""),
        updated_at: new Date().toISOString(),
      };

      setStatus("Salvando OS...", "info");
      const { error } = await sb.from("workorders").update(patch).eq("company_id", cid).eq("id", w.id);
      if (error) throw error;

      setStatus("OS salva.", "ok");
      await loadWorkorders();
      await openWorkorder(w.id, { silentRender: true });
      renderWorkorders();
    } catch (e) {
      console.error("[os] save error", e);
      setError(e?.message || "Erro ao salvar OS.");
    }
  }

  function workorderRow(w) {
    const created = String(w.created_at || "").slice(0, 10);
    const active = state.workorders.selectedId === w.id;
    return el("div", { class: "tr" }, [
      el("div", { class: "td mono" }, [esc(created)]),
      el("div", { class: "td mono" }, [esc(workorderStatusLabel(w.status))]),
      el("div", { class: "td" }, [esc(w.desc || "")]),
      el("div", { class: "td actions" }, [
        el("button", { class: "btn btn-sm", type: "button", onclick: () => openWorkorder(w.id) }, [active ? "Aberto" : "Abrir"]),
      ]),
    ]);
  }

  function renderWorkorderDetailCard() {
    const w = state.workorders.selected;
    if (!w) return el("div", { class: "muted" }, ["Selecione uma OS."]);

    const created = String(w.created_at || "").replace("T", " ").slice(0, 16);

    
      // Compras vinculadas
      const prow = state.workorders.purchases || { rows: [], total: 0, loading: false };
      const purchasesBox = el("div", { class: "section" }, [
        el("h4", { class: "h4" }, ["Compras vinculadas"]),
        el("div", { class: "muted" }, [
          prow.loading ? "Carregando compras..." : `Total compras: ${fmtBRL(prow.total || 0)} • Itens: ${(prow.rows || []).length}`,
        ]),
        el(
          "div",
          { class: "table" },
          [
            el("div", { class: "thead" }, [
              el("div", { class: "th" }, ["Data"]),
              el("div", { class: "th" }, ["Status"]),
              el("div", { class: "th" }, ["Descrição"]),
              el("div", { class: "th" }, ["Valor"]),
            ]),
            el(
              "div",
              { class: "tbody" },
              (prow.rows || []).map((p) =>
                el("div", { class: "tr" }, [
                  el("div", { class: "td" }, [fmtDate(p.date || p.created_at)]),
                  el("div", { class: "td" }, [String(p.status || "")]),
                  el("div", { class: "td" }, [String(p.description || "")]),
                  el("div", { class: "td" }, [fmtBRL(p.value ?? p.total ?? 0)]),
                ])
              )
            ),
          ]
        ),
      ]);

    return el("div", {}, [
      el("div", { class: "row row-3" }, [
        field("Criado", el("div", { class: "pill mono" }, [esc(created)])),
        field("Chamado", el("div", { class: "pill mono" }, [esc(w.ticket_id || "—")])),
        field("Orçamento", el("div", { class: "pill mono" }, [esc(w.quote_id || "—")])),
      ]),
      el("div", { class: "row row-3" }, [
        field(
          "Status",
          el(
            "select",
            { class: "input", value: state.workorders._edit.status, onchange: (e) => (state.workorders._edit.status = e.target.value) },
            [
              el("option", { value: "aberta", selected: (state.workorders._edit.status || w.status) === "aberta" }, ["Aberta"]),
              el("option", { value: "em_andamento", selected: (state.workorders._edit.status || w.status) === "em_andamento" }, ["Em andamento"]),
              el("option", { value: "aguardando_cliente", selected: (state.workorders._edit.status || w.status) === "aguardando_cliente" }, ["Aguardando cliente"]),
              el("option", { value: "finalizada", selected: (state.workorders._edit.status || w.status) === "finalizada" }, ["Finalizada"]),
              el("option", { value: "cancelada", selected: (state.workorders._edit.status || w.status) === "cancelada" }, ["Cancelada"]),
            ]
          )
        ),
        field(
          "Prioridade",
          el(
            "select",
            { class: "input", onchange: (e) => (state.workorders._edit.priority = e.target.value) },
            [
              el("option", { value: "low", selected: (state.workorders._edit.priority || w.priority) === "low" }, ["Baixa"]),
              el("option", { value: "normal", selected: (state.workorders._edit.priority || w.priority) === "normal" }, ["Normal"]),
              el("option", { value: "high", selected: (state.workorders._edit.priority || w.priority) === "high" }, ["Alta"]),
              el("option", { value: "urgent", selected: (state.workorders._edit.priority || w.priority) === "urgent" }, ["Urgente"]),
            ]
          )
        ),
        field(
          "Vencimento",
          el("input", {
            class: "input",
            type: "date",
            value: state.workorders._edit.due_date || "",
            oninput: (e) => (state.workorders._edit.due_date = e.target.value),
          })
        ),
      ]),
      field("Descrição", el("div", { class: "box" }, [esc(w.desc || "")])),
      field(
        "Notas",
        el("textarea", {
          class: "input",
          rows: "4",
          oninput: (e) => (state.workorders._edit.notes = e.target.value),
        }, [state.workorders._edit.notes || ""])
      ),
      purchasesBox,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", onclick: saveWorkorder }, ["Salvar Ordem de Serviço"]),
        w.quote_id
          ? el("button", { class: "btn", type: "button", onclick: () => { openOrcamento(w.quote_id); setHash("orcamentos"); } }, ["Abrir orçamento"])
          : el("span", {}, []),
        w.ticket_id
          ? el("button", { class: "btn", type: "button", onclick: () => { openChamado(w.ticket_id); setHash(KEY_CHAMADOS); } }, ["Abrir ticket"])
          : el("span", {}, []),
      ]),
    ]);
  }

  function renderWorkorders() {
    setTitle(LABEL_ORDEM_SERVICO);
    setActiveNav("os");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field("Buscar", el("input", { class: "input", value: state.workorders.search, placeholder: "id, ticket, descrição...", oninput: (e) => (state.workorders.search = e.target.value) })),
      field(
        "Status",
        el(
          "select",
          { class: "input", onchange: (e) => (state.workorders.status = e.target.value) },
          [
            el("option", { value: "" }, ["(todos)"]),
            el("option", { value: "aberta" }, ["Aberta"]),
            el("option", { value: "em_andamento" }, ["Em andamento"]),
            el("option", { value: "aguardando_cliente" }, ["Aguardando cliente"]),
            el("option", { value: "finalizada" }, ["Finalizada"]),
            el("option", { value: "cancelada" }, ["Cancelada"]),
          ]
        )
      ),
      el("div", { class: "row-actions" }, [el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Aplicar / Recarregar"])]),
    ]);

    const layout = el("div", { class: "row row-2" }, [
      el("div", { class: "section" }, [
        el("h3", { class: "h3" }, ["Lista de Ordem de Serviço"]),
        el("div", { class: "table" }, [
          el("div", { class: "thead" }, [
            el("div", { class: "th" }, ["Criado"]),
            el("div", { class: "th" }, ["Status"]),
            el("div", { class: "th" }, ["Descrição"]),
            el("div", { class: "th" }, ["Ações"]),
          ]),
          el("div", { class: "tbody" }, state.workorders.rows.map((w) => workorderRow(w))),
        ]),
      ]),
      el("div", { class: "section" }, [el("h3", { class: "h3" }, ["Detalhe da Ordem de Serviço"]), renderWorkorderDetailCard()]),
    ]);

    body.appendChild(el("div", { class: "muted" }, [`OS carregadas: ${state.workorders.rows.length}`]));
    body.appendChild(topRow);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(layout);
  }

    

  function defaultConfigState() {
    return {
      loading: false,
      error: null,
      company: null,
      plans: [],
      users: [],
      draft: {},
      newPlan: { name: '', hours_to_expire: '' },
    };
  }

  function ensureConfigState() {
    if (!state.config || typeof state.config !== 'object') {
      state.config = defaultConfigState();
    } else {
      // Garante sub-objetos obrigatórios (evita crash em rotas antigas / cache)
      state.config.draft = state.config.draft && typeof state.config.draft === 'object' ? state.config.draft : {};
      state.config.newPlan = state.config.newPlan && typeof state.config.newPlan === 'object' ? state.config.newPlan : { name: '', hours_to_expire: '' };
      if (!('loading' in state.config)) state.config.loading = false;
      if (!('error' in state.config)) state.config.error = null;
      if (!('company' in state.config)) state.config.company = null;
      if (!Array.isArray(state.config.plans)) state.config.plans = [];
      if (!Array.isArray(state.config.users)) state.config.users = [];
    }
    return state.config;
  }

  // =========================
  // Config
  // =========================
  async function loadConfigData() {
    const cfg = ensureConfigState();
    try {
      const sb = assertSB();
      const companyId = state.session.companyId;
      if (!companyId) throw new Error('companyId ausente');

      cfg.loading = true;
      cfg.error = null;
      refreshRoute();

      const [cRes, pRes, uRes] = await Promise.all([
        sb.from('companies').select('*').eq('id', companyId).single(),
        sb.from('sla_plans').select('id,name,hours_to_expire,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
        sb.from('company_users').select('id,user_id,role,created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
      ]);

      if (cRes?.error) throw cRes.error;
      if (pRes?.error) throw pRes.error;
      if (uRes?.error) throw uRes.error;

      cfg.company = cRes.data || null;
      cfg.plans = Array.isArray(pRes.data) ? pRes.data : [];
      cfg.users = Array.isArray(uRes.data) ? uRes.data : [];

      // espelha draft inicial (edição local)
      cfg.draft = {
        name: cfg.company?.name ?? '',
        phone: cfg.company?.phone ?? '',
        address: cfg.company?.address ?? '',
      };

      cfg.loading = false;
      cfg.error = null;
      refreshRoute();
    } catch (e) {
      cfg.loading = false;
      cfg.error = (e && (e.message || e.error_description)) ? (e.message || e.error_description) : String(e);
      refreshRoute();
    }
  }

// =========================
  // Compras (CRUD + Itens + vínculo com OS)
  // =========================
  async function loadCompras() {
    state.compras.loading = true;
    state.compras.rows = [];
    setError("");
    setStatus("Carregando compras...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    const { data, error } = await sb
      .from("purchases")
      .select("id, workorder_id, description, status, date, value, subtotal, total, invoice_number, paid_at, created_at")
      .eq("company_id", cid)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    state.compras.rows = data || [];

    // Opções de OS para vínculo (dropdown)
    const { data: wdata, error: werr } = await sb
      .from("workorders")
      .select("id, desc, status, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(200);

    if (werr) throw werr;
    state.compras.workordersOptions = wdata || [];

    // Se havia seleção, re-hidrata do array
    if (state.compras.selectedId) {
      state.compras.selected = (state.compras.rows || []).find((r) => String(r.id) === String(state.compras.selectedId)) || null;
      if (state.compras.selected) {
        await loadCompraItems(state.compras.selected.id);
      } else {
        state.compras.selectedId = null;
        state.compras.items = [];
      }
    }

    state.compras.loading = false;
    setStatus("");
  }

  async function loadCompraItems(purchaseId) {
    state.compras.items = [];
    if (!purchaseId) return;

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    const { data, error } = await sb
      .from("purchase_items")
      .select("id, purchase_id, item_type, description, unit, qty, unit_cost, line_total, created_at")
      .eq("company_id", cid)
      .eq("purchase_id", purchaseId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    state.compras.items = data || [];
  }

  function calcCompraSubtotal(items) {
    return (items || []).reduce((acc, it) => {
      const q = Number(it.qty ?? 0);
      const uc = Number(it.unit_cost ?? 0);
      const lt = Number.isFinite(Number(it.line_total)) ? Number(it.line_total) : q * uc;
      return acc + (Number.isFinite(lt) ? lt : 0);
    }, 0);
  }

  async function recalcCompraTotals(purchaseId) {
    if (!purchaseId) return;

    const items = state.compras.items || [];
    const subtotal = calcCompraSubtotal(items);
    const total = subtotal; // sem impostos/descontos por enquanto
    const value = total;

    const sb = assertSB();
    const { error } = await sb.from("purchases").update({ subtotal, total, value }).eq("id", purchaseId);
    if (error) throw error;

    // Atualiza no estado (lista + selecionado)
    const row = (state.compras.rows || []).find((r) => String(r.id) === String(purchaseId));
    if (row) {
      row.subtotal = subtotal;
      row.total = total;
      row.value = value;
    }
    if (state.compras.selected && String(state.compras.selected.id) === String(purchaseId)) {
      state.compras.selected.subtotal = subtotal;
      state.compras.selected.total = total;
      state.compras.selected.value = value;
    }
  }

  async function createCompra() {
    setError("");
    setStatus("Criando compra...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const isoDate = `${yyyy}-${mm}-${dd}`;

    // CHECK purchases_value_check:
    // - status 'draft' permite value = 0
    // - status != 'draft' exige value > 0
    const payload = {
      company_id: cid,
      description: "Nova compra",
      status: "draft",
      date: isoDate,
      value: 0,
      subtotal: 0,
      total: 0,
      workorder_id: null,
      invoice_number: null,
    };

    const { data, error } = await sb
      .from("purchases")
      .insert(payload)
      .select("id, workorder_id, description, status, date, value, subtotal, total, invoice_number, paid_at, created_at")
      .single();

    if (error) throw error;

    await loadCompras();
    state.compras.selectedId = data.id;
    state.compras.selected = data;
    state.compras.items = [];
    setStatus("Compra criada.", "ok");
    return data;
  }

  async function deleteCompra(id) {
    if (!id) return;
    if (!confirm("Excluir esta compra?")) return;

    setError("");
    setStatus("Excluindo compra...", "info");

    const sb = assertSB();
    const { error } = await sb.from("purchases").delete().eq("id", id);
    if (error) throw error;

    if (String(state.compras.selectedId || "") === String(id)) {
      state.compras.selectedId = null;
      state.compras.selected = null;
      state.compras.items = [];
    }

    await loadCompras();
    setStatus("Compra excluída.", "ok");
  }

  async function openCompra(id) {
    state.compras.selectedId = id || null;
    state.compras.selected = (state.compras.rows || []).find((r) => String(r.id) === String(id)) || null;
    setError("");
    setStatus("");

    if (state.compras.selected) {
      await loadCompraItems(state.compras.selected.id);
    } else {
      state.compras.items = [];
    }
    renderCompras();
  }

  async function saveCompraBasics(purchaseId, patch) {
    if (!purchaseId) return;
    const sb = assertSB();

    const { error } = await sb.from("purchases").update(patch).eq("id", purchaseId);
    if (error) throw error;

    // Atualiza estado local
    const row = (state.compras.rows || []).find((r) => String(r.id) === String(purchaseId));
    if (row) Object.assign(row, patch);
    if (state.compras.selected && String(state.compras.selected.id) === String(purchaseId)) Object.assign(state.compras.selected, patch);
  }

  async function addCompraItem(purchaseId) {
    try {
      const sb = assertSB();
      const type = ($("#compraItemTipo")?.value || "Material").trim();
      const desc = ($("#compraItemDesc")?.value || "").trim();
      const unit = ($("#compraItemUnit")?.value || "").trim();
      const qtyRaw = ($("#compraItemQty")?.value || "1").trim();
      const unitCostRaw = ($("#compraItemUnitCost")?.value || "0").trim();

      if (!purchaseId) return showToast("Selecione uma compra", "warn");
      if (!desc) return showToast("Informe a descrição do item", "warn");

      const qty = Math.max(0, parseFloat((qtyRaw || "0").replace(',', '.')) || 0);
      const unitCost = Math.max(0, parseMoney(unitCostRaw) || 0);

      if (qty <= 0) return showToast("Qtd deve ser maior que zero", "warn");

      // OBS: line_total é coluna gerada no Postgres (generated column).
      // Não podemos inserir valor nela; o banco calcula automaticamente.
      const { error } = await sb.from("purchase_items").insert({
        company_id: state.session.companyId,
        purchase_id: purchaseId,
        item_type: type || "Material",
        description: desc,
        unit: unit || null,
        qty,
        unit_cost: unitCost,
      });
      if (error) throw error;

      const elDesc = $("#compraItemDesc");
      const elUnit = $("#compraItemUnit");
      const elQty = $("#compraItemQty");
      const elUC = $("#compraItemUnitCost");
      if (elDesc) elDesc.value = "";
      if (elUnit) elUnit.value = "";
      if (elQty) elQty.value = "1";
      if (elUC) elUC.value = "0";

      showToast("Item adicionado", "ok");

      await reloadComprasKeepSelected(purchaseId);
    } catch (e) {
      console.error(e);
      showToast(e?.message || String(e), "err");
    }
  }

  async function deleteCompraItem(itemId) {
    try {
      const sb = assertSB();
      const companyId = state.session.companyId;
      if (!companyId) throw new Error("companyId ausente");
      const purchaseId = state.compras?.selected?.id;
      if (!purchaseId) throw new Error("Nenhuma compra selecionada");

      const { error } = await sb
        .from("purchase_items")
        .delete()
        .eq("id", itemId)
        .eq("company_id", companyId);
      if (error) throw error;

      showToast("Item removido", "ok");
      await reloadComprasKeepSelected(purchaseId);
    } catch (e) {
      console.error(e);
      showToast(e?.message || String(e), "err");
    }
  }

  async function reloadComprasKeepSelected(purchaseId) {
    const keepId = purchaseId || state.compras?.selected?.id;
    await loadCompras();
    if (keepId) {
      // re-hidrata seleção a partir da lista atual (rows)
      state.compras.selectedId = keepId;
      state.compras.selected =
        (state.compras.rows || []).find((x) => String(x.id) === String(keepId)) || state.compras.selected;

      // itens + totais (salva em purchases.value/subtotal/total)
      await loadCompraItems(keepId);
      await recalcCompraTotals(keepId);
    }
    refreshRouteRenderOnly();
  }

  function renderCompras() {
    setTitle("Compras");
    setActiveNav("compras");
    const body = $("#pageBody");
    body.innerHTML = "";

    body.appendChild(el("div", { class: "muted" }, ["Compras: lista, vínculo com OS e itens."]));

    // Ações
    body.appendChild(
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Recarregar"]),
        el(
          "button",
          {
            class: "btn btn-primary",
            type: "button",
            onclick: async () => {
              try {
                await createCompra();
                await refreshCurrent();
                renderCompras();
              } catch (e) {
                const msg = e?.message || String(e);
                setError(msg);
                showToast(msg, "error");
              }
            },
          },
          ["Criar compra"]
        ),
      ])
    );

    // Filtros
    const search = el("input", {
      class: "input",
      placeholder: "Buscar (descrição/fornecedor)",
      value: state.compras.search || "",
    });

    const status = el("select", { class: "input" }, [
      el("option", { value: "" }, ["(todos)"]),
      el("option", { value: "draft", selected: state.compras.status === "draft" }, ["draft"]),
      el("option", { value: "paid", selected: state.compras.status === "paid" }, ["paid"]),
      el("option", { value: "canceled", selected: state.compras.status === "canceled" }, ["canceled"]),
    ]);

    const apply = el(
      "button",
      {
        class: "btn",
        type: "button",
        onclick: () => {
          state.compras.search = search.value || "";
          state.compras.status = status.value || "";
          renderCompras();
        },
      },
      ["Aplicar filtro"]
    );

    body.appendChild(
      el("div", { class: "section" }, [
        el("div", { class: "row" }, [
          el("div", { style: "flex:1" }, [el("div", { class: "muted" }, ["Buscar (descrição/fornecedor)"]), search]),
          el("div", { style: "width:220px" }, [el("div", { class: "muted" }, ["Status"]), status]),
          el("div", { style: "display:flex;align-items:flex-end" }, [apply]),
        ]),
      ])
    );

    const all = state.compras.rows || [];
    const q = (state.compras.search || "").trim().toLowerCase();
    const st = (state.compras.status || "").trim();

    const rows = all.filter((r) => {
      const okQ = !q || String(r.description || "").toLowerCase().includes(q) || String(r.invoice_number || "").toLowerCase().includes(q);
      const okS = !st || String(r.status || "") === st;
      return okQ && okS;
    });

    body.appendChild(
      el("div", { class: "section" }, [
        el("h3", { class: "h3" }, ["Compras (lista)"]),
        el("div", { class: "muted" }, [`Registros carregados: ${rows.length}`]),
      ])
    );

    const table = el("table", { class: "table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, ["Data"]),
          el("th", {}, ["Status"]),
          el("th", {}, [LABEL_ORDEM_SERVICO]),
          el("th", {}, ["Fornecedor"]),
          el("th", {}, ["Descrição"]),
          el("th", {}, ["Valor"]),
          el("th", {}, ["Ações"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        rows.map((r) =>
          el("tr", { class: String(state.compras.selectedId || "") === String(r.id) ? "row-active" : "" }, [
            el("td", {}, [fmtDate(r.date || r.created_at)]),
            el("td", {}, [String(r.status || "")]),
            el("td", {}, [
              (function () {
                const opts = state.compras.workordersOptions || [];
                const sel = el(
                  "select",
                  {
                    class: "input input-sm",
                    onchange: (e) => {
                      const v = e.target.value || "";
                      setCompraWorkorder(r.id, v || null).catch((err) => {
                        const msg = err?.message || String(err);
                        setError(msg);
                        showToast(msg, "error");
                        refreshCurrent();
                      });
                    },
                  },
                  [
                    el("option", { value: "" }, ["(sem OS)"]),
                    ...opts.map((w) =>
                      el("option", { value: w.id, selected: String(r.workorder_id || "") === String(w.id) }, [fmtOSLabel(w)])
                    ),
                  ]
                );
                return sel;
              })(),
            ]),
            el("td", {}, [splitVendorDesc(String(r.description || "")).vendor || "—"]),
            el("td", {}, [splitVendorDesc(String(r.description || "")).desc || "—"]),
            el("td", {}, [fmtBRL(r.value ?? r.total ?? 0)]),
            el("td", {}, [
              el(
                "button",
                { class: "btn btn-sm", type: "button", onclick: () => openCompra(r.id).catch((e) => showToast(e?.message || String(e), "error")) },
                ["Abrir"]
              ),
              el(
                "button",
                {
                  class: "btn btn-danger btn-sm",
                  type: "button",
                  style: "margin-left:8px",
                  onclick: () =>
                    deleteCompra(r.id).catch((e) => {
                      const msg = e?.message || String(e);
                      setError(msg);
                      showToast(msg, "error");
                    }),
                },
                ["Excluir"]
              ),
            ]),
          ])
        )
      ),
    ]);

    // Layout: lista + detalhe
    const layout = el("div", { class: "row row-2" }, [
      el("div", { class: "section" }, [table]),
      el("div", { class: "section" }, [el("h3", { class: "h3" }, ["Detalhe da compra"]), renderCompraDetail()]),
    ]);

    body.appendChild(layout);
  }

  function renderCompraDetail() {
    const compra = state.compras.selected;
    if (!compra) return el("div", { class: "muted" }, ["Selecione uma compra (Abrir)."]);

    const opts = state.compras.workordersOptions || [];

    // Campos básicos
    const vd = splitVendorDesc(String(compra.description || ""));
    const inpVendor = el("input", { class: "input", value: vd.vendor || "", placeholder: "Fornecedor" });
    const inpDesc = el("input", { class: "input", value: vd.desc || "", placeholder: "Descrição" });
    const inpDate = el("input", { class: "input", type: "date", value: (compra.date || "").slice(0, 10) || "" });
    const inpInv = el("input", { class: "input", value: compra.invoice_number || "" });

    const selStatus = el("select", { class: "input" }, [
      el("option", { value: "draft", selected: compra.status === "draft" }, ["draft"]),
      el("option", { value: "paid", selected: compra.status === "paid" }, ["paid"]),
      el("option", { value: "canceled", selected: compra.status === "canceled" }, ["canceled"]),
    ]);

    const selOS = el(
      "select",
      { class: "input" },
      [
        el("option", { value: "" }, ["(sem OS)"]),
        ...opts.map((w) => el("option", { value: w.id, selected: String(compra.workorder_id || "") === String(w.id) }, [fmtOSLabel(w)])),
      ]
    );

    const btnSave = el(
      "button",
      {
        class: "btn btn-primary",
        type: "button",
        onclick: async () => {
          try {
            const patch = {
              description: joinVendorDesc(inpVendor.value, inpDesc.value),
              date: inpDate.value || null,
              invoice_number: inpInv.value || null,
              status: selStatus.value || "draft",
              workorder_id: selOS.value || null,
            };

            // Se sair de draft, garante value > 0 (regra de CHECK do banco)
            if (patch.status !== "draft") {
              const v = Number(compra.value ?? compra.total ?? 0);
              if (!Number.isFinite(v) || v <= 0) {
                showToast("Para status diferente de 'draft', a compra precisa ter valor > 0. Adicione itens antes.", "error");
                return;
              }
            }

            await saveCompraBasics(compra.id, patch);
            showToast("Compra atualizada.", "ok");
            await loadCompras();
            renderCompras();
          } catch (e) {
            showToast(e?.message || String(e), "error");
          }
        },
      },
      ["Salvar"]
    );

    // Itens
    const items = state.compras.items || [];
    const subtotal = calcCompraSubtotal(items);

    const newType = el("select", { class: "input input-sm", onchange: (e) => (state.compras._newItemType = e.target.value) }, [
      el("option", { value: "material", selected: state.compras._newItemType === "material" }, ["Material"]),
      el("option", { value: "servico", selected: state.compras._newItemType === "servico" }, ["Serviço"]),
      el("option", { value: "outros", selected: state.compras._newItemType === "outros" }, ["Outros"]),
    ]);

    const newDesc = el("input", {
      class: "input input-sm",
      placeholder: "Descrição",
      value: state.compras._newItemDesc || "",
      oninput: (e) => (state.compras._newItemDesc = e.target.value),
    });

    const newUnit = el("input", {
      class: "input input-sm",
      placeholder: "Unid (ex: un / m / kg)",
      value: state.compras._newItemUnit || "",
      oninput: (e) => (state.compras._newItemUnit = e.target.value),
    });

    const newQty = el("input", {
      class: "input input-sm",
      placeholder: "Qtd",
      value: state.compras._newItemQty || "1",
      oninput: (e) => (state.compras._newItemQty = e.target.value),
    });

    const newUC = el("input", {
      class: "input input-sm",
      placeholder: "Custo un.",
      value: state.compras._newItemUnitCost || "0",
      oninput: (e) => (state.compras._newItemUnitCost = e.target.value),
    });

    const btnAdd = el(
      "button",
      {
        class: "btn btn-primary btn-sm",
        type: "button",
        onclick: async () => {
          try {
            await addCompraItem(compra.id);
            await loadCompras(); // atualiza totais na lista
            renderCompras();
          } catch (e) {
            showToast(e?.message || String(e), "error");
          }
        },
      },
      ["Adicionar item"]
    );

    const itemsTable = el("table", { class: "table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", {}, ["Tipo"]),
          el("th", {}, ["Descrição"]),
          el("th", {}, ["Qtd"]),
          el("th", {}, ["Unid"]),
          el("th", {}, ["Custo un."]),
          el("th", {}, ["Total"]),
          el("th", {}, ["Ações"]),
        ]),
      ]),
      el(
        "tbody",
        {},
        items.map((it) =>
          el("tr", {}, [
            el("td", {}, [String(it.item_type || "")]),
            el("td", {}, [String(it.description || "")]),
            el("td", {}, [String(it.qty ?? "")]),
            el("td", {}, [String(it.unit || "")]),
            el("td", {}, [fmtBRL(Number(it.unit_cost ?? 0))]),
            el("td", {}, [fmtBRL(Number(it.line_total ?? (Number(it.qty ?? 0) * Number(it.unit_cost ?? 0))))]),
            el("td", {}, [
              el(
                "button",
                {
                  class: "btn btn-danger btn-sm",
                  type: "button",
                  onclick: async () => {
                    try {
                      await deleteCompraItem(it.id);
                      await loadCompras();
                      renderCompras();
                    } catch (e) {
                      showToast(e?.message || String(e), "error");
                    }
                  },
                },
                ["Excluir"]
              ),
            ]),
          ])
        )
      ),
    ]);

    const totalsRow = el("div", { class: "row", style: "gap:12px; align-items:center; justify-content:flex-end" }, [
      el("div", { class: "mono" }, [`Subtotal: ${fmtBRL(subtotal)}`]),
      el("div", { class: "mono" }, [`Total: ${fmtBRL(subtotal)}`]),
    ]);

    const formRow = el("div", { class: "row", style: "gap:10px; align-items:flex-end" }, [
      el("div", { style: "width:140px" }, [el("div", { class: "muted" }, ["Tipo"]), newType]),
      el("div", { style: "flex:1" }, [el("div", { class: "muted" }, ["Descrição"]), newDesc]),
      el("div", { style: "width:160px" }, [el("div", { class: "muted" }, ["Unidade"]), newUnit]),
      el("div", { style: "width:100px" }, [el("div", { class: "muted" }, ["Qtd"]), newQty]),
      el("div", { style: "width:130px" }, [el("div", { class: "muted" }, ["Custo un."]), newUC]),
      el("div", {}, [btnAdd]),
    ]);

    return el("div", {}, [
      el("div", { class: "row", style: "gap:12px; align-items:flex-end" }, [
        el("div", { style: "width:240px" }, [el("div", { class: "muted" }, ["Fornecedor"]), inpVendor]),
        el("div", { style: "flex:1" }, [el("div", { class: "muted" }, ["Descrição"]), inpDesc]),
        el("div", { style: "width:180px" }, [el("div", { class: "muted" }, ["Data"]), inpDate]),
      ]),
      el("div", { class: "row", style: "gap:12px; align-items:flex-end; margin-top:10px" }, [
        el("div", { style: "flex:1" }, [el("div", { class: "muted" }, ["Nota / NF"]), inpInv]),
        el("div", { style: "width:180px" }, [el("div", { class: "muted" }, ["Status"]), selStatus]),
        el("div", { style: "width:260px" }, [el("div", { class: "muted" }, ["OS vinculada"]), selOS]),
        el("div", {}, [btnSave]),
      ]),
      el("hr", { class: "sep" }),
      el("h3", { class: "h3" }, ["Itens"]),
      formRow,
      el("div", { style: "margin-top:12px" }, [itemsTable]),
      totalsRow,
    ]);
  }

// =========================
  // Config
  // =========================

// =========================
  // Config
  // =========================
  function renderConfig() {
    setTitle('Config');
    setActiveNav('config');
    const body = $('#pageBody');
    body.innerHTML = '';

    // Primeiro paint da rota: ainda não há dados em state.config.
    // Dispara o load e mostra um card simples de carregamento.
    if (!state.config.company && !state.config.loading && !state.config.draft) {
      loadConfigData();
    }
    if (state.config.loading || !state.config.draft) {
      const loadingCard = el('div', { class: 'card' }, [
        el('div', { class: 'card-title' }, ['Config']),
        el('div', { class: 'muted' }, ['Carregando configurações...']),
      ]);
      body.appendChild(loadingCard);
      return;
    }

    const card = el('div', { class: 'card' });
    const header = el('div', { class: 'card-title' }, ['Config']);
    const info = el('div', { class: 'alert info' }, ['Configurações da empresa, planos de SLA e usuários vinculados.']);

    const topRow = el('div', { class: 'row' });
    const btnReload = el('button', { class: 'btn' }, ['Recarregar']);
    btnReload.onclick = async () => { await loadConfigData(); };
    topRow.appendChild(btnReload);

    if (state.config.error) {
      card.appendChild(el('div', { class: 'alert error' }, [String(state.config.error)]));
    }

    // Empresa
    const boxCompany = el('div', { class: 'box' });
    boxCompany.appendChild(el('div', { class: 'box-title' }, ['Empresa']));

    const inName = inputText(state.config.draft.name);
    const inTrade = inputText(state.config.draft.trade_name);
    const inCnpj = inputText(state.config.draft.cnpj);
    const inOwner = inputText(state.config.draft.owner_email);

    const selPlan = el('select', { class: 'input' });
    selPlan.appendChild(el('option', { value: '' }, ['(sem plano padrão)']));
    for (const pl of state.config.plans) {
      selPlan.appendChild(el('option', { value: pl.id }, [`${pl.name} (${pl.hours_to_expire}h)`]));
    }
    selPlan.value = state.config.draft.default_sla_plan_id || '';

    const btnSaveCompany = el('button', { class: 'btn primary' }, ['Salvar empresa']);
    btnSaveCompany.onclick = async () => {
      try {
        const companyId = state.session.companyId;
        if (!companyId) throw new Error('companyId ausente');

        const payload = {
          name: inName.value.trim(),
          trade_name: inTrade.value.trim(),
          cnpj: normCNPJ(inCnpj.value),
          owner_email: inOwner.value.trim(),
          default_sla_plan_id: selPlan.value || null,
        };

        const { error } = await window.sb.from('companies').update(payload).eq('id', companyId);
        if (error) throw error;

        showToast('Empresa atualizada.');
        await loadConfigData();
      } catch (e) {
        console.error(e);
        showToast(e.message || String(e), 'error');
      }
    };

    boxCompany.appendChild(el('div', { class: 'grid2' }, [
      field('Nome (ex: SEG - PORTÕES)', inName).wrap,
      field('Nome fantasia', inTrade).wrap,
      field('CNPJ', inCnpj).wrap,
      field('E-mail do responsável', inOwner).wrap,
      field('Plano SLA padrão', selPlan).wrap,
    ]));
    boxCompany.appendChild(btnSaveCompany);

    // Planos
    const boxPlans = el('div', { class: 'box' });
    boxPlans.appendChild(el('div', { class: 'box-title' }, ['Planos de SLA']));

    const inPlanName = inputText(state.config.newPlan.name);
    const inPlanHours = inputText(state.config.newPlan.hours_to_expire);
    inPlanHours.type = 'number';
    inPlanHours.min = '1';

    const btnAddPlan = el('button', { class: 'btn' }, ['Criar plano']);
    btnAddPlan.onclick = async () => {
      try {
        const companyId = state.session.companyId;
        if (!companyId) throw new Error('companyId ausente');
        const name = inPlanName.value.trim();
        const h = intOr(inPlanHours.value, 24);
        if (!name) throw new Error('Informe o nome do plano');

        const { error } = await window.sb.from('sla_plans').insert({ company_id: companyId, name, hours_to_expire: h });
        if (error) throw error;

        state.config.newPlan.name = '';
        state.config.newPlan.hours_to_expire = '24';
        showToast('Plano criado.');
        await loadConfigData();
      } catch (e) {
        console.error(e);
        showToast(e.message || String(e), 'error');
      }
    };

    const plansTable = el('table', { class: 'table' });
    plansTable.appendChild(el('tr', {}, [el('th', {}, ['Nome']), el('th', {}, ['Horas']), el('th', {}, ['Ações'])]));

    for (const pl of state.config.plans) {
      const btnDel = el('button', { class: 'btn danger sm' }, ['Excluir']);
      btnDel.onclick = async () => {
        if (!confirm('Excluir este plano?')) return;
        try {
          const { error } = await window.sb.from('sla_plans').delete().eq('id', pl.id);
          if (error) throw error;
          showToast('Plano excluído.');
          await loadConfigData();
        } catch (e) {
          console.error(e);
          showToast(e.message || String(e), 'error');
        }
      };
      plansTable.appendChild(el('tr', {}, [el('td', {}, [pl.name]), el('td', {}, [String(pl.hours_to_expire)]), el('td', {}, [btnDel])]));
    }

    boxPlans.appendChild(el('div', { class: 'grid3' }, [
      field('Nome do plano', inPlanName).wrap,
      field('Horas até expirar', inPlanHours).wrap,
      el('div', { class: 'field' }, [btnAddPlan]),
    ]));
    boxPlans.appendChild(plansTable);

    // Usuários
    const boxUsers = el('div', { class: 'box' });
    boxUsers.appendChild(el('div', { class: 'box-title' }, ['Usuários vinculados']));

    const usersTable = el('table', { class: 'table' });
    usersTable.appendChild(el('tr', {}, [el('th', {}, ['User ID']), el('th', {}, ['Role']), el('th', {}, ['Ações'])]));

    for (const u of state.config.users) {
      const selRole = el('select', { class: 'input' });
      for (const r of ['owner', 'admin', 'staff']) selRole.appendChild(el('option', { value: r }, [r]));
      selRole.value = u.role || 'staff';

      const btnSave = el('button', { class: 'btn sm' }, ['Salvar']);
      btnSave.onclick = async () => {
        try {
          const { error } = await window.sb.from('company_users').update({ role: selRole.value }).eq('id', u.id);
          if (error) throw error;
          showToast('Role atualizada.');
          await loadConfigData();
        } catch (e) {
          console.error(e);
          showToast(e.message || String(e), 'error');
        }
      };

      const btnRemove = el('button', { class: 'btn danger sm' }, ['Remover']);
      btnRemove.onclick = async () => {
        if (!confirm('Remover este usuário da empresa?')) return;
        try {
          const { error } = await window.sb.from('company_users').delete().eq('id', u.id);
          if (error) throw error;
          showToast('Usuário removido.');
          await loadConfigData();
        } catch (e) {
          console.error(e);
          showToast(e.message || String(e), 'error');
        }
      };

      usersTable.appendChild(el('tr', {}, [
        el('td', {}, [u.user_id]),
        el('td', {}, [selRole]),
        el('td', {}, [el('div', { class: 'row' }, [btnSave, btnRemove])]),
      ]));
    }

    boxUsers.appendChild(usersTable);

    card.appendChild(header);
    card.appendChild(info);
    card.appendChild(topRow);
    if (state.config.loading) card.appendChild(el('div', { class: 'alert info' }, ['Carregando...']));
    card.appendChild(boxCompany);
    card.appendChild(boxPlans);
    card.appendChild(boxUsers);

    body.appendChild(el('div', { class: 'section' }, [card]));

    if (!state.config.company && !state.config.loading) {
      loadConfigData();
    }
  }

  function renderPlaceholder(title, text) {
    setTitle(title);
    setActiveNav(state.route);
    const body = $("#pageBody");
    body.innerHTML = "";
    body.appendChild(el("div", { class: "section" }, [el("h3", { class: "h3" }, [title]), el("div", { class: "muted" }, [text])]));
  }

  // =========================
  // Router
  // =========================
  function getRouteFromHash() {
    const h = (location.hash || "").replace("#", "").trim();
    return h || "financeiro";
  }

  async function refreshCurrent() {
    await refreshRoute(state.route);
  }

  function refreshRouteRenderOnly() {
    renderCurrentRoute();
  }

  
  async function renderLoginView() {
    const main = $("#pageBody");
    if (!main) return;

    const email = (state.session.userEmail || "").trim();
    main.innerHTML = `
      <div class="card">
        <h2 style="margin:0 0 10px 0;">${APP_NAME}</h2>
        <div class="muted" style="margin-bottom:14px;">Faça login para continuar.</div>

        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:260px;">
            <label class="muted">E-mail</label>
            <input id="loginEmail" class="input" type="email" placeholder="seu@email.com" value="${escapeHtml(email)}" />
          </div>
          <div style="flex:1; min-width:260px;">
            <label class="muted">Senha</label>
            <input id="loginPass" class="input" type="password" placeholder="••••••••" />
          </div>
        </div>

        <div class="row" style="gap:10px; margin-top:14px; align-items:center;">
          <button id="btnLogin" class="btn primary">Entrar</button>
          <button id="btnLogout" class="btn">Sair</button>
          <div id="loginMsg" class="muted" style="margin-left:auto;"></div>
        </div>

        <div class="muted" style="margin-top:14px; line-height:1.4;">
          Se você já está logado e mesmo assim cai aqui, é porque o sistema não conseguiu identificar a empresa (companyId).<br/>
          Vá em <b>Config</b> e confira o <b>defaultCompany</b> ou o vínculo do usuário na tabela <b>company_users</b>.
        </div>
      </div>
    `;

    const btnLogin = $("#btnLogin");
    const btnLogout = $("#btnLogout");
    const msg = $("#loginMsg");

    const setMsg = (t) => { if (msg) msg.textContent = t || ""; };

    if (btnLogout) {
      btnLogout.onclick = async () => {
        try { await window.sb?.auth?.signOut(); } catch (e) {}
        state.session.hasSession = false;
        state.session.userId = null;
        state.session.companyId = null;
        location.hash = "#login";
        setMsg("Sessão encerrada.");
      };
    }

    if (btnLogin) {
      btnLogin.onclick = async () => {
        const em = ($("#loginEmail")?.value || "").trim();
        const pw = ($("#loginPass")?.value || "");
        if (!em || !pw) { setMsg("Informe e-mail e senha."); return; }
        setMsg("Entrando...");
        try {
          const r = await window.sb.auth.signInWithPassword({ email: em, password: pw });
          if (r?.error) throw r.error;
          // Recarrega dados de sessão/empresa
          await initData();
          if (!state.session.hasSession) throw new Error("Login não estabeleceu sessão.");
          location.hash = "#financeiro";
          setMsg("");
          await refreshRoute(getRouteFromHash());
        } catch (e) {
          console.error("login error", e);
          setMsg(e?.message || String(e));
        }
      };
    }
  }

async function refreshRoute(route) {
    state.route = route;

    // Guard: sem sessão, força tela de login (evita loaders estourarem "companyId ausente")
    if (!state.session.hasSession && route !== "login") {
      setActiveNav("");
      await renderLoginView();
      return;
    }

    setActiveNav(route);
    setError("");
    setStatus("");

    if (route === "login") {
      await renderLoginView();
      return;
    }

    if (route === "financeiro") await loadFinanceiro();
    else if (route === "clientes") await loadClientes();
    else if (route === "orcamentos") await loadOrcamentos();
    else if (route === KEY_CHAMADOS) await loadChamados();
    else if (route === "os") await loadWorkorders();
    else if (route === "compras") await loadCompras();

    renderCurrentRoute();
  }

  function renderCurrentRoute() {
    if (state.route === "financeiro") renderFinanceiro();
    else if (state.route === "clientes") renderClientes();
    else if (state.route === "orcamentos") renderOrcamentos();
    else if (state.route === KEY_CHAMADOS) renderChamados();
    else if (state.route === "os") renderWorkorders();
    else if (state.route === "compras") renderCompras();
    else if (state.route === "config") renderConfig();
    else renderPlaceholder("Página", "Rota não encontrada.");
  }

  // =========================
  // Logout
  // =========================
  async function onLogout() {
    try {
      setError("");
      setStatus("Saindo...", "info");
      if (window.Data && typeof window.Data.logout === "function") {
        await window.Data.logout();
      } else {
        const sb = window.sb;
        if (sb?.auth?.signOut) await sb.auth.signOut();
      }
      setStatus("Saiu.", "ok");
      setHash("financeiro");
      location.reload();
    } catch (e) {
      console.error("[logout] error", e);
      setError(e?.message || "Erro ao sair.");
    }
  }

  // =========================
  // Boot
  // =========================
  async function boot() {
    console.log("[app] BOOT START");

    try {
      renderShell();

      const r = await initData();
      console.log("[boot] Data.init =>", r);

      const uidBox = $("#uidBox");
      const cidBox = $("#cidBox");
      if (uidBox) uidBox.textContent = state.session.userId || "—";
      if (cidBox) cidBox.textContent = state.session.companyId || "—";

      if (!state.session.hasSession) {
        // força login
        if (location.hash !== "#login") location.hash = "#login";
      }

      state.route = getRouteFromHash();
      window.addEventListener("hashchange", async () => {
        try {
          const rt = getRouteFromHash();
          await refreshRoute(rt);
        } catch (e) {
          console.error("[router] error", e);
          setError(e?.message || "Erro na navegação.");
        }
      });

      await refreshRoute(state.route);

      state.booted = true;
      console.log("[app] BOOT READY");
    } catch (e) {
      console.error("[app] ERRO no boot", e);
      try {
        renderShell();
      } catch (_) {}
      setTitle("Erro no boot");
      setError(e?.message || "Erro desconhecido.");
      setStatus("Algo quebrou no carregamento do Supabase ou no config.", "info");
    }
  }

  boot();
})();
