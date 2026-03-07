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

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === "class") node.className = v;
      else if (k === "style") node.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === true) node.setAttribute(k, "");
      else if (v !== false && v != null) node.setAttribute(k, String(v));
    });
    (children || []).forEach((c) => {
      if (c == null) return;
      if (typeof c === "string" || typeof c === "number") node.appendChild(document.createTextNode(String(c)));
      else node.appendChild(c);
    });
    return node;
  }

  function fmtMoneyBRL(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function getCurrentYYYYMM() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }

  function clampStr(s, max = 120) {
    s = String(s || "");
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + "…";
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // =========================
  // Estado
  // =========================
  const state = {
    booted: false,
    route: "financeiro",

    session: {
      ok: false,
      hasSession: false,
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
  };

  // =========================
  // UI helpers
  // =========================
  function setTitle(t) {
    const node = $("#pageTitle");
    if (node) node.textContent = t || "";
  }

  function setError(msg) {
    const box = $("#errorBox");
    if (!box) return;
    box.textContent = msg || "";
    box.style.display = msg ? "block" : "none";
  }

  function setStatus(msg, type = "info") {
    const box = $("#statusBox");
    if (!box) return;
    box.textContent = msg || "";
    box.dataset.type = type;
    box.style.display = msg ? "block" : "none";
  }

  function updateConnBadge() {
    const b = $("#connBadge");
    if (!b) return;
    if (state.session.hasSession) {
      b.className = "badge badge-ok";
      b.textContent = "Conectado ✅";
    } else {
      b.className = "badge";
      b.textContent = "Sem sessão";
    }
  }

  function setHash(route) {
    if (!route) route = "financeiro";
    const h = "#" + route;
    if (location.hash !== h) location.hash = h;
  }

  function getRouteFromHash() {
    const h = (location.hash || "").replace("#", "").trim();
    const allowed = ["financeiro", "clientes", "orcamentos", "tickets", "compras", "config"];
    return allowed.includes(h) ? h : "financeiro";
  }

  function setActiveNav(route) {
    $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
  }

  // =========================
  // Render shell
  // =========================
  function renderShell() {
    const root = $("#app");
    if (!root) throw new Error("Elemento #app não existe no DOM.");

    root.innerHTML = "";

    const topbar = el("div", { class: "topbar" }, [
      el("div", { class: "topbar-left" }, [
        el("div", { class: "brand" }, ["Serralheria | Sistema"]),
        el("div", { class: "subtitle" }, ["Front UMD + Supabase"]),
      ]),
      el("div", { class: "topbar-right" }, [
        el("button", { class: "btn btn-danger btn-sm", id: "logoutBtn", onclick: onLogout }, ["Sair"]),
      ]),
    ]);

    const sidebar = el("aside", { class: "sidebar" }, [
      el("div", { class: "h2" }, ["Módulos"]),
      el("nav", { class: "nav" }, [
        navLink("Financeiro", "financeiro"),
        navLink("Clientes", "clientes"),
        navLink("Orçamentos", "orcamentos"),
        navLink("Tickets", "tickets"),
        navLink("Compras", "compras"),
        navLink("Config", "config"),
      ]),
      el("div", { class: "hr" }, []),
      el("div", { class: "kv" }, [
        el("div", { class: "muted" }, ["user:"]),
        el("div", { class: "mono", id: "uidBox" }, ["—"]),
      ]),
      el("div", { class: "kv" }, [
        el("div", { class: "muted" }, ["company:"]),
        el("div", { class: "mono", id: "cidBox" }, ["—"]),
      ]),
      el("div", { class: "hr" }, []),
      el("button", { class: "btn btn-ghost", onclick: onLogout }, ["Sair"]),
    ]);

    const main = el("main", { class: "main" }, [
      el("div", { class: "card" }, [
        el("div", { class: "card-head" }, [
          el("div", { class: "card-title", id: "pageTitle" }, [""]),
          el("div", { class: "badge", id: "connBadge" }, [""]),
        ]),
        el("div", { class: "alert alert-error", id: "errorBox", style: "display:none" }, [""]),
        el("div", { class: "alert alert-info", id: "statusBox", style: "display:none" }, [""]),
        el("div", { id: "pageBody" }, [""]),
      ]),
    ]);

    root.appendChild(topbar);
    root.appendChild(el("div", { class: "layout" }, [sidebar, main]));
  }

  function navLink(label, route) {
    return el(
      "a",
      {
        href: "#" + route,
        "data-route": route,
        onclick: (e) => {
          e.preventDefault();
          setHash(route);
        },
      },
      [label]
    );
  }

  // =========================
  // Data init
  // =========================
  async function initData() {
    if (!window.Data || typeof window.Data.init !== "function") {
      throw new Error("Data.js não carregou ou Data.init() não existe.");
    }
    const r = await window.Data.init();
    if (!r || !r.ok) throw new Error("Falha no Data.init()");
    state.session.ok = true;
    state.session.hasSession = !!r.hasSession;
    state.session.userId = r.userId || null;
    state.session.companyId = r.companyId || window.Data.companyId || null;
    return r;
  }

  // =========================
  // Financeiro
  // =========================
  async function loadFinanceiro() {
    setTitle("Financeiro");
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    state.financeiro.loading = true;
    renderFinanceiro();

    const month = state.financeiro.month;
    const start = month + "-01";
    const end = month + "-31";

    const sb = window.sb;
    const q = sb
      .from("txs")
      .select("id, type, desc, amount, due_date, status, created_at")
      .eq("company_id", cid)
      .gte("due_date", start)
      .lte("due_date", end)
      .order("due_date", { ascending: true });

    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map((r) => ({
      ...r,
      amount: Number(r.amount || 0),
      desc: r.desc || "",
      type: r.type || "",
      status: r.status || "",
      due_date: r.due_date || "",
    }));

    const search = (state.financeiro.search || "").trim().toLowerCase();
    const type = state.financeiro.type;

    const filtered = rows.filter((r) => {
      const okType = type ? r.type === type : true;
      const okSearch = search ? (r.desc || "").toLowerCase().includes(search) : true;
      return okType && okSearch;
    });

    state.financeiro.rows = filtered;
    state.financeiro.total = filtered.reduce((acc, r) => acc + Number(r.amount || 0), 0);
    state.financeiro.loading = false;
  }

  function renderFinanceiro() {
    const body = $("#pageBody");
    body.innerHTML = "";

    const top = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Financeiro"]),
      el("div", { class: "row" }, [
        el("div", { class: "field" }, [
          el("div", { class: "label" }, ["Mês"]),
          el("input", {
            class: "input input-sm",
            type: "month",
            value: state.financeiro.month,
            onchange: (e) => {
              state.financeiro.month = e.target.value;
              refreshRoute("financeiro");
            },
          }),
        ]),
        el("div", { class: "field" }, [
          el("div", { class: "label" }, ["Tipo"]),
          el(
            "select",
            {
              class: "input input-sm",
              onchange: (e) => {
                state.financeiro.type = e.target.value;
                refreshRoute("financeiro");
              },
            },
            [
              option("receber", "Receber", state.financeiro.type === "receber"),
              option("pagar", "Pagar", state.financeiro.type === "pagar"),
            ]
          ),
        ]),
        el("div", { class: "field grow" }, [
          el("div", { class: "label" }, ["Buscar (descrição)"]),
          el("input", {
            class: "input input-sm",
            placeholder: "ex: aluguel, chapa, solda...",
            value: state.financeiro.search,
            oninput: (e) => {
              state.financeiro.search = e.target.value;
              renderFinanceiro();
            },
          }),
        ]),
        el(
          "button",
          {
            class: "btn btn-sm",
            onclick: () => refreshRoute("financeiro"),
          },
          ["Recarregar"]
        ),
      ]),
    ]);

    const sum = el("div", { class: "section" }, [
      el("div", { class: "badge badge-ok" }, ["Total: " + fmtMoneyBRL(state.financeiro.total)]),
      state.financeiro.loading ? el("div", { class: "muted", style: "margin-top:8px" }, ["Carregando..."]) : null,
    ]);

    const table = el("div", { class: "table-wrap" }, [
      el("table", { class: "table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", {}, ["Venc."]),
            el("th", {}, ["Tipo"]),
            el("th", {}, ["Descrição"]),
            el("th", { class: "tr" }, ["Valor"]),
            el("th", {}, ["Status"]),
          ]),
        ]),
        el(
          "tbody",
          {},
          (state.financeiro.rows || []).map((r) =>
            el("tr", {}, [
              el("td", { class: "mono" }, [r.due_date || "—"]),
              el("td", {}, [r.type || "—"]),
              el("td", {}, [clampStr(r.desc || "—", 80)]),
              el("td", { class: "tr mono" }, [fmtMoneyBRL(r.amount)]),
              el("td", {}, [r.status || "aberto"]),
            ])
          )
        ),
      ]),
    ]);

    body.appendChild(top);
    body.appendChild(sum);
    body.appendChild(table);
  }

  function option(value, label, selected) {
    return el("option", { value, ...(selected ? { selected: true } : {}) }, [label]);
  }

  // =========================
  // Clientes
  // =========================
  async function loadClientes() {
    setTitle("Clientes");
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    state.clientes.loading = true;
    renderClientes();

    const sb = window.sb;
    const { data, error } = await sb
      .from("customers")
      .select("id, name, phone, address, notes, created_at")
      .eq("company_id", cid)
      .order("name", { ascending: true });

    if (error) throw error;

    const rows = (data || []).map((r) => ({
      ...r,
      name: r.name || "",
      phone: r.phone || "",
      address: r.address || "",
      notes: r.notes || "",
    }));

    const search = (state.clientes.search || "").trim().toLowerCase();
    const filtered = search
      ? rows.filter((r) => (r.name || "").toLowerCase().includes(search) || (r.phone || "").toLowerCase().includes(search))
      : rows;

    state.clientes.rows = filtered;
    state.clientes.loading = false;
  }

  function renderClientes() {
    const body = $("#pageBody");
    body.innerHTML = "";

    const top = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Clientes"]),
      el("div", { class: "row" }, [
        el("div", { class: "field grow" }, [
          el("div", { class: "label" }, ["Buscar (nome/telefone)"]),
          el("input", {
            class: "input input-sm",
            placeholder: "ex: João, (34) 9xxxx...",
            value: state.clientes.search,
            oninput: (e) => {
              state.clientes.search = e.target.value;
              renderClientes();
            },
          }),
        ]),
        el(
          "button",
          {
            class: "btn btn-sm",
            onclick: () => refreshRoute("clientes"),
          },
          ["Recarregar"]
        ),
        el(
          "button",
          {
            class: "btn btn-primary btn-sm",
            onclick: onCreateCliente,
          },
          ["Criar cliente"]
        ),
      ]),
    ]);

    const list = el("div", { class: "section" }, [
      state.clientes.loading ? el("div", { class: "muted" }, ["Carregando..."]) : null,
      el(
        "div",
        { class: "list" },
        (state.clientes.rows || []).map((c) =>
          el("div", { class: "list-item" }, [
            el("div", { class: "list-main" }, [
              el("div", { class: "list-title" }, [c.name || "—"]),
              el("div", { class: "muted" }, [c.phone || ""]),
              c.address ? el("div", { class: "muted" }, [c.address]) : null,
            ]),
            el("div", { class: "list-actions" }, [
              el(
                "button",
                {
                  class: "btn btn-sm",
                  onclick: () => onEditClienteInline(c.id),
                },
                ["Editar"]
              ),
              el(
                "button",
                {
                  class: "btn btn-danger btn-sm",
                  onclick: () => onDeleteCliente(c.id),
                },
                ["Excluir"]
              ),
            ]),
          ])
        )
      ),
    ]);

    body.appendChild(top);
    body.appendChild(list);

    // editor inline
    if (state.clientes.editingId) {
      const c = (state.clientes.rows || []).find((x) => x.id === state.clientes.editingId);
      if (c) body.appendChild(renderClienteEditor(c));
    }
  }

  function renderClienteEditor(c) {
    const wrap = el("div", { class: "section" }, [
      el("h4", { class: "h4" }, ["Editar cliente"]),
      el("div", { class: "grid2" }, [
        el("div", {}, [el("div", { class: "label" }, ["Nome"]), el("input", { class: "input", id: "edName", value: c.name })]),
        el("div", {}, [el("div", { class: "label" }, ["Telefone"]), el("input", { class: "input", id: "edPhone", value: c.phone })]),
      ]),
      el("div", { class: "grid2", style: "margin-top:10px" }, [
        el("div", {}, [el("div", { class: "label" }, ["Endereço"]), el("input", { class: "input", id: "edAddr", value: c.address })]),
        el("div", {}, [el("div", { class: "label" }, ["Notas"]), el("input", { class: "input", id: "edNotes", value: c.notes || "" })]),
      ]),
      el("div", { class: "row", style: "gap:10px; margin-top:12px; flex-wrap:wrap" }, [
        el("button", { class: "btn btn-primary", onclick: () => onSaveCliente(c.id) }, ["Salvar"]),
        el(
          "button",
          {
            class: "btn",
            onclick: () => {
              state.clientes.editingId = null;
              renderClientes();
            },
          },
          ["Cancelar"]
        ),
      ]),
    ]);
    return wrap;
  }

  async function onCreateCliente() {
    try {
      const name = prompt("Nome do cliente:");
      if (!name) return;
      const phone = prompt("Telefone (opcional):") || "";
      const address = prompt("Endereço (opcional):") || "";

      const cid = state.session.companyId;
      const sb = window.sb;

      const { error } = await sb.from("customers").insert([{ company_id: cid, name, phone, address }]);
      if (error) throw error;

      setStatus("Cliente criado.", "ok");
      await refreshRoute("clientes");
    } catch (e) {
      console.error("[clientes] create error", e);
      setError(e?.message || "Erro ao criar cliente.");
    }
  }

  function onEditClienteInline(id) {
    state.clientes.editingId = id;
    renderClientes();
  }

  async function onSaveCliente(id) {
    try {
      const sb = window.sb;

      const name = ($("#edName")?.value || "").trim();
      const phone = ($("#edPhone")?.value || "").trim();
      const address = ($("#edAddr")?.value || "").trim();
      const notes = ($("#edNotes")?.value || "").trim();

      const { error } = await sb.from("customers").update({ name, phone, address, notes }).eq("id", id);
      if (error) throw error;

      state.clientes.editingId = null;
      setStatus("Cliente atualizado.", "ok");
      await refreshRoute("clientes");
    } catch (e) {
      console.error("[clientes] save error", e);
      setError(e?.message || "Erro ao salvar cliente.");
    }
  }

  async function onDeleteCliente(id) {
    try {
      if (!confirm("Excluir este cliente?")) return;
      const sb = window.sb;
      const { error } = await sb.from("customers").delete().eq("id", id);
      if (error) throw error;
      setStatus("Cliente excluído.", "ok");
      await refreshRoute("clientes");
    } catch (e) {
      console.error("[clientes] delete error", e);
      setError(e?.message || "Erro ao excluir cliente.");
    }
  }

  // =========================
  // Orçamentos
  // =========================
  async function loadOrcamentos() {
    setTitle("Orçamentos");
    const cid = state.session.companyId;
    if (!cid) throw new Error("companyId ausente.");

    state.orcamentos.loading = true;
    renderOrcamentos();

    const sb = window.sb;

    let q = sb.from("quotes").select("id, company_id, status, subtotal, discount, surcharge, total, created_at, updated_at").eq("company_id", cid);

    const search = (state.orcamentos.statusSearch || "").trim().toLowerCase();
    if (search) q = q.ilike("status", `%${search}%`);

    const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
    if (error) throw error;

    state.orcamentos.rows = (data || []).map((r) => ({
      ...r,
      subtotal: Number(r.subtotal || 0),
      discount: Number(r.discount || 0),
      surcharge: Number(r.surcharge || 0),
      total: Number(r.total || 0),
      status: r.status || "draft",
    }));

    state.orcamentos.loading = false;

    // carregar detalhes se já tiver selecionado
    if (state.orcamentos.selectedId) {
      await openOrcamento(state.orcamentos.selectedId);
    }
  }

  function renderOrcamentos() {
    const body = $("#pageBody");
    body.innerHTML = "";

    const left = el("div", { class: "section" }, [
      el("h3", { class: "h3" }, ["Orçamentos"]),
      el("div", { class: "badge badge-ok" }, [`Orçamentos carregados: ${state.orcamentos.rows.length}`]),
      el("div", { class: "row", style: "margin-top:10px" }, [
        el("div", { class: "field grow" }, [
          el("div", { class: "label" }, ["Buscar (status)"]),
          el("input", {
            class: "input input-sm",
            placeholder: "ex: draft, sent, approved...",
            value: state.orcamentos.statusSearch,
            oninput: (e) => {
              state.orcamentos.statusSearch = e.target.value;
              renderOrcamentos();
            },
          }),
        ]),
        el("button", { class: "btn btn-sm", onclick: () => refreshRoute("orcamentos") }, ["Recarregar"]),
        el("button", { class: "btn btn-primary btn-sm", onclick: onCreateOrcamento }, ["Criar orçamento"]),
      ]),
      el("div", { class: "hr" }, []),
      el("div", { class: "muted" }, ["Lista de orçamentos"]),
      el(
        "div",
        { class: "table-wrap", style: "margin-top:10px" },
        [
          el("table", { class: "table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", {}, ["Criado"]),
                el("th", {}, ["Status"]),
                el("th", {}, ["Total"]),
                el("th", {}, ["Ações"]),
              ]),
            ]),
            el(
              "tbody",
              {},
              (state.orcamentos.rows || []).map((q) =>
                el("tr", {}, [
                  el("td", { class: "mono" }, [String(q.created_at || "").slice(0, 10) || "—"]),
                  el("td", {}, [q.status || "draft"]),
                  el("td", { class: "mono" }, [fmtMoneyBRL(q.total)]),
                  el("td", {}, [
                    el("button", { class: "btn btn-sm", onclick: () => openOrcamento(q.id) }, ["Abrir"]),
                    el("span", { class: "sp" }, [" "]),
                    el("button", { class: "btn btn-danger btn-sm", onclick: () => onDeleteOrcamento(q.id) }, ["Excluir"]),
                  ]),
                ])
              )
            ),
          ]),
        ]
      ),
    ]);

    const right = el("div", { class: "section" }, [
      el("h3", { class: "h3", style: "text-align:center" }, ["Detalhe do orçamento"]),
      state.orcamentos.selected
        ? renderOrcamentoDetail()
        : el("div", { class: "muted", style: "margin-top:12px; text-align:center" }, ["Selecione um orçamento na lista."]),
    ]);

    body.appendChild(el("div", { class: "two-col" }, [left, right]));
  }

  function renderOrcamentoDetail() {
    const q = state.orcamentos.selected || {};
    const items = state.orcamentos.items || [];

    return el("div", { class: "card-inner" }, [
      el("div", { class: "grid2" }, [
        el("div", {}, [
          el("div", { class: "label" }, ["Status"]),
          el("input", {
            class: "input input-sm",
            value: q.status || "draft",
            oninput: (e) => {
              q.status = e.target.value;
            },
          }),
        ]),
        el("div", {}, [
          el("div", { class: "label" }, ["Cliente"]),
          el("select", { class: "input input-sm", disabled: true }, [el("option", {}, ["— sem cliente —"])]),
          el("div", { class: "muted", style: "margin-top:6px" }, ["Selecione um cliente (opcional)."]),
        ]),
      ]),

      el("div", { class: "row", style: "gap:10px; margin-top:10px; justify-content:flex-end; flex-wrap:wrap" }, [
        el("button", { class: "btn btn-sm", onclick: onSaveOrcamentoStatus }, ["Salvar status"]),
      ]),

      el("div", { class: "hr" }, []),

      el("div", { class: "grid4" }, [
        kvMoney("Subtotal", q.subtotal),
        kv("Desconto", q.discount),
        kv("Acréscimo", q.surcharge),
        kvMoney("Total", q.total),
      ]),

      el("div", { class: "grid3", style: "margin-top:10px" }, [
        kv("Ticket", q.ticket_id ? clampStr(q.ticket_id, 14) : "—"),
        kv("Enviado", q.sent_at ? String(q.sent_at).slice(0, 10) : "—"),
        kv("Aprov./Rej.", q.approved_at ? "aprovado" : q.rejected_at ? "rejeitado" : "—"),
      ]),

      el("div", { class: "row", style: "gap:10px; margin-top:10px; flex-wrap:wrap; justify-content:flex-end" }, [
        el("button", { class: "btn btn-sm", onclick: onRecalcOrcamento }, ["Recalcular total"]),
        el("button", { class: "btn btn-sm", onclick: onMarkSent }, ["Marcar como enviado"]),
        el("button", { class: "btn btn-primary btn-sm", onclick: onApprove }, ["Aprovar"]),
        el("button", { class: "btn btn-danger btn-sm", onclick: onReject }, ["Rejeitar"]),
      ]),

      el("div", { class: "hr" }, []),

      el("h4", { class: "h4" }, ["Novo item"]),

      el("div", { class: "grid4" }, [
        el("div", {}, [
          el("div", { class: "label" }, ["Tipo"]),
          el(
            "select",
            {
              class: "input input-sm",
              onchange: (e) => (state.orcamentos._newItemType = e.target.value),
            },
            [
              option("material", "Material", state.orcamentos._newItemType === "material"),
              option("labor", "Mão de obra", state.orcamentos._newItemType === "labor"),
              option("travel", "Deslocamento", state.orcamentos._newItemType === "travel"),
              option("third_party", "Terceiros", state.orcamentos._newItemType === "third_party"),
              option("other", "Outro", state.orcamentos._newItemType === "other"),
            ]
          ),
        ]),
        el("div", { class: "grow2" }, [
          el("div", { class: "label" }, ["Descrição"]),
          el("input", {
            class: "input input-sm",
            placeholder: "ex: Barra chata 1/8",
            value: state.orcamentos._newItemDesc,
            oninput: (e) => (state.orcamentos._newItemDesc = e.target.value),
          }),
        ]),
        el("div", {}, [
          el("div", { class: "label" }, ["Qtd"]),
          el("input", {
            class: "input input-sm",
            value: state.orcamentos._newItemQty,
            oninput: (e) => (state.orcamentos._newItemQty = e.target.value),
          }),
        ]),
        el("div", {}, [
          el("div", { class: "label" }, ["Preço unit."]),
          el("input", {
            class: "input input-sm",
            value: state.orcamentos._newItemUnitPrice,
            oninput: (e) => (state.orcamentos._newItemUnitPrice = e.target.value),
          }),
        ]),
      ]),

      el("div", { class: "grid3", style: "margin-top:10px" }, [
        el("div", {}, [
          el("div", { class: "label" }, ["Custo unit."]),
          el("input", {
            class: "input input-sm",
            value: state.orcamentos._newItemUnitCost,
            oninput: (e) => (state.orcamentos._newItemUnitCost = e.target.value),
          }),
        ]),
        el("div", {}, [
          el("div", { class: "label" }, ["Unidade"]),
          el("input", {
            class: "input input-sm",
            placeholder: "ex: un / m / kg",
            value: state.orcamentos._newItemUnit,
            oninput: (e) => (state.orcamentos._newItemUnit = e.target.value),
          }),
        ]),
        el("div", { class: "row", style: "justify-content:flex-end; align-items:flex-end" }, [
          el("button", { class: "btn btn-primary btn-sm", onclick: onAddItem }, ["Adicionar item"]),
        ]),
      ]),

      el("div", { class: "hr" }, []),

      el("h4", { class: "h4" }, ["Itens"]),

      el(
        "div",
        { class: "table-wrap" },
        [
          el("table", { class: "table" }, [
            el("thead", {}, [
              el("tr", {}, [
                el("th", {}, ["#"]),
                el("th", {}, ["Descrição"]),
                el("th", {}, ["Qtd"]),
                el("th", {}, ["Preço"]),
                el("th", {}, ["Total"]),
                el("th", {}, ["Ações"]),
              ]),
            ]),
            el(
              "tbody",
              {},
              items.length
                ? items.map((it, idx) =>
                    el("tr", {}, [
                      el("td", { class: "mono" }, [String(idx + 1)]),
                      el("td", {}, [clampStr(it.description || "", 80)]),
                      el("td", { class: "mono" }, [String(it.qty || "")]),
                      el("td", { class: "mono" }, [fmtMoneyBRL(it.unit_price)]),
                      el("td", { class: "mono" }, [fmtMoneyBRL(it.total_price)]),
                      el("td", {}, [el("span", { class: "muted" }, ["—"])]),
                    ])
                  )
                : [el("tr", {}, [el("td", { colspan: "6", class: "muted" }, ["Sem itens."])] )]
            ),
          ]),
        ]
      ),
    ]);
  }

  function kv(label, value) {
    return el("div", { class: "kvbox" }, [el("div", { class: "muted" }, [label]), el("div", { class: "mono" }, [String(value ?? "—")])]);
  }
  function kvMoney(label, value) {
    return el("div", { class: "kvbox" }, [el("div", { class: "muted" }, [label]), el("div", { class: "mono" }, [fmtMoneyBRL(value)])]);
  }

  async function onCreateOrcamento() {
    try {
      const cid = state.session.companyId;
      const sb = window.sb;
      const payload = {
        company_id: cid,
        status: "draft",
        subtotal: 0,
        discount: 0,
        surcharge: 0,
        total: 0,
      };
      const { data, error } = await sb.from("quotes").insert([payload]).select("id").single();
      if (error) throw error;
      setStatus("Orçamento criado.", "ok");
      await refreshRoute("orcamentos");
      if (data?.id) await openOrcamento(data.id);
    } catch (e) {
      console.error("[orcamentos] create error", e);
      setError(e?.message || "Erro ao criar orçamento.");
    }
  }

  async function onDeleteOrcamento(id) {
    try {
      if (!confirm("Excluir este orçamento?")) return;
      const sb = window.sb;
      const { error } = await sb.from("quotes").delete().eq("id", id);
      if (error) throw error;
      setStatus("Orçamento excluído.", "ok");
      state.orcamentos.selectedId = null;
      state.orcamentos.selected = null;
      state.orcamentos.items = [];
      await refreshRoute("orcamentos");
    } catch (e) {
      console.error("[orcamentos] delete error", e);
      setError(e?.message || "Erro ao excluir orçamento.");
    }
  }

  async function openOrcamento(id) {
    state.orcamentos.selectedId = id;
    const sb = window.sb;

    const { data: q, error: qErr } = await sb
      .from("quotes")
      .select("id, status, subtotal, discount, surcharge, total, ticket_id, sent_at, approved_at, rejected_at")
      .eq("id", id)
      .single();
    if (qErr) throw qErr;

    const { data: items, error: itErr } = await sb
      .from("quote_items")
      .select("id, item_type, description, unit, qty, unit_cost, unit_price, total_cost, total_price, sort_order, created_at")
      .eq("quote_id", id)
      .order("sort_order", { ascending: true });

    if (itErr) throw itErr;

    state.orcamentos.selected = {
      ...q,
      subtotal: Number(q.subtotal || 0),
      discount: Number(q.discount || 0),
      surcharge: Number(q.surcharge || 0),
      total: Number(q.total || 0),
    };

    state.orcamentos.items = (items || []).map((it) => ({
      ...it,
      qty: Number(it.qty || 0),
      unit_cost: Number(it.unit_cost || 0),
      unit_price: Number(it.unit_price || 0),
      total_cost: Number(it.total_cost || 0),
      total_price: Number(it.total_price || 0),
      item_type: String(it.item_type || "").toLowerCase(),
    }));

    renderOrcamentos();
  }

  async function onSaveOrcamentoStatus() {
    try {
      const q = state.orcamentos.selected;
      if (!q?.id) return;
      const sb = window.sb;
      const { error } = await sb.from("quotes").update({ status: (q.status || "draft").trim() }).eq("id", q.id);
      if (error) throw error;
      setStatus("Status salvo.", "ok");
      await refreshRoute("orcamentos");
    } catch (e) {
      console.error("[orcamentos] save status error", e);
      setError(e?.message || "Erro ao salvar status.");
    }
  }

  async function onRecalcOrcamento() {
    try {
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const items = state.orcamentos.items || [];
      const subtotal = items.reduce((acc, it) => acc + Number(it.total_price || 0), 0);

      const discount = Number(q.discount || 0);
      const surcharge = Number(q.surcharge || 0);
      const total = subtotal - discount + surcharge;

      const sb = window.sb;
      const { error } = await sb.from("quotes").update({ subtotal, discount, surcharge, total }).eq("id", q.id);
      if (error) throw error;

      setStatus("Total recalculado.", "ok");
      await openOrcamento(q.id);
      await refreshRoute("orcamentos");
    } catch (e) {
      console.error("[orcamentos] recalc error", e);
      setError(e?.message || "Erro ao recalcular.");
    }
  }

  async function onAddItem() {
    try {
      const q = state.orcamentos.selected;
      if (!q?.id) return;

      const item_type = String(state.orcamentos._newItemType || "material").toLowerCase();
      const description = (state.orcamentos._newItemDesc || "").trim();
      const unit = (state.orcamentos._newItemUnit || "").trim();
      const qty = Number(state.orcamentos._newItemQty || 0);
      const unit_cost = Number(state.orcamentos._newItemUnitCost || 0);
      const unit_price = Number(state.orcamentos._newItemUnitPrice || 0);

      if (!description) {
        setError("Descrição do item é obrigatória.");
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Qtd inválida.");
        return;
      }

      const total_cost = qty * unit_cost;
      const total_price = qty * unit_price;

      const sort_order = (state.orcamentos.items || []).length + 1;

      const sb = window.sb;
      const payload = {
        quote_id: q.id,
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

      const { error } = await sb.from("quote_items").insert([payload]);
      if (error) throw error;

      // reset
      state.orcamentos._newItemDesc = "";
      state.orcamentos._newItemQty = "1";
      state.orcamentos._newItemUnit = "";
      state.orcamentos._newItemUnitCost = "0";
      state.orcamentos._newItemUnitPrice = "0";

      setStatus("Item adicionado.", "ok");
      await openOrcamento(q.id);
      await onRecalcOrcamento();
    } catch (e) {
      console.error("[orcamentos] add item error", e);
      setError(e?.message || "Erro ao adicionar item.");
    }
  }

  async function onMarkSent() {
    try {
      const q = state.orcamentos.selected;
      if (!q?.id) return;
      const sb = window.sb;
      const { error } = await sb.from("quotes").update({ sent_at: new Date().toISOString(), status: "sent" }).eq("id", q.id);
      if (error) throw error;
      setStatus("Marcado como enviado.", "ok");
      await openOrcamento(q.id);
      await refreshRoute("orcamentos");
    } catch (e) {
      console.error("[orcamentos] mark sent error", e);
      setError(e?.message || "Erro ao marcar como enviado.");
    }
  }

  async function onApprove() {
    try {
      const q = state.orcamentos.selected;
      if (!q?.id) return;
      const sb = window.sb;
      const { error } = await sb.from("quotes").update({ approved_at: new Date().toISOString(), rejected_at: null, status: "approved" }).eq("id", q.id);
      if (error) throw error;
      setStatus("Aprovado.", "ok");
      await openOrcamento(q.id);
      await refreshRoute("orcamentos");
    } catch (e) {
      console.error("[orcamentos] approve error", e);
      setError(e?.message || "Erro ao aprovar.");
    }
  }

  async function onReject() {
    try {
      const q = state.orcamentos.selected;
      if (!q?.id) return;
      const sb = window.sb;
      const { error } = await sb.from("quotes").update({ rejected_at: new Date().toISOString(), approved_at: null, status: "rejected" }).eq("id", q.id);
      if (error) throw error;
      setStatus("Rejeitado.", "ok");
      await openOrcamento(q.id);
      await refreshRoute("orcamentos");
    } catch (e) {
      console.error("[orcamentos] reject error", e);
      setError(e?.message || "Erro ao rejeitar.");
    }
  }

  // =========================
  // Config
  // =========================
  function renderConfig() {
    setTitle("Config");
    setActiveNav("config");
    const body = $("#pageBody");
    body.innerHTML = "";

    const sec = el("div", { class: "section" }, [
      el("div", { class: "row", style: "align-items:center; justify-content:space-between; gap:12px" }, [
        el("div", {}, [
          el("h3", { class: "h3", style: "margin:0" }, ["Config"]),
          el("div", { class: "muted", style: "margin-top:6px" }, ["Sessão / empresa / login."]),
        ]),
        el("div", { class: "row", style: "gap:8px; flex-wrap:wrap; justify-content:flex-end" }, [
          el("button", { class: "btn btn-ghost", onclick: () => location.reload() }, ["Recarregar"]),
          el("button", { class: "btn btn-danger", onclick: onLogout }, ["Sair"]),
        ]),
      ]),

      el("div", { class: "hr" }, []),

      el("div", { class: "grid2" }, [
        el("div", { class: "card mini" }, [
          el("div", { class: "muted" }, ["Status"]),
          el("div", { class: "mono", style: "margin-top:8px" }, [state.session.hasSession ? "LOGADO ✅" : "SEM SESSÃO ❌"]),
        ]),
        el("div", { class: "card mini" }, [
          el("div", { class: "muted" }, ["company_id (current_company_id)"]),
          el("div", { class: "mono", style: "margin-top:8px; word-break:break-all" }, [state.session.companyId || "—"]),
        ]),
      ]),

      el("div", { class: "grid2", style: "margin-top:12px" }, [
        el("div", { class: "card mini" }, [
          el("div", { class: "muted" }, ["user_id"]),
          el("div", { class: "mono", style: "margin-top:8px; word-break:break-all" }, [state.session.userId || "—"]),
        ]),
        el("div", { class: "card mini" }, [
          el("div", { class: "muted" }, ["Modo"]),
          el("div", { class: "mono", style: "margin-top:8px" }, [window.Data?._mode || window.Data?.mode || "supabase"]),
        ]),
      ]),
    ]);

    body.appendChild(sec);

    if (!state.session.hasSession) {
      const form = el("div", { class: "section", style: "margin-top:14px" }, [
        el("h4", { class: "h4" }, ["Login (Supabase Auth)"]),
        el("div", { class: "muted", style: "margin-bottom:10px" }, [
          "Se der 'Invalid login credentials', use 'Send password recovery' no Supabase ou Magic Link.",
        ]),
      ]);

      const email = el("input", { class: "input", type: "email", placeholder: "email", value: "" });
      const pass = el("input", { class: "input", type: "password", placeholder: "senha", value: "" });

      const btnLogin = el(
        "button",
        {
          class: "btn btn-primary",
          onclick: async () => {
            try {
              setError("");
              setStatus("Entrando...", "info");
              if (!window.Data?.login) throw new Error("Data.login() não existe (data.js).");
              const r = await window.Data.login(email.value.trim(), pass.value);
              if (r?.error) throw r.error;
              await initData();
              updateConnBadge();
              setStatus("Login OK. Recarregando...", "ok");
              location.reload();
            } catch (e) {
              console.error("[login] error", e);
              setError(e?.message || "Falha no login.");
              setStatus("", "info");
            }
          },
        },
        ["Entrar"]
      );

      const btnMagic = el(
        "button",
        {
          class: "btn",
          onclick: async () => {
            try {
              setError("");
              setStatus("Enviando magic link...", "info");
              const sb = window.sb;
              if (!sb?.auth?.signInWithOtp) throw new Error("Supabase auth não disponível (signInWithOtp).");
              const { error } = await sb.auth.signInWithOtp({ email: email.value.trim() });
              if (error) throw error;
              setStatus("Magic link enviado. Verifique seu email e depois recarregue.", "ok");
            } catch (e) {
              console.error("[magiclink] error", e);
              setError(e?.message || "Falha ao enviar magic link.");
              setStatus("", "info");
            }
          },
        },
        ["Magic link"]
      );

      form.appendChild(
        el("div", { class: "grid2", style: "gap:10px" }, [
          el("div", {}, [el("div", { class: "muted" }, ["Email"]), email]),
          el("div", {}, [el("div", { class: "muted" }, ["Senha"]), pass]),
        ])
      );

      form.appendChild(el("div", { class: "row", style: "gap:10px; margin-top:12px; flex-wrap:wrap" }, [btnLogin, btnMagic]));

      body.appendChild(form);
    }
  }

  function renderPlaceholder(title, text) {
    setTitle(title);
    const body = $("#pageBody");
    body.innerHTML = "";
    body.appendChild(el("div", { class: "section" }, [el("h3", { class: "h3" }, [title]), el("div", { class: "muted" }, [text || ""]) ]));
  }

  // =========================
  // Router
  // =========================
  async function refreshRoute(route) {
    // normalizar
    state.route = route;
    setActiveNav(route);
    setError("");
    setStatus("");

    // gate: sem sessão => só deixa Config (login)
    if (!state.session.hasSession && route !== "config") {
      state.route = "config";
      setHash("config");
      renderCurrentRoute();
      setStatus("Sem sessão. Faça login no módulo Config.", "info");
      return;
    }

    // gate: tem sessão mas companyId ausente => Config
    if (state.session.hasSession && !state.session.companyId && route !== "config") {
      state.route = "config";
      setHash("config");
      renderCurrentRoute();
      setError("companyId ausente. Verifique vínculo em company_users.");
      return;
    }

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
      updateConnBadge();

      if (!state.session.hasSession) {
        setStatus("Sem sessão. Abra Config para fazer login.", "info");
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
      setStatus("Se isso apareceu, algo quebrou no carregamento do Supabase ou no config.", "info");
    }
  }

  boot();
})();
