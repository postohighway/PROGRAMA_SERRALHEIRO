// data.js
// Front data layer (mock + supabase) — compatível com o projeto
// IMPORTANTE: "clients" no front => tabela "customers" no Supabase

import { uid, todayISO, monthISO } from "./utils.js";

const LS_KEY = "serralheria_settings_v1";

let _mode = "mock";
let _supabase = null;

// ---------------------------
// Settings (localStorage)
// ---------------------------
function getSavedSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSettings(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj || {}));
}

function setMode(m) {
  _mode = m === "supabase" ? "supabase" : "mock";
}

function mode() {
  return _mode;
}

// ---------------------------
// Mock DB
// ---------------------------
const mockDB = {
  clients: [],
  quotes: [],
  workorders: [],
  txs: [],
  session: null,
  active_company_id: "mock-company-1",
};

function ensureMockSeed() {
  if (mockDB.clients.length > 0) return;

  const c1 = { id: uid("cli"), name: "Cliente Exemplo", phone: "(31) 99999-0000", address: "Rua A, 123", notes: "" };
  const c2 = { id: uid("cli"), name: "Maria Silva", phone: "(31) 98888-1111", address: "Rua B, 456", notes: "" };
  mockDB.clients.push(c1, c2);

  mockDB.quotes.push({
    id: uid("orc"),
    company_id: mockDB.active_company_id,
    ticket_id: null,
    status: "aberto",
    currency: "BRL",
    subtotal: 3500,
    discount: 0,
    surcharge: 0,
    total: 3500,
    sent_at: null,
    approved_at: null,
    rejected_at: null,
    approval_note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  mockDB.workorders.push({
    id: uid("os"),
    company_id: mockDB.active_company_id,
    ticket_id: null,
    client_id: c2.id,
    desc: "Grade de janela",
    status: "producao",
    due_date: todayISO(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const m = monthISO(new Date());
  mockDB.txs.push(
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Entrada Orçamento", amount: 500, due_date: `${m}-10`, category: "Serviços", status: "quitado", created_at: new Date().toISOString() },
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "pagar", desc: "Compra de material", amount: 240, due_date: `${m}-11`, category: "Materiais", status: "quitado", created_at: new Date().toISOString() },
    { id: uid("tx"), company_id: mockDB.active_company_id, type: "receber", desc: "Saldo a receber", amount: 3000, due_date: `${m}-20`, category: "Serviços", status: "aberto", created_at: new Date().toISOString() },
  );
}

// ---------------------------
// Supabase init
// ---------------------------
async function initFromSettings() {
  const s = getSavedSettings();
  setMode(s.mode || "mock");

  if (_mode === "supabase") {
    if (!s.supabaseUrl || !s.supabaseKey) {
      _supabase = null;
      return;
    }
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm");
    _supabase = createClient(s.supabaseUrl, s.supabaseKey);
  } else {
    _supabase = null;
    ensureMockSeed();
  }
}

// ---------------------------
// Company context (RLS)
// ---------------------------
async function getActiveCompanyId() {
  const s = getSavedSettings();
  if (s.activeCompanyId) return s.activeCompanyId;

  if (_mode === "mock") return mockDB.active_company_id;

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase
    .from("company_users")
    .select("company_id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;

  const companyId = data?.[0]?.company_id || null;
  if (companyId) {
    s.activeCompanyId = companyId;
    saveSettings(s);
  }
  return companyId;
}

async function setActiveCompanyId(companyId) {
  const s = getSavedSettings();
  s.activeCompanyId = companyId;
  saveSettings(s);
  return companyId;
}

// ---------------------------
// AUTH
// ---------------------------
async function login(email, password) {
  if (_mode === "mock") {
    mockDB.session = { email };
    return true;
  }

  if (!_supabase) throw new Error("Supabase não inicializado. Confira URL e Key em Configurações.");

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  await getActiveCompanyId();
  return !!data?.session;
}

async function logout() {
  if (_mode === "mock") {
    mockDB.session = null;
    return;
  }
  if (_supabase) await _supabase.auth.signOut();
}

// ---------------------------
// Helpers
// ---------------------------
function mustSupabase() {
  if (!_supabase) throw new Error("Supabase não inicializado.");
  return _supabase;
}

function normalizePhone(v) {
  // sem regex: remove espaços e caracteres comuns manualmente
  if (!v) return "";
  let out = "";
  for (const ch of String(v)) {
    if (ch >= "0" && ch <= "9") out += ch;
  }
  return out;
}

// ---------------------------
// Mock CRUD
// ---------------------------
function mockList(table) {
  return [...mockDB[table]];
}
function mockCreate(table, payload) {
  const row = { id: uid(table), ...payload };
  mockDB[table].push(row);
  return row;
}
function mockUpdate(table, id, payload) {
  const idx = mockDB[table].findIndex((x) => x.id === id);
  if (idx < 0) throw new Error("Item não encontrado.");
  mockDB[table][idx] = { ...mockDB[table][idx], ...payload };
  return mockDB[table][idx];
}
function mockRemove(table, id) {
  const idx = mockDB[table].findIndex((x) => x.id === id);
  if (idx < 0) return;
  mockDB[table].splice(idx, 1);
}

// ---------------------------
// Collections API
// ---------------------------
// CLIENTS (front) => CUSTOMERS (db)
const clients = {
  async list() {
    if (_mode === "mock") return mockList("clients");
    const sb = mustSupabase();
    const { data, error } = await sb.from("customers").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("clients", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = {
      company_id: companyId,
      name: payload?.name || "",
      phone: payload?.phone || "",
      email: payload?.email || null,
      address: payload?.address || null,
      created_at: payload?.created_at || new Date().toISOString(),
    };

    const { data, error } = await sb.from("customers").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("clients", id, payload);

    const sb = mustSupabase();
    const patch = { ...payload };
    if (typeof patch.phone !== "undefined") patch.phone = String(patch.phone);

    const { data, error } = await sb.from("customers").update(patch).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("clients", id);

    const sb = mustSupabase();
    const { error } = await sb.from("customers").delete().eq("id", id);
    if (error) throw error;
  },
};

// QUOTES
const quotes = {
  async list() {
    if (_mode === "mock") return mockList("quotes");

    const sb = mustSupabase();
    const { data, error } = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("quotes", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };
    const { data, error } = await sb.from("quotes").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("quotes", id, payload);

    const sb = mustSupabase();
    const { data, error } = await sb.from("quotes").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("quotes", id);

    const sb = mustSupabase();
    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) throw error;
  },
};

// WORKORDERS (tabela: workorders)
const workorders = {
  async list() {
    if (_mode === "mock") return mockList("workorders");

    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("workorders", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };
    const { data, error } = await sb.from("workorders").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("workorders", id, payload);

    const sb = mustSupabase();
    const { data, error } = await sb.from("workorders").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("workorders", id);

    const sb = mustSupabase();
    const { error } = await sb.from("workorders").delete().eq("id", id);
    if (error) throw error;
  },
};

// TXS
const txs = {
  async list() {
    if (_mode === "mock") return mockList("txs");

    const sb = mustSupabase();
    const { data, error } = await sb.from("txs").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(payload) {
    if (_mode === "mock") return mockCreate("txs", payload);

    const sb = mustSupabase();
    const companyId = await getActiveCompanyId();
    if (!companyId) throw new Error("Não foi possível determinar a company ativa.");

    const row = payload?.company_id ? payload : { ...payload, company_id: companyId };
    const { data, error } = await sb.from("txs").insert(row).select("*").single();
    if (error) throw error;
    return data;
  },

  async update(id, payload) {
    if (_mode === "mock") return mockUpdate("txs", id, payload);

    const sb = mustSupabase();
    const { data, error } = await sb.from("txs").update(payload).eq("id", id).select("*").single();
    if (error) throw error;
    return data;
  },

  async remove(id) {
    if (_mode === "mock") return mockRemove("txs", id);

    const sb = mustSupabase();
    const { error } = await sb.from("txs").delete().eq("id", id);
    if (error) throw error;
  },
};

// ---------------------------
// Reports (sem regex)
// ---------------------------
const reports = {
  // Retorna resumo por mês baseado em txs: receber/pagar/result
  monthSummary(list) {
    const map = {};
    for (const tx of list || []) {
      const due = String(tx?.due_date || "");
      const key = due.length >= 7 ? due.slice(0, 7) : "sem-data";

      if (!map[key]) map[key] = { receive: 0, pay: 0 };

      const amt = Number(tx?.amount || 0);
      if (tx?.type === "receber") map[key].receive += amt;
      else map[key].pay += amt;
    }

    return Object.entries(map)
      .map(([month, v]) => ({
        month,
        receive: v.receive,
        pay: v.pay,
        result: v.receive - v.pay,
      }))
      .sort((a, b) => (a.month > b.month ? 1 : -1));
  },
};

// ---------------------------
// Public API
// ---------------------------
export const Data = {
  initFromSettings,
  mode,
  saveSettings,
  getSavedSettings,

  // auth
  login,
  logout,

  // company
  getActiveCompanyId,
  setActiveCompanyId,

  // collections
  clients, // (db: customers)
  quotes,
  workorders,
  txs,

  // reports
  reports,

  // debug
  get supabase() {
    return _supabase;
  },
};
