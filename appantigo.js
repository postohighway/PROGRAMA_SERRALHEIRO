/* app.js (UMD / sem modules)
   Requisitos:
   - index.html carrega: config.local.js -> supabaseClient.js -> data.js -> app.js
   - supabaseClient.js define window.sb (Supabase client UMD)
   - data.js define window.Data com Data.init(), Data.getCompanyId(), Data.logout() etc.
*/

(() => {
  "use strict";

  // =========================
  // Helpers DOM
  // =========================
  const $ = (sel, root = document) => root.querySelector(sel);
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

  function normalizePhone(s) {
    return String(s ?? "").replace(/[^\d]+/g, "");
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

    // heurística
    if (/(mao|mão|servic|instal|solda|pintur|montag)/.test(s1)) return "labor";
    if (/(frete|entreg|desloc|viag)/.test(s1)) return "travel";
    if (/(terceir)/.test(s1)) return "third_party";
    if (/(ferro|aco|aço|alumin|inox|mater)/.test(s1)) return "material";
    return "other";
  }

  function safeISODateFromBR(br) {
    // "DD/MM/AAAA" -> "AAAA-MM-DD"  (retorna null se inválida)
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
    // "AAAA-MM-DD" -> "DD/MM/AAAA"
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso || "");
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function getMonthRange(yyyyMm) {
    // yyyyMm: "2026-02" -> {start:"2026-02-01", end:"2026-02-28"}
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



  // =========================
  // Modal (simples)
  // =========================
  let _modalEl = null;

  function closeModal() {
    if (_modalEl && _modalEl.parentNode) _modalEl.parentNode.removeChild(_modalEl);
    _modalEl = null;
  }

  function openModal(opts) {
    const title = opts?.title || "";
    const bodyNode = opts?.body || el("div", {}, []);
    const footerButtons = opts?.footerButtons || [];

    closeModal();

    const backdrop = el("div", { class: "modal-backdrop", onclick: (e) => { if (e.target === backdrop) closeModal(); } }, []);
    const modal = el("div", { class: "modal" }, [
      el("div", { class: "modal-head" }, [
        el("div", { class: "modal-title" }, [title]),
        el("button", { class: "btn btn-ghost", type: "button", onclick: closeModal }, ["✕"]),
      ]),
      el("div", { class: "modal-body" }, [bodyNode]),
      el("div", { class: "modal-foot" }, footerButtons),
    ]);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    _modalEl = backdrop;

    // ESC fecha
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        document.removeEventListener("keydown", onKey);
        closeModal();
      }
    };
    document.addEventListener("keydown", onKey);
  }
  // =========================
  // State
  // =========================
  const state = {
    booted: false,
    route: "financeiro",

    session: {
      ok: false,
      userId: null,
      companyId: null,
    },

    financeiro: {
      month: getCurrentYYYYMM(),
      search: "",
      type: "receber", // receber | pagar
      rows: [],
      total: 0,
      loading: false,
    },

    clientes: {
      search: "",
      rows: [],
      loading: false,
      editingId: null,
    },

    orcamentos: {
      statusSearch: "",
      rows: [],
      loading: false,

      // cache de clientes (para vincular orçamento)
      customers: [],
      customersLoading: false,

      selectedId: null,
      selected: null,
      items: [],

      // editor de itens
      editItemId: null,
      editItem: null, // {id, item_type, description, unit, qty, unit_cost, unit_price}

      // campos "novo item"
      _newItemType: "material",
      _newItemDesc: "",
      _newItemQty: "1",
      _newItemUnit: "",
      _newItemUnitCost: "0",
      _newItemUnitPrice: "0",

      // totais
      _newDiscount: "0",
      _newSurcharge: "0",

      // aprovação / rejeição
      _decisionNote: "",
    },
  };

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
    if (!r || !r.ok) throw new Error("Falha no Data.init()");
    state.session.ok = true;
    state.session.userId = r.userId || null;
    state.session.companyId = r.companyId || window.Data.companyId || null;
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
        el("div", { class: "title" }, ["Sistema da Serralheria"]),
        el("div", { class: "subtitle" }, ["Módulos"]),
      ]),
      el("div", { class: "topbar-right" }, [
        el(
          "button",
          {
            class: "btn btn-danger",
            id: "btnLogoutTop",
            onclick: onLogout,
            type: "button",
          },
          ["Sair"]
        ),
      ]),
    ]);

    const sidebar = el("aside", { class: "sidebar" }, [
      el("div", { class: "nav" }, [
        navBtn("financeiro", "Financeiro"),
        navBtn("clientes", "Clientes"),
        navBtn("orcamentos", "Orçamentos"),
        navBtn("tickets", "Tickets"),
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
        el(
          "button",
          {
            class: "btn btn-ghost",
            id: "btnLogout",
            onclick: onLogout,
            type: "button",
          },
          ["Sair"]
        ),
      ]),
    ]);

    const main = el("main", { class: "main" }, [
      el("div", { class: "container" }, [
        el("div", { class: "card", id: "pageCard" }, [
          el("div", { class: "card-head" }, [
            el("div", { class: "card-title", id: "pageTitle" }, [""]),
            el("div", { class: "badge", id: "connBadge" }, [
              "Conectado ",
              el("span", { class: "check" }, ["✅"]),
            ]),
          ]),
          el("div", { class: "alert alert-error", id: "errorBox", style: "display:none" }, [""]),
          el("div", { class: "alert alert-info", id: "statusBox", style: "display:none" }, [""]),
          el("div", { id: "pageBody" }, [""]),
        ]),
      ]),
    ]);

    const layout = el("div", { class: "layout" }, [sidebar, main]);
    app.appendChild(header);
    app.appendChild(layout);
  }

  function navBtn(route, label) {
    return el(
      "button",
      {
        class: "navbtn",
        "data-route": route,
        type: "button",
        onclick: () => setHash(route),
      },
      [label]
    );
  }

  function setActiveNav(route) {
    $$(".navbtn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-route") === route);
    });
  }

  function setTitle(text) {
    const t = $("#pageTitle");
    if (t) t.textContent = text;
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
    if (!cid) throw new Error("companyId ausente (Data.init não definiu companyId).");

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

  function renderFinanceiro() {
    setTitle("Financeiro");
    setActiveNav("financeiro");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field(
        "Mês (AAAA-MM)",
        el("input", {
          class: "input",
          value: state.financeiro.month,
          placeholder: "2026-02",
          oninput: (e) => (state.financeiro.month = e.target.value),
        })
      ),
      field(
        "Buscar (descrição)",
        el("input", {
          class: "input",
          value: state.financeiro.search,
          placeholder: "ex: aluguel",
          oninput: (e) => (state.financeiro.search = e.target.value),
        })
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
            {
              class: "input",
              onchange: (e) => (state.financeiro._newType = e.target.value),
            },
            [el("option", { value: "receber" }, ["A receber"]), el("option", { value: "pagar" }, ["A pagar"])]
          )
        ),
        field(
          "Descrição",
          el("input", {
            class: "input",
            placeholder: "ex: aluguel",
            oninput: (e) => (state.financeiro._newDesc = e.target.value),
          })
        ),
        field(
          "Valor",
          el("input", {
            class: "input",
            placeholder: "100",
            oninput: (e) => (state.financeiro._newAmount = e.target.value),
          })
        ),
        field(
          "Vencimento (DD/MM/AAAA)",
          el("input", {
            class: "input",
            placeholder: "05/02/2026",
            oninput: (e) => (state.financeiro._newDueBR = e.target.value),
          })
        ),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", onclick: onCreateTx }, ["Salvar"]),
      ]),
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

  // =========================
  // Clientes
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

    if (term && /^\d+$/.test(normalizePhone(term))) {
      const digits = normalizePhone(term);
      rows = rows.filter(
        (r) =>
          normalizePhone(r.phone).includes(digits) ||
          String(r.name || "").toLowerCase().includes(term.toLowerCase())
      );
    }

    state.clientes.rows = rows;
    setStatus(`Clientes carregados: ${rows.length}`, "ok");
    state.clientes.loading = false;
  }

  function renderClientes() {
    setTitle("Clientes");
    setActiveNav("clientes");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field(
        "Buscar",
        el("input", {
          class: "input",
          value: state.clientes.search,
          placeholder: "nome ou telefone",
          oninput: (e) => (state.clientes.search = e.target.value),
        })
      ),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn", type: "button", onclick: () => refreshCurrent() }, ["Recarregar"]),
      ]),
      el("div", {}, []),
    ]);

    const newBox = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Novo cliente"]),
      el("div", { class: "row row-2" }, [
        field(
          "Nome",
          el("input", { class: "input", oninput: (e) => (state.clientes._newName = e.target.value) })
        ),
        field(
          "Telefone",
          el("input", { class: "input", oninput: (e) => (state.clientes._newPhone = e.target.value) })
        ),
      ]),
      el("div", { class: "row row-2" }, [
        field(
          "Endereço",
          el("input", { class: "input", oninput: (e) => (state.clientes._newAddress = e.target.value) })
        ),
        field(
          "Notas",
          el("input", { class: "input", oninput: (e) => (state.clientes._newNotes = e.target.value) })
        ),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", type: "button", onclick: onCreateCustomer }, ["Criar cliente"]),
      ]),
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
        el("input", {
          class: "input input-sm",
          value: r._editName ?? r.name ?? "",
          oninput: (e) => (r._editName = e.target.value),
        }),
      ]),
      el("div", { class: "td" }, [
        el("input", {
          class: "input input-sm",
          value: r._editPhone ?? r.phone ?? "",
          oninput: (e) => (r._editPhone = e.target.value),
        }),
      ]),
      el("div", { class: "td" }, [
        el("input", {
          class: "input input-sm",
          value: r._editAddress ?? r.address ?? "",
          oninput: (e) => (r._editAddress = e.target.value),
        }),
      ]),
      el("div", { class: "td actions" }, [
        el("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => onSaveCustomer(r) }, ["Salvar"]),
        el("button", { class: "btn btn-sm", type: "button", onclick: cancelEditCustomer }, ["Cancelar"]),
      ]),
    ]);
  }

  function startEditCustomer(r) {
    state.clientes.editingId = r.id;
    refreshRouteRenderOnly();
  }

  function cancelEditCustomer() {
    state.clientes.editingId = null;
    refreshRouteRenderOnly();
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
      if (
        res.error &&
        String(res.error.message || "").toLowerCase().includes("column") &&
        String(res.error.message || "").toLowerCase().includes("notes")
      ) {
        const payload2 = { company_id: cid, name, phone: phone || null, address: address || null };
        res = await sb.from("customers").insert(payload2);
      }
      if (res.error) throw res.error;

      setStatus("Cliente criado.", "ok");

      state.clientes._newName = "";
      state.clientes._newPhone = "";
      state.clientes._newAddress = "";
      state.clientes._newNotes = "";

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

  // =========================

  // ORÇAMENTOS (quotes / quote_items)
  // v2:
  // - vínculo com cliente (quotes.customer_id)
  // - editar item
  // - reordenar itens (sort_order)
  // - aprovar/rejeitar
  // - imprimir para PDF (window.print)

  async function loadOrcamentosCustomers() {
    // carrega lista mínima de clientes para dropdown do orçamento
    try {
      if (state.orcamentos.customersLoading) return;
      if (Array.isArray(state.orcamentos.customers) && state.orcamentos.customers.length) return;

      state.orcamentos.customersLoading = true;
      const sb = assertSB();
      const cid = state.session.companyId;
      if (!cid) throw new Error("companyId ausente.");

      const { data, error } = await sb
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", cid)
        .order("name", { ascending: true })
        .limit(500);
      if (error) throw error;

      state.orcamentos.customers = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("[orcamentos] load customers warning", e);
      // não bloqueia (só impede vínculo por enquanto)
    } finally {
      state.orcamentos.customersLoading = false;
    }
  }

  function getCustomerLabelById(id) {
    const rows = state.orcamentos.customers || [];
    const found = rows.find((c) => c.id === id);
    if (!found) return "—";
    const ph = found.phone ? ` • ${found.phone}` : "";
    return `${found.name || "—"}${ph}`;
  }

  function buildCustomerSelect({ value = "", onChange } = {}) {
    const rows = state.orcamentos.customers || [];
    const sel = el(
      "select",
      {
        class: "input",
        onchange: (e) => {
          if (typeof onChange === "function") onChange(e.target.value);
        },
      },
      [
        el("option", { value: "" }, ["— selecionar —"]),
        ...rows.map((c) => el("option", { value: c.id, selected: String(c.id) === String(value) }, [`${c.name || "—"}${c.phone ? " • " + c.phone : ""}`])),
      ]
    );
    return sel;
  }

  async function loadOrcamentos() {
    state.orcamentos.loading = true;
    setError("");
    setStatus("Carregando orçamentos...", "info");

    const sb = assertSB();
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    await loadOrcamentosCustomers();

    let q = sb
      .from("quotes")
      .select(
        "id, company_id, customer_id, contract_id, ticket_id, status, currency, subtotal, discount, surcharge, total, sent_at, approved_at, rejected_at, approval_note, created_at, updated_at"
      )
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(200);

    const term = String(state.orcamentos.statusSearch || "").trim().toLowerCase();
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
      .select(
        "id, company_id, customer_id, contract_id, ticket_id, status, currency, subtotal, discount, surcharge, total, sent_at, approved_at, rejected_at, approval_note, created_at, updated_at"
      )
      .eq("id", id)
      .maybeSingle();
    if (e1) throw e1;

    const { data: items, error: e2 } = await sb
      .from("quote_items")
      .select(
        "id, quote_id, item_type, description, unit, qty, unit_cost, unit_price, total_cost, total_price, sort_order, created_at"
      )
      .eq("quote_id", id)
      .order("sort_order", { ascending: true });
    if (e2) throw e2;

    state.orcamentos.selected = quote || null;
    state.orcamentos.items = Array.isArray(items) ? items : [];

    // defaults de edição
    state.orcamentos._newDiscount = String(quote?.discount ?? 0);
    state.orcamentos._newSurcharge = String(quote?.surcharge ?? 0);
    state.orcamentos._decisionNote = String(quote?.approval_note ?? "");
  }

  function renderOrcamentos() {
    setTitle("Orçamentos");
    setActiveNav("orcamentos");

    const body = $("#pageBody");
    body.innerHTML = "";

    const topRow = el("div", { class: "row row-3" }, [
      field(
        "Buscar (status)",
        el("input", {
          class: "input",
          value: state.orcamentos.statusSearch,
          placeholder: "ex: draft, sent, approved...",
          oninput: (e) => (state.orcamentos.statusSearch = e.target.value),
        })
      ),
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
            el("div", { class: "th" }, ["Cliente"]),
            el("div", { class: "th" }, ["Status"]),
            el("div", { class: "th" }, ["Total"]),
            el("div", { class: "th" }, ["Ações"]),
          ]),
          el("div", { class: "tbody" }, state.orcamentos.rows.map((q) => quoteRow(q))),
        ]),
      ]),
      el("div", { class: "section" }, [
        el("h3", { class: "h3" }, ["Detalhe do orçamento"]),
        renderOrcamentoDetalheCard(),
      ]),
    ]);

    body.appendChild(el("div", { class: "muted" }, [`Orçamentos carregados: ${state.orcamentos.rows.length}`]));
    body.appendChild(topRow);
    body.appendChild(el("hr", { class: "sep" }));
    body.appendChild(layout);
  }

  function quoteRow(q) {
    const created = String(q.created_at || "").slice(0, 10);
    const active = state.orcamentos.selectedId === q.id;

    return el("div", { class: "tr" }, [
      el("div", { class: "td mono" }, [esc(created)]),
      el("div", { class: "td" }, [esc(getCustomerLabelById(q.customer_id))]),
      el("div", { class: "td mono" }, [esc(q.status || "")]),
      el("div", { class: "td mono" }, [formatBRL(q.total)]),
      el("div", { class: "td actions" }, [
        el("button", { class: "btn btn-sm", type: "button", onclick: () => openOrcamento(q.id) }, [active ? "Aberto" : "Abrir"]),
        el("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => deleteOrcamento(q.id) }, ["Excluir"]),
      ]),
    ]);
  }

  function renderOrcamentoDetalheCard() {
    const q = state.orcamentos.selected;
    if (!q) return el("div", { class: "muted" }, ["Selecione um orçamento."]);

    const subtotal = Number(q.subtotal || 0);
    const discount = Number(q.discount || 0);
    const surcharge = Number(q.surcharge || 0);
    const total = Number(q.total || 0);

    const customerSelect = buildCustomerSelect({
      value: q.customer_id || "",
      onChange: (val) => {
        q._editCustomerId = val || null;
      },
    });

    const discountInput = el("input", {
      class: "input",
      value: String(state.orcamentos._newDiscount ?? discount),
      oninput: (e) => (state.orcamentos._newDiscount = e.target.value),
    });

    const surchargeInput = el("input", {
      class: "input",
      value: String(state.orcamentos._newSurcharge ?? surcharge),
      oninput: (e) => (state.orcamentos._newSurcharge = e.target.value),
    });

    const noteInput = el("input", {
      class: "input",
      value: String(state.orcamentos._decisionNote ?? q.approval_note ?? ""),
      placeholder: "Obs (opcional)",
      oninput: (e) => (state.orcamentos._decisionNote = e.target.value),
    });

    const approvedAt = q.approved_at ? String(q.approved_at).slice(0, 19).replace('T', ' ') : null;
    const rejectedAt = q.rejected_at ? String(q.rejected_at).slice(0, 19).replace('T', ' ') : null;

    return el("div", {}, [
      el("div", { class: "row row-2" }, [
        field(
          "Cliente",
          el("div", {}, [
            customerSelect,
            el("div", { class: "muted", style: "margin-top:6px" }, [
              "O orçamento deve sempre pertencer a um cliente (link / ligação / contrato).",
            ]),
          ])
        ),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn", type: "button", onclick: saveOrcamentoCustomer }, ["Salvar cliente"]),
        ]),
      ]),

      el("div", { class: "row row-2" }, [
        field(
          "Status",
          el("input", {
            class: "input",
            value: String(q.status || "draft"),
            oninput: (e) => (q._editStatus = e.target.value),
          })
        ),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-primary", type: "button", onclick: saveOrcamentoStatus }, ["Salvar status"]),
          el("button", { class: "btn", type: "button", onclick: printOrcamento }, ["Imprimir / PDF"]),
        ]),
      ]),

      el("div", { class: "row row-3" }, [
        field("Aprovado em", el("div", { class: "pill mono" }, [approvedAt || "—"])),
        field("Rejeitado em", el("div", { class: "pill mono" }, [rejectedAt || "—"])),
        field("Nota", noteInput),
      ]),

      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-success", type: "button", onclick: approveOrcamento }, ["Aprovar"]),
        el("button", { class: "btn btn-danger", type: "button", onclick: rejectOrcamento }, ["Rejeitar"]),
        el("button", { class: "btn", type: "button", onclick: clearApprovalFlags }, ["Limpar aprovação"]),
      ]),

      el("hr", { class: "sep" }),

      el("div", { class: "row row-4" }, [
        field("Subtotal", el("div", { class: "pill mono" }, [formatBRL(subtotal)])),
        field("Desconto", discountInput),
        field("Acréscimo", surchargeInput),
        field("Total", el("div", { class: "pill mono" }, [formatBRL(total)])),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn", type: "button", onclick: recalcOrcamentoTotal }, ["Recalcular total"]),
      ]),

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
        field(
          "Descrição",
          el("input", {
            class: "input",
            value: state.orcamentos._newItemDesc,
            placeholder: "ex: Barra chata 1/8",
            oninput: (e) => (state.orcamentos._newItemDesc = e.target.value),
          })
        ),
        field(
          "Qtd",
          el("input", {
            class: "input",
            value: state.orcamentos._newItemQty,
            placeholder: "1",
            oninput: (e) => (state.orcamentos._newItemQty = e.target.value),
          })
        ),
        field(
          "Preço unit.",
          el("input", {
            class: "input",
            value: state.orcamentos._newItemUnitPrice,
            placeholder: "100,00",
            oninput: (e) => (state.orcamentos._newItemUnitPrice = e.target.value),
          })
        ),
      ]),
      el("div", { class: "row row-3" }, [
        field(
          "Custo unit.",
          el("input", {
            class: "input",
            value: state.orcamentos._newItemUnitCost,
            placeholder: "0,00",
            oninput: (e) => (state.orcamentos._newItemUnitCost = e.target.value),
          })
        ),
        field(
          "Unidade",
          el("input", {
            class: "input",
            value: state.orcamentos._newItemUnit,
            placeholder: "ex: un / m / kg",
            oninput: (e) => (state.orcamentos._newItemUnit = e.target.value),
          })
        ),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-primary", type: "button", onclick: addQuoteItem }, ["Adicionar item"]),
        ]),
      ]),

      el("hr", { class: "sep" }),
      el("h3", { class: "h3" }, ["Itens"]),
      el("div", { class: "table" }, [
        el("div", { class: "thead" }, [
          el("div", { class: "th" }, ["#"]),
          el("div", { class: "th" }, ["Descrição"]),
          el("div", { class: "th" }, ["Qtd"]),
          el("div", { class: "th" }, ["Total"]),
          el("div", { class: "th" }, ["Ações"]),
        ]),
        el("div", { class: "tbody" }, state.orcamentos.items.map((it, idx) => quoteItemRow(it, idx))),
      ]),
    ]);
  }

  function quoteItemRow(it, idx) {
    const upDisabled = idx === 0;
    const downDisabled = idx === state.orcamentos.items.length - 1;

    return el("div", { class: "tr" }, [
      el("div", { class: "td mono" }, [String(idx + 1)]),
      el("div", { class: "td" }, [esc(it.description || "")]),
      el("div", { class: "td mono" }, [String(it.qty ?? "")]),
      el("div", { class: "td mono" }, [formatBRL(it.total_price)]),
      el("div", { class: "td actions" }, [
        el("button", { class: "btn btn-sm", type: "button", onclick: () => openEditQuoteItem(it) }, ["Editar"]),
        el("button", { class: "btn btn-sm", type: "button", disabled: upDisabled, onclick: () => moveQuoteItem(it.id, -1) }, ["↑"]),
        el("button", { class: "btn btn-sm", type: "button", disabled: downDisabled, onclick: () => moveQuoteItem(it.id, +1) }, ["↓"]),
        el("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => deleteQuoteItem(it.id) }, ["Excluir"]),
      ]),
    ]);
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
      await loadOrcamentosCustomers();

      const body = el("div", {}, [
        el("div", { class: "muted", style: "margin-bottom:10px" }, [
          "Escolha o cliente. O orçamento pode nascer via link, ligação direta, ou contrato mensal — mas sempre pertence a um cliente.",
        ]),
      ]);

      let chosenCustomerId = "";
      const sel = buildCustomerSelect({
        value: "",
        onChange: (v) => {
          chosenCustomerId = v;
        },
      });

      body.appendChild(field("Cliente", sel));

      openModal({
        title: "Criar orçamento",
        body,
        footerButtons: [
          el("button", { class: "btn", type: "button", onclick: closeModal }, ["Cancelar"]),
          el(
            "button",
            {
              class: "btn btn-primary",
              type: "button",
              onclick: async () => {
                try {
                  if (!chosenCustomerId) {
                    return setError("Selecione um cliente para criar o orçamento.");
                  }
                  closeModal();

                  const sb = assertSB();
                  const cid = state.session.companyId;
                  setStatus("Criando orçamento...", "info");

                  const payload = {
                    company_id: cid,
                    customer_id: chosenCustomerId,
                    contract_id: null,
                    ticket_id: null,
                    status: "draft",
                    currency: "BRL",
                    subtotal: 0,
                    discount: 0,
                    surcharge: 0,
                    total: 0,
                  };

                  const { data, error } = await sb.from("quotes").insert(payload).select("id").maybeSingle();
                  if (error) throw error;

                  setStatus("Orçamento criado.", "ok");
                  state.orcamentos.selectedId = data?.id || null;
                  await refreshCurrent();
                } catch (e) {
                  console.error("[orcamentos] create error", e);
                  setError(e?.message || "Erro ao criar orçamento.");
                }
              },
            },
            ["Criar"]
          ),
        ],
      });
    } catch (e) {
      console.error("[orcamentos] create modal error", e);
      setError(e?.message || "Erro ao abrir criação de orçamento.");
    }
  }

  async function saveOrcamentoCustomer() {
    try {
      setError("");
      const sb = assertSB();
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const customer_id = q._editCustomerId ?? q.customer_id ?? null;
      if (!customer_id) return setError("Selecione um cliente.");

      setStatus("Salvando cliente...", "info");
      const { error } = await sb.from("quotes").update({ customer_id }).eq("id", q.id);
      if (error) throw error;

      setStatus("Cliente salvo.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] customer save error", e);
      setError(e?.message || "Erro ao salvar cliente.");
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

  async function approveOrcamento() {
    try {
      setError("");
      const sb = assertSB();
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const note = String(state.orcamentos._decisionNote || "").trim() || null;
      setStatus("Aprovando...", "info");

      const now = new Date().toISOString();
      const { error } = await sb
        .from("quotes")
        .update({ status: "approved", approved_at: now, rejected_at: null, approval_note: note })
        .eq("id", q.id);
      if (error) throw error;

      setStatus("Orçamento aprovado.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] approve error", e);
      setError(e?.message || "Erro ao aprovar.");
    }
  }

  async function rejectOrcamento() {
    try {
      setError("");
      const sb = assertSB();
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const note = String(state.orcamentos._decisionNote || "").trim() || null;
      setStatus("Rejeitando...", "info");

      const now = new Date().toISOString();
      const { error } = await sb
        .from("quotes")
        .update({ status: "rejected", rejected_at: now, approved_at: null, approval_note: note })
        .eq("id", q.id);
      if (error) throw error;

      setStatus("Orçamento rejeitado.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] reject error", e);
      setError(e?.message || "Erro ao rejeitar.");
    }
  }

  async function clearApprovalFlags() {
    try {
      setError("");
      const sb = assertSB();
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      setStatus("Limpando aprovação...", "info");
      const { error } = await sb
        .from("quotes")
        .update({ approved_at: null, rejected_at: null, approval_note: null })
        .eq("id", q.id);
      if (error) throw error;

      setStatus("Flags limpas.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] clear flags error", e);
      setError(e?.message || "Erro ao limpar.");
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
        .update({
          subtotal,
          discount: Number.isFinite(discount) ? discount : 0,
          surcharge: Number.isFinite(surcharge) ? surcharge : 0,
          total,
        })
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

      const payload = {
        quote_id: quoteId,
        item_type,
        description,
        unit,
        qty,
        unit_cost,
        unit_price,
        total_cost,
        total_price,
        sort_order,
      };

      const { error } = await sb.from("quote_items").insert(payload);
      if (error) throw error;

      setStatus("Item adicionado.", "ok");

      // limpa inputs
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

  async function moveQuoteItem(itemId, dir) {
    try {
      setError("");
      const items = state.orcamentos.items || [];
      const idx = items.findIndex((x) => x.id === itemId);
      if (idx < 0) return;

      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= items.length) return;

      const a = items[idx];
      const b = items[newIdx];

      const sb = assertSB();
      setStatus("Reordenando...", "info");

      // swap sort_order
      const aOrder = Number(a.sort_order || idx + 1);
      const bOrder = Number(b.sort_order || newIdx + 1);

      const { error: e1 } = await sb.from("quote_items").update({ sort_order: bOrder }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await sb.from("quote_items").update({ sort_order: aOrder }).eq("id", b.id);
      if (e2) throw e2;

      setStatus("Ordem atualizada.", "ok");
      await refreshCurrent();
    } catch (e) {
      console.error("[orcamentos] move item error", e);
      setError(e?.message || "Erro ao reordenar item.");
    }
  }

  function openEditQuoteItem(it) {
    state.orcamentos.editItemId = it?.id || null;
    state.orcamentos.editItem = it
      ? {
          id: it.id,
          item_type: it.item_type,
          description: it.description,
          unit: it.unit || "",
          qty: String(it.qty ?? ""),
          unit_cost: String(it.unit_cost ?? 0),
          unit_price: String(it.unit_price ?? 0),
        }
      : null;

    const e = state.orcamentos.editItem;
    if (!e) return;

    const body = el("div", {}, [
      field(
        "Tipo",
        el(
          "select",
          {
            class: "input",
            onchange: (ev) => (e.item_type = normalizeQuoteItemType(ev.target.value)),
          },
          [
            el("option", { value: "material", selected: e.item_type === "material" }, ["Material"]),
            el("option", { value: "labor", selected: e.item_type === "labor" }, ["Mão de obra"]),
            el("option", { value: "travel", selected: e.item_type === "travel" }, ["Deslocamento / Frete"]),
            el("option", { value: "third_party", selected: e.item_type === "third_party" }, ["Terceiros"]),
            el("option", { value: "other", selected: e.item_type === "other" }, ["Outros"]),
          ]
        )
      ),
      field(
        "Descrição",
        el("input", {
          class: "input",
          value: e.description,
          oninput: (ev) => (e.description = ev.target.value),
        })
      ),
      el("div", { class: "row row-3" }, [
        field(
          "Qtd",
          el("input", {
            class: "input",
            value: e.qty,
            oninput: (ev) => (e.qty = ev.target.value),
          })
        ),
        field(
          "Preço unit.",
          el("input", {
            class: "input",
            value: e.unit_price,
            oninput: (ev) => (e.unit_price = ev.target.value),
          })
        ),
        field(
          "Custo unit.",
          el("input", {
            class: "input",
            value: e.unit_cost,
            oninput: (ev) => (e.unit_cost = ev.target.value),
          })
        ),
      ]),
      field(
        "Unidade",
        el("input", {
          class: "input",
          value: e.unit,
          oninput: (ev) => (e.unit = ev.target.value),
        })
      ),
    ]);

    openModal({
      title: "Editar item",
      body,
      footerButtons: [
        el("button", { class: "btn", type: "button", onclick: closeModal }, ["Cancelar"]),
        el("button", { class: "btn btn-primary", type: "button", onclick: saveEditQuoteItem }, ["Salvar"]),
      ],
    });
  }

  async function saveEditQuoteItem() {
    try {
      setError("");
      const e = state.orcamentos.editItem;
      if (!e?.id) return;

      const item_type = normalizeQuoteItemType(e.item_type || "material");
      const description = String(e.description || "").trim();
      const unit = String(e.unit || "").trim() || null;

      const qty = Number(String(e.qty || "1").replace(",", "."));
      const unit_cost = Number(String(e.unit_cost || "0").replace(",", "."));
      const unit_price = Number(String(e.unit_price || "0").replace(",", "."));

      if (!description) return setError("Descrição obrigatória.");
      if (!Number.isFinite(qty) || qty <= 0) return setError("Qtd inválida.");
      if (!Number.isFinite(unit_price) || unit_price < 0) return setError("Preço inválido.");
      if (!Number.isFinite(unit_cost) || unit_cost < 0) return setError("Custo inválido.");

      const total_cost = qty * unit_cost;
      const total_price = qty * unit_price;

      const sb = assertSB();
      setStatus("Salvando item...", "info");

      const { error } = await sb
        .from("quote_items")
        .update({ item_type, description, unit, qty, unit_cost, unit_price, total_cost, total_price })
        .eq("id", e.id);
      if (error) throw error;

      closeModal();
      setStatus("Item salvo.", "ok");
      await refreshCurrent();
    } catch (err) {
      console.error("[orcamentos] save edit item error", err);
      setError(err?.message || "Erro ao salvar item.");
    }
  }
  function printOrcamento() {
    try {
      const q = state.orcamentos.selected;
      if (!q) return;

      const customerLabel = getCustomerLabelById(q.customer_id);
      const items = state.orcamentos.items || [];

      const rowsHtml = items
        .map(
          (it, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${esc(it.description || "")}</td>
              <td style="text-align:right">${esc(String(it.qty ?? ""))}</td>
              <td style="text-align:right">${formatBRL(it.unit_price)}</td>
              <td style="text-align:right">${formatBRL(it.total_price)}</td>
            </tr>`
        )
        .join("\n");

      const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Orçamento</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
    h1{margin:0 0 6px 0;font-size:22px}
    .muted{color:#666;font-size:12px}
    .box{border:1px solid #ddd;border-radius:10px;padding:12px;margin-top:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border:1px solid #ddd;padding:8px;font-size:12px}
    th{background:#f5f5f5;text-align:left}
    .totals{margin-top:12px;display:flex;justify-content:flex-end}
    .totals table{width:auto}
    .totals th,.totals td{border:none;padding:4px 0 4px 12px}
    .right{text-align:right}
  </style>
</head>
<body>
  <h1>Orçamento</h1>
  <div class="muted">ID: ${esc(q.id)} • Status: ${esc(q.status || "")}</div>

  <div class="box">
    <div><b>Cliente:</b> ${esc(customerLabel)}</div>
    <div><b>Data:</b> ${esc(String(q.created_at || "").slice(0,10))}</div>
    ${q.approval_note ? `<div><b>Observação:</b> ${esc(q.approval_note)}</div>` : ""}
  </div>

  <div class="box">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Descrição</th>
          <th class="right">Qtd</th>
          <th class="right">Preço</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || "<tr><td colspan='5' class='muted'>Nenhum item</td></tr>"}
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tr><th class="right">Subtotal:</th><td class="right">${formatBRL(q.subtotal)}</td></tr>
        <tr><th class="right">Desconto:</th><td class="right">${formatBRL(q.discount)}</td></tr>
        <tr><th class="right">Acréscimo:</th><td class="right">${formatBRL(q.surcharge)}</td></tr>
        <tr><th class="right">Total:</th><td class="right"><b>${formatBRL(q.total)}</b></td></tr>
      </table>
    </div>
  </div>

  <script>
    window.addEventListener('load', () => { setTimeout(() => window.print(), 50); });
  </script>
</body>
</html>`;

      const w = window.open("", "_blank");
      if (!w) return setError("Popup bloqueado. Libere popups para gerar o PDF.");
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) {
      console.error("[orcamentos] print error", e);
      setError(e?.message || "Erro ao gerar PDF.");
    }
  }

  async function deleteOrcamento(id) {
    try {
      setError("");
      const ok = confirm("Excluir este orçamento? (itens serão apagados também)");
      if (!ok) return;

      const sb = assertSB();
      setStatus("Excluindo orçamento...", "info");

      // primeiro itens
      await sb.from("quote_items").delete().eq("quote_id", id);
      // depois quote
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
  // =========================
  // Páginas placeholder
  // =========================
  function renderPlaceholder(title, text) {
    setTitle(title);
    setActiveNav(state.route);
    const body = $("#pageBody");
    body.innerHTML = "";
    body.appendChild(
      el("div", { class: "section" }, [el("h3", { class: "h3" }, [title]), el("div", { class: "muted" }, [text])])
    );
  }

  function renderConfig() {
    setTitle("Config");
    setActiveNav("config");
    const body = $("#pageBody");
    body.innerHTML = "";

    body.appendChild(
      el("div", { class: "section" }, [
        el("h3", { class: "h3" }, ["Config"]),
        el("div", { class: "badge badge-ok" }, ["Tela criada ✅"]),
        el("div", { class: "muted", style: "margin-top:8px" }, ["Próximo: empresa/usuários/planos."]),
        el("div", { class: "mono", style: "margin-top:12px" }, [`company: ${state.session.companyId || "—"}`]),
      ])
    );
  }

  // =========================
  // Fields / layout helpers
  // =========================
  function field(label, inputNode) {
    return el("div", { class: "field" }, [el("label", { class: "label" }, [label]), inputNode]);
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

  async function refreshRoute(route) {
    state.route = route;
    setActiveNav(route);
    setError("");
    setStatus("");

    if (route === "financeiro") {
      await loadFinanceiro();
    } else if (route === "clientes") {
      await loadClientes();
    } else if (route === "orcamentos") {
      await loadOrcamentos();
    }

    renderCurrentRoute();
  }

  function renderCurrentRoute() {
    if (state.route === "financeiro") renderFinanceiro();
    else if (state.route === "clientes") renderClientes();
    else if (state.route === "orcamentos") renderOrcamentos();
    else if (state.route === "config") renderConfig();
    else if (state.route === "tickets") renderPlaceholder("Tickets", "Próximo módulo (tickets / messages / history).");
    else if (state.route === "compras") renderPlaceholder("Compras", "Próximo módulo (purchases / payments).");
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
      setStatus("Se isso apareceu, algo quebrou no carregamento do Supabase ou no config.", "info");
    }
  }

  boot();
})();
